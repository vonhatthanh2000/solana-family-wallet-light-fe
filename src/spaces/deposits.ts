import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  clusterApiUrl,
  type Cluster,
} from "@solana/web3.js";
import type { ConnectedSigner } from "../solana/signers/types";

export type DepositToken = {
  /** The SPL mint. Classic SPL only: the Space program does not support Token-2022 mints. */
  tokenAddress: string;
  symbol: string;
  decimals: number;
  /** The Space's associated token account for this mint, as published by the backend. */
  depositAddress: string;
  /** Smallest-unit rent to open the ATA. "0" when it already exists, undefined when unknown. */
  rentLamports?: string;
};

export type DepositResult = {
  signature: string;
  sourceAddress: string;
  destinationAddress: string;
  baseUnits: string;
  rpcUrl: string;
  network: Cluster;
  /** True when the transaction carried the ATA creation instruction for an SPL deposit. */
  opensTokenAccount: boolean;
};

export type DepositCost = {
  /** Network fee for the message that was built, or undefined when the RPC could not price it. */
  feeLamports?: string;
  /** One-off ATA rent. "0" when nothing is owed, undefined when the backend could not say. */
  rentLamports?: string;
  /** fee + rent + (native deposits only) the transferred amount. Undefined while anything is unknown. */
  requiredLamports?: string;
  senderLamports?: string;
  /** Undefined when the required total or the balance could not be read. */
  sufficient?: boolean;
  /** How much more SOL the wallet needs. "0" when it is covered, undefined when unknown. */
  shortfallLamports?: string;
  opensTokenAccount: boolean;
};

type BlockhashConnection = Pick<Connection, "getLatestBlockhash">;
type PricingConnection = BlockhashConnection & Pick<Connection, "getFeeForMessage" | "getBalance">;

export type DepositRequest = {
  senderAddress: string;
  spaceAddress: string;
  chainId: string;
  fallbackNetwork: string;
  amount: string;
  token?: DepositToken;
  rpcUrl?: string;
};

export type BuiltDeposit = {
  transaction: Transaction;
  sender: PublicKey;
  destinationAddress: string;
  baseUnits: bigint;
  opensTokenAccount: boolean;
  network: Cluster;
  rpcUrl: string;
};

export function decimalToBaseUnits(value: string, decimals: number): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("Enter a positive decimal amount");
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > decimals) throw new Error(`Amount supports at most ${decimals} decimal places`);
  const units = BigInt(whole!) * (10n ** BigInt(decimals)) + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (units <= 0n) throw new Error("Deposit amount must be greater than zero");
  return units;
}

export function baseUnitsToDecimal(value: string, decimals: number): string {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) throw new Error("Base-unit amount must be an integer");
  const digits = BigInt(normalized).toString();
  if (decimals === 0) return digits;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole;
}

export function solanaNetwork(chainId: string, fallback: string): Cluster {
  const candidate = `${chainId} ${fallback}`.toLowerCase();
  if (candidate.includes("mainnet")) return "mainnet-beta";
  if (candidate.includes("devnet")) return "devnet";
  if (candidate.includes("testnet")) return "testnet";
  throw new Error(`Cannot map Solana chain ${chainId} to devnet, testnet, or mainnet`);
}

export function walletStandardChain(network: Cluster): `solana:${string}` {
  return `solana:${network === "mainnet-beta" ? "mainnet" : network}`;
}

