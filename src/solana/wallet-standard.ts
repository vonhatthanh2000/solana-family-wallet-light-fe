import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount, WalletIcon } from "@wallet-standard/base";
import {
  SolanaSignAndSendTransaction,
  type SolanaSignAndSendTransactionFeature,
  SolanaSignMessage,
  type SolanaSignMessageFeature,
} from "@solana/wallet-standard-features";
import {
  StandardConnect,
  StandardEvents,
  type StandardConnectFeature,
  type StandardEventsFeature,
} from "@wallet-standard/features";
import bs58 from "bs58";
import type { ConnectedSigner } from "./signers/types";

type CompatibleFeatures = StandardConnectFeature &
  StandardEventsFeature &
  SolanaSignMessageFeature &
  Partial<SolanaSignAndSendTransactionFeature>;

type CompatibleWallet = Omit<Wallet, "features"> & {
  features: CompatibleFeatures;
};

export type CompatibleSolanaWallet = {
  id: string;
  name: string;
  icon: WalletIcon;
};

const walletIds = new WeakMap<Wallet, string>();
let nextWalletId = 1;

function walletId(wallet: Wallet): string {
  let id = walletIds.get(wallet);
  if (!id) {
    id = `wallet-standard:${nextWalletId++}`;
    walletIds.set(wallet, id);
  }
  return id;
}

function walletFingerprint(wallet: Wallet): string {
  return JSON.stringify([
    wallet.name,
    wallet.version,
    wallet.icon,
    [...wallet.chains].sort(),
  ]);
}

function isCompatibleWallet(wallet: Wallet): wallet is CompatibleWallet {
  const connect = wallet.features[StandardConnect] as { connect?: unknown } | null | undefined;
  const events = wallet.features[StandardEvents] as { on?: unknown } | null | undefined;
  const signMessage = wallet.features[SolanaSignMessage] as
    | { signMessage?: unknown }
    | null
    | undefined;
  return (
    wallet.chains.some((chain) => chain.startsWith("solana:")) &&
    typeof connect?.connect === "function" &&
    typeof events?.on === "function" &&
    typeof signMessage?.signMessage === "function"
  );
}

