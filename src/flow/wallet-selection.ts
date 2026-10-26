export type IndexedWallet = {
  _id: string;
  address: string;
  walletIndex?: number | null;
  isActive: boolean;
  publicKey?: string | null;
};

export type SolanaWalletPlan =
  | {
      kind: "reuse";
      wallet: IndexedWallet;
      tonWallet: IndexedWallet;
      preferredIndex: number;
    }
  | {
      kind: "register";
      tonWallet: IndexedWallet;
      preferredIndex: number;
    }
  | {
      kind: "blocked";
      message: string;
    };

export function normalizedWalletIndex(wallet: IndexedWallet): number {
  return Number.isInteger(wallet.walletIndex) && wallet.walletIndex! >= 0
    ? wallet.walletIndex!
    : 0;
}

export function effectiveWallet<T extends IndexedWallet>(wallets: readonly T[]): T | undefined {
  return wallets
    .filter((wallet) => wallet.isActive)
    .sort((left, right) => normalizedWalletIndex(left) - normalizedWalletIndex(right))[0];
}

export function planSolanaWalletRegistration(input: {
  tonWallets: readonly IndexedWallet[];
  solanaWallets: readonly IndexedWallet[];
  connectedAddress: string;
}): SolanaWalletPlan {
  const tonWallet = effectiveWallet(input.tonWallets);
  if (!tonWallet) {
    return { kind: "blocked", message: "No active TON wallet exists for this account" };
  }
  const preferredIndex = normalizedWalletIndex(tonWallet);
  const solanaWallet = effectiveWallet(input.solanaWallets);
  if (solanaWallet?.address === input.connectedAddress) {
    return { kind: "reuse", wallet: solanaWallet, tonWallet, preferredIndex };
  }
  if (solanaWallet && normalizedWalletIndex(solanaWallet) <= preferredIndex) {
    return {
      kind: "blocked",
      message:
        `Backend-effective Solana wallet ${solanaWallet.address} at index ` +
        `${normalizedWalletIndex(solanaWallet)} does not match connected account ` +
        `${input.connectedAddress}. Deactivate or move that record before creating a Space.`,
    };
  }
  const existingConnectedWallet = input.solanaWallets.find(
    (wallet) => wallet.isActive && wallet.address === input.connectedAddress,
  );
  if (existingConnectedWallet) {
    return {
      kind: "blocked",
      message:
        `Connected Solana address ${input.connectedAddress} is already registered at index ` +
        `${normalizedWalletIndex(existingConnectedWallet)}, but another wallet remains ` +
        "backend-effective. Resolve the existing records before creating a Space.",
    };
  }
  return { kind: "register", tonWallet, preferredIndex };
}

export function requireEffectiveSolanaWallet<T extends IndexedWallet>(
  wallets: readonly T[],
  connectedAddress: string,
): T {
  const wallet = effectiveWallet(wallets);
  if (!wallet) {
    throw new Error("No active Solana wallet exists after registration");
  }
  if (wallet.address !== connectedAddress) {
    throw new Error(
      `Backend-effective Solana wallet is still ${wallet.address}, not connected account ` +
      `${connectedAddress}. Space creation remains blocked.`,
    );
  }
  return wallet;
}
