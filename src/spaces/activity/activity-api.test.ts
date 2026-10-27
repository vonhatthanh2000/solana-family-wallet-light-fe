import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setApiClientConfiguration, setApiDebugListener } from "../../api/client";
import { historyQuery, httpActivityApi } from "./activity-api";

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

const emptyList = { pending: [], settled: [], hasMore: false };

describe("historyQuery", () => {
  it("always pages and leaves out filters the user did not set", () => {
    expect(historyQuery({})).toBe("page=1&limit=20");
  });

  it("carries every documented filter", () => {
    expect(historyQuery({ vaultId: "v1", category: "others", from: "2026-08-01", to: "2026-08-31", page: 3, limit: 50 }))
      .toBe("vaultId=v1&category=others&from=2026-08-01&to=2026-08-31&page=3&limit=50");
  });
});

describe("Activity HTTP adapter", () => {
  beforeEach(() => {
    setApiClientConfiguration({ apiBaseUrl: "https://api.example.test", jwt: "secret" });
    setApiDebugListener(undefined);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("reads the recent feed without a vault filter by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(emptyList));
    vi.stubGlobal("fetch", fetchMock);

    await httpActivityApi.listActivities("space/id");

    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.test/family-wallet/spaces/space%2Fid/activities");
  });

  it("narrows the recent feed to one vault", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(emptyList));
    vi.stubGlobal("fetch", fetchMock);

    await httpActivityApi.listActivities("space", "vault/id");

    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.test/family-wallet/spaces/space/activities?vaultId=vault%2Fid");
  });

  it("requests history behind View all with its filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      pending: [], data: [], meta: { currentPage: 1, from: 0, perPage: 20, lastPage: 1, to: 0, total: 0 },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await httpActivityApi.getHistory("space", { vaultId: "v1", page: 2 });

    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.test/family-wallet/spaces/space/activities/history?vaultId=v1&page=2&limit=20");
  });

  it("reads one activity row and the ledger page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({
        id: "act-1", kind: "money_in", state: "settled", status: "complete", icon: "money_in",
        occurredAt: "2026-10-06T08:20:00.000Z", title: { key: "noti.family.money_in.title", params: {} },
        subLine: { key: "noti.family.common.by", params: {} }, target: null, detail: {},
      }))
      .mockResolvedValueOnce(response([]));
    vi.stubGlobal("fetch", fetchMock);

    await httpActivityApi.getActivity("space", "act/1");
    await httpActivityApi.listLedger("space", 2, 20);

    expect(fetchMock.mock.calls[0]![0]).toBe("https://api.example.test/family-wallet/spaces/space/activities/act%2F1");
    expect(fetchMock.mock.calls[1]![0]).toBe("https://api.example.test/family-wallet/spaces/space/ledger?page=2&limit=20");
  });
});