function findSolanaAccount(accounts: readonly WalletAccount[]): WalletAccount {
  const account = accounts.find(
    (candidate) =>
      candidate.publicKey.length === 32 &&
      candidate.chains.some((chain) => chain.startsWith("solana:")) &&
      candidate.features.includes(SolanaSignMessage),
  );
  if (!account) {
    throw new Error("The selected wallet did not provide a Solana account with raw message signing");
  }
  return account;
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function hasExpectedAccount(wallet: Wallet, address: string, publicKey: Uint8Array): boolean {
  return wallet.accounts.some(
    (candidate) =>
      candidate.address === address &&
      bytesEqual(Uint8Array.from(candidate.publicKey), publicKey),
  );
}

export function listCompatibleSolanaWallets(): CompatibleSolanaWallet[] {
  return getWallets()
    .get()
    .filter(isCompatibleWallet)
    .filter((wallet) => wallet.name.trim().toLowerCase() === "solflare")
    .map((wallet) => ({ id: walletId(wallet), name: wallet.name, icon: wallet.icon }));
}

export function subscribeToCompatibleSolanaWallets(
  listener: (wallets: CompatibleSolanaWallet[]) => void,
): () => void {
  const registry = getWallets();
  const refresh = () => listener(listCompatibleSolanaWallets());
  const offRegister = registry.on("register", refresh);
  const offUnregister = registry.on("unregister", refresh);
  // Close the gap between the caller's initial snapshot and listener setup.
  // A browser extension can register during that gap, before either listener exists.
  refresh();
  return () => {
    offRegister();
    offUnregister();
  };
}

function signerFor(
  wallet: CompatibleWallet,
  id: string,
  account: WalletAccount,
): ConnectedSigner {
  const publicKey = Uint8Array.from(account.publicKey);
  const fingerprint = walletFingerprint(wallet);

  const activeWalletAndAccount = () => {
    const registeredWallets = getWallets().get();
    const originalWallet = registeredWallets.find((candidate) => walletId(candidate) === id);
    const replacements = originalWallet
      ? []
      : registeredWallets.filter(
          (candidate) =>
            isCompatibleWallet(candidate) &&
            walletFingerprint(candidate) === fingerprint &&
            hasExpectedAccount(candidate, account.address, publicKey),
        );
    const activeWallet = originalWallet ?? (replacements.length === 1 ? replacements[0] : undefined);
    if (!activeWallet || !isCompatibleWallet(activeWallet)) {
      throw new Error(`${wallet.name} is no longer available. Reconnect the wallet and try again.`);
    }
    const activeAccount = activeWallet.accounts.find(
      (candidate) =>
        candidate.address === account.address &&
        bytesEqual(Uint8Array.from(candidate.publicKey), publicKey),
    );
    if (!activeAccount) {
      throw new Error(
        `${wallet.name} account changed from ${account.address}. Reload the payload for the active account.`,
      );
    }
    return { activeWallet, activeAccount };
  };

  const transactionFeature = wallet.features[SolanaSignAndSendTransaction] as
    | SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction]
    | undefined;

  return {
    address: account.address,
    provider: wallet.name,
    canSignDigest: true,
    canSignTransaction: typeof transactionFeature?.signAndSendTransaction === "function" &&
      transactionFeature.supportedTransactionVersions.includes("legacy"),
    publicKeyBytes: () => Uint8Array.from(publicKey),
    signDigest32: async (digest: Uint8Array) => {
      if (digest.length !== 32) throw new Error("Signing digest must be exactly 32 bytes");
      const { activeWallet, activeAccount } = activeWalletAndAccount();
      const [output] = await activeWallet.features[SolanaSignMessage].signMessage({
        account: activeAccount,
        message: digest,
      });
      if (!output || !bytesEqual(output.signedMessage, digest)) {
        throw new Error(`${wallet.name} did not sign the exact raw 32-byte digest`);
      }
      if (output.signatureType && output.signatureType !== "ed25519") {
        throw new Error(`${wallet.name} returned a non-Ed25519 message signature`);
      }
      if (output.signature.length !== 64) {
        throw new Error("Ed25519 signature must be exactly 64 bytes");
      }
      return Uint8Array.from(output.signature);
    },
    signAndSendTransaction: async (transaction: Uint8Array, chain: `${string}:${string}`) => {
      const { activeWallet, activeAccount } = activeWalletAndAccount();
      const feature = activeWallet.features[SolanaSignAndSendTransaction] as
        | SolanaSignAndSendTransactionFeature[typeof SolanaSignAndSendTransaction]
        | undefined;
      if (!feature || !activeAccount.features.includes(SolanaSignAndSendTransaction)) {
        throw new Error(`${wallet.name} does not support signing and sending Solana transactions`);
      }
      if (!feature.supportedTransactionVersions.includes("legacy")) {
        throw new Error(`${wallet.name} does not support legacy Solana transactions`);
      }
      if (!activeAccount.chains.includes(chain)) {
        throw new Error(`${wallet.name} account is not connected to ${chain}`);
      }
      const [output] = await feature.signAndSendTransaction({
        account: activeAccount,
        transaction,
        chain,
        options: { preflightCommitment: "confirmed" },
      });
      if (!output?.signature?.length) throw new Error(`${wallet.name} did not return a transaction signature`);
      return bs58.encode(output.signature);
    },
  };
}

export async function connectStandardWallet(id: string): Promise<ConnectedSigner> {
  const wallet = getWallets()
    .get()
    .find((candidate) => walletId(candidate) === id);
  if (!wallet || !isCompatibleWallet(wallet)) {
    throw new Error("The selected Wallet Standard wallet is no longer available");
  }

  const result = await wallet.features[StandardConnect].connect();
  return signerFor(wallet, id, findSolanaAccount(result.accounts));
}

export function subscribeToStandardWallet(
  id: string,
  onWalletChange: (signer: ConnectedSigner | undefined) => void,
): () => void {
  const wallet = getWallets()
    .get()
    .find((candidate) => walletId(candidate) === id);
  if (!wallet || !isCompatibleWallet(wallet)) return () => undefined;

  return wallet.features[StandardEvents].on("change", ({ accounts }) => {
    if (!accounts || accounts.length === 0) {
      onWalletChange(undefined);
      return;
    }
    try {
      onWalletChange(signerFor(wallet, id, findSolanaAccount(accounts)));
    } catch {
      onWalletChange(undefined);
    }
  });
}
