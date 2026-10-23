import type { SolanaMessageSigner } from "./signing";

export type PublicKeyLike = {
  toBase58(): string;
  toBytes(): Uint8Array;
};

export type PhantomProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PublicKeyLike | null;
  connect(): Promise<{ publicKey: PublicKeyLike }>;
  disconnect(): Promise<void>;
  signMessage?: (
    message: Uint8Array,
    display?: "hex" | "utf8",
  ) => Promise<{ signature: Uint8Array; publicKey: PublicKeyLike }>;
  on?: (event: "accountChanged" | "disconnect", handler: (value?: unknown) => void) => void;
  off?: (event: "accountChanged" | "disconnect", handler: (value?: unknown) => void) => void;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
  }
}

export type ConnectedWallet = SolanaMessageSigner & {
  address: string;
  canSignMessage: boolean;
};

export function getPhantom(): PhantomProvider {
  const provider = window.phantom?.solana;
  if (!provider?.isPhantom) {
    throw new Error(
      "Phantom was not found. Install the Phantom extension or open this page in Phantom's browser.",
    );
  }
  return provider;
}

function walletFromPublicKey(
  provider: PhantomProvider,
  publicKey: PublicKeyLike,
): ConnectedWallet {
  const publicKeyBytes = Uint8Array.from(publicKey.toBytes());
  const address = publicKey.toBase58();
  if (publicKeyBytes.length !== 32) {
    throw new Error("Phantom returned a Solana public key that is not 32 bytes");
  }
  return {
    address,
    publicKeyBytes: () => Uint8Array.from(publicKeyBytes),
    canSignMessage: typeof provider.signMessage === "function",
    signMessage: async (bytes: Uint8Array) => {
      const activeProvider = getPhantom();
      if (!activeProvider.signMessage) {
        throw new Error("This Phantom provider does not support signMessage");
      }
      if (activeProvider.isConnected === false || !activeProvider.publicKey) {
        throw new Error("Phantom is disconnected. Click Connect Phantom, then try signing again.");
      }
      if (activeProvider.publicKey.toBase58() !== address) {
        throw new Error(
          `Phantom account changed from ${address} to ${activeProvider.publicKey.toBase58()}. Reload the payload for the active account.`,
        );
      }
      const result = await activeProvider.signMessage(bytes, "utf8");
      return Uint8Array.from(result.signature);
    },
  };
}

export async function connectPhantom(): Promise<ConnectedWallet> {
  const provider = getPhantom();
  const { publicKey } = await provider.connect();
  return walletFromPublicKey(provider, publicKey);
}

export async function disconnectPhantom(): Promise<void> {
  await getPhantom().disconnect();
}

export function subscribeToPhantom(
  onWalletChange: (wallet: ConnectedWallet | undefined) => void,
): () => void {
  let provider: PhantomProvider;
  try {
    provider = getPhantom();
  } catch {
    return () => undefined;
  }
  const handleAccountChanged = (value?: unknown) => {
    if (!value || typeof value !== "object") {
      onWalletChange(undefined);
      return;
    }
    try {
      onWalletChange(walletFromPublicKey(provider, value as PublicKeyLike));
    } catch {
      onWalletChange(undefined);
    }
  };
  const handleDisconnect = () => onWalletChange(undefined);
  provider.on?.("accountChanged", handleAccountChanged);
  provider.on?.("disconnect", handleDisconnect);
  return () => {
    provider.off?.("accountChanged", handleAccountChanged);
    provider.off?.("disconnect", handleDisconnect);
  };
}
