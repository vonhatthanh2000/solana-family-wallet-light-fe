import { useState } from "react";
import { CopyButton } from "../../components/CopyButton";
import type { ConnectedSigner } from "../../solana/signers/types";
import type { SpaceChainDto } from "../contracts";
import {
  baseUnitsToDecimal,
  sendDeposit,
  solanaExplorerTxUrl,
  type DepositResult,
} from "../deposits";
import { solText } from "../deposit-cost";
import type { SolReserveDto } from "./contracts";

type Props = {
  reserve: SolReserveDto;
  /** The deployed Solana chain, for mapping the network the wallet is asked to sign on. */
  chain?: SpaceChainDto;
  signer?: ConnectedSigner;
  fallbackNetwork: string;
  onFunded(): Promise<unknown>;
};

/**
 * Setup, not failure: by design a Space holds no SOL, so the first spend out of every Solana Space
 * needs the family to put a little in. The notice is driven by the same solReserve whether it came
 * from the spend-fee read or from a RESERVE_TOO_LOW refusal.
 */
export function SpendReserveNotice({ reserve, chain, signer, fallbackNetwork, onFunded }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<DepositResult>();
  const topUp = baseUnitsToDecimal(reserve.topUpLamports, 9);
  const canSend = Boolean(signer?.canSignTransaction && chain?.chainId);

  const fund = async () => {
    setError(undefined);
    if (!signer || !chain?.chainId) {
      setError("Connect a Solana wallet that can sign transactions, or send the SOL manually to the Space address above");
      return;
    }
    setBusy(true);
    try {
      // A plain native transfer to the Space PDA. No token, no ATA: this is the Space's own balance.
      const next = await sendDeposit({
        signer,
        spaceAddress: reserve.spaceAddress,
        chainId: chain.chainId,
        fallbackNetwork,
        amount: topUp,
        rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,
      });
      setResult(next);
      // Nothing to poll server-side: the notice clears when the fee read no longer reports a shortfall.
      await onFunded();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="result warning" role="status">
      <strong>Your Space needs a little SOL to send</strong>
      <p>
        Deposit {topUp} SOL to the Space to cover about {reserve.coversSpends || 20} transactions.
        Solana charges the Space itself for sending, and a new Space holds nothing — so this is a
        one-time setup step for the first spend, not an error.
      </p>
      <dl className="compact-details">
        <div><dt>Space holds</dt><dd>{solText(reserve.heldLamports)}</dd></div>
        <div><dt>Needs at least</dt><dd>{solText(reserve.neededLamports)}</dd></div>
        <div><dt>Short by</dt><dd>{solText(reserve.shortfallLamports)}</dd></div>
        <div><dt>Suggested deposit</dt><dd>{solText(reserve.topUpLamports)}</dd></div>
        <div>
          <dt>Space address (not a token account)</dt>
          <dd className="mono wrap"><span className="copyable">{reserve.spaceAddress}<CopyButton value={reserve.spaceAddress} label="Space address for the SOL reserve" /></span></dd>
        </div>
      </dl>
      <p className="hint">Send plain SOL to this address. A token deposit address will not fund the Space.</p>
      <div className="button-row">
        <button type="button" disabled={busy || !canSend} onClick={() => void fund()}>
          {busy ? "Opening wallet…" : `Deposit ${topUp} SOL`}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => void onFunded()}>Re-check reserve</button>
      </div>
      {!canSend && <p className="hint">Connect a Solana wallet that can sign transactions to deposit from here, or send the SOL yourself to the address above.</p>}
      {error && <div className="inline-error" role="alert"><strong>Could not deposit SOL</strong><p>{error}</p></div>}
      {result && <p>Sent. <span className="copyable"><code className="wrap">{result.signature}</code><CopyButton value={result.signature} label="reserve top-up signature" /></span> <a href={solanaExplorerTxUrl(result.signature, result.network)} target="_blank" rel="noreferrer">View in Solana Explorer ↗</a> — re-check the reserve once it confirms.</p>}
    </div>
  );
}