export function solanaExplorerTxUrl(signature: string, network: Cluster): string {
  const cluster = network === "mainnet-beta" ? "" : `?cluster=${network}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}

export function depositRpcUrl(network: Cluster, override?: string): string {
  return override?.trim() || clusterApiUrl(network);
}

/**
 * Builds the deposit transaction the device will sign. An SPL deposit is always two instructions in
 * this order: an idempotent ATA creation paid for by the sender, then the checked transfer. The
 * creation instruction is included even when the backend reported the ATA as ready — it is free
 * when the account exists and it keeps the deposit correct if the account appears (or does not)
 * between reading the deposit addresses and the transaction landing. Both are atomic in one
 * transaction, so the transfer can never land without its destination account.
 */
export async function buildDepositTransaction(
  input: DepositRequest & { connection?: BlockhashConnection },
): Promise<BuiltDeposit> {
  const { token } = input;
  const network = solanaNetwork(input.chainId, input.fallbackNetwork);
  const rpcUrl = depositRpcUrl(network, input.rpcUrl);
  const connection = input.connection ?? new Connection(rpcUrl, "confirmed");
  const sender = new PublicKey(input.senderAddress);
  const space = new PublicKey(input.spaceAddress);
  const transaction = new Transaction();
  let destinationAddress = space.toBase58();
  let baseUnits: bigint;

  if (token) {
    baseUnits = decimalToBaseUnits(input.amount, token.decimals);
    const mint = new PublicKey(token.tokenAddress);
    // The Space owner is a program PDA, so its ATA derivation must allow an off-curve owner.
    const spaceAta = getAssociatedTokenAddressSync(mint, space, true, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    const backendAta = new PublicKey(token.depositAddress);
    if (!spaceAta.equals(backendAta)) {
      throw new Error(
        `The published ${token.symbol} deposit address ${backendAta.toBase58()} is not the associated token account of this Space and mint (${spaceAta.toBase58()}). Refresh the deposit addresses before sending.`,
      );
    }
    const senderAta = getAssociatedTokenAddressSync(mint, sender, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
    destinationAddress = spaceAta.toBase58();
    transaction.add(
      createAssociatedTokenAccountIdempotentInstruction(
        sender, // the sender pays the ATA rent
        spaceAta,
        space,
        mint,
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      ),
      createTransferCheckedInstruction(
        senderAta,
        mint,
        spaceAta,
        sender,
        baseUnits,
        token.decimals,
        [],
        TOKEN_PROGRAM_ID,
      ),
    );
  } else {
    baseUnits = decimalToBaseUnits(input.amount, 9);
    transaction.add(SystemProgram.transfer({ fromPubkey: sender, toPubkey: space, lamports: baseUnits }));
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = sender;
  transaction.recentBlockhash = blockhash;
  return {
    transaction,
    sender,
    destinationAddress,
    baseUnits,
    opensTokenAccount: Boolean(token),
    network,
    rpcUrl,
  };
}

/**
 * Prices the message that would be signed. There is no backend fee estimate for deposits — the
 * backend no longer builds the message — so the fee comes from the RPC and the rent from the
 * deposit-addresses response.
 */
export async function estimateDepositCost(
  input: DepositRequest & { connection?: PricingConnection },
): Promise<DepositCost> {
  const network = solanaNetwork(input.chainId, input.fallbackNetwork);
  const rpcUrl = depositRpcUrl(network, input.rpcUrl);
  const connection = input.connection ?? new Connection(rpcUrl, "confirmed");
  const built = await buildDepositTransaction({ ...input, connection });
  const [fee, senderLamports] = await Promise.all([
    connection.getFeeForMessage(built.transaction.compileMessage(), "confirmed")
      .then((response) => response.value)
      .catch(() => null),
    connection.getBalance(built.sender, "confirmed").catch(() => null),
  ]);
  // Absent rent means the chain could not be asked. Unknown is never rendered as free.
  const rent = input.token ? input.token.rentLamports : "0";
  const feeLamports = fee === null || fee === undefined ? undefined : BigInt(fee);
  const rentLamports = rent === undefined ? undefined : BigInt(rent);
  const solSpent = input.token ? 0n : built.baseUnits;
  const required = feeLamports !== undefined && rentLamports !== undefined
    ? feeLamports + rentLamports + solSpent
    : undefined;
  const balance = senderLamports === null ? undefined : BigInt(senderLamports);
  const shortfall = required === undefined || balance === undefined
    ? undefined
    : required > balance ? required - balance : 0n;
  return {
    feeLamports: feeLamports?.toString(),
    rentLamports: rentLamports?.toString(),
    requiredLamports: required?.toString(),
    senderLamports: balance?.toString(),
    sufficient: shortfall === undefined ? undefined : shortfall === 0n,
    shortfallLamports: shortfall?.toString(),
    opensTokenAccount: built.opensTokenAccount,
  };
}

export async function sendDeposit(input: {
  signer: ConnectedSigner;
  spaceAddress: string;
  chainId: string;
  fallbackNetwork: string;
  amount: string;
  token?: DepositToken;
  rpcUrl?: string;
  connection?: BlockhashConnection;
}): Promise<DepositResult> {
  const { signer } = input;
  if (!signer.canSignTransaction || !signer.signAndSendTransaction) {
    throw new Error(`${signer.provider} does not support signing and sending transactions`);
  }
  const built = await buildDepositTransaction({ ...input, senderAddress: signer.address });
  const serialized = built.transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  const signature = await signer.signAndSendTransaction(serialized, walletStandardChain(built.network));
  return {
    signature,
    sourceAddress: built.sender.toBase58(),
    destinationAddress: built.destinationAddress,
    baseUnits: built.baseUnits.toString(),
    rpcUrl: built.rpcUrl,
    network: built.network,
    opensTokenAccount: built.opensTokenAccount,
  };
}

export async function getDepositConfirmation(
  signature: string,
  rpcUrl: string,
): Promise<"submitted" | "confirmed" | "finalized" | "failed"> {
  const response = await new Connection(rpcUrl, "confirmed").getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  const status = response.value[0];
  if (!status) return "submitted";
  if (status.err) return "failed";
  if (status.confirmationStatus === "finalized") return "finalized";
  if (status.confirmationStatus === "confirmed" || status.confirmations !== null) return "confirmed";
  return "submitted";
}
