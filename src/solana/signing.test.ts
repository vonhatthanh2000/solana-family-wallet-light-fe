import nacl from "tweetnacl";
import { describe, expect, it, vi } from "vitest";
import type { SolanaOpenPayload } from "../api/types";
import type { ConnectedSigner } from "./signers/types";
import {
  bytesToHex,
  hexToBytes32,
  publicKeyHex,
  signSolanaPayload,
} from "./signing";

const now = Math.floor(Date.now() / 1_000);
const digestBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

function payload(overrides: Partial<SolanaOpenPayload> = {}): SolanaOpenPayload {
  return {
    spaceId: "0x01",
    chainObjectId: "chain-object-id",
    chainId: "0x67",
    chainType: "SOL",
    address: "space-pda",
    programId: "program-id",
    creator: `0x${"00".repeat(32)}`,
    digest: `0x${bytesToHex(digestBytes)}`,
    config: "config",
    validAfter: now - 10,
    validUntil: now + 300,
    guardian: "0x01",
    owner: `0x${"00".repeat(32)}`,
    members: ["0x03"],
    ...overrides,
  };
}

function walletFor(
  keyPair: nacl.SignKeyPair,
  signer: (bytes: Uint8Array) => Uint8Array = (bytes) =>
    nacl.sign.detached(bytes, keyPair.secretKey),
): ConnectedSigner {
  return {
    address: "base58-address",
    provider: "Test",
    publicKeyBytes: () => Uint8Array.from(keyPair.publicKey),
    canSignDigest: true,
    signDigest32: async (bytes) => signer(bytes),
  };
}

describe("hexToBytes32", () => {
  it("accepts a valid 0x-prefixed 32-byte digest", () => {
    expect(hexToBytes32(`0x${"ab".repeat(32)}`)).toEqual(
      Uint8Array.from({ length: 32 }, () => 0xab),
    );
  });

  it.each([
    "",
    "0x",
    "0x1",
    `0x${"aa".repeat(31)}`,
    `0x${"aa".repeat(33)}`,
    `0x${"gg".repeat(32)}`,
  ])("rejects malformed input: %s", (value) => {
    expect(() => hexToBytes32(value)).toThrow("exactly 32 bytes");
  });
});

describe("publicKeyHex", () => {
  it("converts a public key to lowercase 0x hex", () => {
    const key = Uint8Array.from({ length: 32 }, (_, index) => 255 - index);
    expect(publicKeyHex(key)).toBe(`0x${bytesToHex(key)}`);
  });
});

describe("signSolanaPayload", () => {
  it("blocks a connected provider that cannot sign raw digests", async () => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);
    const signDigest32 = vi.fn(async () => new Uint8Array(64));

    await expect(signSolanaPayload(payload({ creator, owner: creator }), {
      address: "base58-address",
      provider: "Read-only wallet",
      canSignDigest: false,
      publicKeyBytes: () => keyPair.publicKey,
      signDigest32,
    })).rejects.toThrow("does not support raw digest signing");
    expect(signDigest32).not.toHaveBeenCalled();
  });

  it("rejects a connected key different from payload.creator", async () => {
    const keyPair = nacl.sign.keyPair();
    await expect(signSolanaPayload(payload(), walletFor(keyPair))).rejects.toThrow(
      "does not match payload.creator",
    );
  });

  it("rejects a payload owner different from the connected creator before signing", async () => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);
    const signDigest32 = vi.fn(async () => new Uint8Array(64));

    await expect(
      signSolanaPayload(
        payload({ creator, owner: `0x${"ff".repeat(32)}` }),
        {
          address: "base58-address",
          provider: "Test",
          canSignDigest: true,
          publicKeyBytes: () => keyPair.publicKey,
          signDigest32,
        },
      ),
    ).rejects.toThrow("payload.creator and payload.owner");
    expect(signDigest32).not.toHaveBeenCalled();
  });

  it("rejects expired and nearly-expired payloads", async () => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);
    await expect(
      signSolanaPayload(payload({ creator, owner: creator, validUntil: now - 1 }), walletFor(keyPair)),
    ).rejects.toThrow("Activation payload is expiring; request a fresh payload");
    await expect(
      signSolanaPayload(payload({ creator, owner: creator, validUntil: now + 10 }), walletFor(keyPair)),
    ).rejects.toThrow("Activation payload is expiring; request a fresh payload");
  });

  it("passes the raw 32-byte digest to the connected wallet and verifies the signature", async () => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);
    let signedBytes: Uint8Array | undefined;
    const signature = await signSolanaPayload(
      payload({ creator, owner: creator }),
      walletFor(keyPair, (bytes) => {
        signedBytes = Uint8Array.from(bytes);
        return nacl.sign.detached(bytes, keyPair.secretKey);
      }),
    );
    expect(signedBytes).toEqual(digestBytes);
    expect(signedBytes).toHaveLength(32);
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
    expect(
      nacl.sign.detached.verify(digestBytes, Uint8Array.from(signature.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16))), keyPair.publicKey),
    ).toBe(true);
  });

  it("fails local verification when the wallet signs different bytes", async () => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);
    const wrongBytes = Uint8Array.from(digestBytes);
    wrongBytes[0] = wrongBytes[0]! ^ 0xff;
    await expect(
      signSolanaPayload(
        payload({ creator, owner: creator }),
        walletFor(keyPair, () => nacl.sign.detached(wrongBytes, keyPair.secretKey)),
      ),
    ).rejects.toThrow("does not verify over the raw 32-byte digest");
  });

  it("rejects a non-64-byte signature", async () => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);

    await expect(
      signSolanaPayload(
        payload({ creator, owner: creator }),
        walletFor(keyPair, () => new Uint8Array(63)),
      ),
    ).rejects.toThrow("exactly 64 bytes");
  });
});
