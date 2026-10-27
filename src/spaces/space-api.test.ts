import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setApiClientConfiguration, setApiDebugListener } from "../api/client";
import { httpSpaceDashboardApi } from "./space-api";

const response = (body: unknown) => new Response(JSON.stringify(body), {
  status: 200,
  headers: { "Content-Type": "application/json" },
});

describe("Space dashboard HTTP adapter", () => {
  beforeEach(() => {
    setApiClientConfiguration({ apiBaseUrl: "https://api.example.test", jwt: "secret" });
    setApiDebugListener(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("uses encoded Space ids for detail, vault, and member reads", async () => {
    const detail = { spaceId: "space/id", name: "Family", purpose: "FAMILY", role: "OWNER", memberCount: 1, chains: [] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(detail))
      .mockResolvedValueOnce(response([]))
      .mockResolvedValueOnce(response({ voterCount: 0, members: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await httpSpaceDashboardApi.getSpace("space/id");
    await httpSpaceDashboardApi.listVaults("space/id");
    await httpSpaceDashboardApi.getMembers("space/id");

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.example.test/family-wallet/spaces/space%2Fid",
      "https://api.example.test/family-wallet/spaces/space%2Fid/vaults",
      "https://api.example.test/family-wallet/spaces/space%2Fid/members",
    ]);
  });
});
