import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ApiError, setApiClientConfiguration, setApiDebugListener } from "../api/client";
import {
  activateSolana as activateSolanaRequest,
  createWalletGroup,
  createSpace as createSpaceRequest,
  extractSolanaPayload,
  getChains,
  getDepositAddresses,
  getSolanaPayload,
  getWallets,
  registerWallet as registerWalletRequest,
} from "../api/endpoints";
import type { DebugEvent, DiagnosticError, SpaceChainDto } from "../api/types";
import { connectPhantom } from "../solana/phantom";
import { getSignabilityError, signSolanaPayload } from "../solana/signing";
import { flowReducer, initialFlowState, normalizeError } from "./state";

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

function normalizePhantomError(error: unknown): DiagnosticError {
  const diagnostic = normalizeError(error, "wallet");
  const message = diagnostic.message.toLowerCase();
  if (message.includes("disconnected port") || message.includes("service worker")) {
    diagnostic.message =
      "Phantom's browser-extension connection was lost. Reload this page, unlock Phantom, then click Connect Phantom again.";
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

  useEffect(() => {
    const timer = window.setInterval(() => setNowSeconds(Math.floor(Date.now() / 1000)), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (
      state.payload &&
      state.status !== "expired" &&
      state.status !== "deployed" &&
      nowSeconds >= state.payload.validUntil - 15
    ) {
      dispatch({ type: "EXPIRED" });
      dispatch({
        type: "ADD_EVENT",
        event: nowEvent("Payload validity", "failure", "Payload entered the 15-second safety window"),
      });
    }
  }, [nowSeconds, state.payload, state.status]);

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
        const walletGroup = await createWalletGroup("Main Wallet");
        if (!Number.isInteger(walletGroup.walletIndex) || walletGroup.walletIndex < 0) {
          throw new Error("Wallet-group response is missing a valid walletIndex");
        }
        dispatch({ type: "GROUPS_LOADED", groups: [walletGroup], selected: walletGroup });

        const connectedWallet = await connectPhantom();
        dispatch({ type: "WALLET_CHANGED", wallet: connectedWallet });

        const chains = await getChains();
        const chain = chains.items.find(
          (item) =>
            item.chainType === "SOL" &&
            item.network === expectedNetwork &&
            item.isActive === true,
        );
        if (!chain) {
          throw new Error(
            `No active Solana ${expectedNetwork} chain was returned. Check DEFAULT_NETWORK, the active chain row, and the backend database.`,
          );
        }
        dispatch({ type: "CHAIN_LOADED", chain });

        const wallet = await registerWalletRequest({
          chainId: chain._id,
          address: connectedWallet.address,
          publicKey: connectedWallet.address,
          walletIndex: walletGroup.walletIndex,
        });
        if (wallet.address !== connectedWallet.address) {
          throw new Error(
            `Stored address ${wallet.address} does not match connected Phantom address ${connectedWallet.address}.`,
          );
        }
        if (wallet.walletIndex !== walletGroup.walletIndex) {
          throw new Error("The backend returned a wallet at a different wallet index");
        }
        dispatch({ type: "WALLET_REGISTERED", wallet });
      } catch (error) {
        dispatch({ type: "ERROR", error: normalizeError(error, "backend") });
        logFailure("Create Solana wallet", error);
      }
    });
  }, [apiBaseUrl, expectedNetwork, jwt, logFailure, runBusy]);

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
        const connectedWallet = await connectPhantom();
        dispatch({ type: "WALLET_CHANGED", wallet: connectedWallet });

        const chains = await getChains();
        const chain = chains.items.find(
          (item) =>
            item.chainType === "SOL" &&
            item.network === expectedNetwork &&
            item.isActive === true,
        );
        if (!chain) {
          throw new Error(
            `No active Solana ${expectedNetwork} chain was returned. Check DEFAULT_NETWORK, the active chain row, and the backend database.`,
          );
        }
        dispatch({ type: "CHAIN_LOADED", chain });

        const wallets = await getWallets(chain._id);
        const wallet = wallets.find(
          (item) => item.isActive && item.address === connectedWallet.address,
        );
        if (!wallet) {
          throw new Error(
            `No active backend Solana wallet matches Phantom address ${connectedWallet.address}.`,
          );
        }
        dispatch({ type: "WALLET_REGISTERED", wallet });
      } catch (error) {
        dispatch({ type: "ERROR", error: normalizeError(error, "backend") });
        logFailure("Get existing Solana wallet", error);
      }
    });
  }, [apiBaseUrl, expectedNetwork, jwt, logFailure, runBusy]);

  const createSpace = useCallback(async () => {
    if (!spaceName.trim()) return;
    setCreateSpaceError(undefined);
    await runBusy("create-space", async () => {
      try {
        const response = await createSpaceRequest(spaceName.trim());
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
        if (!(error instanceof ApiError)) {
          diagnostic.message = `Create result is ambiguous because the request failed at the network boundary. Check the backend before retrying. ${diagnostic.message}`;
        }
        setCreateSpaceError(diagnostic);
        dispatch({ type: "ERROR", error: diagnostic, status: "failed" });
        logFailure("Create Space (not automatically retried)", error);
      }
    });
  }, [logFailure, runBusy, spaceName]);

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

  const signPayload = useCallback(async () => {
    const { payload, connectedWallet } = stateRef.current;
    if (!payload || !connectedWallet) return;
    dispatch({ type: "SIGNING" });
    try {
      const signatureHex = await signSolanaPayload(payload, connectedWallet);
      dispatch({ type: "SIGNED", signatureHex });
      dispatch({
        type: "ADD_EVENT",
        event: nowEvent("Sign raw digest", "success", {
          digest: payload.digest,
          signature: signatureHex,
          locallyVerified: true,
        }),
      });
    } catch (error) {
      dispatch({
        type: "ERROR",
        error: normalizePhantomError(error),
        status: "payload-ready",
        clearSignature: true,
      });
      logFailure("Sign raw digest", error);
    }
  }, [logFailure]);

  const reopenPhantom = useCallback(async () => {
    await runBusy("reopen-phantom", async () => {
      try {
        const connectedWallet = await connectPhantom();
        dispatch({ type: "WALLET_CHANGED", wallet: connectedWallet });
        dispatch({
          type: "ADD_EVENT",
          event: nowEvent("Reopen Phantom", "success", {
            address: connectedWallet.address,
          }),
        });
      } catch (error) {
        dispatch({
          type: "ERROR",
          error: normalizePhantomError(error),
          status: stateRef.current.payload ? "payload-ready" : "wallet-disconnected",
          clearSignature: true,
        });
        logFailure("Reopen Phantom", error);
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
    reopenPhantom,
    submitSignature,
    startPolling,
    stopPolling,
    clearLog: () => dispatch({ type: "CLEAR_LOG" }),
  };
}
