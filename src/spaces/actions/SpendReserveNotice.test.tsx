import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ConnectedSigner } from "../../solana/signers/types";
import { SpendReserveNotice } from "./SpendReserveNotice";
import type { SolReserveDto } from "./contracts";

const reserve: SolReserveDto = {
  spaceAddress: "space-pda", heldLamports: "2136720", neededLamports: "3236720",
  shortfallLamports: "1100000", topUpLamports: "1200000", coversSpends: 20,
};
const chain = { chainObjectId: "sol", chainId: "devnet", chainType: "SOL", address: "space-pda", isDeployed: true };
const signer: ConnectedSigner = {
  address: "sender", provider: "Test wallet", canSignDigest: true, canSignTransaction: true,
  publicKeyBytes: () => new Uint8Array(32), signDigest32: vi.fn(), signAndSendTransaction: vi.fn(),
};

describe("spend reserve notice", () => {
  it("asks for the top-up amount, names the Space address, and offers to deposit it", () => {
    const html = renderToStaticMarkup(<SpendReserveNotice
      reserve={reserve}
      chain={chain}
      signer={signer}
      fallbackNetwork="devnet"
      onFunded={vi.fn(async () => undefined)}
    />);

    expect(html).toContain("needs a little SOL to send");
    expect(html).toContain("Deposit 0.0012 SOL to the Space to cover about 20 transactions");
    expect(html).toContain("space-pda");
    // Worded as setup, not as a failure.
    expect(html).toContain("not an error");
    expect(html).toContain("result warning");
    expect(html).not.toContain("disabled=\"\"");
  });

  it("warns that a token deposit address cannot fund the Space", () => {
    const html = renderToStaticMarkup(<SpendReserveNotice
      reserve={reserve}
      chain={chain}
      signer={signer}
      fallbackNetwork="devnet"
      onFunded={vi.fn(async () => undefined)}
    />);

    expect(html).toContain("not a token account");
    expect(html).toContain("A token deposit address will not fund the Space");
  });

  it("falls back to sending manually when no wallet can sign", () => {
    const html = renderToStaticMarkup(<SpendReserveNotice
      reserve={reserve}
      chain={chain}
      fallbackNetwork="devnet"
      onFunded={vi.fn(async () => undefined)}
    />);

    expect(html).toContain("send the SOL yourself to the address above");
    expect(html).toContain("disabled=\"\"");
  });
});
