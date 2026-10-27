import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setApiClientConfiguration, setApiDebugListener } from "../../api/client";
import { spaceActionApi } from "./space-action-api";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Space action HTTP adapter", () => {
  beforeEach(() => {
    setApiClientConfiguration({ apiBaseUrl: "https://api.example.test", jwt: "secret" });
    setApiDebugListener(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("keeps Vault transfer amounts as strings and sends the idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetchMock);

    await spaceActionApi.moveVaultMoney("space/id", "vault/id", "add-money", "900719925474099312345", "request-id").catch(() => undefined);

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("https://api.example.test/family-wallet/spaces/space%2Fid/vaults/vault%2Fid/add-money");
    expect(JSON.parse(init.body as string)).toEqual({
      amount: "900719925474099312345",
      clientRequestId: "request-id",
    });
  });

  it("serializes spend voting, fee preview, and category re-filing exactly", async () => {
    const spend = {
      spendId: "spend/id", chainType: "SOL", chainId: "devnet", status: "open",
      proposedBy: "owner", action: { token: "native", amount: "1", destination: "destination" },
      intent: { digest: `0x${"11".repeat(32)}`, signed: {} }, note: null, categoryId: null,
      vaultId: null, requiredApprovals: 2, approverIds: ["owner"], declinerIds: [],
      readyToSend: false, send: null, txHash: null,
    };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(spend))
      .mockResolvedValueOnce(response({ lamports: "5000" }))
      .mockResolvedValueOnce(response({}));
    vi.stubGlobal("fetch", fetchMock);

    await spaceActionApi.voteSpend("space", "spend/id", "ab".repeat(64));
    await expect(spaceActionApi.getSpendFee("space", "devnet")).resolves.toEqual({ lamports: "5000" });
    await spaceActionApi.setSpendCategory("space", "spend/id", null);

    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({
      spendId: "spend/id",
      signature: "ab".repeat(64),
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://api.example.test/family-wallet/spaces/space/spend/fee?chainId=devnet");
    expect(fetchMock.mock.calls[2]?.[0]).toBe("https://api.example.test/family-wallet/spaces/space/spend/spend%2Fid/category");
    expect(JSON.parse((fetchMock.mock.calls[2]?.[1] as RequestInit).body as string)).toEqual({ categoryId: null });
  });

  it("lets the browser set a multipart boundary for photo uploads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File([new Uint8Array([1, 2, 3])], "family.png", { type: "image/png" });

    await spaceActionApi.setSpacePhoto("space", file);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.method).toBe("PUT");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.headers as Headers).has("Content-Type")).toBe(false);
    expect((init.body as FormData).get("file")).toBe(file);
  });

  it("sends the rotation target only for guardian rotation payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ actionId: "action", digest: `0x${"22".repeat(32)}` }));
    vi.stubGlobal("fetch", fetchMock);

    await spaceActionApi.guardianPayload("space", "rotate_guardian", "guardian-key");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.test/family-wallet/spaces/space/solana/guardian/rotate_guardian/payload");
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual({ targetGuardian: "guardian-key" });
  });

  it("sends a Vault rule proposal as the direct request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ requestId: "request", kind: "VAULT_RULE" }));
    vi.stubGlobal("fetch", fetchMock);
    const rule = {
      alwaysAsk: false,
      thresholdUsd: "250.50",
      quorumPercent: 75,
      mustIncludeMemberIds: ["member-id"],
    };

    await spaceActionApi.proposeVaultRuleChange("space", "vault/id", rule);

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.example.test/family-wallet/spaces/space/vaults/vault%2Fid/rule-change");
    expect(JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string)).toEqual(rule);
  });
});
