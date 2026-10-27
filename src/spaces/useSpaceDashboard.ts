import { useCallback, useEffect, useRef, useState } from "react";
import type { DiagnosticError } from "../api/types";
import { normalizeError } from "../flow/state";
import type { SpaceDashboard, SpaceSummaryDto } from "./contracts";
import { loadSpaceDashboard } from "./load-space-dashboard";
import { httpSpaceDashboardApi, type SpaceDashboardApi } from "./space-api";

export type SpaceDashboardFlow = {
  spaces: SpaceSummaryDto[];
  selected?: SpaceDashboard;
  selectedSpaceId: string;
  loadingList: boolean;
  loadingDetail: boolean;
  listError?: DiagnosticError;
  detailError?: DiagnosticError;
  lastRefreshed?: Date;
  selectSpace(spaceId: string): void;
  refreshList(): Promise<void>;
  refreshSelected(): Promise<void>;
};

type Inputs = {
  enabled: boolean;
  configurationKey: string;
  selectedSpaceId: string;
  onSelectSpace(spaceId: string): void;
  api?: SpaceDashboardApi;
};

export function useSpaceDashboard({
  enabled,
  configurationKey,
  selectedSpaceId,
  onSelectSpace,
  api = httpSpaceDashboardApi,
}: Inputs): SpaceDashboardFlow {
  const [spaces, setSpaces] = useState<SpaceSummaryDto[]>([]);
  const [selected, setSelected] = useState<SpaceDashboard>();
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listReady, setListReady] = useState(false);
  const [listError, setListError] = useState<DiagnosticError>();
  const [detailError, setDetailError] = useState<DiagnosticError>();
  const [lastRefreshed, setLastRefreshed] = useState<Date>();
  const listSequence = useRef(0);
  const detailSequence = useRef(0);

  const refreshList = useCallback(async () => {
    if (!enabled) return;
    const sequence = ++listSequence.current;
    setLoadingList(true);
    setListError(undefined);
    try {
      const next = await api.listSpaces();
      if (sequence === listSequence.current) setSpaces(next);
    } catch (error) {
      if (sequence === listSequence.current) setListError(normalizeError(error, "backend"));
    } finally {
      if (sequence === listSequence.current) {
        setLoadingList(false);
        setListReady(true);
      }
    }
  }, [api, enabled]);

  const refreshSelected = useCallback(async () => {
    if (!enabled || !selectedSpaceId) return;
    const pending = spaces.find((space) => space.spaceId === selectedSpaceId)?.membershipStatus === "PENDING";
    if (pending) {
      setSelected(undefined);
      setDetailError(undefined);
      return;
    }
    const sequence = ++detailSequence.current;
    setLoadingDetail(true);
    setDetailError(undefined);
    try {
      const dashboard = await loadSpaceDashboard(api, selectedSpaceId);
      if (sequence === detailSequence.current) {
        setSelected(dashboard);
        setLastRefreshed(new Date());
      }
    } catch (error) {
      if (sequence === detailSequence.current) setDetailError(normalizeError(error, "backend"));
    } finally {
      if (sequence === detailSequence.current) setLoadingDetail(false);
    }
  }, [api, enabled, selectedSpaceId, spaces]);

  useEffect(() => {
    ++listSequence.current;
    ++detailSequence.current;
    setSpaces([]);
    setSelected(undefined);
    setListReady(false);
    setListError(undefined);
    setDetailError(undefined);
    if (!enabled) {
      return;
    }
    void refreshList();
  }, [configurationKey, enabled, refreshList]);

  useEffect(() => {
    ++detailSequence.current;
    setSelected(undefined);
    setDetailError(undefined);
    setLastRefreshed(undefined);
    if (enabled && listReady && selectedSpaceId) void refreshSelected();
  }, [enabled, listReady, refreshSelected, selectedSpaceId]);

  return {
    spaces,
    selected,
    selectedSpaceId,
    loadingList,
    loadingDetail,
    listError,
    detailError,
    lastRefreshed,
    selectSpace: onSelectSpace,
    refreshList,
    refreshSelected,
  };
}
