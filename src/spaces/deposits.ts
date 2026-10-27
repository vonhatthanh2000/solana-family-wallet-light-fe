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
  tokenAddress: string;
  symbol: string;
  decimals: number;
};

export type DepositResult = {
  signature: string;
  sourceAddress: string;
  destinationAddress: string;
  baseUnits: string;
  rpcUrl: string;
  network: Cluster;
};

type BlockhashConnection = Pick<Connection, "getLatestBlockhash">;

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

export function depositRpcUrl(network: Cluster, override?: string): string {
  return override?.trim() || clusterApiUrl(network);
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
  const { signer, token } = input;
  if (!signer.canSignTransaction || !signer.signAndSendTransaction) {
    throw new Error(`${signer.provider} does not support signing and sending transactions`);
  }
  const network = solanaNetwork(input.chainId, input.fallbackNetwork);
  const rpcUrl = depositRpcUrl(network, input.rpcUrl);
  const connection = input.connection ?? new Connection(rpcUrl, "confirmed");
  const sender = new PublicKey(signer.address);
  const space = new PublicKey(input.spaceAddress);
  const transaction = new Transaction();
  let destinationAddress = space.toBase58();
  let baseUnits: bigint;

  if (token) {
    baseUnits = decimalToBaseUnits(input.amount, token.decimals);
    const mint = new PublicKey(token.tokenAddress);
    const sourceAta = getAssociatedTokenAddressSync(mint, sender);
    const destinationAta = getAssociatedTokenAddressSync(mint, space, true);
    destinationAddress = destinationAta.toBase58();
    transaction.add(createAssociatedTokenAccountIdempotentInstruction(
      sender,
      destinationAta,
      space,
      mint,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ));
    transaction.add(createTransferCheckedInstruction(
      sourceAta,
      mint,
      destinationAta,
      sender,
      baseUnits,
      token.decimals,
      [],
      TOKEN_PROGRAM_ID,
    ));
  } else {
    baseUnits = decimalToBaseUnits(input.amount, 9);
    transaction.add(SystemProgram.transfer({ fromPubkey: sender, toPubkey: space, lamports: baseUnits }));
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  transaction.feePayer = sender;
  transaction.recentBlockhash = blockhash;
  const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
  const signature = await signer.signAndSendTransaction(serialized, walletStandardChain(network));
  return {
    signature,
    sourceAddress: sender.toBase58(),
    destinationAddress,
    baseUnits: baseUnits.toString(),
    rpcUrl,
    network,
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
