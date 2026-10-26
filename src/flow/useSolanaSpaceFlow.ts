import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ApiError, setApiClientConfiguration, setApiDebugListener } from "../api/client";
import {
  activateSolana as activateSolanaRequest,
  extractSolanaPayload,
  getChains,
  getDepositAddresses,
  getSolanaPayload,
} from "../api/endpoints";
import type { DebugEvent, DiagnosticError, SpaceChainDto } from "../api/types";
import { getSignabilityError, signSolanaPayload } from "../solana/signing";
import {
  connectStandardWallet,
  listCompatibleSolanaWallets,
  subscribeToCompatibleSolanaWallets,
  subscribeToStandardWallet,
} from "../solana/wallet-standard";
import { flowReducer, initialFlowState, normalizeError } from "./state";
import {
  createSpaceWithEffectiveWallet,
  reconcileEffectiveWallets,
  type EffectiveWalletContext,
  WalletReconciliationError,
} from "./wallet-reconciliation";

const API_URL_KEY = "solana-test.apiBaseUrl";
const JWT_KEY = "solana-test.jwt";
const SPACE_ID_KEY = "solana-test.spaceId";
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 3 * 60_000;

function readSession(key: string, fallback = ""): string {
  try {
    return sessionStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeSession(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // sessionStorage may be disabled; the diagnostic flow can still continue in memory.
  }
}

function nowEvent(
  step: string,
  outcome: DebugEvent["outcome"],
  detail?: unknown,
): DebugEvent {
  return { at: new Date().toISOString(), step, outcome, detail };
}

function normalizeWalletError(error: unknown): DiagnosticError {
  const diagnostic = normalizeError(error, "wallet");
  const message = diagnostic.message.toLowerCase();
  if (message.includes("disconnected port") || message.includes("service worker")) {
    diagnostic.message =
      "The wallet browser-extension connection was lost. Reload this page, unlock the selected wallet, then reconnect it.";
  }
  return diagnostic;
}

export function useSolanaSpaceFlow() {
  const defaultApiUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";
  const expectedNetwork = import.meta.env.VITE_EXPECTED_NETWORK || "testnet";
  const initialSpaceId = readSession(SPACE_ID_KEY);
  const [state, dispatch] = useReducer(flowReducer, {
    ...initialFlowState,
    status: readSession(API_URL_KEY, defaultApiUrl) && readSession(JWT_KEY)
      ? "wallet-disconnected"
      : "configuration-required",
    spaceId: initialSpaceId || undefined,
  });
  const [apiBaseUrl, setApiBaseUrl] = useState(() => readSession(API_URL_KEY, defaultApiUrl));
  const [jwt, setJwt] = useState(() => readSession(JWT_KEY));
  const [spaceName, setSpaceName] = useState(
    () => `Solana signing test ${new Date().toISOString()}`,
  );
  const [createSpaceError, setCreateSpaceError] = useState<DiagnosticError>();
  const [walletOptions, setWalletOptions] = useState(() => listCompatibleSolanaWallets());
  const [selectedWalletId, setSelectedWalletId] = useState(
    () => walletOptions.length === 1 ? walletOptions[0]!.id : "",
  );
  const [busyAction, setBusyAction] = useState<string>();
  const [polling, setPolling] = useState(false);
  const [nowSeconds, setNowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const stateRef = useRef(state);
  const pollTimerRef = useRef<number | undefined>(undefined);
  const pollDeadlineRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setApiClientConfiguration({ apiBaseUrl, jwt });
    writeSession(API_URL_KEY, apiBaseUrl);
    writeSession(JWT_KEY, jwt);
  }, [apiBaseUrl, jwt]);

  useEffect(() => {
    writeSession(SPACE_ID_KEY, state.spaceId ?? "");
  }, [state.spaceId]);

  useEffect(() => {
    setApiDebugListener((event) => dispatch({ type: "ADD_EVENT", event }));
    return () => setApiDebugListener(undefined);
  }, []);

  useEffect(() => subscribeToCompatibleSolanaWallets((wallets) => {
    setWalletOptions(wallets);
    setSelectedWalletId((current) => {
      if (wallets.some((wallet) => wallet.id === current)) return current;
      return wallets.length === 1 ? wallets[0]!.id : "";
    });
  }), []);

  useEffect(() => {
    if (!selectedWalletId) return;
    return subscribeToStandardWallet(selectedWalletId, (wallet) => {
      dispatch({ type: "WALLET_CHANGED", wallet });
    });
  }, [selectedWalletId]);

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const logFailure = useCallback((step: string, error: unknown) => {
    dispatch({
      type: "ADD_EVENT",
      event: nowEvent(step, "failure", error instanceof Error ? error.message : String(error)),
    });
  }, []);

  const runBusy = useCallback(async <T,>(name: string, action: () => Promise<T>): Promise<T> => {
    setBusyAction(name);
    try {
      return await action();
    } finally {
      setBusyAction(undefined);
    }
  }, []);

  const connectedSignerOrSelectedWallet = useCallback(async () => {
    if (stateRef.current.connectedWallet) return stateRef.current.connectedWallet;
    if (!selectedWalletId) throw new Error("Select a compatible Solana wallet first");
    return connectStandardWallet(selectedWalletId);
  }, [selectedWalletId]);

  const selectWallet = useCallback((id: string) => {
    setSelectedWalletId(id);
    dispatch({ type: "WALLET_CHANGED", wallet: undefined });
  }, []);

  const applyWalletContext = useCallback((context: EffectiveWalletContext) => {
    dispatch({
      type: "GROUPS_LOADED",
      groups: context.walletGroups,
      selected: context.walletGroup,
    });
    dispatch({ type: "CHAIN_LOADED", chain: context.solanaChain });
    dispatch({ type: "WALLET_REGISTERED", wallet: context.solanaWallet });
  }, []);

  const connectWallet = useCallback(async () => {
    if (!selectedWalletId) {
      dispatch({
        type: "ERROR",
        error: { source: "wallet", message: "Select a compatible Solana wallet first" },
        status: stateRef.current.payload ? "payload-ready" : "wallet-disconnected",
      });
      return;
    }
    await runBusy("connect-wallet", async () => {
      try {
        const wallet = await connectStandardWallet(selectedWalletId);
        dispatch({ type: "WALLET_CHANGED", wallet });
        dispatch({
          type: "ADD_EVENT",
          event: nowEvent("Connect wallet", "success", {
            provider: wallet.provider,
            address: wallet.address,
          }),
        });
      } catch (error) {
        dispatch({
          type: "ERROR",
          error: normalizeWalletError(error),
          status: stateRef.current.payload ? "payload-ready" : "wallet-disconnected",
          clearSignature: true,
        });
        logFailure("Connect wallet", error);
      }
    });
  }, [logFailure, runBusy, selectedWalletId]);

  const testApi = useCallback(async () => {
    if (!apiBaseUrl.trim() || !jwt.trim()) {
      dispatch({
        type: "ERROR",
        error: { source: "client", message: "Enter the API base URL and JWT first" },
        status: "configuration-required",
      });
      return;
    }
    await runBusy("test-api", async () => {
      try {
        const response = await getChains();
        dispatch({ type: "CONFIGURED" });
        dispatch({
          type: "ADD_EVENT",
          event: nowEvent("Test API", "success", { chainCount: response.items.length }),
        });
      } catch (error) {
        dispatch({ type: "ERROR", error: normalizeError(error, "client") });
        logFailure("Test API", error);
      }
    });
  }, [apiBaseUrl, jwt, logFailure, runBusy]);

  const registerWallet = useCallback(async () => {
    if (!apiBaseUrl.trim() || !jwt.trim()) {
      dispatch({
        type: "ERROR",
        error: {
          source: "client",
          message: "Enter the API base URL and JWT first",
        },
        status: "configuration-required",
      });
      return;
    }
    await runBusy("register-wallet", async () => {
      try {
        const connectedWallet = await connectedSignerOrSelectedWallet();
        dispatch({ type: "WALLET_CHANGED", wallet: connectedWallet });
        const context = await reconcileEffectiveWallets({
          connectedAddress: connectedWallet.address,
          expectedNetwork,
          allowRegistration: true,
        });
        applyWalletContext(context);
        dispatch({
          type: "ADD_EVENT",
          event: nowEvent("Reconcile Solana wallet", "success", {
            provider: connectedWallet.provider,
            address: context.solanaWallet.address,
            walletIndex: context.solanaWallet.walletIndex ?? 0,
          }),
        });
      } catch (error) {
        dispatch({ type: "ERROR", error: normalizeError(error, "backend") });
        logFailure("Reconcile Solana wallet", error);
      }
    });
  }, [
    apiBaseUrl,
    applyWalletContext,
    connectedSignerOrSelectedWallet,
    expectedNetwork,
    jwt,
    logFailure,
    runBusy,
  ]);

  const getExistingWallet = useCallback(async () => {
    if (!apiBaseUrl.trim() || !jwt.trim()) {
      dispatch({
        type: "ERROR",
        error: { source: "client", message: "Enter the API base URL and JWT first" },
        status: "configuration-required",
      });
      return;
    }

    await runBusy("get-wallet", async () => {
      try {
        const connectedWallet = await connectedSignerOrSelectedWallet();
        dispatch({ type: "WALLET_CHANGED", wallet: connectedWallet });
        const context = await reconcileEffectiveWallets({
          connectedAddress: connectedWallet.address,
          expectedNetwork,
          allowRegistration: false,
        });
        applyWalletContext(context);
      } catch (error) {
        dispatch({ type: "ERROR", error: normalizeError(error, "backend") });
        logFailure("Get existing Solana wallet", error);
      }
    });
  }, [
    apiBaseUrl,
    applyWalletContext,
    connectedSignerOrSelectedWallet,
    expectedNetwork,
    jwt,
    logFailure,
    runBusy,
  ]);

  const createSpace = useCallback(async () => {
    if (!spaceName.trim()) return;
    setCreateSpaceError(undefined);
    await runBusy("create-space", async () => {
      try {
        const connectedWallet = stateRef.current.connectedWallet;
        if (!connectedWallet) {
          throw new WalletReconciliationError("Connect a compatible Solana wallet first");
        }
        const { context, response } = await createSpaceWithEffectiveWallet({
          name: spaceName.trim(),
          connectedAddress: connectedWallet.address,
          expectedNetwork,
        });
        applyWalletContext(context);
        const payload = extractSolanaPayload(response);
        const skipped = response.initialize?.skipped?.find((item) => item.chainType === "SOL");
        dispatch({
          type: "SPACE_CREATED",
          spaceId: response.spaceId,
          payload,
          skippedReason: skipped?.reason,
        });
        setCreateSpaceError(undefined);
        writeSession(SPACE_ID_KEY, response.spaceId);
      } catch (error) {
        const diagnostic = normalizeError(error, "backend");
        if (!(error instanceof ApiError) && !(error instanceof WalletReconciliationError)) {
          diagnostic.message = `Create result is ambiguous because the request failed at the network boundary. Check the backend before retrying. ${diagnostic.message}`;
        }
        setCreateSpaceError(diagnostic);
        dispatch({ type: "ERROR", error: diagnostic, status: "failed" });
        logFailure("Create Space (not automatically retried)", error);
      }
    });
  }, [applyWalletContext, expectedNetwork, logFailure, runBusy, spaceName]);

  const setSpaceId = useCallback((spaceId: string) => {
    dispatch({ type: "SPACE_ID_CHANGED", spaceId: spaceId.trim() });
  }, []);

  const loadFreshPayload = useCallback(async () => {
    const spaceId = stateRef.current.spaceId;
    if (!spaceId) {
      dispatch({
        type: "ERROR",
        error: { source: "client", message: "Enter or create a Space id first" },
      });
      return;
    }
    await runBusy("load-payload", async () => {
      try {
        const payload = await getSolanaPayload(spaceId);
        dispatch({ type: "PAYLOAD_READY", payload });
      } catch (error) {
        dispatch({ type: "ERROR", error: normalizeError(error, "backend"), clearSignature: true });
        logFailure("Load fresh Solana payload", error);
      }
    });
  }, [logFailure, runBusy]);

  useEffect(() => {
    const canRefreshExpiredPayload =
      state.status === "payload-ready" || state.status === "signed";
    if (
      state.payload &&
      canRefreshExpiredPayload &&
      nowSeconds >= state.payload.validUntil - 15
    ) {
      dispatch({ type: "EXPIRED" });
      dispatch({
        type: "ADD_EVENT",
        event: nowEvent(
          "Payload validity",
          "failure",
          "Payload entered the 15-second safety window; requesting a fresh payload",
        ),
      });
      void loadFreshPayload();
    }
  }, [loadFreshPayload, nowSeconds, state.payload, state.status]);

  const signPayload = useCallback(async () => {
    const { payload, connectedWallet } = stateRef.current;
    if (!payload || !connectedWallet) return;
    dispatch({ type: "SIGNING" });
    try {
      const signatureHex = await signSolanaPayload(payload, connectedWallet);
      dispatch({ type: "SIGNED", signatureHex });
      dispatch({
        type: "ADD_EVENT",
        event: nowEvent("Sign raw Solana activation digest", "success", {
          messageByteLength: 32,
          locallyVerified: true,
        }),
      });
    } catch (error) {
      dispatch({
        type: "ERROR",
        error: normalizeWalletError(error),
        status: "payload-ready",
        clearSignature: true,
      });
      logFailure("Sign raw Solana activation digest", error);
    }
  }, [logFailure]);

  const useTestSigner = useCallback(async () => {
    if (!import.meta.env.DEV) {
      dispatch({
        type: "ERROR",
        error: { source: "wallet", message: "The test signer is available only in development" },
      });
      return;
    }
    await runBusy("connect-test-signer", async () => {
      try {
        setSelectedWalletId("");
        const { createTestKeypairSigner } = await import("../solana/signers/test-keypair");
        const connectedWallet = createTestKeypairSigner();
        dispatch({ type: "WALLET_CHANGED", wallet: connectedWallet });
        dispatch({
          type: "ADD_EVENT",
          event: nowEvent("Use development test signer", "success", {
            address: connectedWallet.address,
          }),
        });
      } catch (error) {
        dispatch({
          type: "ERROR",
          error: normalizeError(error, "wallet"),
          status: stateRef.current.payload ? "payload-ready" : "wallet-disconnected",
          clearSignature: true,
        });
        logFailure("Use development test signer", error);
      }
    });
  }, [logFailure, runBusy]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== undefined) window.clearInterval(pollTimerRef.current);
    pollTimerRef.current = undefined;
    pollDeadlineRef.current = undefined;
    setPolling(false);
  }, []);

  const pollOnce = useCallback(async (): Promise<boolean> => {
    const current = stateRef.current;
    if (!current.spaceId) return true;
    try {
      const response = await getDepositAddresses(current.spaceId);
      const exact = current.payload
        ? response.chains.find((chain) => chain.chainObjectId === current.payload!.chainObjectId)
        : undefined;
      const deployment = exact ?? response.chains.find((chain) => chain.chainType === "SOL");
      if (!deployment) {
        dispatch({
          type: "ERROR",
          error: {
            source: "poll",
            message: "No Solana activation exists for this Space. Fetch a fresh payload to activate it.",
            raw: response,
          },
          status: "space-created",
          clearSignature: true,
        });
        return true;
      }
      dispatch({ type: "DEPLOYMENT_UPDATED", deployment });
      return Boolean(
        (deployment.isDeployed && deployment.address) || deployment.deployState === "failed",
      );
    } catch (error) {
      dispatch({ type: "ERROR", error: normalizeError(error, "poll"), status: "pending" });
      logFailure("Poll deployment", error);
      return false;
    }
  }, [logFailure]);

  const startPolling = useCallback(() => {
    stopPolling();
    setPolling(true);
    pollDeadlineRef.current = Date.now() + POLL_TIMEOUT_MS;

    const tick = async () => {
      if (pollDeadlineRef.current && Date.now() >= pollDeadlineRef.current) {
        dispatch({
          type: "ERROR",
          error: {
            source: "poll",
            message: "Automatic polling stopped after three minutes. Deployment may still be delayed; manual polling is safe.",
          },
          status: "pending",
        });
        stopPolling();
        return;
      }
      if (await pollOnce()) stopPolling();
    };

    void tick();
    pollTimerRef.current = window.setInterval(() => void tick(), POLL_INTERVAL_MS);
  }, [pollOnce, stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  const submitSignature = useCallback(async () => {
    const current = stateRef.current;
    if (!current.spaceId || !current.payload || !current.signatureHex) return;
    dispatch({ type: "SUBMITTING" });
    await runBusy("submit-signature", async () => {
      try {
        const response = await activateSolanaRequest(current.spaceId!, {
          signature: current.signatureHex!,
          validAfter: current.payload!.validAfter,
          validUntil: current.payload!.validUntil,
        });
        const deployment: SpaceChainDto = {
          chainObjectId: response.chainObjectId ?? current.payload!.chainObjectId,
          chainId: current.payload!.chainId,
          chainType: "SOL",
          address: typeof response.address === "string" ? response.address : null,
          isDeployed: response.isDeployed === true,
          deployState: response.deployState,
          deployError: response.deployError,
        };
        dispatch({ type: "PENDING", deployment });
        startPolling();
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          dispatch({ type: "PENDING" });
          startPolling();
          return;
        }
        const diagnostic = normalizeError(error, "backend");
        const stale = diagnostic.code === "OPEN_PAYLOAD_STALE";
        dispatch({
          type: "ERROR",
          error: diagnostic,
          status: stale ? "expired" : "failed",
          clearPayload: stale || diagnostic.code === "INVALID_SIGNATURE",
          clearSignature: stale || diagnostic.code === "INVALID_SIGNATURE",
        });
        logFailure("Submit Solana activation", error);
      }
    });
  }, [logFailure, runBusy, startPolling]);

  const clearSession = useCallback(() => {
    stopPolling();
    writeSession(API_URL_KEY, "");
    writeSession(JWT_KEY, "");
    writeSession(SPACE_ID_KEY, "");
    setApiBaseUrl(defaultApiUrl);
    setJwt("");
    setCreateSpaceError(undefined);
    dispatch({ type: "CLEAR_SESSION" });
  }, [defaultApiUrl, stopPolling]);

  const signabilityError = useMemo(
    () => getSignabilityError(state.payload, state.connectedWallet, nowSeconds),
    [nowSeconds, state.connectedWallet, state.payload],
  );

  return {
    state,
    apiBaseUrl,
    setApiBaseUrl,
    jwt,
    setJwt,
    expectedNetwork,
    spaceName,
    setSpaceName,
    createSpaceError,
    walletOptions,
    selectedWalletId,
    selectWallet,
    busyAction,
    polling,
    nowSeconds,
    secondsRemaining: state.payload ? state.payload.validUntil - nowSeconds : undefined,
    signabilityError,
    testApi,
    clearSession,
    registerWallet,
    getExistingWallet,
    createSpace,
    setSpaceId,
    loadFreshPayload,
    signPayload,
    connectWallet,
    useTestSigner,
    submitSignature,
    startPolling,
    stopPolling,
    clearLog: () => dispatch({ type: "CLEAR_LOG" }),
  };
}
