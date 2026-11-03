import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton } from "../components/CopyButton";
import type { ConnectedSigner } from "../solana/signers/types";
import type { TokenDepositAddressDto } from "../api/types";
import type { SpaceChainDto } from "./contracts";
import { baseUnitsToDecimal, depositRpcUrl, solanaNetwork } from "./deposits";
import { readWalletBalances, type WalletBalance } from "./balances";

const REFRESH_MS = 30_000;

function amountText(holding: WalletBalance["tokens"][number]): string {
  return holding.baseUnits === undefined
    ? "No token account yet"
    : baseUnitsToDecimal(holding.baseUnits, holding.decimals);
}

/** Pure renderer, so the numbers can be checked without an RPC. */
export function BalanceCards({
  balances, busy, error, onRefresh, readAt,
}: {
  balances: WalletBalance[];
  busy: boolean;
  error?: string;
  onRefresh(): void;
  readAt?: string;
}) {
  return (
    <div className="action-group balance-strip">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Read straight from the chain</p>
          <h3>Balances</h3>
          <p>SOL pays the fees: the sending wallet needs it to deposit, and the Space needs its own SOL to send out. Token amounts are the on-chain accounts, not the Space ledger.</p>
        </div>
        <button type="button" className="secondary" disabled={busy} onClick={onRefresh}>{busy ? "Reading…" : "Refresh balances"}</button>
      </div>
      {error && <div className="result warning"><strong>Could not read balances</strong><p>{error}</p></div>}
      {!balances.length && !error && <p className="empty">Connect a wallet and deploy the Space on Solana to read balances.</p>}
      <div className="action-grid">
        {balances.map((wallet) => (
          <article key={`${wallet.label}:${wallet.address}`}>
            <h4>{wallet.label}</h4>
            <span className="copyable mono wrap">{wallet.address}<CopyButton value={wallet.address} label={`${wallet.label} address`} /></span>
            <dl className="compact-details">
              <div><dt>SOL</dt><dd>{baseUnitsToDecimal(wallet.lamports, 9)}</dd></div>
              {wallet.tokens.map((holding) => (
                <div key={holding.mint}><dt>{holding.symbol}</dt><dd>{amountText(holding)}</dd></div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      {readAt && <p className="hint">Read at {readAt}; refreshed every {REFRESH_MS / 1000} seconds.</p>}
    </div>
  );
}

/**
 * The personal wallet is whichever wallet is connected; the Space wallet is its Solana PDA. Both are
 * read on chain, because the Space's own SOL is not part of the backend's token ledger.
 */
export function WalletBalancesPanel({
  chain, signer, tokens, fallbackNetwork,
}: {
  chain?: SpaceChainDto;
  signer?: ConnectedSigner;
  tokens: TokenDepositAddressDto[];
  fallbackNetwork: string;
}) {
  const [balances, setBalances] = useState<WalletBalance[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [readAt, setReadAt] = useState<string>();
  const spaceAddress = chain?.isDeployed ? chain.address : undefined;
  const senderAddress = signer?.address;
  const chainId = chain?.chainId;
  // Which mints to read is what makes a read different; their labels ride along on a ref, so a
  // re-fetched but unchanged token list does not trigger another RPC round trip.
  const tokensRef = useRef(tokens);
  tokensRef.current = tokens;
  const mintKey = tokens.map((token) => token.mint).join(",");

  const read = useCallback(async (): Promise<void> => {
    if (!chainId || (!spaceAddress && !senderAddress)) { setBalances([]); return; }
    setBusy(true);
    try {
      const network = solanaNetwork(chainId, fallbackNetwork);
      const next = await readWalletBalances({
        wallets: [
          ...(senderAddress ? [{ label: "Personal wallet", address: senderAddress }] : []),
          ...(spaceAddress ? [{ label: "Space wallet", address: spaceAddress, ownerOffCurve: true }] : []),
        ],
        tokens: mintKey
          ? tokensRef.current.map((token) => ({ mint: token.mint, symbol: token.symbol, decimals: token.decimals }))
          : [],
        rpcUrl: depositRpcUrl(network, import.meta.env.VITE_SOLANA_RPC_URL),
      });
      setBalances(next);
      setError(undefined);
      setReadAt(new Date().toLocaleTimeString());
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  }, [chainId, fallbackNetwork, mintKey, senderAddress, spaceAddress]);

  useEffect(() => {
    let live = true;
    void read();
    const timer = window.setInterval(() => { if (live) void read(); }, REFRESH_MS);
    return () => { live = false; window.clearInterval(timer); };
  }, [read]);

  return <BalanceCards balances={balances} busy={busy} error={error} readAt={readAt} onRefresh={() => void read()} />;
}
