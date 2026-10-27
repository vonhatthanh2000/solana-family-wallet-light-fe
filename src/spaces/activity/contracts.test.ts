import { describe, expect, it } from "vitest";
import {
  parseActivityDetail, parseActivityHistory, parseActivityList, parseActivityRow, parseLedger,
} from "./contracts";

const row = {
  id: "act-1",
  kind: "spend_request",
  state: "pending",
  status: "open",
  icon: "request",
  occurredAt: "2026-10-06T08:20:00.000Z",
  amount: { value: "45000000", decimals: 6, symbol: "USDT", sign: "-", muted: true },
  title: { key: "noti.family.spend_request.title", params: { actor: { id: "u1", name: "Minho", isYou: false } } },
  subLine: { key: "noti.family.common.from_for", params: {} },
  badge: { key: "noti.family.badge.approved_count", params: { v: 1, n: 2 }, tone: "amber" },
  target: { screen: "tx_details", id: "act-1", spendId: "spend-1", chainType: "SOL", chainId: "devnet" },
};

describe("parseActivityRow", () => {
  it("keeps the i18n params untouched so the client owns the wording", () => {
    const parsed = parseActivityRow(row);
    expect(parsed.title.params).toEqual({ actor: { id: "u1", name: "Minho", isYou: false } });
    expect(parsed.badge?.tone).toBe("amber");
    expect(parsed.target?.spendId).toBe("spend-1");
  });

  it("accepts a row that opens nothing and carries no amount or badge", () => {
    const parsed = parseActivityRow({ ...row, amount: undefined, badge: undefined, target: null });
    expect(parsed.amount).toBeUndefined();
    expect(parsed.badge).toBeUndefined();
    expect(parsed.target).toBeNull();
  });

  it("rejects an amount whose sign is not + or -", () => {
    expect(() => parseActivityRow({ ...row, amount: { ...row.amount, sign: "?" } })).toThrow(/sign/);
  });

  it("keeps the smallest-unit amount as text", () => {
    expect(parseActivityRow(row).amount?.value).toBe("45000000");
  });
});

describe("parseActivityList", () => {
  it("splits pending from settled and reports whether older rows exist", () => {
    const parsed = parseActivityList({ pending: [row], settled: [], hasMore: true });
    expect(parsed.pending).toHaveLength(1);
    expect(parsed.settled).toEqual([]);
    expect(parsed.hasMore).toBe(true);
  });

  it("rejects a response without its arrays", () => {
    expect(() => parseActivityList({ pending: [row] })).toThrow(/settled/);
  });
});

describe("parseActivityHistory", () => {
  it("reads the pending block, the paged rows and the page meta", () => {
    const parsed = parseActivityHistory({
      pending: [row],
      data: [{ ...row, id: "act-2", state: "settled", status: "complete" }],
      meta: { currentPage: 2, from: 21, perPage: 20, lastPage: 3, to: 40, total: 47 },
    });
    expect(parsed.pending[0]!.id).toBe("act-1");
    expect(parsed.data[0]!.id).toBe("act-2");
    expect(parsed.meta.lastPage).toBe(3);
  });

  it("treats a missing pending block as empty rather than failing", () => {
    const parsed = parseActivityHistory({
      data: [],
      meta: { currentPage: 1, from: 0, perPage: 20, lastPage: 1, to: 0, total: 0 },
    });
    expect(parsed.pending).toEqual([]);
  });
});

describe("parseActivityDetail", () => {
  it("keeps the open-ended detail record beside the row fields", () => {
    const parsed = parseActivityDetail({
      ...row,
      detail: { chain: { txHash: "sig", explorerUrl: "https://explorer" }, stampsUsed: 0 },
    });
    expect(parsed.id).toBe("act-1");
    expect(parsed.detail.stampsUsed).toBe(0);
  });

  it("defaults an absent detail record to an empty object", () => {
    expect(parseActivityDetail(row).detail).toEqual({});
  });
});

describe("parseLedger", () => {
  const ledgerRow = {
    txHash: "sig-1",
    direction: "in",
    token: "native",
    symbol: "SOL",
    decimals: 9,
    amount: "1000000",
    fee: null,
    counterparty: "SenderPubkey",
    timestamp: 1700000000,
  };

  it("reads a deposit row and keeps a missing fee as null", () => {
    const [parsed] = parseLedger([ledgerRow]);
    expect(parsed!.amount).toBe("1000000");
    expect(parsed!.fee).toBeNull();
  });

  it("accepts a paged response that wraps its rows in items", () => {
    expect(parseLedger({ items: [ledgerRow] })).toHaveLength(1);
  });

  it("rejects a response that is neither an array nor paged", () => {
    expect(() => parseLedger({ rows: [] })).toThrow(/ledger response/);
  });
});
