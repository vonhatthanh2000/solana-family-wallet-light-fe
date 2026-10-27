import { apiRequest } from "../api/client";
import {
  parseDashboardMembers,
  parseSpaceDetail,
  parseSpaceList,
  parseVaults,
  type SpaceDetailDto,
  type SpaceMembersDto,
  type SpaceSummaryDto,
  type VaultDto,
} from "./contracts";

export type SpaceDashboardApi = {
  listSpaces(): Promise<SpaceSummaryDto[]>;
  getSpace(spaceId: string): Promise<SpaceDetailDto>;
  listVaults(spaceId: string): Promise<VaultDto[]>;
  getMembers(spaceId: string): Promise<SpaceMembersDto>;
};

const id = encodeURIComponent;
const parsed = async <T,>(request: Promise<unknown>, parser: (value: unknown) => T) => parser(await request);

export const httpSpaceDashboardApi: SpaceDashboardApi = {
  listSpaces: () => parsed(apiRequest("/family-wallet/spaces"), parseSpaceList),
  getSpace: (spaceId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}`),
    parseSpaceDetail,
  ),
  listVaults: (spaceId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/vaults`),
    parseVaults,
  ),
  getMembers: (spaceId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/members`),
    parseDashboardMembers,
  ),
};
