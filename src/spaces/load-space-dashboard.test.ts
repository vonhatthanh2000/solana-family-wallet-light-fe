import { describe, expect, it, vi } from "vitest";
import { loadSpaceDashboard } from "./load-space-dashboard";

describe("loadSpaceDashboard", () => {
  it("starts all selected-Space reads before waiting for results", async () => {
    const calls: string[] = [];
    const api = {
      getSpace: vi.fn(async () => { calls.push("space"); return { spaceId: "space" } as never; }),
      listVaults: vi.fn(async () => { calls.push("vaults"); return []; }),
      getMembers: vi.fn(async () => { calls.push("members"); return { voterCount: 0, members: [] }; }),
    };

    const dashboard = await loadSpaceDashboard(api, "space");

    expect(calls).toEqual(["space", "vaults", "members"]);
    expect(dashboard).toMatchObject({ vaults: [], members: { voterCount: 0 } });
  });
});
