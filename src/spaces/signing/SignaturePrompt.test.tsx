import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SignaturePrompt } from "./SignaturePrompt";
import type { SignatureItem } from "./signature-queue";

const approval: SignatureItem = {
  id: "spend-approval:spend-1",
  kind: "spend-approval",
  title: "Approve a spend",
  detail: "1000000 lamports to DestinationPubkey · 1 of 2 approved",
  digest: `0x${"11".repeat(32)}`,
};

describe("SignaturePrompt", () => {
  it("renders nothing when no signature is owed", () => {
    expect(renderToStaticMarkup(<SignaturePrompt items={[]} busy={false} onSign={vi.fn()} />)).toBe("");
  });

  it("announces the signature as an alert with what the wallet will sign", () => {
    const html = renderToStaticMarkup(<SignaturePrompt items={[approval]} busy={false} walletLabel="Vote…llet" onSign={vi.fn()} />);

    expect(html).toContain('role="alert"');
    expect(html).toContain("1 thing needs your signature");
    expect(html).toContain("Approve a spend");
    expect(html).toContain("raw 32-byte intent digest");
    expect(html).toContain("Sign now");
    expect(html).toContain("Vote…llet");
  });

  it("counts several pending signatures in plural", () => {
    const html = renderToStaticMarkup(<SignaturePrompt
      items={[approval, { ...approval, id: "member-send:send-1", kind: "member-send", title: "Sign an on-chain member change" }]}
      busy={false}
      onSign={vi.fn()}
    />);

    expect(html).toContain("2 things need your signature");
    expect(html).toContain("Sign an on-chain member change");
  });

  it("shortens the digest instead of printing all 32 bytes", () => {
    const html = renderToStaticMarkup(<SignaturePrompt items={[approval]} busy={false} onSign={vi.fn()} />);

    expect(html).toContain("0x11111111…11111111");
    expect(html).not.toContain("11".repeat(32));
  });

  it("explains a blocked item rather than offering a button that cannot work", () => {
    const html = renderToStaticMarkup(<SignaturePrompt
      items={[{ ...approval, blocked: "Connect the signing wallet first" }]}
      busy={false}
      onSign={vi.fn()}
    />);

    expect(html).toContain("Connect the signing wallet first");
    expect(html).not.toContain("Sign now");
  });

  it("sends the user back to the guardian flow instead of signing a stale payload", () => {
    const html = renderToStaticMarkup(<SignaturePrompt
      items={[{ id: "guardian:g-1", kind: "guardian", title: "A guardian action is waiting for its signature", detail: "rotate_guardian · start the operation again to get a fresh payload" }]}
      busy={false}
      onSign={vi.fn()}
    />);

    expect(html).toContain("Restart the guardian operation");
    expect(html).not.toContain("Sign now");
  });

  it("shows the wallet is busy while a prompt is open", () => {
    const html = renderToStaticMarkup(<SignaturePrompt items={[approval]} busy onSign={vi.fn()} />);

    expect(html).toContain("Waiting for the wallet…");
  });
});
