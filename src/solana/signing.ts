import nacl from "tweetnacl";
import type { SolanaOpenPayload } from "../api/types";
import type { ConnectedSigner } from "./signers/types";

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
  wallet: ConnectedSigner | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | undefined {
  if (!wallet) return "Connect a signing wallet and create the Solana wallet first";
  if (!payload) return "Load a Solana payload first";
  if (!wallet.canSignDigest) {
    return `${wallet.provider} does not support raw digest signing`;
  }

  try {
    hexToBytes32(payload.digest);
  } catch (error) {
    return error instanceof Error ? error.message : "The digest is invalid";
  }
  const connectedKey = publicKeyHex(wallet.publicKeyBytes()).toLowerCase();
  if (
    connectedKey !== payload.creator.toLowerCase() ||
    connectedKey !== payload.owner.toLowerCase()
  ) {
    return "Connected signing account does not match payload.creator and payload.owner";
  }
  if (nowSeconds < payload.validAfter) return "Payload is not valid yet";
  if (nowSeconds >= payload.validUntil - 15) {
    return "Activation payload is expiring; request a fresh payload";
  }
  return undefined;
}

export async function signSolanaPayload(
  payload: SolanaOpenPayload,
  wallet: ConnectedSigner,
): Promise<string> {
  const signabilityError = getSignabilityError(payload, wallet);
  if (signabilityError) throw new Error(signabilityError);

  const digestBytes = hexToBytes32(payload.digest);
  const signatureBytes = await wallet.signDigest32(digestBytes);
  if (signatureBytes.length !== 64) {
    throw new Error("Ed25519 signature must be exactly 64 bytes");
  }
  if (!nacl.sign.detached.verify(digestBytes, signatureBytes, wallet.publicKeyBytes())) {
    throw new Error("Signature does not verify over the raw 32-byte digest");
  }
  return bytesToHex(signatureBytes);
}
