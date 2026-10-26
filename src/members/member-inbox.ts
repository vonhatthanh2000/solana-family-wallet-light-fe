import type { MemberApi } from "./member-api";
import type { MemberRequestDto } from "./contracts";

type InboxApi = Pick<MemberApi, "listRequests" | "listWaitingJoins">;

export async function loadApprovalInbox(
  api: InboxApi,
  spaceId: string,
): Promise<MemberRequestDto[]> {
  const queue = await api.listRequests(spaceId);
  const ordinary = queue.filter((request) => request.kind !== "INVITE_LINK");
  const inviteRows = queue.filter(
    (request) => request.kind === "INVITE_LINK" && (request.joinCount ?? 0) > 0,
  );
  const joins = await Promise.all(
    inviteRows.map((invite) => api.listWaitingJoins(spaceId, invite.id)),
  );
  return [...joins.flat(), ...ordinary];
}
