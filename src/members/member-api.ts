import { apiRequest } from "../api/client";
import {
  parseInvitePreview,
  parseFamilyRoles,
  parseJoinResult,
  parseMemberRequest,
  parseMemberRequests,
  parseMemberSend,
  parseMemberSpace,
  parseSpaceInvite,
  parseSpaceInvites,
  parseSpaceMembers,
  parseSubmittedMemberSend,
  type InvitePreviewDto,
  type FamilyRoleDto,
  type JoinResultDto,
  type MemberRequestDto,
  type MemberSendDto,
  type MemberSpaceDto,
  type SpaceInviteDto,
  type SpaceMemberDto,
  type SubmittedMemberSendDto,
} from "./contracts";

const id = encodeURIComponent;

export type MemberApi = {
  getSpace(spaceId: string): Promise<MemberSpaceDto>;
  listRoles(): Promise<FamilyRoleDto[]>;
  listRequests(spaceId: string): Promise<MemberRequestDto[]>;
  listWaitingJoins(spaceId: string, inviteId: string): Promise<MemberRequestDto[]>;
  approve(spaceId: string, requestId: string): Promise<MemberRequestDto>;
  listChainProgress(spaceId: string, requestId: string): Promise<MemberSendDto[]>;
  listMySends(spaceId: string): Promise<MemberSendDto[]>;
  prepareSend(spaceId: string, memberSendId: string): Promise<MemberSendDto>;
  submitSend(spaceId: string, memberSendId: string, signature: string): Promise<SubmittedMemberSendDto>;
  listMembers(spaceId: string, chainId: string): Promise<SpaceMemberDto[]>;
  createInvite(spaceId: string): Promise<SpaceInviteDto>;
  listInvites(spaceId: string): Promise<SpaceInviteDto[]>;
  previewInvite(code: string): Promise<InvitePreviewDto>;
  joinInvite(code: string): Promise<JoinResultDto>;
  requestRemoval(spaceId: string, userId: string): Promise<MemberRequestDto>;
  requestHandover(spaceId: string, userId: string): Promise<MemberRequestDto>;
  leave(spaceId: string): Promise<Record<string, unknown>>;
};

async function parsed<T>(request: Promise<unknown>, parser: (value: unknown) => T): Promise<T> {
  return parser(await request);
}

export const httpMemberApi: MemberApi = {
  getSpace: (spaceId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}`),
    parseMemberSpace,
  ),
  listRoles: () => parsed(apiRequest("/family-wallet/roles"), parseFamilyRoles),
  listRequests: (spaceId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/requests`),
    parseMemberRequests,
  ),
  listWaitingJoins: (spaceId, inviteId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/invites/${id(inviteId)}/joins`),
    parseMemberRequests,
  ),
  approve: (spaceId, requestId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/requests/${id(requestId)}/approve`, {
      method: "POST",
    }),
    parseMemberRequest,
  ),
  listChainProgress: (spaceId, requestId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/requests/${id(requestId)}/member-sends`),
    (value) => {
      if (!Array.isArray(value)) throw new Error("member-send progress response must be an array");
      return value.map(parseMemberSend);
    },
  ),
  listMySends: (spaceId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/member-sends`),
    (value) => {
      if (!Array.isArray(value)) throw new Error("member sends response must be an array");
      return value.map(parseMemberSend);
    },
  ),
  prepareSend: (spaceId, memberSendId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/member-sends/execute`, {
      method: "POST",
      body: JSON.stringify({ memberSendId }),
    }),
    parseMemberSend,
  ),
  submitSend: (spaceId, memberSendId, signature) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/member-sends/execute`, {
      method: "POST",
      body: JSON.stringify({ memberSendId, signature }),
    }),
    parseSubmittedMemberSend,
  ),
  listMembers: (spaceId, chainId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/list-members?chainId=${id(chainId)}`),
    parseSpaceMembers,
  ),
  createInvite: (spaceId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/invites`, {
      method: "POST",
      body: JSON.stringify({ role: "MEMBER" }),
    }),
    parseSpaceInvite,
  ),
  listInvites: (spaceId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/invites`),
    parseSpaceInvites,
  ),
  previewInvite: (code) => parsed(
    apiRequest(`/family-wallet/invites/${id(code)}`),
    parseInvitePreview,
  ),
  joinInvite: (code) => parsed(
    apiRequest(`/family-wallet/invites/${id(code)}/join`, { method: "POST" }),
    parseJoinResult,
  ),
  requestRemoval: (spaceId, userId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/members/${id(userId)}/removal-requests`, {
      method: "POST",
    }),
    parseMemberRequest,
  ),
  requestHandover: (spaceId, userId) => parsed(
    apiRequest(`/family-wallet/spaces/${id(spaceId)}/members/${id(userId)}/handover-requests`, {
      method: "POST",
    }),
    parseMemberRequest,
  ),
  leave: (spaceId) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/leave`, { method: "POST" }),
};
