import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import type { SpaceInviteDto } from "./contracts";
import { createOrReuseMemberInvite, reusableMemberInvite } from "./member-invite";

const existing: SpaceInviteDto = {
  id: "invite-id",
  spaceId: "space",
  code: "reusable-code",
  role: "MEMBER",
  status: "OPEN",
  expiresAt: "2026-11-01T00:00:00.000Z",
  createdBy: "owner",
};

describe("MEMBER invite reuse", () => {
  it("selects the one existing open MEMBER invite for immediate display", () => {
    expect(reusableMemberInvite([existing])).toEqual(existing);
    expect(reusableMemberInvite([{ ...existing, status: "EXPIRED" }])).toBeUndefined();
  });

  it("returns the existing open invite when create reports a conflict", async () => {
    const api = {
      createInvite: vi.fn(async () => {
        throw new ApiError(409, {
          message: "A MEMBER invite link is still open: share it, or revoke it to make a new one",
        }, { method: "POST", path: "/family-wallet/spaces/space/invites" });
      }),
      listInvites: vi.fn(async () => [existing]),
    };

    await expect(createOrReuseMemberInvite(api, "space")).resolves.toEqual({
      invite: existing,
      reused: true,
    });
    expect(api.listInvites).toHaveBeenCalledWith("space");
  });
});
