import { useState } from "react";
import type { SignatureItem } from "./signature-queue";

type Props = {
  items: SignatureItem[];
  busy: boolean;
  walletLabel?: string;
  onSign(item: SignatureItem): void;
};

const KIND_HINTS: Record<string, string> = {
  "spend-approval": "Your wallet signs the raw 32-byte intent digest. Approving does not move money.",
  "spend-execution": "Your wallet signs the raw 32-byte send digest inside its five-minute window.",
  "member-send": "Your wallet signs the raw 32-byte member-send digest for this chain.",
  guardian: "Guardian payloads expire, so start the operation again to get a fresh digest.",
};

function shortDigest(digest: string | undefined): string | undefined {
  if (!digest) return undefined;
  const body = digest.startsWith("0x") ? digest.slice(2) : digest;
  return body.length > 16 ? `0x${body.slice(0, 8)}…${body.slice(-8)}` : digest;
}

// A signature is the one step the app cannot take on the member's behalf, so it gets its own window
// rather than a line buried in whichever panel owns the action.
export function SignaturePrompt({ items, busy, walletLabel, onSign }: Props) {
  const [hidden, setHidden] = useState(false);
  if (!items.length) return null;

  if (hidden) {
    return (
      <aside className="signature-prompt collapsed" role="status">
        <button type="button" onClick={() => setHidden(false)}>
          {items.length} signature{items.length === 1 ? "" : "s"} needed
        </button>
      </aside>
    );
  }

  return (
    <aside className="signature-prompt" role="alert" aria-labelledby="signature-prompt-title">
      <div className="signature-prompt-heading">
        <div>
          <span className="eyebrow">Waiting for your wallet</span>
          <strong id="signature-prompt-title">
            {items.length} thing{items.length === 1 ? "" : "s"} need{items.length === 1 ? "s" : ""} your signature
          </strong>
        </div>
        <button type="button" className="secondary" onClick={() => setHidden(true)} aria-label="Collapse signature window">–</button>
      </div>
      {walletLabel && <p className="muted">Signing wallet: <code>{walletLabel}</code></p>}
      <div className="signature-prompt-list">
        {items.map((item) => (
          <article key={item.id}>
            <strong>{item.title}</strong>
            <span className="muted">{item.detail}</span>
            <small className="hint">{KIND_HINTS[item.kind]}</small>
            {shortDigest(item.digest) && <code className="mono">{shortDigest(item.digest)}</code>}
            {item.blocked
              ? <span className="status status-pending">{item.blocked}</span>
              : item.kind === "guardian"
                ? <span className="status status-signing">Restart the guardian operation</span>
                : <button type="button" disabled={busy} onClick={() => onSign(item)}>{busy ? "Waiting for the wallet…" : "Sign now"}</button>}
          </article>
        ))}
      </div>
    </aside>
  );
}
