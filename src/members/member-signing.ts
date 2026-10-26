import nacl from "tweetnacl";
import { bytesToHex, hexToBytes32 } from "../solana/signing";
import type { ConnectedSigner } from "../solana/signers/types";
import type { MemberSendDto } from "./contracts";

export function getMemberSignabilityError(input: {
  send: MemberSendDto;
  actorUserId?: string;
  connectedSigner?: ConnectedSigner;
  storedAddress?: string;
  nowSeconds?: number;
}): string | undefined {
  const { send, actorUserId, connectedSigner, storedAddress } = input;
  const nowSeconds = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (send.chainType !== "SOL") return "Only Solana member changes are supported by this demo";
  if (!actorUserId || send.signerUserId !== actorUserId) {
    return "This member change is assigned to a different signer";
  }
  if (!connectedSigner) return "Connect Solflare before signing";
  if (!storedAddress) return "Load or register this profile's stored Solana wallet first";
  if (connectedSigner.address !== storedAddress) {
    return "Connected Solflare account does not match the stored Solana wallet";
  }
  if (!send.send) return "Load a fresh member-change payload first";
  if (send.send.signed.action.kind !== send.change) {
    return "Signed action does not match the member change row";
  }
  try {
    hexToBytes32(send.send.digest);
  } catch (error) {
    return error instanceof Error ? error.message : "Member-change digest is invalid";
  }
  if (nowSeconds < send.send.signed.validAfter) return "Member-change payload is not valid yet";
  if (nowSeconds >= send.send.signed.validUntil - 15) {
    return "Member-change payload is expiring; load a fresh payload";
  }
  return undefined;
}

export async function signMemberDigest(input: {
  send: MemberSendDto;
  actorUserId?: string;
  connectedSigner?: ConnectedSigner;
  storedAddress?: string;
  nowSeconds?: number;
}): Promise<string> {
  const problem = getMemberSignabilityError(input);
  if (problem) throw new Error(problem);
  const signer = input.connectedSigner!;
  const digest = hexToBytes32(input.send.send!.digest);
  const signature = await signer.signDigest32(digest);
  if (signature.length !== 64) throw new Error("Ed25519 signature must be exactly 64 bytes");
  if (!nacl.sign.detached.verify(digest, signature, signer.publicKeyBytes())) {
    throw new Error("Signature does not verify over the raw 32-byte member-change digest");
  }
  return bytesToHex(signature);
}
