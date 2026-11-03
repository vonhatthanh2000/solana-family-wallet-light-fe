import { describe, expect, it } from "vitest";
import { parseCategories, parseMoneyQuote, parseSpends, parseVaultTokenOptions, solReserveFrom } from "./contracts";

describe("Space action contracts", () => {
  it("accepts either public id spelling for categories", () => {
    expect(parseCategories([
      { id: "public-id", name: "Food", isOthers: false },
      { _id: "mongo-id", name: "Other", isOthers: true },
    ])).toEqual([
      { id: "public-id", name: "Food", isOthers: false },
      { id: "mongo-id", name: "Other", isOthers: true },
    ]);
  });

  it("keeps quoted and spend amounts lossless", () => {
    const amount = "900719925474099312345";
    expect(parseMoneyQuote({
      source: "SHARED", available: { amount, formatted: "900719925474.099312345" },
      need: 2, voters: 3, amount: { amount, formatted: "900719925474.099312345", usd: null },
    }).amount?.amount).toBe(amount);
    expect(parseSpends([{
      spendId: "spend", chainType: "SOL", chainId: "devnet", status: "submitted",
      proposedBy: "owner", action: { token: "native", amount, destination: "destination" },
      intent: { digest: `0x${"11".repeat(32)}`, signed: {} }, note: null, categoryId: null,
      vaultId: null, requiredApprovals: 1, approverIds: ["owner"], declinerIds: [],
      readyToSend: false, send: null, txHash: "transaction",
    }])[0]?.action.amount).toBe(amount);
  });

  it("keeps backend dUSDT metadata available even when the Space hides the asset", () => {
    const tokens = parseVaultTokenOptions([{
      tokenId: "dusdt", name: "Devnet USDT", symbol: "dUSDT", decimals: 6,
      tokenAddress: "Ex6Bkm2vTVmrbdn74iYjigzpVYhPjoxQVEnBPm9MEP7F", isNative: false,
      chainObjectId: "sol-record", chainId: "devnet", chainType: "SOL",
      chainName: "Solana Devnet", network: "devnet", isHidden: true,
    }]);

    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ symbol: "dUSDT", tokenAddress: "Ex6Bkm2vTVmrbdn74iYjigzpVYhPjoxQVEnBPm9MEP7F" });
  });

  it("reads the SOL reserve from a spend-fee response and from a refusal body", () => {
    const reserve = {
      spaceAddress: "space-pda", heldLamports: "2136720", neededLamports: "3236720",
      shortfallLamports: "1100000", topUpLamports: "1200000", topUpSol: "0.0012", coversSpends: 20,
    };
    const expected = {
      spaceAddress: "space-pda", heldLamports: "2136720", neededLamports: "3236720",
      shortfallLamports: "1100000", topUpLamports: "1200000", coversSpends: 20,
    };

    expect(solReserveFrom({ amount: "5000", usd: "0.01", solReserve: reserve })).toEqual(expected);
    // Propose and execute refuse with the same object in the error body.
    expect(solReserveFrom({ statusCode: 400, code: "RESERVE_TOO_LOW", solReserve: reserve })).toEqual(expected);
    expect(solReserveFrom({ code: "RESERVE_TOO_LOW", details: { solReserve: reserve } })).toEqual(expected);
  });

  it("treats a missing, covered, or unusable reserve as nothing to report", () => {
    const reserve = {
      spaceAddress: "space-pda", heldLamports: "2136720", neededLamports: "3236720",
      shortfallLamports: "1100000", topUpLamports: "1200000", coversSpends: 20,
    };

    expect(solReserveFrom({ amount: "5000", usd: "0.01" })).toBeUndefined();
    expect(solReserveFrom(undefined)).toBeUndefined();
    // A shortfall of zero is a funded Space, so there is no notice to show.
    expect(solReserveFrom({ solReserve: { ...reserve, shortfallLamports: "0" } })).toBeUndefined();
    // Never guess the destination or the amount to ask for.
    expect(solReserveFrom({ solReserve: { ...reserve, spaceAddress: "" } })).toBeUndefined();
    expect(solReserveFrom({ solReserve: { ...reserve, topUpLamports: "0.0012" } })).toBeUndefined();
  });
});
