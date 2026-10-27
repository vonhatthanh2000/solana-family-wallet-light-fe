import { describe, expect, it } from "vitest";
import { parseCategories, parseMoneyQuote, parseSpends } from "./contracts";

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
});
