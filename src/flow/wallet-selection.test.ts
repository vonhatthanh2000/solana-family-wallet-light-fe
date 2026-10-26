import { describe, expect, it } from "vitest";
import {
  effectiveWallet,
  requireEffectiveSolanaWallet,
  planSolanaWalletRegistration,
  type IndexedWallet,
} from "./wallet-selection";

function wallet(
  address: string,
  walletIndex: number | null | undefined,
  overrides: Partial<IndexedWallet> = {},
): IndexedWallet {
  return {
    _id: `${address}-${String(walletIndex)}`,
    address,
    walletIndex,
    isActive: true,
    ...overrides,
  };
}

describe("backend-effective wallet selection", () => {
  it("selects the lowest active index and treats a legacy missing index as zero", () => {
    const selected = effectiveWallet([
      wallet("index-two", 2),
      wallet("inactive", -1, { isActive: false }),
      wallet("legacy-zero", undefined),
      wallet("index-one", 1),
    ]);

    expect(selected?.address).toBe("legacy-zero");
  });

  it("reuses an already-effective matching Solana wallet", () => {
    const result = planSolanaWalletRegistration({
      tonWallets: [wallet("ton", 0, { publicKey: "ab".repeat(32) })],
      solanaWallets: [wallet("connected", 2), wallet("connected", 0)],
      connectedAddress: "connected",
    });

    expect(result).toEqual({
      kind: "reuse",
      wallet: expect.objectContaining({ address: "connected", walletIndex: 0 }),
      tonWallet: expect.objectContaining({ address: "ton", walletIndex: 0 }),
      preferredIndex: 0,
    });
  });

  it("blocks when a lower effective Solana wallet belongs to another address", () => {
    const result = planSolanaWalletRegistration({
      tonWallets: [wallet("ton", 2, { publicKey: "ab".repeat(32) })],
      solanaWallets: [wallet("other-solana", 1)],
      connectedAddress: "connected",
    });

    expect(result).toEqual({
      kind: "blocked",
      message: expect.stringContaining("other-solana"),
    });
  });

  it("blocks a connected address stranded behind a different effective Solana wallet", () => {
    const result = planSolanaWalletRegistration({
      tonWallets: [wallet("ton", 0, { publicKey: "ab".repeat(32) })],
      solanaWallets: [wallet("other-solana", 2), wallet("connected", 3)],
      connectedAddress: "connected",
    });

    expect(result).toEqual({
      kind: "blocked",
      message: expect.stringContaining("already registered"),
    });
  });

  it("allows a safe lower-index registration to supersede a mismatching higher record", () => {
    const result = planSolanaWalletRegistration({
      tonWallets: [wallet("ton", 0, { publicKey: "ab".repeat(32) })],
      solanaWallets: [wallet("other-solana", 3)],
      connectedAddress: "connected",
    });

    expect(result).toEqual({
      kind: "register",
      tonWallet: expect.objectContaining({ address: "ton" }),
      preferredIndex: 0,
    });
  });

  it("requires the reloaded effective Solana wallet to match after registration", () => {
    expect(() =>
      requireEffectiveSolanaWallet(
        [wallet("other-solana", 0), wallet("connected", 1)],
        "connected",
      ),
    ).toThrow("still other-solana");

    expect(
      requireEffectiveSolanaWallet(
        [wallet("other-solana", 3), wallet("connected", 0)],
        "connected",
      ).address,
    ).toBe("connected");
  });
});
