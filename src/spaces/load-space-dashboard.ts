import type { SpaceDashboard } from "./contracts";
import type { SpaceDashboardApi } from "./space-api";

export async function loadSpaceDashboard(
  api: Pick<SpaceDashboardApi, "getSpace" | "listVaults" | "getMembers">,
  spaceId: string,
): Promise<SpaceDashboard> {
  const [space, vaults, members] = await Promise.all([
    api.getSpace(spaceId),
    api.listVaults(spaceId),
    api.getMembers(spaceId),
  ]);
  return { space, vaults, members };
}
