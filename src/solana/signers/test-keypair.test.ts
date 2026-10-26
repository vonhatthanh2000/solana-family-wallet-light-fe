import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { createTestKeypairSigner } from "./test-keypair";

describe("development Ed25519 signer", () => {
  it("signs exactly one raw 32-byte digest with a stable Solana address", async () => {
    const signer = createTestKeypairSigner(new Uint8Array(32).fill(7));
    const digest = Uint8Array.from({ length: 32 }, (_, index) => index);

    const signature = await signer.signDigest32(digest);

    expect(signer.provider).toBe("Test keypair");
    expect(signer.address).toBe("GmaDrppBC7P5ARKV8g3djiwP89vz1jLK23V2GBjuAEGB");
    expect(signer.publicKeyBytes()).toHaveLength(32);
    expect(signature).toHaveLength(64);
    expect(nacl.sign.detached.verify(digest, signature, signer.publicKeyBytes())).toBe(true);
  });

  it("rejects a message that is not exactly 32 bytes", async () => {
    const signer = createTestKeypairSigner(new Uint8Array(32).fill(7));

    await expect(signer.signDigest32(new Uint8Array(31))).rejects.toThrow("exactly 32 bytes");
  });
});
