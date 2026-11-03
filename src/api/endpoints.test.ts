import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, setApiClientConfiguration, setApiDebugListener } from "./client";
import {
  activateSolana,
  createSpace,
  createWalletGroup,
  extractSolanaPayload,
  getDepositAddresses,
  getSolanaDepositFee,
  getSolanaPayload,
  getWalletGroups,
  getWallets,
  registerWallet,
  reportSendTransaction,
} from "./endpoints";
import { canonicalSolanaPayload } from "./solanaPayload.fixture";
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

  it("loads existing wallet groups without creating a new one", async () => {
    const groups = [{
      _id: "group",
      name: "Main Wallet",
      walletIndex: 0,
      selected: true,
      isHidden: false,
      walletIds: [],
    }];
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(groups));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getWalletGroups()).resolves.toEqual(groups);
    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.test/wallets/groups");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBeUndefined();
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

  it("parses the same canonical Solana payload from refresh and create-space responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(canonicalSolanaPayload)));

    await expect(getSolanaPayload(canonicalSolanaPayload.spaceId)).resolves.toEqual(
      canonicalSolanaPayload,
    );
    expect(extractSolanaPayload({
      spaceId: canonicalSolanaPayload.spaceId,
      name: "Family",
      purpose: "FAMILY",
      role: "OWNER",
      memberCount: canonicalSolanaPayload.members.length,
      initialize: {
        spaceId: canonicalSolanaPayload.spaceId,
        ready: [canonicalSolanaPayload],
        skipped: [],
      },
    })).toEqual(canonicalSolanaPayload);
  });

  it("parses backend-supported dUSDT metadata and its exact deposit ATA", async () => {
    const response = {
      spaceId: `0x${"44".repeat(32)}`,
      chains: [{
        chainObjectId: "sol-record", chainId: "devnet", chainType: "SOL",
        address: "space-pda", isDeployed: true,
        tokenDepositAddresses: [{
          token: {
            _id: "dusdt-token", name: "Devnet USDT", symbol: "dUSDT", decimals: 6,
            address: "Ex6Bkm2vTVmrbdn74iYjigzpVYhPjoxQVEnBPm9MEP7F",
          },
          depositAddress: "backend-derived-ata", ataExists: true,
        }],
      }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(response)));

    await expect(getDepositAddresses(response.spaceId)).resolves.toMatchObject({
      tokenDepositAddresses: [{
        symbol: "dUSDT",
        mint: "Ex6Bkm2vTVmrbdn74iYjigzpVYhPjoxQVEnBPm9MEP7F",
        address: "backend-derived-ata",
        isReady: true,
      }],
    });
  });

  it("quotes one token's deposit cost and keeps every lamport figure a string", async () => {
    const quote = {
      tokenId: "698161a631fcd4a91bf994c4",
      mint: "Es9vMFrzaCER",
      decimals: 6,
      destination: "space-ata",
      ataExists: false,
      fees: {
        transactionFeeLamports: "5000", rentLamports: "2039280", totalLamports: "2044280",
        transactionFeeSol: "0.000005", rentSol: "0.00203928", totalSol: "0.00204428",
      },
      sender: "sender-wallet",
      senderLamports: "1500000",
      shortfallLamports: "544280",
    };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(quote));
    vi.stubGlobal("fetch", fetchMock);

    const parsed = await getSolanaDepositFee("space/id", "698161a631fcd4a91bf994c4");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/family-wallet/spaces/space%2Fid/solana/deposit-fee?tokenId=698161a631fcd4a91bf994c4",
    );
    // The *Sol display strings are dropped on purpose: SOL is formatted from lamports everywhere.
    expect(parsed).toEqual({
      tokenId: "698161a631fcd4a91bf994c4",
      mint: "Es9vMFrzaCER",
      decimals: 6,
      destination: "space-ata",
      ataExists: false,
      fees: { transactionFeeLamports: "5000", rentLamports: "2039280", totalLamports: "2044280" },
      sender: "sender-wallet",
      senderLamports: "1500000",
      shortfallLamports: "544280",
    });
  });

  it("rejects a deposit quote whose costs are not smallest-unit integers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({
      tokenId: "token", mint: "mint", decimals: 6, destination: "ata", ataExists: false,
      fees: { transactionFeeLamports: "5000", rentLamports: "0.00203928", totalLamports: "2044280" },
      sender: "sender", senderLamports: "1500000", shortfallLamports: "0",
    })));

    await expect(getSolanaDepositFee("space", "token")).rejects.toThrow(
      "fees.rentLamports must be a smallest-unit integer string",
    );
  });

  it("keeps rentLamports a smallest-unit string and leaves an unreadable one undefined", async () => {
    const response = {
      spaceId: `0x${"44".repeat(32)}`,
      chains: [{
        chainObjectId: "sol-record", chainId: "devnet", chainType: "SOL",
        address: "space-pda", isDeployed: true,
        tokenDepositAddresses: [
          { tokenId: "new", symbol: "dUSDT", decimals: 6, mint: "mint-a", address: "ata-a", isReady: false, rentLamports: "2039280" },
          { tokenId: "open", symbol: "dUSDC", decimals: 6, mint: "mint-b", address: "ata-b", isReady: true, rentLamports: "0" },
          { tokenId: "unknown", symbol: "dBONK", decimals: 5, mint: "mint-c", address: "ata-c", isReady: false },
        ],
      }],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(response)));

    const parsed = await getDepositAddresses(response.spaceId);
    expect(parsed.tokenDepositAddresses.map((token) => token.rentLamports)).toEqual([
      "2039280",
      "0",
      undefined,
    ]);
  });

  it("reports a broadcast deposit to the user's own off-chain history as a SEND", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await reportSendTransaction({
      chainId: "sol-record",
      txHash: "signature",
      from: "sender",
      to: "space-ata",
      amount: "2.5",
      coin: "TOKEN",
      tokenAddress: "mint",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.test/offchain/transaction/create-send-tx");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("POST");
    // The chain document id, the literal TOKEN coin, and whole units — not the transfer's own values.
    expect(JSON.parse(String(init.body))).toEqual({
      chainId: "sol-record",
      txHash: "signature",
      txType: "SEND",
      from: "sender",
      to: "space-ata",
      amount: "2.5",
      coin: "TOKEN",
      tokenAddress: "mint",
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
