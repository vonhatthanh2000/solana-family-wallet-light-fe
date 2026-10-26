import { describe, expect, it } from "vitest";
import type { SolanaOpenPayload, SpaceChainDto } from "../api/types";
import type { ConnectedSigner } from "../solana/signers/types";
import { flowReducer, initialFlowState, type FlowState } from "./state";

const wallet: ConnectedSigner = {
  address: "wallet",
  provider: "Test",
  publicKeyBytes: () => new Uint8Array(32),
  canSignDigest: true,
  signDigest32: async () => new Uint8Array(64),
};

const payload = {
  spaceId: "0x01",
  chainObjectId: "chain",
  chainId: "0x67",
  chainType: "SOL",
  address: "pda",
  programId: "program",
  creator: `0x${"00".repeat(32)}`,
  digest: `0x${"11".repeat(32)}`,
  config: "config",
  validAfter: 1,
  validUntil: 2,
  guardian: "0x01",
  owner: `0x${"00".repeat(32)}`,
  members: ["0x03"],
} satisfies SolanaOpenPayload;

function activeState(overrides: Partial<FlowState> = {}): FlowState {
  return {
    ...initialFlowState,
    status: "signed",
    connectedWallet: wallet,
    payload,
    signatureHex: "ab".repeat(64),
    ...overrides,
  };
}

describe("flowReducer", () => {
  it("clears payload and signature on account change", () => {
    const changed = flowReducer(activeState(), {
      type: "WALLET_CHANGED",
      wallet: { ...wallet, address: "another-wallet" },
    });
    expect(changed.payload).toBeUndefined();
    expect(changed.signatureHex).toBeUndefined();
  });

  it("keeps the payload while replacing a stale wallet adapter for the same account", () => {
    const reconnectedWallet = {
      ...wallet,
      signDigest32: async () => new Uint8Array(64).fill(1),
    };
    const reconnected = flowReducer(activeState(), {
      type: "WALLET_CHANGED",
      wallet: reconnectedWallet,
    });

    expect(reconnected.connectedWallet).toBe(reconnectedWallet);
    expect(reconnected.payload).toBe(payload);
    expect(reconnected.signatureHex).toBe("ab".repeat(64));
  });

  it("does not report deployed from pending without isDeployed and an address", () => {
    const deployment: SpaceChainDto = {
      chainObjectId: "chain",
      chainId: "0x67",
      chainType: "SOL",
      address: "pda",
      isDeployed: false,
      deployState: "pending",
    };
    const next = flowReducer(activeState({ status: "pending" }), {
      type: "DEPLOYMENT_UPDATED",
      deployment,
    });
    expect(next.status).toBe("pending");
  });

  it("requires a fresh payload after failed deployment", () => {
    const next = flowReducer(activeState({ status: "pending" }), {
      type: "DEPLOYMENT_UPDATED",
      deployment: {
        chainObjectId: "chain",
        chainId: "0x67",
        chainType: "SOL",
        address: null,
        isDeployed: false,
        deployState: "failed",
        deployError: "guardian refused",
      },
    });
    expect(next.status).toBe("failed");
    expect(next.payload).toBeUndefined();
    expect(next.signatureHex).toBeUndefined();
  });

  it("discards the one-use payload and signature when the payload expires", () => {
    const next = flowReducer(activeState(), { type: "EXPIRED" });

    expect(next.status).toBe("expired");
    expect(next.payload).toBeUndefined();
    expect(next.signatureHex).toBeUndefined();
  });

  it.each(["INVALID_SIGNATURE", "OPEN_PAYLOAD_STALE"])(
    "requires a fresh payload after %s",
    (code) => {
      const next = flowReducer(activeState({ status: "submitting" }), {
        type: "ERROR",
        error: { source: "backend", code, message: code },
        status: code === "OPEN_PAYLOAD_STALE" ? "expired" : "failed",
        clearPayload: true,
        clearSignature: true,
      });

      expect(next.payload).toBeUndefined();
      expect(next.signatureHex).toBeUndefined();
    },
  );

  it("leaves an ambiguous Create failure stopped for explicit user action", () => {
    const next = flowReducer(activeState({ status: "submitting" }), {
      type: "ERROR",
      error: { source: "backend", message: "Create result is ambiguous" },
      status: "failed",
    });
    expect(next.status).toBe("failed");
    expect(next.error?.message).toContain("ambiguous");
  });
});
