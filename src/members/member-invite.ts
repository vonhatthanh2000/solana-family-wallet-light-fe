import type { MemberApi } from "./member-api";
import type { SpaceInviteDto } from "./contracts";
import { ApiError } from "../api/client";

type InviteApi = Pick<MemberApi, "createInvite" | "listInvites">;

export function reusableMemberInvite(invites: readonly SpaceInviteDto[]): SpaceInviteDto | undefined {
  const open = invites.filter((invite) => invite.role === "MEMBER" && invite.status === "OPEN");
  return open.length === 1 ? open[0] : undefined;
}

export async function createOrReuseMemberInvite(
  api: InviteApi,
  spaceId: string,
): Promise<{ invite: SpaceInviteDto; reused: boolean }> {
  try {
    return { invite: await api.createInvite(spaceId), reused: false };
  } catch (error) {
    const isOpenInviteConflict = error instanceof ApiError &&
      error.status === 409 &&
      /MEMBER invite link is still open/i.test(error.message);
    if (!isOpenInviteConflict) throw error;
    const existing = reusableMemberInvite(await api.listInvites(spaceId));
    if (!existing) throw error;
    return { invite: existing, reused: true };
  }
}
