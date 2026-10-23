import nacl from "tweetnacl";
import { describe, expect, it, vi } from "vitest";
import type { SolanaOpenPayload } from "../api/types";
import type { ConnectedWallet } from "./phantom";
import {
  bytesToHex,
  hexToBytes32,
  publicKeyHex,
  signSolanaPayload,
  solanaActivationSigningBytes,
  solanaActivationSigningMessage,
} from "./signing";

const now = Math.floor(Date.now() / 1_000);
const digestBytes = Uint8Array.from({ length: 32 }, (_, index) => index + 1);

function payload(overrides: Partial<SolanaOpenPayload> = {}): SolanaOpenPayload {
  const digest = overrides.digest ?? `0x${bytesToHex(digestBytes)}`;
  return {
    spaceId: "0x01",
    chainObjectId: "chain-object-id",
    chainId: "0x67",
    chainType: "SOL",
    address: "space-pda",
    programId: "program-id",
    creator: `0x${"00".repeat(32)}`,
    digest,
    signingMessage: solanaActivationSigningMessage(digest),
    signingMessageEncoding: "utf8",
    signingMessageVersion: 1,
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
): ConnectedWallet {
  return {
    address: "base58-address",
    publicKeyBytes: () => Uint8Array.from(keyPair.publicKey),
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

describe("solanaActivationSigningMessage", () => {
  it("constructs the exact 109-byte version-1 message", () => {
    const digest = `0x${"ab".repeat(32)}`;
    const expected = `Family Wallet Solana activation v1\nDigest: ${digest}`;

    expect(solanaActivationSigningMessage(digest)).toBe(expected);
    expect(solanaActivationSigningBytes(digest)).toEqual(new TextEncoder().encode(expected));
    expect(solanaActivationSigningBytes(digest)).toHaveLength(109);
    expect(expected.endsWith("\n")).toBe(false);
  });

  it.each([
    "",
    "ab".repeat(32),
    `0x${"AB".repeat(32)}`,
    `0x${"ab".repeat(31)}`,
    `0x${"ab".repeat(33)}`,
  ])("rejects a non-canonical digest: %s", (digest) => {
    expect(() => solanaActivationSigningMessage(digest)).toThrow("canonical lowercase");
  });
});

describe("signSolanaPayload", () => {
  it("rejects a connected key different from payload.creator", async () => {
    const keyPair = nacl.sign.keyPair();
    await expect(signSolanaPayload(payload(), walletFor(keyPair))).rejects.toThrow(
      "does not match payload.creator",
    );
  });

  it("rejects a payload owner different from the connected creator before signing", async () => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);
    const signMessage = vi.fn(async () => new Uint8Array(64));

    await expect(
      signSolanaPayload(
        payload({ creator, owner: `0x${"ff".repeat(32)}` }),
        { publicKeyBytes: () => keyPair.publicKey, signMessage },
      ),
    ).rejects.toThrow("payload.creator and payload.owner");
    expect(signMessage).not.toHaveBeenCalled();
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

  it("passes the exact canonical UTF-8 bytes to Phantom and verifies the signature", async () => {
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
    const expectedBytes = solanaActivationSigningBytes(`0x${bytesToHex(digestBytes)}`);

    expect(signedBytes).toEqual(expectedBytes);
    expect(signedBytes).not.toEqual(digestBytes);
    expect(signature).toMatch(/^[0-9a-f]{128}$/);
    expect(
      nacl.sign.detached.verify(expectedBytes, Uint8Array.from(signature.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16))), keyPair.publicKey),
    ).toBe(true);
  });

  it.each([
    ["CRLF", (message: string) => message.replace("\n", "\r\n")],
    ["trailing newline", (message: string) => `${message}\n`],
    ["changed capitalization", (message: string) => message.replace("Family", "family")],
    ["uppercase digest", (message: string) => message.replace(/[a-f]/g, (value) => value.toUpperCase())],
  ])("rejects a non-canonical API message (%s) before calling Phantom", async (_label, mutate) => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);
    const canonical = payload({ creator, owner: creator });
    const signMessage = vi.fn(async () => new Uint8Array(64));

    await expect(
      signSolanaPayload(
        { ...canonical, signingMessage: mutate(canonical.signingMessage) },
        { ...walletFor(keyPair), signMessage },
      ),
    ).rejects.toThrow("INVALID_OPEN_PAYLOAD");
    expect(signMessage).not.toHaveBeenCalled();
  });

  it("fails local verification when the wallet signs different bytes", async () => {
    const keyPair = nacl.sign.keyPair();
    const creator = publicKeyHex(keyPair.publicKey);
    const wrongBytes = Uint8Array.from(digestBytes);
    await expect(
      signSolanaPayload(
        payload({ creator, owner: creator }),
        walletFor(keyPair, () => nacl.sign.detached(wrongBytes, keyPair.secretKey)),
      ),
    ).rejects.toThrow("does not verify over the canonical activation message");
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
