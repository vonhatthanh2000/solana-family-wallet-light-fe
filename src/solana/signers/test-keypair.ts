import bs58 from "bs58";
import nacl from "tweetnacl";
import type { ConnectedSigner } from "./types";

export function createTestKeypairSigner(seed = crypto.getRandomValues(new Uint8Array(32))): ConnectedSigner {
  if (seed.length !== 32) throw new Error("Test signer seed must be exactly 32 bytes");
  const keyPair = nacl.sign.keyPair.fromSeed(Uint8Array.from(seed));

  return {
    address: bs58.encode(keyPair.publicKey),
    provider: "Test keypair",
    canSignDigest: true,
    publicKeyBytes: () => Uint8Array.from(keyPair.publicKey),
    signDigest32: async (digest: Uint8Array) => {
      if (digest.length !== 32) throw new Error("Signing digest must be exactly 32 bytes");
      return nacl.sign.detached(digest, keyPair.secretKey);
    },
  };
}
