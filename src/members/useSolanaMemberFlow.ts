import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, clearApiFailuresForPath } from "../api/client";
import type { DiagnosticError } from "../api/types";
import { pollIntervalMs } from "../flow/poll-interval";
import { normalizeError } from "../flow/state";
import type { ConnectedSigner } from "../solana/signers/types";
import type {
  InvitePreviewDto,
  JoinResultDto,
  FamilyRoleDto,
  MemberRequestDto,
  MemberSendDto,
  MemberSpaceDto,
  SpaceInviteDto,
  SpaceMemberDto,
  SubmittedMemberSendDto,
} from "./contracts";
import { httpMemberApi, type MemberApi } from "./member-api";
import { loadApprovalInbox } from "./member-inbox";
import { createOrReuseMemberInvite, reusableMemberInvite } from "./member-invite";
import { recoverMemberSend, shouldRefreshAfterMemberError } from "./member-recovery";
import { getMemberSignabilityError, signMemberDigest } from "./member-signing";
import { canApproveRequest, canDeclineRequest, decodeJwtSubject } from "./member-view";
import { loadSpaceMembers } from "./member-workspace";
import { hasActiveMemberWork, memberRefreshCapabilities } from "./member-permissions";

export type SolanaMemberFlow = {
  actorUserId?: string;
  space?: MemberSpaceDto;
  role?: FamilyRoleDto;
  requests: MemberRequestDto[];
  sends: MemberSendDto[];
  members: SpaceMemberDto[];
  createdInvite?: SpaceInviteDto;
  inviteReused: boolean;
  inviteCode: string;
  invitePreview?: InvitePreviewDto;
  joinResult?: JoinResultDto;
  submittedSends: Record<string, SubmittedMemberSendDto>;
  busyAction?: string;
  refreshing: boolean;
  error?: DiagnosticError;
  setInviteCode(value: string): void;
  refresh(): Promise<void>;
  createInvite(): Promise<void>;
  revokeInvite(): Promise<void>;
  previewInvite(): Promise<void>;
  joinInvite(): Promise<void>;
  approve(request: MemberRequestDto): Promise<void>;
  decline(request: MemberRequestDto): Promise<void>;
  cancelRequest(request: MemberRequestDto): Promise<void>;
  applyVaultRequest(request: MemberRequestDto): Promise<void>;
  prepareSend(send: MemberSendDto): Promise<void>;
  signAndSubmit(send: MemberSendDto): Promise<void>;
  requestRemoval(userId: string): Promise<void>;
  requestHandover(userId: string): Promise<void>;
  leave(): Promise<void>;
  can(permission: string): boolean;
  canApprove(request: MemberRequestDto): boolean;
  canDecline(request: MemberRequestDto): boolean;
  signabilityError(send: MemberSendDto): string | undefined;
  clearError(): void;
};

type Inputs = {
  jwt: string;
  spaceId: string;
  solanaChainObjectId?: string;
  connectedSigner?: ConnectedSigner;
  storedAddress?: string;
  onSpaceIdChange(spaceId: string): void;
  onSpaceLeft?(spaceId: string): void;
  api?: MemberApi;
};

function replaceById<T>(items: T[], next: T, idOf: (item: T) => string): T[] {
  const id = idOf(next);
  return items.some((item) => idOf(item) === id)
    ? items.map((item) => idOf(item) === id ? next : item)
    : [next, ...items];
}

