import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DepositCostPanel } from "./DepositPanel";
import { deviceCostView, quoteCostView } from "./deposit-cost";

const quote = {
  tokenId: "dusdt", mint: "mint", decimals: 6, destination: "space-ata",
  ataExists: false,
  fees: { transactionFeeLamports: "5000", rentLamports: "2039280", totalLamports: "2044280" },
  sender: "sender", senderLamports: "3000000", shortfallLamports: "0",
};

describe("deposit cost UI", () => {
  it("quotes the one-off rent as part of the first deposit of a token", () => {
    const html = renderToStaticMarkup(<DepositCostPanel view={quoteCostView(quote, "dUSDT")} />);

    expect(html).toContain("First deposit of dUSDT");
    expect(html).toContain("once per token");
    expect(html).toContain("0.00203928 SOL");
    expect(html).toContain("0.000005 SOL");
    expect(html).toContain("0.00204428 SOL");
    expect(html).not.toContain("SOL more");
  });

  it("charges only the network fee once the Space's token account exists", () => {
    const html = renderToStaticMarkup(<DepositCostPanel view={quoteCostView({
      ...quote, ataExists: true,
      fees: { transactionFeeLamports: "5000", rentLamports: "0", totalLamports: "5000" },
    }, "dUSDT")} />);

    expect(html).not.toContain("First deposit of dUSDT");
    expect(html).toContain("already open, so only the network fee applies");
    expect(html).toContain("<dd>0 SOL</dd>");
  });

  it("states the shortfall when the quote says the wallet cannot cover the cost", () => {
    const html = renderToStaticMarkup(<DepositCostPanel view={quoteCostView({
      ...quote, senderLamports: "1500000", shortfallLamports: "544280",
    }, "dUSDT")} />);

    expect(html).toContain("needs 0.00054428 SOL more");
    expect(html).toContain("Deposit stays disabled");
    expect(html).toContain("result failure");
  });

  it("never renders rent the backend could not read as free", () => {
    const html = renderToStaticMarkup(<DepositCostPanel view={deviceCostView({
      feeLamports: "5000", opensTokenAccount: true, senderLamports: "3000000",
    }, "dUSDT")} />);

    expect(html).toContain("could not be read");
    expect(html).toContain("unknown rather than zero");
    expect(html).toContain("<dd>Unknown</dd>");
    expect(html).toContain("Priced on this device");
  });

  it("prices a native deposit on the device, with no account rent at all", () => {
    const html = renderToStaticMarkup(<DepositCostPanel view={deviceCostView({
      feeLamports: "5000", rentLamports: "0", requiredLamports: "100005000",
      senderLamports: "3000000", shortfallLamports: "97005000", opensTokenAccount: false,
    }, "SOL")} />);

    expect(html).not.toContain("One-off account rent");
    expect(html).toContain("SOL needed in total");
    expect(html).toContain("needs 0.097005 SOL more");
  });
});
