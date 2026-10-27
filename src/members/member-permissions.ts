import type { FamilyRoleDto, MemberRequestDto, MemberSendDto, MemberSpaceDto } from "./contracts";

export function memberRefreshCapabilities(role: FamilyRoleDto | undefined) {
  const permissions = new Set(role?.permissions ?? []);
  return {
    canViewRequests: permissions.has("VIEW"),
    canListInvites: permissions.has("INVITE"),
    canListSends: role?.onChainSigner === true,
  };
}

export function hasActiveMemberWork(
  space: MemberSpaceDto | undefined,
  requests: readonly MemberRequestDto[],
  sends: readonly MemberSendDto[],
): boolean {
  return Boolean(
    space?.memberChangeInProgress ||
    requests.some((request) => ["PENDING", "APPROVED", "EXECUTING"].includes(request.status)) ||
    sends.some((send) => ["ready", "signing", "submitted"].includes(send.status)),
  );
}
