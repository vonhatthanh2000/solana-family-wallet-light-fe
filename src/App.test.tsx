import { getWallets } from "@wallet-standard/app";
import type { Wallet } from "@wallet-standard/base";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import App from "./App";

describe("signing provider selection", () => {
  it("offers provider-neutral wallet selection and the development signer", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Select wallet");
    expect(html).toContain("Connect wallet");
    expect(html).toContain("Use test signer");
    expect(html).toContain("Solana signing wallet");
    expect(html).toContain("Install or unlock Solflare in this browser profile, then reload");
    expect(html).toContain("Member management");
    expect(html).toContain("Requests to approve");
    expect(html).toContain("Actions waiting for my signature");
  });

  it("shows a compatible Solflare wallet in the selector", () => {
    const solflare: Wallet = {
      version: "1.0.0",
      name: "Solflare",
      icon: "data:image/svg+xml;base64,PHN2Zy8+",
      chains: ["solana:devnet"],
      accounts: [],
      features: {
        "standard:connect": { version: "1.0.0", connect: vi.fn() },
        "standard:events": { version: "1.0.0", on: vi.fn() },
        "solana:signMessage": { version: "1.1.0", signMessage: vi.fn() },
      },
    };
    const unregister = getWallets().register(solflare);
    try {
      const html = renderToStaticMarkup(<App />);
      expect(html).toContain("Solflare");
      expect(html).toContain("Solflare icon");
    } finally {
      unregister();
    }
  });
});
