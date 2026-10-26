import { afterEach, describe, expect, it, vi } from "vitest";
import { verifiedTonPublicKeyInBrowser } from "./browser-wallet-public-key";

const PUBLIC_KEY = "ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c";
const TESTNET_V4_ADDRESS = "EQAqbua3_0G_7K_jgzhjJceolfT-TONGsY65wUoBUtZinKC1";

afterEach(() => vi.unstubAllGlobals());

describe("verifiedTonPublicKeyInBrowser", () => {
  it("installs Buffer before lazily evaluating the TON packages", async () => {
    vi.stubGlobal("Buffer", undefined);

    await expect(
      verifiedTonPublicKeyInBrowser(PUBLIC_KEY, TESTNET_V4_ADDRESS, "testnet"),
    ).resolves.toBe(PUBLIC_KEY);
  });
});