export function useSolanaMemberFlow({
  jwt,
  spaceId,
  solanaChainObjectId,
  connectedSigner,
  storedAddress,
  onSpaceIdChange,
  onSpaceLeft,
  api = httpMemberApi,
}: Inputs): SolanaMemberFlow {
  const actorUserId = useMemo(() => decodeJwtSubject(jwt), [jwt]);
  const [requests, setRequests] = useState<MemberRequestDto[]>([]);
  const [space, setSpace] = useState<MemberSpaceDto>();
  const [roles, setRoles] = useState<FamilyRoleDto[]>([]);
  const [sends, setSends] = useState<MemberSendDto[]>([]);
  const [members, setMembers] = useState<SpaceMemberDto[]>([]);
  const [createdInvite, setCreatedInvite] = useState<SpaceInviteDto>();
  const [inviteReused, setInviteReused] = useState(false);
  const [inviteCode, setInviteCodeState] = useState("");
  const [invitePreview, setInvitePreview] = useState<InvitePreviewDto>();
  const [joinResult, setJoinResult] = useState<JoinResultDto>();
  const [submittedSends, setSubmittedSends] = useState<Record<string, SubmittedMemberSendDto>>({});
  const [busyAction, setBusyAction] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<DiagnosticError>();
  const requestsRef = useRef<MemberRequestDto[]>([]);
  const membersRef = useRef<SpaceMemberDto[]>([]);
  const activeSpaceIdRef = useRef(spaceId);
  const pollingTimerRef = useRef<number | undefined>(undefined);
  activeSpaceIdRef.current = spaceId;

  const stopPolling = useCallback(() => {
    if (pollingTimerRef.current !== undefined) window.clearInterval(pollingTimerRef.current);
    pollingTimerRef.current = undefined;
  }, []);

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const fail = useCallback((failure: unknown, source: DiagnosticError["source"] = "backend") => {
    setError(normalizeError(failure, source));
  }, []);

  const refresh = useCallback(async () => {
    if (!spaceId || !jwt || activeSpaceIdRef.current !== spaceId) return;
    const requestedSpaceId = spaceId;
    setRefreshing(true);
    const spaceTask = api.getSpace(spaceId);
    const roleTask = api.listRoles();
    const [spaceResult, roleResult] = await Promise.allSettled([spaceTask, roleTask]);
    if (activeSpaceIdRef.current !== requestedSpaceId) return;
    if (spaceResult.status === "rejected") {
      const diagnostic = normalizeError(spaceResult.reason, "backend");
      if (diagnostic.status === 403 && diagnostic.code === "NOT_A_MEMBER") {
        stopPolling();
        activeSpaceIdRef.current = "";
        setSpace(undefined);
        setRoles([]);
        setRequests([]);
        setSends([]);
        setMembers([]);
        setCreatedInvite(undefined);
        setRefreshing(false);
        onSpaceLeft?.(requestedSpaceId);
        clearApiFailuresForPath(`/family-wallet/spaces/${encodeURIComponent(requestedSpaceId)}`);
        onSpaceIdChange("");
        return;
      }
      fail(spaceResult.reason);
      setRefreshing(false);
      return;
    }
    const loadedSpace = spaceResult.status === "fulfilled" ? spaceResult.value : undefined;
    const loadedRoles = roleResult.status === "fulfilled" ? roleResult.value : [];
    const activeRole = loadedSpace
      ? loadedRoles.find((role) => role.key.toUpperCase() === loadedSpace.role.toUpperCase())
      : undefined;
    const capabilities = memberRefreshCapabilities(activeRole);
    if (loadedSpace) setSpace(loadedSpace);
    if (roleResult.status === "fulfilled") setRoles(loadedRoles);

    const inviteTask = capabilities.canListInvites ? api.listInvites(spaceId) : Promise.resolve([]);
    const requestTask = (capabilities.canViewRequests ? loadApprovalInbox(api, spaceId) : Promise.resolve([])).then(async (inbox) => {
      const visibleIds = new Set(inbox.map((request) => request.id));
      const landing = requestsRef.current.filter(
        (request) => request.status === "EXECUTING" && !visibleIds.has(request.id),
      );
      const progress = await Promise.all(landing.map(async (request) => ({
        request,
        sends: await api.listChainProgress(spaceId, request.id),
      })));
      return [
        ...inbox,
        ...progress.map(({ request, sends }) => ({
          ...request,
          status: sends.some((send) => send.status === "failed") ? "FAILED" as const : request.status,
          memberSends: sends,
        })),
      ];
    });
    const sendTask = capabilities.canListSends ? api.listMySends(spaceId) : Promise.resolve([]);
    const memberTask = loadSpaceMembers({
      api,
      spaceId,
      solanaChainObjectId,
      discoverSolanaChainObjectId: async () => {
        return loadedSpace?.chains.find((chain) => chain.chainType === "SOL")?.chainObjectId ?? "";
      },
    });
    const [inviteResult, requestResult, sendResult, memberResult] = await Promise.allSettled([
      inviteTask,
      requestTask,
      sendTask,
      memberTask,
    ]);
    if (activeSpaceIdRef.current !== requestedSpaceId) return;
    if (inviteResult.status === "fulfilled") {
      const existing = capabilities.canListInvites ? reusableMemberInvite(inviteResult.value) : undefined;
      setCreatedInvite(existing);
      setInviteReused(Boolean(existing));
      if (existing) setInviteCodeState(existing.code);
    }
    if (requestResult.status === "fulfilled") {
      const settledMembers = memberResult.status === "fulfilled"
        ? memberResult.value
        : membersRef.current;
      const reconciled = requestResult.value.map((request) => {
        if (request.status !== "EXECUTING" || !request.memberSends.length) return request;
        const allExecuted = request.memberSends.every((send) => send.status === "executed");
        const target = settledMembers.find((member) => member.userId === request.targetUserId);
        const settled = request.kind === "JOIN"
          ? target?.status === "ACTIVE"
          : request.kind === "REMOVE_MEMBER"
            ? target?.status === "REMOVED" || target?.status === "LEFT"
            : request.kind === "HANDOVER"
              ? target?.role === "OWNER"
              : false;
        return allExecuted && settled ? { ...request, status: "DONE" as const } : request;
      });
      requestsRef.current = reconciled;
      setRequests(reconciled);
    }
    if (sendResult.status === "fulfilled") {
      setSends((current) => {
        const openIds = new Set(sendResult.value.map((send) => send.memberSendId));
        const submitted = current.filter(
          (send) => send.status === "submitted" && !openIds.has(send.memberSendId),
        );
        return [...sendResult.value, ...submitted];
      });
    }
    if (memberResult.status === "fulfilled") {
      membersRef.current = memberResult.value;
      setMembers(memberResult.value);
    }
    const failures = [roleResult, inviteResult, requestResult, sendResult, memberResult].filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    const membershipLost = failures.some((result) => {
      const diagnostic = normalizeError(result.reason, "backend");
      return diagnostic.status === 403 && diagnostic.code === "NOT_A_MEMBER";
    });
    if (membershipLost) {
      stopPolling();
      activeSpaceIdRef.current = "";
      setSpace(undefined);
      setRoles([]);
      setRequests([]);
      setSends([]);
      setMembers([]);
      setCreatedInvite(undefined);
      setRefreshing(false);
      onSpaceLeft?.(requestedSpaceId);
      clearApiFailuresForPath(`/family-wallet/spaces/${encodeURIComponent(requestedSpaceId)}`);
      onSpaceIdChange("");
      return;
    }
    const criticalFailure = memberResult.status === "rejected"
      ? memberResult.reason
      : failures.length === 5
        ? failures[0]!.reason
        : undefined;
    if (criticalFailure) fail(criticalFailure);
    else setError(undefined);
    setRefreshing(false);
  }, [api, fail, jwt, onSpaceIdChange, onSpaceLeft, solanaChainObjectId, spaceId, stopPolling]);

  useEffect(() => {
    stopPolling();
    if (!spaceId || !jwt) {
      setRequests([]);
      setSends([]);
      setMembers([]);
      setSpace(undefined);
      setRoles([]);
      setCreatedInvite(undefined);
      setInviteReused(false);
      setRefreshing(false);
      return;
    }
    setSpace(undefined);
    setRoles([]);
    setMembers([]);
    setCreatedInvite(undefined);
    setInviteReused(false);
    membersRef.current = [];
    void refresh();
    return stopPolling;
  }, [jwt, refresh, spaceId, stopPolling]);

  // An empty approval queue must still discover a request another member proposes, so polling never
  // stops entirely; it only slows down once nothing in this Space is mid-flight.
  const interval = pollIntervalMs(hasActiveMemberWork(space, requests, sends));

  useEffect(() => {
    stopPolling();
    if (!spaceId || !jwt) return;
    pollingTimerRef.current = window.setInterval(() => {
      if (activeSpaceIdRef.current === spaceId) void refresh();
    }, interval);
    return stopPolling;
  }, [interval, jwt, refresh, spaceId, stopPolling]);

  const run = useCallback(async (name: string, action: () => Promise<void>) => {
    if (busyAction) return;
    setBusyAction(name);
    setError(undefined);
    try {
      await action();
    } catch (failure) {
      fail(failure);
    } finally {
      setBusyAction(undefined);
    }
  }, [busyAction, fail]);

  const createInvite = useCallback(() => run("create-invite", async () => {
    if (!spaceId) throw new Error("Enter or create a Space ID first");
    const { invite, reused } = await createOrReuseMemberInvite(api, spaceId);
    setCreatedInvite(invite);
    setInviteReused(reused);
    setInviteCodeState(invite.code);
    await refresh();
  }), [api, refresh, run, spaceId]);

  const revokeInvite = useCallback(() => run("revoke-invite", async () => {
    if (!spaceId || !createdInvite) throw new Error("There is no open invite to revoke");
    await api.revokeInvite(spaceId, createdInvite.id);
    setCreatedInvite(undefined);
    setInviteReused(false);
    setInviteCodeState("");
    await refresh();
  }), [api, createdInvite, refresh, run, spaceId]);

  const previewInvite = useCallback(() => run("preview-invite", async () => {
    const code = inviteCode.trim();
    if (!code) throw new Error("Paste an invite code first");
    const preview = await api.previewInvite(code);
    setInvitePreview(preview);
    onSpaceIdChange(preview.spaceId);
  }), [api, inviteCode, onSpaceIdChange, run]);

  const joinInvite = useCallback(() => run("join-invite", async () => {
    const code = inviteCode.trim();
    if (!code) throw new Error("Paste an invite code first");
    const result = await api.joinInvite(code);
    setJoinResult(result);
    if (invitePreview?.spaceId) onSpaceIdChange(invitePreview.spaceId);
  }), [api, inviteCode, invitePreview?.spaceId, onSpaceIdChange, run]);

  const approve = useCallback((request: MemberRequestDto) => run(
    `approve:${request.id}`,
    async () => {
      if (!spaceId) throw new Error("Space ID is required");
      if (!canApproveRequest(request, actorUserId)) {
        throw new Error("This profile is not currently eligible to approve this request");
      }
      let updated: MemberRequestDto;
      try {
        updated = await api.approve(spaceId, request.id);
      } catch (failure) {
        await refresh();
        throw failure;
      }
      setRequests((current) => {
        const next = replaceById(current, updated, (item) => item.id);
        requestsRef.current = next;
        return next;
      });
      if (updated.memberSends.length) {
        setSends((current) => updated.memberSends.reduce(
          (items, send) => replaceById(items, send, (item) => item.memberSendId),
          current,
        ));
      }
      await refresh();
    },
  ), [actorUserId, api, refresh, run, spaceId]);

  const decline = useCallback((request: MemberRequestDto) => run(
    `decline:${request.id}`,
    async () => {
      if (!spaceId) throw new Error("Space ID is required");
      if (!canDeclineRequest(request, actorUserId)) {
        throw new Error("This profile is not currently eligible to decline this request");
      }
      const updated = await api.decline(spaceId, request.id);
      setRequests((current) => replaceById(current, updated, (item) => item.id));
      await refresh();
    },
  ), [actorUserId, api, refresh, run, spaceId]);

  const cancelRequest = useCallback((request: MemberRequestDto) => run(
    `cancel-request:${request.id}`,
    async () => {
      if (!spaceId) throw new Error("Space ID is required");
      if (!actorUserId || request.proposerUserId !== actorUserId || request.status !== "PENDING") {
        throw new Error("Only the proposer can withdraw a pending request");
      }
      await api.cancelRequest(spaceId, request.id);
      await refresh();
    },
  ), [actorUserId, api, refresh, run, spaceId]);

  const applyVaultRequest = useCallback((request: MemberRequestDto) => run(
    `apply-request:${request.id}`,
    async () => {
      if (!spaceId) throw new Error("Space ID is required");
      await api.applyVaultRequest(spaceId, request.id);
      await refresh();
    },
  ), [api, refresh, run, spaceId]);

  const prepareSend = useCallback((send: MemberSendDto) => run(
    `prepare:${send.memberSendId}`,
    async () => {
      if (!spaceId) throw new Error("Space ID is required");
      if (!actorUserId || send.signerUserId !== actorUserId) {
        throw new Error("This member change is assigned to another profile");
      }
      const prepared = await api.prepareSend(spaceId, send.memberSendId);
      setSends((current) => replaceById(current, prepared, (item) => item.memberSendId));
    },
  ), [actorUserId, api, run, spaceId]);

  const signAndSubmit = useCallback((send: MemberSendDto) => run(
    `submit:${send.memberSendId}`,
    async () => {
      if (!spaceId) throw new Error("Space ID is required");
      let submitted: SubmittedMemberSendDto;
      try {
        const signature = await signMemberDigest({
          send,
          actorUserId,
          connectedSigner,
          storedAddress,
        });
        submitted = await api.submitSend(spaceId, send.memberSendId, signature);
      } catch (failure) {
        const code = failure instanceof ApiError ? failure.code : undefined;
        const recovered = recoverMemberSend(send, code);
        setSends((current) => replaceById(current, recovered, (item) => item.memberSendId));
        if (shouldRefreshAfterMemberError(code)) await refresh();
        throw failure;
      }
      setSubmittedSends((current) => ({ ...current, [send.memberSendId]: submitted }));
      setSends((current) => current.map((item) => item.memberSendId === send.memberSendId
        ? { ...item, status: "submitted", txHash: submitted.txHash, send: null }
        : item));
      await refresh();
    },
  ), [actorUserId, api, connectedSigner, refresh, run, spaceId, storedAddress]);

  const mutateMember = useCallback((name: string, action: () => Promise<MemberRequestDto>) =>
    run(name, async () => {
      const created = await action();
      setRequests((current) => replaceById(current, created, (item) => item.id));
      await refresh();
    }), [refresh, run]);

  const requestRemoval = useCallback((userId: string) => mutateMember(
    `remove:${userId}`,
    () => {
      if (!spaceId) return Promise.reject(new Error("Space ID is required"));
      return api.requestRemoval(spaceId, userId);
    },
  ), [api, mutateMember, spaceId]);

  const requestHandover = useCallback((userId: string) => mutateMember(
    `handover:${userId}`,
    () => {
      if (!spaceId) return Promise.reject(new Error("Space ID is required"));
      return api.requestHandover(spaceId, userId);
    },
  ), [api, mutateMember, spaceId]);

  const leave = useCallback(() => run("leave", async () => {
    if (!spaceId) throw new Error("Space ID is required");
    const departedSpaceId = spaceId;
    await api.leave(departedSpaceId);
    stopPolling();
    activeSpaceIdRef.current = "";
    setSpace(undefined);
    setRoles([]);
    setRequests([]);
    setSends([]);
    setMembers([]);
    setCreatedInvite(undefined);
    setInvitePreview(undefined);
    setJoinResult(undefined);
    setRefreshing(false);
    onSpaceLeft?.(departedSpaceId);
    clearApiFailuresForPath(`/family-wallet/spaces/${encodeURIComponent(departedSpaceId)}`);
    onSpaceIdChange("");
  }), [api, onSpaceIdChange, onSpaceLeft, run, spaceId, stopPolling]);

  return {
    actorUserId,
    space,
    role: space ? roles.find((role) => role.key.toUpperCase() === space.role.toUpperCase()) : undefined,
    requests,
    sends,
    members,
    createdInvite,
    inviteReused,
    inviteCode,
    invitePreview,
    joinResult,
    submittedSends,
    busyAction,
    refreshing,
    error,
    setInviteCode: (value) => {
      setInviteCodeState(value);
      setInvitePreview(undefined);
      setJoinResult(undefined);
    },
    refresh,
    createInvite,
    revokeInvite,
    previewInvite,
    joinInvite,
    approve,
    decline,
    cancelRequest,
    applyVaultRequest,
    prepareSend,
    signAndSubmit,
    requestRemoval,
    requestHandover,
    leave,
    can: (permission) => Boolean(space && roles.find((role) => role.key.toUpperCase() === space.role.toUpperCase())?.permissions.includes(permission)),
    canApprove: (request) => canApproveRequest(request, actorUserId),
    canDecline: (request) => canDeclineRequest(request, actorUserId),
    signabilityError: (send) => getMemberSignabilityError({
      send,
      actorUserId,
      connectedSigner,
      storedAddress,
    }),
    clearError: () => setError(undefined),
  };
}
