import { describe, expect, it } from "vitest";
import { parseSpaceDetail, parseSpaceList, parseVaults } from "./contracts";

const balance = {
  spaceId: "0xspace",
  totalUsd: 125.5,
  unallocatedUsd: 25.5,
  partial: true,
  chains: [{
    chainObjectId: "sol-chain",
    chainId: "devnet",
    chainType: "SOL",
    address: "space-pda",
    tokens: [{
      token: "native",
      tokenId: "sol-token",
      symbol: "SOL",
      decimals: 9,
      amount: null,
      formatted: null,
      priceUsd: 125.5,
      change24h: null,
      valueUsd: null,
      unallocatedAmount: null,
      unallocatedFormatted: null,
      unallocatedValueUsd: null,
      inVaultAmount: "900719925474099312345",
      inVaultFormatted: "100",
      vaultCount: 2,
    }],
  }],
};

describe("Space dashboard contracts", () => {
  it("keeps unknown balances null and exact blockchain amounts as strings", () => {
    const space = parseSpaceList([{
      spaceId: "0xspace",
      name: "Family",
      purpose: "FAMILY",
      role: "OWNER",
      memberCount: 3,
      membershipStatus: "ACTIVE",
      chains: [],
      balance,
    }])[0]!;

    expect(space.balance).toMatchObject({ partial: true, totalUsd: 125.5 });
    expect(space.balance?.chains[0]?.tokens[0]).toMatchObject({
      amount: null,
      valueUsd: null,
      inVaultAmount: "900719925474099312345",
    });
  });

  it("accepts the reduced pending membership shape", () => {
    const space = parseSpaceList([{
      spaceId: "0xpending",
      name: "Friends",
      purpose: "FRIENDS",
      role: "MEMBER",
      membershipStatus: "PENDING",
      requestId: "request-id",
      status: "EXECUTING",
    }])[0]!;

    expect(space).toMatchObject({ membershipStatus: "PENDING", status: "EXECUTING" });
    expect(space.memberCount).toBeUndefined();
  });

  it("parses active detail without the backend's optional membershipStatus", () => {
    const detail = parseSpaceDetail({
      spaceId: "0xspace",
      name: "Family",
      purpose: "FAMILY",
      role: "OWNER",
      memberCount: 3,
      defaultRule: { alwaysAsk: false, thresholdUsd: "200", quorumPercent: 50 },
      chains: [{
        chainObjectId: "sol-chain",
        chainId: "devnet",
        chainType: "SOL",
        address: "space-pda",
        isDeployed: true,
      }],
      balance,
    });

    expect(detail.membershipStatus).toBe("ACTIVE");
    expect(detail.defaultRule.thresholdUsd).toBe("200");
  });

  it("parses vault balances and goals without numeric conversion", () => {
    const vault = parseVaults([{
      vaultId: "vault-id",
      spaceId: "0xspace",
      name: "Travel",
      token: { tokenId: "token-id", name: "Tether", symbol: "USDT", decimals: 6, chainId: "devnet", chainType: "SOL" },
      goalAmount: "2500.25",
      balance: { amount: "1500500000", formatted: "1500.5" },
      approvalRule: { alwaysAsk: true, quorumPercent: 75 },
      usesDefaultRule: false,
      photos: [],
      createdBy: "owner-id",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-02T00:00:00.000Z",
    }])[0]!;

    expect(vault.balance).toEqual({ amount: "1500500000", formatted: "1500.5" });
    expect(vault.goalAmount).toBe("2500.25");
  });
});
