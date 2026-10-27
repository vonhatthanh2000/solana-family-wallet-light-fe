import type { MemberRequestDto, MemberSendDto, SpaceMemberDto } from "./contracts";

export function shortId(value: string | undefined): string {
  if (!value) return "unknown";
  return value.length <= 14 ? value : `${value.slice(0, 6)}…${value.slice(-6)}`;
}

export function decodeJwtSubject(jwt: string): string | undefined {
  try {
    const payload = jwt.split(".")[1];
    if (!payload) return undefined;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    return typeof decoded.sub === "string" && decoded.sub ? decoded.sub : undefined;
  } catch {
    return undefined;
  }
}

export function requestActionLabel(request: Pick<MemberRequestDto, "kind" | "targetUserId" | "payload">): string {
  switch (request.kind) {
    case "JOIN":
      return `Add member ${shortId(request.targetUserId)}`;
    case "REMOVE_MEMBER":
      return `Remove member ${shortId(request.targetUserId)}`;
    case "HANDOVER":
      return `Change owner to ${shortId(request.targetUserId)}`;
    case "ROLE_CHANGE":
      return `Change ${shortId(request.targetUserId)} to ${String(request.payload.role ?? "new role")}`;
    case "INVITE_LINK":
      return `Add member requests (${String(request.payload.role ?? "MEMBER")})`;
    default:
      return request.kind.replaceAll("_", " ").toLowerCase();
  }
}

export function sendActionLabel(send: Pick<MemberSendDto, "change" | "targetUserId">): string {
  if (send.change === "add") return `Add member ${shortId(send.targetUserId)}`;
  if (send.change === "remove") return `Remove member ${shortId(send.targetUserId)}`;
  return `Change owner to ${shortId(send.targetUserId)}`;
}

export function canApproveRequest(request: MemberRequestDto, actorUserId?: string): boolean {
  return Boolean(
    actorUserId &&
    request.status === "PENDING" &&
    request.eligibleVoters.includes(actorUserId) &&
    !request.seals.includes(actorUserId) &&
    !request.declines.includes(actorUserId),
  );
}

export function canDeclineRequest(request: MemberRequestDto, actorUserId?: string): boolean {
  return Boolean(
    actorUserId &&
    request.proposerUserId !== actorUserId &&
    request.status === "PENDING" &&
    request.eligibleVoters.includes(actorUserId) &&
    !request.seals.includes(actorUserId) &&
    !request.declines.includes(actorUserId),
  );
}

export function memberDisplayName(member: SpaceMemberDto | undefined): string {
  if (!member) return "Unknown member";
  const profile = member.profile;
  return profile.displayName || [profile.firstName, profile.lastName].filter(Boolean).join(" ") ||
    profile.username || shortId(member.userId);
}
