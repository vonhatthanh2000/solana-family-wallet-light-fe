import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ActivityPanel } from "./ActivityPanel";
import type { ActivityRowDto } from "./contracts";
import type { SpaceActivityFlow } from "./useSpaceActivity";

const pendingSpend: ActivityRowDto = {
  id: "act-1", kind: "spend_request", state: "pending", status: "open", icon: "request",
  occurredAt: "2026-10-06T08:20:00.000Z",
  amount: { value: "45000000", decimals: 6, symbol: "USDT", sign: "-", muted: true },
  title: { key: "noti.family.spend_request.title", params: { actor: { id: "u1", name: "Minho", isYou: false } } },
  subLine: { key: "noti.family.common.from_for", params: { source: { type: "shared_wallet" }, category: { name: "Groceries" } } },
  badge: { key: "noti.family.badge.approved_count", params: { v: 1, n: 3 }, tone: "amber" },
  target: { screen: "tx_details", id: "act-1", spendId: "spend-1" },
};

const settledDeposit: ActivityRowDto = {
  id: "act-2", kind: "money_in", state: "settled", status: "complete", icon: "money_in",
  occurredAt: "2026-10-05T08:20:00.000Z",
  amount: { value: "2000000000", decimals: 9, symbol: "SOL", sign: "+", muted: false },
  title: { key: "noti.family.money_in.title", params: { envelope: { type: "shared_wallet" } } },
  subLine: { key: "noti.family.common.by", params: { actor: { id: "u1", name: "Minho", isYou: true } } },
  target: null,
};

function flow(overrides: Partial<SpaceActivityFlow> = {}): SpaceActivityFlow {
  return {
    view: "recent",
    recent: { pending: [pendingSpend], settled: [settledDeposit], hasMore: true },
    history: undefined,
    ledger: undefined,
    detail: undefined,
    filter: { page: 1, limit: 20 },
    ledgerPage: 1,
    loading: false,
    error: undefined,
    pendingCount: 1,
    showView: vi.fn(),
    applyFilter: vi.fn(),
    goToPage: vi.fn(),
    goToLedgerPage: vi.fn(),
    openDetail: vi.fn(async () => undefined),
    closeDetail: vi.fn(),
    clearError: vi.fn(),
    refresh: vi.fn(async () => undefined),
    ...overrides,
  } as SpaceActivityFlow;
}

describe("ActivityPanel", () => {
  it("renders the i18n rows as English copy with lossless amounts", () => {
    const html = renderToStaticMarkup(<ActivityPanel flow={flow()} vaults={[]} categories={[]} />);

    expect(html).toContain("Minho asked to send money");
    expect(html).toContain("From the Shared Wallet · Groceries");
    expect(html).toContain("1 of 3 approved");
    expect(html).toContain("-45 USDT");
    expect(html).toContain("Money added to the Shared Wallet");
    expect(html).toContain("+2 SOL");
    expect(html).toContain("By You");
  });

  it("separates what is waiting on the family from what has settled", () => {
    const html = renderToStaticMarkup(<ActivityPanel flow={flow()} vaults={[]} categories={[]} />);

    expect(html).toContain("Waiting on the family (1)");
    expect(html).toContain("Settled");
    expect(html).toContain("View all activity");
  });

  it("mutes money that has not moved yet", () => {
    const html = renderToStaticMarkup(<ActivityPanel flow={flow()} vaults={[]} categories={[]} />);

    expect(html).toContain('class="activity-amount muted">-45 USDT');
    expect(html).toContain('class="activity-amount">+2 SOL');
  });

  it("says the queue is empty rather than implying nothing happened", () => {
    const html = renderToStaticMarkup(<ActivityPanel
      flow={flow({ recent: { pending: [], settled: [], hasMore: false }, pendingCount: 0 })}
      vaults={[]}
      categories={[]}
    />);

    expect(html).toContain("Nothing is waiting for a vote or a send.");
    expect(html).toContain("No settled activity yet.");
  });

  it("offers the documented history filters on the View all screen", () => {
    const html = renderToStaticMarkup(<ActivityPanel
      flow={flow({
        view: "history",
        history: { pending: [], data: [settledDeposit], meta: { currentPage: 2, from: 21, perPage: 20, lastPage: 3, to: 40, total: 47 } },
      })}
      vaults={[{ vaultId: "v1", name: "Holiday" } as never]}
      categories={[{ id: "c1", name: "Groceries" }]}
    />);

    expect(html).toContain("Holiday");
    expect(html).toContain("Groceries");
    expect(html).toContain("Page 2 of 3 · 47 rows");
  });

  it("shows a ledger row with its copyable transaction identifier", () => {
    const html = renderToStaticMarkup(<ActivityPanel
      flow={flow({
        view: "ledger",
        ledger: [{
          txHash: "solana-signature", direction: "in", token: "native", symbol: "SOL",
          decimals: 9, amount: "1500000000", fee: null, counterparty: "SenderPubkey", timestamp: 1700000000,
        }],
      })}
      vaults={[]}
      categories={[]}
    />);

    expect(html).toContain("Deposit · SOL");
    expect(html).toContain("+1.5 SOL");
    expect(html).toContain("solana-signature");
    expect(html).toContain("Not recorded");
  });

  it("renders a detail record, including the chain explorer link", () => {
    const html = renderToStaticMarkup(<ActivityPanel
      flow={flow({
        detail: {
          ...settledDeposit,
          detail: {
            by: { id: "u1", name: "Minho", isYou: false },
            chain: { txHash: "sig-1", explorerUrl: "https://explorer.example/tx/sig-1", name: "Solana" },
            stampsUsed: 0,
          },
        },
      })}
      vaults={[]}
      categories={[]}
    />);

    expect(html).toContain("Minho");
    expect(html).toContain("sig-1");
    expect(html).toContain("https://explorer.example/tx/sig-1");
    expect(html).toContain("Close details");
  });

  it("surfaces a backend failure instead of an empty feed", () => {
    const html = renderToStaticMarkup(<ActivityPanel
      flow={flow({ error: { message: "Space not found", source: "backend", status: 404, code: "SPACE_NOT_FOUND" } })}
      vaults={[]}
      categories={[]}
    />);

    expect(html).toContain("Could not load activity");
    expect(html).toContain("Space not found");
  });
});
