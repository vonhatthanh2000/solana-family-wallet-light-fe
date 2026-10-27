import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setApiClientConfiguration, setApiDebugListener } from "../api/client";
import { httpMemberApi } from "./member-api";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

const request = {
  id: "request-id",
  spaceId: "space",
  kind: "JOIN",
  status: "PENDING",
  proposerUserId: "member-b",
  targetUserId: "member-b",
  payload: { role: "MEMBER" },
  seals: [],
  declines: [],
  need: 1,
  eligibleVoters: ["owner"],
  expiresAt: new Date().toISOString(),
};

describe("member HTTP adapter", () => {
  beforeEach(() => {
    setApiClientConfiguration({ apiBaseUrl: "https://api.example.test", jwt: "secret" });
    setApiDebugListener(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads the shared approval inbox and approves its request", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response([request]))
      .mockResolvedValueOnce(response(request));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpMemberApi.listRequests("space/id")).resolves.toHaveLength(1);
    await httpMemberApi.approve("space/id", "request/id");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/family-wallet/spaces/space%2Fid/requests",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.example.test/family-wallet/spaces/space%2Fid/requests/request%2Fid/approve",
    );
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe("POST");
  });

  it("declines, withdraws, and retries a family request on their distinct routes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ ...request, status: "REJECTED", declines: ["owner"] }))
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({}));
    vi.stubGlobal("fetch", fetchMock);

    await httpMemberApi.decline("space", "request/id");
    await httpMemberApi.cancelRequest("space", "request/id");
    await httpMemberApi.applyVaultRequest("space", "request/id");

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.example.test/family-wallet/spaces/space/requests/request%2Fid/decline",
      "https://api.example.test/family-wallet/spaces/space/requests/request%2Fid",
      "https://api.example.test/family-wallet/spaces/space/requests/request%2Fid/apply",
    ]);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe("DELETE");
  });

  it("loads accepted-member Space information and role permissions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        spaceId: "space",
        name: "Family",
        purpose: "FAMILY",
        role: "MEMBER",
        memberCount: 2,
        chains: [{
          chainObjectId: "sol-chain",
          chainId: "devnet",
          chainType: "SOL",
          address: "space-pda",
          isDeployed: true,
        }],
      }))
      .mockResolvedValueOnce(response([{
        key: "MEMBER",
        permissions: ["VIEW", "VOTE"],
        countsInQuorum: true,
        onChainSigner: true,
        singleHolder: false,
        labels: {},
      }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpMemberApi.getSpace("space")).resolves.toMatchObject({
      role: "MEMBER",
      membershipStatus: "ACTIVE",
    });
    await expect(httpMemberApi.listRoles()).resolves.toEqual([
      expect.objectContaining({ key: "MEMBER", permissions: ["VIEW", "VOTE"] }),
    ]);
  });

  it("submits only memberSendId and lowercase signature", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      memberSendId: "send-id",
      txHash: "transaction",
      status: "submitted",
    }));
    vi.stubGlobal("fetch", fetchMock);

    await httpMemberApi.submitSend("space", "send-id", "ab".repeat(64));

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual({
      memberSendId: "send-id",
      signature: "ab".repeat(64),
    });
  });

  it("lists reusable open invites for the Space", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response([{
      id: "invite",
      spaceId: "space",
      code: "existing-code",
      role: "MEMBER",
      status: "OPEN",
      expiresAt: "2026-11-01T00:00:00.000Z",
      createdBy: "owner",
    }]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpMemberApi.listInvites("space")).resolves.toEqual([
      expect.objectContaining({ code: "existing-code", status: "OPEN" }),
    ]);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/family-wallet/spaces/space/invites",
    );
  });

  it("revokes a selected invite by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}));
    vi.stubGlobal("fetch", fetchMock);

    await httpMemberApi.revokeInvite("space", "invite/id");

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.example.test/family-wallet/spaces/space/invites/invite%2Fid",
    );
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe("DELETE");
  });
});
