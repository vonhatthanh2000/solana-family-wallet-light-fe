import { describe, expect, it } from "vitest";
import type { VaultDto } from "../contracts";
import type { VaultTokenOptionDto } from "./contracts";
import { vaultsForSupportedToken } from "./token-selection";

const token = (tokenId: string, symbol: string, isNative: boolean): VaultTokenOptionDto => ({
  tokenId, name: symbol, symbol, decimals: isNative ? 9 : 6,
  tokenAddress: isNative ? "" : "backend-mint", isNative,
  chainObjectId: "sol-record", chainId: "devnet", chainType: "SOL",
  chainName: "Solana Devnet", network: "devnet",
});

const vault = (tokenId: string, symbol: string): VaultDto => ({
  vaultId: `${tokenId}-vault`, spaceId: "space", name: `${symbol} vault`,
  token: { tokenId, name: symbol, symbol, decimals: symbol === "SOL" ? 9 : 6, chainId: "devnet", chainType: "SOL" },
  balance: { amount: "0", formatted: "0" }, approvalRule: {}, usesDefaultRule: true,
  photos: [], createdBy: "owner", createdAt: "2026-01-01", updatedAt: "2026-01-01",
});

describe("backend-supported token selection", () => {
  it("matches vaults by backend token id instead of hardcoded USDT symbols", () => {
    const vaults = [vault("sol", "SOL"), vault("dusdt", "dUSDT")];

    expect(vaultsForSupportedToken(vaults, "devnet", token("sol", "SOL", true)).map((item) => item.vaultId)).toEqual(["sol-vault"]);
    expect(vaultsForSupportedToken(vaults, "devnet", token("dusdt", "dUSDT", false)).map((item) => item.vaultId)).toEqual(["dusdt-vault"]);
  });
});
