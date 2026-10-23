import nacl from "tweetnacl";
import type { SolanaOpenPayload } from "../api/types";

export interface SolanaMessageSigner {
  publicKeyBytes(): Uint8Array;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}

export const SOLANA_ACTIVATION_MESSAGE_VERSION = 1 as const;
export const SOLANA_ACTIVATION_MESSAGE_ENCODING = "utf8" as const;
export const SOLANA_ACTIVATION_MESSAGE_PREFIX = "Family Wallet Solana activation v1";

export function solanaActivationSigningMessage(digest: string): string {
  if (!/^0x[0-9a-f]{64}$/.test(digest)) {
    throw new Error("Solana activation digest must be canonical lowercase 0x-prefixed hex");
  }
  return `${SOLANA_ACTIVATION_MESSAGE_PREFIX}\nDigest: ${digest}`;
}

export function solanaActivationSigningBytes(digest: string): Uint8Array {
  return new TextEncoder().encode(solanaActivationSigningMessage(digest));
}

function validateCanonicalSigningMessage(payload: SolanaOpenPayload): Uint8Array {
  if (payload.signingMessageEncoding !== SOLANA_ACTIVATION_MESSAGE_ENCODING) {
    throw new Error("Unsupported Solana signing-message encoding");
  }
  if (payload.signingMessageVersion !== SOLANA_ACTIVATION_MESSAGE_VERSION) {
    throw new Error("Unsupported Solana signing-message version");
  }
  const expected = solanaActivationSigningMessage(payload.digest);
  if (payload.signingMessage !== expected) {
    throw new Error("INVALID_OPEN_PAYLOAD: Solana signing message is not canonical");
  }
  return new TextEncoder().encode(expected);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes32(value: string): Uint8Array {
  const hex = value.replace(/^0x/i, "");
  if (hex.length !== 64 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error("Digest must be exactly 32 bytes of hexadecimal");
  }
  return Uint8Array.from(hex.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

export function publicKeyHex(publicKey: Uint8Array): `0x${string}` {
  if (publicKey.length !== 32) throw new Error("Solana public key must be 32 bytes");
  return `0x${bytesToHex(publicKey)}`;
}

export function getSignabilityError(
  payload: SolanaOpenPayload | undefined,
  wallet: SolanaMessageSigner | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | undefined {
  if (!wallet) return "Connect Phantom and create the Solana wallet first";
  if (!payload) return "Load a Solana payload first";

  try {
    validateCanonicalSigningMessage(payload);
  } catch (error) {
    return error instanceof Error ? error.message : "The digest is invalid";
  }
  const connectedKey = publicKeyHex(wallet.publicKeyBytes()).toLowerCase();
  if (
    connectedKey !== payload.creator.toLowerCase() ||
    connectedKey !== payload.owner.toLowerCase()
  ) {
    return "Connected Phantom account does not match payload.creator and payload.owner";
  }
  if (nowSeconds < payload.validAfter) return "Payload is not valid yet";
  if (nowSeconds >= payload.validUntil - 15) {
    return "Activation payload is expiring; request a fresh payload";
  }
  return undefined;
}

export async function signSolanaPayload(
  payload: SolanaOpenPayload,
  wallet: SolanaMessageSigner,
): Promise<string> {
  const signabilityError = getSignabilityError(payload, wallet);
  if (signabilityError) throw new Error(signabilityError);

  const messageBytes = validateCanonicalSigningMessage(payload);
  const signatureBytes = await wallet.signMessage(messageBytes);
  if (signatureBytes.length !== 64) {
    throw new Error("Ed25519 signature must be exactly 64 bytes");
  }
  if (!nacl.sign.detached.verify(messageBytes, signatureBytes, wallet.publicKeyBytes())) {
    throw new Error("Signature does not verify over the canonical activation message");
  }
  return bytesToHex(signatureBytes);
}
