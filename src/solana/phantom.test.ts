import { afterEach, describe, expect, it, vi } from "vitest";
import { connectPhantom, type PhantomProvider, type PublicKeyLike } from "./phantom";

function publicKey(address: string): PublicKeyLike {
  return {
    toBase58: () => address,
    toBytes: () => new Uint8Array(32),
  };
}

function providerFor(address: string, signatureByte: number): PhantomProvider {
  const key = publicKey(address);
  return {
    isPhantom: true,
    publicKey: key,
    connect: vi.fn(async () => ({ publicKey: key })),
    disconnect: vi.fn(async () => undefined),
    signMessage: vi.fn(async () => ({
      signature: new Uint8Array(64).fill(signatureByte),
      publicKey: key,
    })),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Phantom signing adapter", () => {
  it("reacquires the injected provider and opens the signing request directly", async () => {
    const originalProvider = providerFor("same-address", 1);
    const refreshedProvider = providerFor("same-address", 2);
    vi.stubGlobal("window", { phantom: { solana: originalProvider } });

    const wallet = await connectPhantom();
    window.phantom!.solana = refreshedProvider;

    const signature = await wallet.signMessage(new Uint8Array(32));

    expect(refreshedProvider.connect).not.toHaveBeenCalled();
    expect(refreshedProvider.signMessage).toHaveBeenCalledOnce();
    expect(originalProvider.signMessage).not.toHaveBeenCalled();
    expect(signature).toEqual(new Uint8Array(64).fill(2));
  });
});
