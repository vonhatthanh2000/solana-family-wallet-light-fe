import nacl from "tweetnacl";
import { describe, expect, it, vi } from "vitest";
import type { MemberSendDto } from "./contracts";
import { getMemberSignabilityError, signMemberDigest } from "./member-signing";

const pair = nacl.sign.keyPair();
const digest = Uint8Array.from({ length: 32 }, (_, index) => index);
const digestHex = `0x${Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("")}` as const;
const send: MemberSendDto = {
  memberSendId: "send",
  chainType: "SOL",
  chainId: "devnet",
  change: "add",
  slot: 1,
  key: "0xkey",
  targetUserId: "member-b",
  signerUserId: "owner",
  requestId: "request",
  status: "signing",
  txHash: null,
  send: {
    chainType: "SOL",
    digest: digestHex,
    requestBoc: "base64",
    signed: {
      programId: "program",
      networkId: -3,
      space: "space-address",
      nonce: "1",
      validAfter: 100,
      validUntil: 500,
      maxRefundLamports: "0",
      action: { kind: "add", key: "0xkey" },
    },
  },
};

describe("member digest signing", () => {
  it("passes exactly the raw 32 digest bytes to the assigned signer", async () => {
    const signDigest32 = vi.fn(async (bytes: Uint8Array) =>
      nacl.sign.detached(bytes, pair.secretKey));
    const signer = {
      address: "stored-address",
      provider: "Solflare",
      canSignDigest: true,
      publicKeyBytes: () => pair.publicKey,
      signDigest32,
    };

    const signature = await signMemberDigest({
      send,
      actorUserId: "owner",
      connectedSigner: signer,
      storedAddress: "stored-address",
      nowSeconds: 200,
    });

    expect(signDigest32).toHaveBeenCalledWith(digest);
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
  });

  it("blocks another actor and a mismatched wallet before signing", () => {
    expect(getMemberSignabilityError({ send, actorUserId: "member-b" })).toContain(
      "different signer",
    );
    expect(getMemberSignabilityError({
      send,
      actorUserId: "owner",
      connectedSigner: {
        address: "wrong",
        provider: "Solflare",
        canSignDigest: true,
        publicKeyBytes: () => pair.publicKey,
        signDigest32: vi.fn(),
      },
      storedAddress: "stored-address",
      nowSeconds: 200,
    })).toContain("does not match");
  });
});
