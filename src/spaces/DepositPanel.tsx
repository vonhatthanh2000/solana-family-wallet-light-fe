import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { ConnectedSigner } from "../solana/signers/types";
import { CopyButton } from "../components/CopyButton";
import { getSolanaDepositFee, reportSendTransaction } from "../api/endpoints";
import type { SpaceChainDto } from "./contracts";
import type { SolanaDepositFeeQuote, TokenDepositAddressDto } from "../api/types";
import {
  blocksDeposit,
  deviceCostView,
  quoteCostView,
  solText,
  type DepositCostView,
} from "./deposit-cost";
import {
  baseUnitsToDecimal,
  decimalToBaseUnits,
  estimateDepositCost,
  getDepositConfirmation,
  sendDeposit,
  solanaExplorerTxUrl,
  type DepositCost,
  type DepositResult,
  type DepositToken,
} from "./deposits";

type Props = {
  spaceId: string;
  chain?: SpaceChainDto;
  tokenDepositAddresses: TokenDepositAddressDto[];
  signer?: ConnectedSigner;
  fallbackNetwork: string;
  onSettled(): Promise<void>;
};

/** A quote older than this is re-read before the user leans on it: ataExists can flip. */
const QUOTE_FRESHNESS_MS = 60_000;

export function DepositCostPanel({ view }: { view?: DepositCostView }) {
  if (!view) return null;
  const blocked = blocksDeposit(view);
  return (
    <div className={`result ${blocked ? "failure" : "warning"}`}>
      <strong>What this deposit costs in SOL</strong>
      {view.account === "opens" && <p>First deposit of {view.symbol} to this Space opens its token account — a one-off {solText(view.rentLamports)}, plus {solText(view.feeLamports)} network fee. It is paid once per token, ever: the next depositor pays nothing. It is not refundable, because it stays with the account, which the Space owns.</p>}
      {view.account === "exists" && <p>This Space's {view.symbol} account is already open, so only the network fee applies.</p>}
      {view.account === "unknown" && <p>The {view.symbol} account's rent could not be read, so the one-off cost below is unknown rather than zero. Keep about 0.00204 SOL spare.</p>}
      <dl className="compact-details">
        {view.account !== "none" && <div><dt>One-off account rent</dt><dd>{solText(view.rentLamports)}</dd></div>}
        <div><dt>Network fee</dt><dd>{solText(view.feeLamports)}</dd></div>
        <div><dt>SOL needed{view.account === "none" ? " in total" : ` on top of the ${view.symbol} amount`}</dt><dd>{solText(view.totalLamports)}</dd></div>
        {view.senderLamports !== undefined && <div><dt>Wallet balance</dt><dd>{solText(view.senderLamports)}</dd></div>}
      </dl>
      {blocked && <p><strong>This wallet needs {solText(view.shortfallLamports)} more.</strong> The transaction would fail on chain, so Deposit stays disabled until it is topped up.</p>}
      {view.source === "device" && <p className="hint">Priced on this device: the Space could not quote this deposit.</p>}
    </div>
  );
}

export function DepositPanel({ spaceId, chain, tokenDepositAddresses, signer, fallbackNetwork, onSettled }: Props) {
  const [asset, setAsset] = useState("native");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<DepositResult>();
  const [status, setStatus] = useState<"submitted" | "confirmed" | "finalized" | "failed">();
  const [cost, setCost] = useState<DepositCost>();
  const [costError, setCostError] = useState<string>();
  const [quote, setQuote] = useState<SolanaDepositFeeQuote>();
  const [quoteUnavailable, setQuoteUnavailable] = useState(false);
  const supportedTokens = useMemo(() => tokenDepositAddresses.filter((candidate) => (
    candidate.chainType === "SOL" && (
      candidate.chainObjectId === chain?.chainObjectId || candidate.chainId === chain?.chainId
    )
  )), [chain?.chainId, chain?.chainObjectId, tokenDepositAddresses]);
  const token = useMemo(() => supportedTokens.find((candidate) => candidate.mint === asset), [asset, supportedTokens]);
  const baseUnits = useMemo(() => {
    if (!amount) return undefined;
    if (asset !== "native" && !token) return undefined;
    try { return decimalToBaseUnits(amount, token?.decimals ?? 9).toString(); }
    catch { return undefined; }
  }, [amount, asset, token]);
  // Keyed on primitives so re-rendering the parent cannot restart the pricing effects below.
  const tokenId = token?.tokenId;
  const mint = token?.mint;
  const symbol = token?.symbol;
  const decimals = token?.decimals;
  const depositAddress = token?.address;
  const rentLamports = token?.rentLamports;
  const senderAddress = signer?.address;
  const spaceAddress = chain?.isDeployed ? chain.address : undefined;
  const chainId = chain?.chainId;
  const depositToken = useMemo((): DepositToken | undefined => (
    mint && symbol && decimals !== undefined && depositAddress
      ? { tokenAddress: mint, symbol, decimals, depositAddress, rentLamports }
      : undefined
  ), [decimals, depositAddress, mint, rentLamports, symbol]);

  useEffect(() => {
    if (asset !== "native" && !token) setAsset("native");
  }, [asset, token]);

  const loadQuote = useCallback(async (): Promise<void> => {
    if (!spaceId || !tokenId) return;
    try {
      const next = await getSolanaDepositFee(spaceId, tokenId);
      // A late answer for a token the user has already left must not price the current one.
      if (next.tokenId !== tokenId) return;
      setQuote(next);
      setQuoteUnavailable(false);
    } catch {
      // Not fatal: the deposit is still buildable, so fall back to pricing it on this device.
      setQuote(undefined);
      setQuoteUnavailable(true);
    }
  }, [spaceId, tokenId]);

  // The quote needs no amount, so it is read as soon as a token is chosen, and re-read while the
  // screen stays open: ataExists can flip under the user, which changes the price.
  useEffect(() => {
    setQuote(undefined);
    setQuoteUnavailable(false);
    if (!tokenId) return;
    let live = true;
    void loadQuote();
    const timer = window.setInterval(() => { if (live) void loadQuote(); }, QUOTE_FRESHNESS_MS);
    return () => { live = false; window.clearInterval(timer); };
  }, [loadQuote, tokenId]);

  // Native deposits have no quote endpoint, and a token deposit falls back here when the Space
  // could not quote it. The fee needs the exact message, so it is re-priced whenever that changes.
  useEffect(() => {
    setCost(undefined);
    setCostError(undefined);
    if (asset !== "native" && !quoteUnavailable) return;
    if (!spaceAddress || !senderAddress || !chainId || !baseUnits) return;
    if (asset !== "native" && !depositToken) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void estimateDepositCost({
        senderAddress,
        spaceAddress,
        chainId,
        fallbackNetwork,
        amount,
        token: depositToken,
        rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,
      }).then((next) => { if (current) setCost(next); })
        .catch((failure: unknown) => {
          if (current) setCostError(failure instanceof Error ? failure.message : String(failure));
        });
    }, 400);
    return () => { current = false; window.clearTimeout(timer); };
  }, [amount, asset, baseUnits, chainId, depositToken, fallbackNetwork, quoteUnavailable, senderAddress, spaceAddress]);

  const costView = useMemo((): DepositCostView | undefined => {
    if (quote) return quoteCostView(quote, symbol ?? "SOL");
    if (cost) return deviceCostView(cost, symbol ?? "SOL");
    return undefined;
  }, [cost, quote, symbol]);
  const underfunded = blocksDeposit(costView);
  // Two reads of the same ATA. If they disagree, one is stale and the deposit could miss the Space.
  const staleDestination = Boolean(quote && depositAddress && quote.destination !== depositAddress);

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
    if (asset !== "native" && !depositToken) {
      setError("Choose a supported token returned by the backend");
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
        token: depositToken,
        rpcUrl: import.meta.env.VITE_SOLANA_RPC_URL,
      });
      setResult(next);
      setStatus("submitted");
      // History only. The chain scanner credits the Space ledger whether or not this lands.
      void reportSendTransaction({
        chainId: chain.chainObjectId,
        txHash: next.signature,
        from: next.sourceAddress,
        to: next.destinationAddress,
        // This endpoint takes whole units, unlike the transfer instruction.
        amount: baseUnitsToDecimal(next.baseUnits, depositToken?.decimals ?? 9),
        coin: depositToken ? "TOKEN" : "NATIVE",
        tokenAddress: depositToken?.tokenAddress,
      }).catch(() => undefined);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      // A send can fail because the account was opened meanwhile, which changes the price.
      void loadQuote();
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(chain?.isDeployed && chain.address);

  return (
    <div className="action-group deposit-panel">
      <h3>Deposit from connected wallet</h3>
      <p>A deposit is an ordinary wallet transfer: this device builds it, your wallet signs and broadcasts it, and the chain scanner credits the Space. For a token, the same transaction opens the Space's token account when it does not exist yet, and your wallet pays its one-off rent. Review the transfer in your wallet before signing.</p>
      <form className="inline-form" onSubmit={(event) => void submit(event)}>
        <label>Asset<select value={asset} onChange={(event) => { setAsset(event.target.value); setResult(undefined); }}><option value="native">SOL</option>{supportedTokens.map((option) => <option key={option.tokenId} value={option.mint}>{option.symbol}{option.rentLamports && option.rentLamports !== "0" ? " · first deposit costs extra" : ""}</option>)}</select></label>
        <label>Amount ({token?.symbol ?? "SOL"})<input inputMode="decimal" placeholder={token ? "10.00" : "0.1"} value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
        <button disabled={busy || !ready || !signer?.canSignTransaction || !baseUnits || underfunded || staleDestination}>{busy ? "Opening wallet…" : "Review and deposit"}</button>
      </form>
      <dl className="compact-details">
        <div><dt>From</dt><dd className="mono wrap"><span className="copyable">{signer?.address ?? "Connect a wallet"}<CopyButton value={signer?.address} label="sender address" /></span></dd></div>
        <div><dt>Space PDA</dt><dd className="mono wrap"><span className="copyable">{chain?.address ?? "Unavailable until deployed"}<CopyButton value={chain?.address} label="Space PDA" /></span></dd></div>
        {token && <div><dt>{token.symbol} deposit ATA</dt><dd className="mono wrap"><span className="copyable">{token.address}<CopyButton value={token.address} label={`${token.symbol} deposit ATA`} /></span></dd></div>}
        <div><dt>Exact base units</dt><dd className="mono">{baseUnits ?? "—"}</dd></div>
      </dl>
      {token && <p className="hint">Send {token.symbol} only to the ATA above, never to the Space PDA{token.isReady ? "" : ", and only through this flow until the account exists — a plain transfer from an exchange cannot create it and would fail"}.</p>}
      {signer && !signer.canSignTransaction && <div className="result warning">{signer.provider} is connected for raw signing but does not expose transaction signing. Reconnect a compatible Solflare account.</div>}
      {staleDestination && <div className="result failure" role="alert"><strong>Deposit address disagrees with the Space's quote</strong><p>This screen is about to send {symbol} to {depositAddress}, but the Space quotes {quote?.destination}. One of the two is stale, so the deposit is held. Refresh actions and try again.</p></div>}
      <DepositCostPanel view={costView} />
      {costError && <div className="result warning"><strong>Could not price this deposit</strong><p>{costError}</p></div>}
      {error && <div className="inline-error" role="alert"><strong>Deposit failed</strong><p>{error}</p></div>}
      {result && <div className={`result ${status === "failed" ? "failure" : status === "finalized" ? "success" : "warning"}`}><strong>Deposit {status}</strong><p>{status === "submitted" ? "The wallet broadcast the transaction; this is not final yet." : status === "confirmed" ? "The transaction is confirmed and awaiting finalization." : status === "finalized" ? "The transaction is finalized. Indexed activity may appear later." : "The transaction failed on chain. A dead blockhash just means rebuilding it — nothing is reserved anywhere."}</p><span className="copyable"><code className="wrap">{result.signature}</code><CopyButton value={result.signature} label="transaction signature" /></span><div className="button-row"><button type="button" className="secondary" onClick={() => void refreshStatus()}>Refresh status</button><a href={solanaExplorerTxUrl(result.signature, result.network)} target="_blank" rel="noreferrer">View in Solana Explorer ↗</a></div></div>}
    </div>
  );
}
