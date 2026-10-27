import type { ChainDto, WalletDto, WalletGroupDto } from "../api/types";
import type { ConnectedSigner } from "../solana/signers/types";
import { publicKeyHex } from "../solana/signing";
import { CopyButton } from "./CopyButton";

type Props = {
  wallet?: ConnectedSigner;
  chain?: ChainDto;
  selectedGroup?: WalletGroupDto;
  storedWallet?: WalletDto;
  busyAction?: string;
  onRegister(): void;
  onGetWallet(): void;
};

export function WalletPanel({
  wallet,
  chain,
  selectedGroup,
  storedWallet,
  busyAction,
  onRegister,
  onGetWallet,
}: Props) {
  const connectedHex = wallet ? publicKeyHex(wallet.publicKeyBytes()) : undefined;
  const addressMatches = wallet && storedWallet
    ? wallet.address === storedWallet.address
    : undefined;

  return (
    <>
      <section>
        <h2>2. Solana signing wallet</h2>
        <div className="actions">
          <button onClick={onRegister} disabled={Boolean(busyAction)}>
            {busyAction === "register-wallet" ? "Reconciling…" : "Register / reconcile wallet"}
          </button>
          <button className="secondary" onClick={onGetWallet} disabled={Boolean(busyAction)}>
            {busyAction === "get-wallet" ? "Verifying…" : "Verify existing wallet"}
          </button>
        </div>
        <dl>
          <dt>Base58 address</dt>
          <dd className="mono"><span className="copyable">{wallet?.address ?? "Not created"}<CopyButton value={wallet?.address} label="wallet address" /></span></dd>
          <dt>32-byte key hex</dt>
          <dd className="mono wrap"><span className="copyable">{connectedHex ?? "—"}<CopyButton value={connectedHex} label="public key" /></span></dd>
          <dt>Signing provider</dt>
          <dd>{wallet?.provider ?? "—"}</dd>
          <dt>Raw digest signing</dt>
          <dd>{wallet ? (wallet.canSignDigest ? "Available" : "Unavailable") : "—"}</dd>
        </dl>
      </section>

      <section>
        <h2>3. Backend-effective wallet details</h2>
        <dl>
          <dt>Wallet group</dt>
          <dd>{selectedGroup?.name ?? "—"}</dd>
          <dt>Wallet index</dt>
          <dd>{selectedGroup?.walletIndex ?? storedWallet?.walletIndex ?? "—"}</dd>
          <dt>Selected chain</dt>
          <dd>{chain?.name ?? "—"}</dd>
          <dt>Chain object id</dt>
          <dd className="mono">{chain?._id ?? "—"}</dd>
          <dt>API chain id</dt>
          <dd className="mono">{chain?.chainId ?? "—"}</dd>
        </dl>
        {storedWallet && (
          <div className={addressMatches ? "result success" : "result failure"}>
            Stored address: <span className="mono copyable">{storedWallet.address}<CopyButton value={storedWallet.address} label="stored wallet address" /></span><br />
            Match: {addressMatches ? "yes" : "NO — stop here"}
          </div>
        )}
      </section>
    </>
  );
}
