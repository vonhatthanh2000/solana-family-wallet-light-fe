import { ApiError } from "../api/client";
import type {
  ChainDto,
  DebugEvent,
  DiagnosticError,
  SolanaOpenPayload,
  SpaceChainDto,
  WalletDto,
  WalletGroupDto,
} from "../api/types";
import type { ConnectedWallet } from "../solana/phantom";

export type FlowStatus =
  | "configuration-required"
  | "wallet-disconnected"
  | "wallet-connected"
  | "chain-loaded"
  | "wallet-registered"
  | "space-created"
  | "payload-ready"
  | "awaiting-wallet-approval"
  | "signed"
  | "submitting"
  | "pending"
  | "deployed"
  | "failed"
  | "expired";

export type FlowState = {
  status: FlowStatus;
  connectedWallet?: ConnectedWallet;
  solanaChain?: ChainDto;
  walletGroups: WalletGroupDto[];
  walletGroup?: WalletGroupDto;
  storedWallet?: WalletDto;
  spaceId?: string;
  payload?: SolanaOpenPayload;
  signatureHex?: string;
  deployment?: SpaceChainDto;
  skippedReason?: string;
  error?: DiagnosticError;
  events: DebugEvent[];
};

export const initialFlowState: FlowState = {
  status: "configuration-required",
  walletGroups: [],
  events: [],
};

export type FlowAction =
  | { type: "CONFIGURED" }
  | { type: "WALLET_CHANGED"; wallet?: ConnectedWallet }
  | { type: "CHAIN_LOADED"; chain: ChainDto }
  | { type: "GROUPS_LOADED"; groups: WalletGroupDto[]; selected: WalletGroupDto }
  | { type: "GROUP_SELECTED"; group: WalletGroupDto }
  | { type: "WALLET_REGISTERED"; wallet: WalletDto }
  | {
      type: "SPACE_CREATED";
      spaceId: string;
      payload?: SolanaOpenPayload;
      skippedReason?: string;
    }
  | { type: "SPACE_ID_CHANGED"; spaceId: string }
  | { type: "PAYLOAD_READY"; payload: SolanaOpenPayload }
  | { type: "SIGNING" }
  | { type: "SIGNED"; signatureHex: string }
  | { type: "SUBMITTING" }
  | { type: "PENDING"; deployment?: SpaceChainDto }
  | { type: "DEPLOYMENT_UPDATED"; deployment: SpaceChainDto }
  | { type: "EXPIRED" }
  | { type: "ERROR"; error: DiagnosticError; status?: FlowStatus; clearSignature?: boolean }
  | { type: "ADD_EVENT"; event: DebugEvent }
  | { type: "CLEAR_LOG" }
  | { type: "CLEAR_SESSION" };

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "CONFIGURED":
      return {
        ...state,
        status: state.connectedWallet ? "wallet-connected" : "wallet-disconnected",
        error: undefined,
      };
    case "WALLET_CHANGED":
      if (
        action.wallet &&
        state.connectedWallet?.address === action.wallet.address
      ) {
        return { ...state, connectedWallet: action.wallet, error: undefined };
      }
      return {
        ...state,
        connectedWallet: action.wallet,
        storedWallet: undefined,
        payload: undefined,
        signatureHex: undefined,
        deployment: undefined,
        status: action.wallet ? "wallet-connected" : "wallet-disconnected",
        error: undefined,
      };
    case "CHAIN_LOADED":
      return { ...state, solanaChain: action.chain, status: "chain-loaded", error: undefined };
    case "GROUPS_LOADED":
      return {
        ...state,
        walletGroups: action.groups,
        walletGroup: action.selected,
        storedWallet: undefined,
        payload: undefined,
        signatureHex: undefined,
        deployment: undefined,
        status: state.solanaChain ? "chain-loaded" : state.status,
        error: undefined,
      };
    case "GROUP_SELECTED":
      return {
        ...state,
        walletGroup: action.group,
        storedWallet: undefined,
        payload: undefined,
        signatureHex: undefined,
        deployment: undefined,
        status: state.solanaChain ? "chain-loaded" : state.status,
        error: undefined,
      };
    case "WALLET_REGISTERED":
      return { ...state, storedWallet: action.wallet, status: "wallet-registered", error: undefined };
    case "SPACE_CREATED":
      return {
        ...state,
        spaceId: action.spaceId,
        payload: action.payload,
        signatureHex: undefined,
        deployment: undefined,
        skippedReason: action.skippedReason,
        status: action.payload ? "payload-ready" : "space-created",
        error: undefined,
      };
    case "SPACE_ID_CHANGED":
      return {
        ...state,
        spaceId: action.spaceId || undefined,
        payload: undefined,
        signatureHex: undefined,
        deployment: undefined,
        skippedReason: undefined,
        status: action.spaceId ? "space-created" : state.connectedWallet ? "wallet-connected" : "wallet-disconnected",
        error: undefined,
      };
    case "PAYLOAD_READY":
      return {
        ...state,
        spaceId: action.payload.spaceId,
        payload: action.payload,
        signatureHex: undefined,
        deployment: undefined,
        skippedReason: undefined,
        status: "payload-ready",
        error: undefined,
      };
    case "SIGNING":
      return { ...state, status: "awaiting-wallet-approval", error: undefined };
    case "SIGNED":
      return { ...state, signatureHex: action.signatureHex, status: "signed", error: undefined };
    case "SUBMITTING":
      return { ...state, status: "submitting", error: undefined };
    case "PENDING":
      return { ...state, deployment: action.deployment, status: "pending", error: undefined };
    case "DEPLOYMENT_UPDATED": {
      const deployment = action.deployment;
      if (deployment.isDeployed && deployment.address) {
        return { ...state, deployment, status: "deployed", error: undefined };
      }
      if (deployment.deployState === "failed") {
        return {
          ...state,
          deployment,
          payload: undefined,
          signatureHex: undefined,
          status: "failed",
          error: {
            source: "poll",
            message: deployment.deployError || "Solana deployment failed; fetch a fresh payload",
            raw: deployment,
          },
        };
      }
      return { ...state, deployment, status: "pending" };
    }
    case "EXPIRED":
      return { ...state, signatureHex: undefined, status: "expired" };
    case "ERROR":
      return {
        ...state,
        status: action.status ?? "failed",
        signatureHex: action.clearSignature ? undefined : state.signatureHex,
        error: action.error,
      };
    case "ADD_EVENT":
      return { ...state, events: [...state.events, action.event] };
    case "CLEAR_LOG":
      return { ...state, events: [] };
    case "CLEAR_SESSION":
      return { ...initialFlowState, status: "configuration-required" };
  }
}

export function normalizeError(
  error: unknown,
  source: DiagnosticError["source"],
): DiagnosticError {
  if (error instanceof ApiError) {
    return {
      source: "backend",
      status: error.status,
      code: error.code,
      message:
        error.status === 401
          ? "JWT is missing, expired, or invalid. Paste a fresh JWT before continuing."
          : error.message,
      raw: error.body,
      request: error.request,
    };
  }
  return {
    source,
    message: error instanceof Error ? error.message : String(error),
    raw: error,
  };
}
