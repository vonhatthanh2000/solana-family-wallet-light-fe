import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import type { SolanaOpenPayload } from "../api/types";
import type { ConnectedWallet } from "./phantom";
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
    owner: "0x02",
    members: ["0x03"],
    ...overrides,
  };
}

function walletFor(
  keyPair: nacl.SignKeyPair,
  signer: (bytes: Uint8Array) => Uint8Array = (bytes) =>
    nacl.sign.detached(bytes, keyPair.secretKey),
): ConnectedWallet {
  return {
    address: "base58-address",
    publicKeyBytes: keyPair.publicKey,
    canSignMessage: true,
    signMessage: async (bytes) => signer(bytes),
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
  it("rejects a connected key different from payload.creator", async () => {
    const keyPair = nacl.sign.keyPair();
    await expect(signSolanaPayload(payload(), walletFor(keyPair))).rejects.toThrow(
      "does not match payload.creator",
    );
  });

  it("rejects expired and nearly-expired payloads", async () => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);
    await expect(
      signSolanaPayload(payload({ creator, validUntil: now - 1 }), walletFor(keyPair)),
    ).rejects.toThrow("fewer than 15 safe seconds");
    await expect(
      signSolanaPayload(payload({ creator, validUntil: now + 10 }), walletFor(keyPair)),
    ).rejects.toThrow("fewer than 15 safe seconds");
  });

  it("returns a locally verified 128-character signature", async () => {
    const keyPair = nacl.sign.keyPair();
    const signature = await signSolanaPayload(
      payload({ creator: publicKeyHex(keyPair.publicKey) }),
      walletFor(keyPair),
    );
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
    expect(
      nacl.sign.detached.verify(digestBytes, Uint8Array.from(signature.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16))), keyPair.publicKey),
    ).toBe(true);
  });

  it("fails when the wallet signs the UTF-8 hex text instead of raw digest bytes", async () => {
    const keyPair = nacl.sign.keyPair();
    const value = payload({ creator: publicKeyHex(keyPair.publicKey) });
    const textBytes = new TextEncoder().encode(value.digest);
    await expect(
      signSolanaPayload(
        value,
        walletFor(keyPair, () => nacl.sign.detached(textBytes, keyPair.secretKey)),
      ),
    ).rejects.toThrow("does not verify over the raw backend digest");
  });

  it("fails verification when any digest byte changes", async () => {
    const keyPair = nacl.sign.keyPair();
    const originalSignature = nacl.sign.detached(digestBytes, keyPair.secretKey);
    const changed = Uint8Array.from(digestBytes);
    changed[0] = changed[0]! ^ 0xff;
    await expect(
      signSolanaPayload(
        payload({
          creator: publicKeyHex(keyPair.publicKey),
          digest: `0x${bytesToHex(changed)}`,
        }),
        walletFor(keyPair, () => originalSignature),
      ),
    ).rejects.toThrow("does not verify over the raw backend digest");
  });
});
