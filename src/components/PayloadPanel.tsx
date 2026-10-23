import type { SolanaOpenPayload } from "../api/types";
import type { ConnectedWallet } from "../solana/phantom";
import { hexToBytes32, publicKeyHex } from "../solana/signing";

type Props = {
  payload?: SolanaOpenPayload;
  wallet?: ConnectedWallet;
  signatureHex?: string;
  secondsRemaining?: number;
  signabilityError?: string;
  awaitingApproval: boolean;
  onSign(): void;
};

export function PayloadPanel({
  payload,
  wallet,
  signatureHex,
  secondsRemaining,
  signabilityError,
  awaitingApproval,
  onSign,
}: Props) {
  let digestLength: number | undefined;
  if (payload) {
    try {
      digestLength = hexToBytes32(payload.digest).length;
    } catch {
      digestLength = undefined;
    }
  }
  const connectedHex = wallet ? publicKeyHex(wallet.publicKeyBytes()) : undefined;
  const creatorMatches = payload && connectedHex
    ? payload.creator.toLowerCase() === connectedHex.toLowerCase() &&
      payload.owner.toLowerCase() === connectedHex.toLowerCase()
    : undefined;

  return (
    <section>
      <h2>5. Payload and signature</h2>
      {payload ? (
        <>
          <dl>
            <dt>Payload creator</dt>
            <dd className="mono wrap">{payload.creator}</dd>
            <dt>Connected key</dt>
            <dd className="mono wrap">{connectedHex ?? "—"}</dd>
            <dt>Creator/owner match</dt>
            <dd className={creatorMatches ? "good" : "bad"}>{creatorMatches ? "yes" : "NO"}</dd>
            <dt>Digest</dt>
            <dd className="mono wrap">{payload.digest}</dd>
            <dt>Decoded length</dt>
            <dd>{digestLength === undefined ? "invalid" : `${digestLength} bytes`}</dd>
            <dt>Signing protocol</dt>
            <dd>v{payload.signingMessageVersion} · {payload.signingMessageEncoding}</dd>
            <dt>Signing message</dt>
            <dd className="mono wrap signing-message">{payload.signingMessage}</dd>
            <dt>Valid after</dt>
            <dd>{payload.validAfter} ({new Date(payload.validAfter * 1_000).toISOString()})</dd>
            <dt>Valid until</dt>
            <dd>{payload.validUntil} ({new Date(payload.validUntil * 1_000).toISOString()})</dd>
            <dt>Seconds remaining</dt>
            <dd>{secondsRemaining ?? "—"}</dd>
          </dl>
          <div className="actions">
            <button onClick={onSign} disabled={Boolean(signabilityError) || awaitingApproval}>
              {awaitingApproval ? "Waiting for Phantom…" : "Sign activation message with Phantom"}
            </button>
          </div>
          {signabilityError && <p className="hint">Sign disabled: {signabilityError}</p>}
          {signatureHex && (
            <div className="result success">
              Local Ed25519 verification: PASS
              <div className="mono wrap signature">{signatureHex}</div>
              <small>{signatureHex.length} hexadecimal characters</small>
            </div>
          )}
          <details>
            <summary>Full Solana payload JSON</summary>
            <pre>{JSON.stringify(payload, null, 2)}</pre>
          </details>
        </>
      ) : (
        <p className="empty">No payload loaded.</p>
      )}
    </section>
  );
}
