import nacl from "tweetnacl";
import type { SolanaOpenPayload } from "../api/types";
import type { ConnectedWallet } from "./phantom";

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
  wallet: ConnectedWallet | undefined,
  nowSeconds = Math.floor(Date.now() / 1000),
): string | undefined {
  if (!wallet) return "Connect Phantom and create the Solana wallet first";
  if (!wallet.canSignMessage) return "The connected wallet does not support signMessage";
  if (!payload) return "Load a Solana payload first";

  let digest: Uint8Array;
  try {
    digest = hexToBytes32(payload.digest);
  } catch (error) {
    return error instanceof Error ? error.message : "The digest is invalid";
  }
  if (digest.length !== 32) return "Digest must be exactly 32 bytes";
  if (publicKeyHex(wallet.publicKeyBytes).toLowerCase() !== payload.creator.toLowerCase()) {
    return "Connected Phantom account does not match payload.creator";
  }
  if (nowSeconds < payload.validAfter) return "Payload is not valid yet";
  if (nowSeconds >= payload.validUntil - 15) {
    return "Payload is expired or has fewer than 15 safe seconds remaining";
  }
  return undefined;
}

export async function signSolanaPayload(
  payload: SolanaOpenPayload,
  wallet: ConnectedWallet,
): Promise<string> {
  const signabilityError = getSignabilityError(payload, wallet);
  if (signabilityError) throw new Error(signabilityError);

  const digestBytes = hexToBytes32(payload.digest);
  const signatureBytes = await wallet.signMessage(digestBytes);
  if (signatureBytes.length !== 64) {
    throw new Error("Wallet returned a signature that is not 64 bytes");
  }
  if (!nacl.sign.detached.verify(digestBytes, signatureBytes, wallet.publicKeyBytes)) {
    throw new Error("Wallet signature does not verify over the raw backend digest");
  }
  return bytesToHex(signatureBytes);
}
