import { apiRequest } from "../../api/client";
import {
  parseActivityDetail, parseActivityHistory, parseActivityList, parseLedger,
  type ActivityDetailDto, type ActivityHistoryDto, type ActivityListDto, type LedgerRowDto,
} from "./contracts";

const id = encodeURIComponent;
const parsed = async <T,>(request: Promise<unknown>, parser: (value: unknown) => T) => parser(await request);

export type HistoryFilter = {
  vaultId?: string;
  category?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
};

export function historyQuery(filter: HistoryFilter): string {
  const query = new URLSearchParams();
  if (filter.vaultId) query.set("vaultId", filter.vaultId);
  if (filter.category) query.set("category", filter.category);
  if (filter.from) query.set("from", filter.from);
  if (filter.to) query.set("to", filter.to);
  query.set("page", String(filter.page ?? 1));
  query.set("limit", String(filter.limit ?? 20));
  return query.toString();
}

export type ActivityApi = {
  listActivities(spaceId: string, vaultId?: string): Promise<ActivityListDto>;
  getHistory(spaceId: string, filter: HistoryFilter): Promise<ActivityHistoryDto>;
  getActivity(spaceId: string, activityId: string): Promise<ActivityDetailDto>;
  listLedger(spaceId: string, page: number, limit: number): Promise<LedgerRowDto[]>;
};

export const httpActivityApi: ActivityApi = {
  listActivities: (spaceId, vaultId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/activities${vaultId ? `?vaultId=${id(vaultId)}` : ""}`),
    parseActivityList,
  ),
  getHistory: (spaceId, filter) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/activities/history?${historyQuery(filter)}`),
    parseActivityHistory,
  ),
  getActivity: (spaceId, activityId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/activities/${id(activityId)}`),
    parseActivityDetail,
  ),
  listLedger: (spaceId, page, limit) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/ledger?page=${page}&limit=${limit}`),
    parseLedger,
  ),
};
