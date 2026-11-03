import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackAccount,
} from "@solana/spl-token";
import { Connection, PublicKey } from "@solana/web3.js";

export type TokenHolding = {
  mint: string;
  symbol: string;
  decimals: number;
  /** Smallest units. Undefined when the token account does not exist yet — not the same as zero. */
  baseUnits?: string;
  /** The associated token account the balance was read from. */
  ata: string;
};

export type WalletBalance = {
  label: string;
  address: string;
  /** Lamports held by the address itself. "0" for an address the chain has never seen. */
  lamports: string;
  tokens: TokenHolding[];
};

export type BalanceWallet = {
  label: string;
  address: string;
  /** True for a program-owned address such as a Space PDA, whose ATA is derived off-curve. */
  ownerOffCurve?: boolean;
};

export type BalanceToken = { mint: string; symbol: string; decimals: number };

type BalanceConnection = Pick<Connection, "getMultipleAccountsInfo">;

/**
 * Reads the native and SPL balances of several addresses in one RPC round trip: the owner accounts
 * carry the lamports, and each derived ATA carries one token balance. Classic SPL only, matching the
 * deposit path.
 *
 * One request covers every address, so keep wallets × (1 + tokens) under the RPC's 100-account cap.
 */
export async function readWalletBalances(input: {
  wallets: BalanceWallet[];
  tokens: BalanceToken[];
  rpcUrl: string;
  connection?: BalanceConnection;
}): Promise<WalletBalance[]> {
  const { wallets, tokens } = input;
  if (!wallets.length) return [];
  const connection = input.connection ?? new Connection(input.rpcUrl, "confirmed");
  const keys: PublicKey[] = [];
  const plan = wallets.map((wallet) => {
    const owner = new PublicKey(wallet.address);
    const ownerIndex = keys.push(owner) - 1;
    const tokenEntries = tokens.map((token) => {
      const ata = getAssociatedTokenAddressSync(
        new PublicKey(token.mint),
        owner,
        wallet.ownerOffCurve ?? false,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      return { token, ata, index: keys.push(ata) - 1 };
    });
    return { wallet, ownerIndex, tokenEntries };
  });

  const infos = await connection.getMultipleAccountsInfo(keys, "confirmed");
  return plan.map(({ wallet, ownerIndex, tokenEntries }) => ({
    label: wallet.label,
    address: wallet.address,
    lamports: String(infos[ownerIndex]?.lamports ?? 0),
    tokens: tokenEntries.map(({ token, ata, index }) => {
      const info = infos[index];
      let baseUnits: string | undefined;
      try {
        if (info) baseUnits = unpackAccount(ata, info, TOKEN_PROGRAM_ID).amount.toString();
      } catch {
        // Present but not a classic SPL account of ours: report it as unopened rather than guess.
        baseUnits = undefined;
      }
      return { mint: token.mint, symbol: token.symbol, decimals: token.decimals, baseUnits, ata: ata.toBase58() };
    }),
  }));
}
