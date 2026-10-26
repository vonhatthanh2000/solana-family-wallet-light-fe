import { afterEach, describe, expect, it, vi } from "vitest";
import { verifiedTonPublicKey } from "./wallet-public-key";

const PUBLIC_KEY = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
const TESTNET_V4_ADDRESS = "EQAqbua3_0G_7K_jgzhjJceolfT-TONGsY65wUoBUtZinKC1";
const TESTNET_V5_ADDRESS = "EQD0NT7WXJYKY55KvH9gXNjOuuXoQcvcL60sPQgG6r9MdWol";
const MAINNET_V5_ADDRESS = "EQCUm8ivArnrArRJxOEdWU9L79QzyMa2ZZZ7YKn52__z0ICV";

afterEach(() => vi.unstubAllGlobals());

describe("verifiedTonPublicKey", () => {
  it.each([TESTNET_V4_ADDRESS, TESTNET_V5_ADDRESS])(
    "accepts the backend-compatible testnet wallet at %s",
    (address) => {
      expect(verifiedTonPublicKey(PUBLIC_KEY.toUpperCase(), address, "testnet")).toBe(PUBLIC_KEY);
    },
  );

  it("uses the mainnet global id for a v5 wallet", () => {
    expect(verifiedTonPublicKey(PUBLIC_KEY, MAINNET_V5_ADDRESS, "mainnet")).toBe(PUBLIC_KEY);
    expect(() =>
      verifiedTonPublicKey(PUBLIC_KEY, MAINNET_V5_ADDRESS, "testnet"),
    ).toThrow("TON publicKey does not match the wallet address");
  });

  it("rejects a key that does not derive the stored address", () => {
    expect(() =>
      verifiedTonPublicKey("08".repeat(32), TESTNET_V5_ADDRESS, "testnet"),
    ).toThrow("TON publicKey does not match the wallet address");
  });

  it("verifies an address when the browser has no Node Buffer global", () => {
    vi.stubGlobal("Buffer", undefined);

    expect(verifiedTonPublicKey(PUBLIC_KEY, TESTNET_V4_ADDRESS, "testnet")).toBe(PUBLIC_KEY);
  });
});
