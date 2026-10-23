import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, setApiClientConfiguration, setApiDebugListener } from "./client";
import { activateSolana, createSpace, createWalletGroup, getWallets, registerWallet } from "./endpoints";
import type { DebugEvent } from "./types";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("endpoint serialization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setApiClientConfiguration({ apiBaseUrl: "https://api.example.test", jwt: "super-secret-jwt" });
    setApiDebugListener(undefined);
  });

  it("wallet registration sends the chain, public address, public key, and group index", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ _id: "wallet" }));
    vi.stubGlobal("fetch", fetchMock);

    await registerWallet({
      chainId: "mongo-chain-id",
      address: "base58-address",
      publicKey: "base58-address",
      walletIndex: 0,
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      chainId: "mongo-chain-id",
      address: "base58-address",
      publicKey: "base58-address",
      walletIndex: 0,
    });
  });

  it("creates a wallet group using only its name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      _id: "group",
      name: "Main Wallet",
      walletIndex: 0,
      selected: true,
      isHidden: false,
    }));
    vi.stubGlobal("fetch", fetchMock);

    await createWalletGroup("Main Wallet");

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://api.example.test/wallets/groups");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ name: "Main Wallet" });
  });

  it("gets existing wallets by the chain MongoDB id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWallets("mongo chain/id")).resolves.toEqual([]);

    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.example.test/wallets?chainId=mongo%20chain%2Fid",
    );
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBeUndefined();
  });

  it("activation sends only the signature and unchanged payload timestamps", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ deployState: "pending" }));
    vi.stubGlobal("fetch", fetchMock);

    await activateSolana("0xspace", {
      signature: "ab".repeat(64),
      validAfter: 1_790_000_000,
      validUntil: 1_790_000_300,
    });

    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      signature: "ab".repeat(64),
      validAfter: 1_790_000_000,
      validUntil: 1_790_000_300,
    });
  });

  it("attaches the failed Create Space request body to a 400 error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      statusCode: 400,
      message: "Invalid approval rule",
      code: "INVALID_APPROVAL_RULE",
    }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })));

    const error = await createSpace("My test space").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe("Invalid approval rule");
    expect((error as ApiError).request).toEqual({
      method: "POST",
      path: "/family-wallet/spaces",
      body: {
        name: "My test space",
        purpose: "FAMILY",
        approvalRule: {
          alwaysAsk: false,
          thresholdUsd: "200",
          quorumPercent: 50,
        },
      },
    });
  });

  it("never includes authorization or the JWT in debug events", async () => {
    const events: DebugEvent[] = [];
    setApiDebugListener((event) => events.push(event));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ _id: "wallet" })));

    await registerWallet({
      chainId: "chain",
      address: "address",
      publicKey: "address",
      walletIndex: 0,
    });

    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("super-secret-jwt");
    expect(serialized.toLowerCase()).not.toContain("authorization");
  });

});
