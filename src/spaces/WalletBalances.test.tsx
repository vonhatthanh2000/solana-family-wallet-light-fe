import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BalanceCards } from "./WalletBalances";
import type { WalletBalance } from "./balances";

const balances: WalletBalance[] = [
  {
    label: "Personal wallet", address: "sender-address", lamports: "1500000",
    tokens: [{ mint: "mint", symbol: "dUSDT", decimals: 6, baseUnits: "25000000", ata: "sender-ata" }],
  },
  {
    label: "Space wallet", address: "space-pda", lamports: "2136720",
    tokens: [{ mint: "mint", symbol: "dUSDT", decimals: 6, baseUnits: "10000000", ata: "space-ata" }],
  },
];

describe("balance cards", () => {
  it("shows the personal and Space wallets with their SOL and token amounts", () => {
    const html = renderToStaticMarkup(<BalanceCards balances={balances} busy={false} onRefresh={vi.fn()} readAt="10:30:00" />);

    expect(html).toContain("Personal wallet");
    expect(html).toContain("Space wallet");
    expect(html).toContain("sender-address");
    expect(html).toContain("space-pda");
    expect(html).toContain("<dd>0.0015</dd>");
    expect(html).toContain("<dd>0.00213672</dd>");
    expect(html).toContain("<dd>25</dd>");
    expect(html).toContain("<dd>10</dd>");
    expect(html).toContain("Read at 10:30:00");
  });

  it("says a token account is unopened rather than showing zero", () => {
    const html = renderToStaticMarkup(<BalanceCards busy={false} onRefresh={vi.fn()} balances={[{
      label: "Space wallet", address: "space-pda", lamports: "0",
      tokens: [{ mint: "mint", symbol: "dUSDT", decimals: 6, ata: "space-ata" }],
    }]} />);

    expect(html).toContain("No token account yet");
  });

  it("surfaces an RPC failure instead of implying the wallets are empty", () => {
    const html = renderToStaticMarkup(<BalanceCards balances={[]} busy={false} error="429 Too Many Requests" onRefresh={vi.fn()} />);

    expect(html).toContain("Could not read balances");
    expect(html).toContain("429 Too Many Requests");
    expect(html).not.toContain("Connect a wallet and deploy");
  });
});
