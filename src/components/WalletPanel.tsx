import type { ChainDto, WalletDto, WalletGroupDto } from "../api/types";
import type { ConnectedWallet } from "../solana/phantom";
import { publicKeyHex } from "../solana/signing";

type Props = {
  wallet?: ConnectedWallet;
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
        <h2>2. Phantom Solana wallet</h2>
        <div className="actions">
          <button onClick={onRegister} disabled={Boolean(busyAction)}>
            {busyAction === "register-wallet" ? "Creating…" : "Create Solana Wallet"}
          </button>
          <button className="secondary" onClick={onGetWallet} disabled={Boolean(busyAction)}>
            {busyAction === "get-wallet" ? "Getting…" : "Get Existing Wallet"}
          </button>
        </div>
        <dl>
          <dt>Base58 address</dt>
          <dd className="mono">{wallet?.address ?? "Not created"}</dd>
          <dt>32-byte key hex</dt>
          <dd className="mono wrap">{connectedHex ?? "—"}</dd>
          <dt>Phantom signing</dt>
          <dd>{wallet ? (wallet.canSignMessage ? "Available" : "Unavailable") : "—"}</dd>
        </dl>
      </section>

      <section>
        <h2>3. Created wallet details</h2>
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
            Stored address: <span className="mono">{storedWallet.address}</span><br />
            Match: {addressMatches ? "yes" : "NO — stop here"}
          </div>
        )}
      </section>
    </>
  );
}
