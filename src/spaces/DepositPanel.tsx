import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { ConnectedSigner } from "../solana/signers/types";
import { CopyButton } from "../components/CopyButton";
import type { SpaceChainDto } from "./contracts";
import type { VaultTokenOptionDto } from "./actions/contracts";
import {
  decimalToBaseUnits,
  getDepositConfirmation,
  sendDeposit,
  type DepositResult,
} from "./deposits";

type Props = {
  chain?: SpaceChainDto;
  tokens: VaultTokenOptionDto[];
  signer?: ConnectedSigner;
  fallbackNetwork: string;
  onSettled(): Promise<void>;
};

function explorerUrl(signature: string, network: DepositResult["network"]): string {
  const cluster = network === "mainnet-beta" ? "" : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

export function DepositPanel({ chain, tokens, signer, fallbackNetwork, onSettled }: Props) {
  const [asset, setAsset] = useState("native");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<DepositResult>();
  const [status, setStatus] = useState<"submitted" | "confirmed" | "finalized" | "failed">();
  const token = useMemo(() => tokens.find((candidate) =>
    !candidate.isNative && candidate.tokenAddress === asset), [asset, tokens]);
  const baseUnits = useMemo(() => {
    if (!amount) return undefined;
    try { return decimalToBaseUnits(amount, token?.decimals ?? 9).toString(); }
    catch { return undefined; }
  }, [amount, token?.decimals]);

  const refreshStatus = async () => {
    if (!result) return;
    try {
      const next = await getDepositConfirmation(result.signature, result.rpcUrl);
      if (next !== status) {
        setStatus(next);
        if (next === "confirmed" || next === "finalized") await onSettled();
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  useEffect(() => {
    if (!result || status === "finalized" || status === "failed") return;
    const timer = window.setInterval(() => void refreshStatus(), 4_000);
    return () => window.clearInterval(timer);
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(undefined);
    setResult(undefined);
    setStatus(undefined);
    if (!chain?.isDeployed || !chain.address) {
      setError("The Solana Space must be deployed before deposits are enabled");
      return;
    }
    if (!signer) {
      setError("Connect the wallet that will fund this deposit");
      return;
    }
    setBusy(true);
    try {
      const next = await sendDeposit({
        signer,
        spaceAddress: chain.address,
        chainId: chain.chainId,
        fallbackNetwork,
        amount,
        token: token ? {
          tokenAddress: token.tokenAddress,
          symbol: token.symbol,
          decimals: token.decimals,
        } : undefined,
        rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,
      });
      setResult(next);
      setStatus("submitted");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const supportedTokens = tokens.filter((candidate) =>
    candidate.chainId === chain?.chainId && !candidate.isNative && Boolean(candidate.tokenAddress));
  const ready = Boolean(chain?.isDeployed && chain.address);

  return (
    <div className="action-group deposit-panel">
      <h3>Deposit from connected wallet</h3>
      <p>This creates a normal wallet transfer. Review it in your wallet before signing. The backend has no deposit endpoint.</p>
      <form className="inline-form" onSubmit={(event) => void submit(event)}>
        <label>Asset<select value={asset} onChange={(event) => { setAsset(event.target.value); setResult(undefined); }}><option value="native">SOL</option>{supportedTokens.map((option) => <option key={option.tokenId} value={option.tokenAddress}>{option.symbol}</option>)}</select></label>
        <label>Amount ({token?.symbol ?? "SOL"})<input inputMode="decimal" placeholder={token ? "10.00" : "0.1"} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <button disabled={busy || !ready || !signer?.canSignTransaction || !baseUnits}>{busy ? "Opening wallet…" : "Review and deposit"}</button>
      </form>
      <dl className="compact-details">
        <div><dt>From</dt><dd className="mono wrap"><span className="copyable">{signer?.address ?? "Connect a wallet"}<CopyButton value={signer?.address} label="sender address" /></span></dd></div>
        <div><dt>Space PDA</dt><dd className="mono wrap"><span className="copyable">{chain?.address ?? "Unavailable until deployed"}<CopyButton value={chain?.address} label="Space PDA" /></span></dd></div>
        <div><dt>Exact base units</dt><dd className="mono">{baseUnits ?? "—"}</dd></div>
      </dl>
      {signer && !signer.canSignTransaction && <div className="result warning">{signer.provider} is connected for raw signing but does not expose transaction signing. Reconnect a compatible Solflare account.</div>}
      {error && <div className="inline-error" role="alert"><strong>Deposit failed</strong><p>{error}</p></div>}
      {result && <div className={`result ${status === "failed" ? "failure" : status === "finalized" ? "success" : "warning"}`}><strong>Deposit {status}</strong><p>{status === "submitted" ? "The wallet broadcast the transaction; this is not final yet." : status === "confirmed" ? "The transaction is confirmed and awaiting finalization." : status === "finalized" ? "The transaction is finalized. Indexed activity may appear later." : "The transaction failed on chain."}</p><span className="copyable"><code className="wrap">{result.signature}</code><CopyButton value={result.signature} label="transaction signature" /></span><div className="button-row"><button type="button" className="secondary" onClick={() => void refreshStatus()}>Refresh status</button><a href={explorerUrl(result.signature, result.network)} target="_blank" rel="noreferrer">View in Solana Explorer ↗</a></div></div>}
    </div>
  );
}
