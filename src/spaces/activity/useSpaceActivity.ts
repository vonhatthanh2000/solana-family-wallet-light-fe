import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagnosticError } from "../../api/types";
import { pollIntervalMs } from "../../flow/poll-interval";
import { normalizeError } from "../../flow/state";
import { httpActivityApi, type ActivityApi, type HistoryFilter } from "./activity-api";
import type { ActivityDetailDto, ActivityHistoryDto, ActivityListDto, LedgerRowDto } from "./contracts";

export type ActivityView = "recent" | "history" | "ledger";

type Inputs = {
  spaceId: string;
  enabled: boolean;
  api?: ActivityApi;
};

const LEDGER_LIMIT = 20;

export function useSpaceActivity({ spaceId, enabled, api = httpActivityApi }: Inputs) {
  const [view, setView] = useState<ActivityView>("recent");
  const [recent, setRecent] = useState<ActivityListDto>();
  const [history, setHistory] = useState<ActivityHistoryDto>();
  const [ledger, setLedger] = useState<LedgerRowDto[]>();
  const [detail, setDetail] = useState<ActivityDetailDto>();
  const [filter, setFilter] = useState<HistoryFilter>({ page: 1, limit: 20 });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DiagnosticError>();
  const sequence = useRef(0);
  const busy = useRef(false);

  const load = useCallback(async (silent: boolean) => {
    if (!enabled || !spaceId) return;
    const current = ++sequence.current;
    busy.current = true;
    if (!silent) setLoading(true);
    try {
      if (view === "recent") {
        const result = await api.listActivities(spaceId, filter.vaultId);
        if (current === sequence.current) setRecent(result);
      } else if (view === "history") {
        const result = await api.getHistory(spaceId, filter);
        if (current === sequence.current) setHistory(result);
      } else {
        const result = await api.listLedger(spaceId, ledgerPage, LEDGER_LIMIT);
        if (current === sequence.current) setLedger(result);
      }
      if (current === sequence.current) setError(undefined);
    } catch (failure) {
      if (current === sequence.current) setError(normalizeError(failure, "backend"));
    } finally {
      busy.current = false;
      if (current === sequence.current && !silent) setLoading(false);
    }
  }, [api, enabled, filter, ledgerPage, spaceId, view]);

  useEffect(() => {
    setDetail(undefined);
    void load(false);
  }, [load]);

  useEffect(() => {
    ++sequence.current;
    setRecent(undefined); setHistory(undefined); setLedger(undefined); setDetail(undefined);
    setFilter({ page: 1, limit: 20 }); setLedgerPage(1); setError(undefined);
  }, [spaceId]);

  // Pending rows move on their own, and a request another member proposes shows up only on a refetch,
  // so an empty feed keeps the slower heartbeat rather than going silent.
  const pendingCount = (view === "history" ? history?.pending.length : recent?.pending.length) ?? 0;
  const interval = pollIntervalMs(pendingCount > 0);
  useEffect(() => {
    if (!enabled || !spaceId || view === "ledger") return;
    const timer = window.setInterval(() => {
      if (!busy.current) void load(true);
    }, interval);
    return () => window.clearInterval(timer);
  }, [enabled, interval, load, spaceId, view]);

  const openDetail = useCallback(async (activityId: string) => {
    if (!spaceId) return;
    setLoading(true);
    try {
      setDetail(await api.getActivity(spaceId, activityId));
      setError(undefined);
    } catch (failure) {
      setError(normalizeError(failure, "backend"));
    } finally {
      setLoading(false);
    }
  }, [api, spaceId]);

  return {
    view, recent, history, ledger, detail, filter, ledgerPage, loading, error, pendingCount,
    showView: (next: ActivityView) => setView(next),
    applyFilter: (next: HistoryFilter) => setFilter({ limit: 20, ...next, page: 1 }),
    goToPage: (page: number) => setFilter((current) => ({ ...current, page: Math.max(1, page) })),
    goToLedgerPage: (page: number) => setLedgerPage(Math.max(1, page)),
    openDetail,
    closeDetail: () => setDetail(undefined),
    clearError: () => setError(undefined),
    refresh: () => load(false),
  };
}

export type SpaceActivityFlow = ReturnType<typeof useSpaceActivity>;
