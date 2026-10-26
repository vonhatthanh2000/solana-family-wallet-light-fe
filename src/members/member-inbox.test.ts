import { describe, expect, it, vi } from "vitest";
import type { MemberRequestDto } from "./contracts";
import { loadApprovalInbox } from "./member-inbox";
import { requestActionLabel } from "./member-view";

function request(overrides: Partial<MemberRequestDto>): MemberRequestDto {
  return {
    id: "request",
    spaceId: "space",
    kind: "REMOVE_MEMBER",
    status: "PENDING",
    proposerUserId: "owner",
    targetUserId: "target",
    payload: {},
    seals: [],
    declines: [],
    need: 1,
    eligibleVoters: ["approver"],
    expiresAt: new Date().toISOString(),
    memberSends: [],
    ...overrides,
  };
}

describe("approval inbox", () => {
  it("expands invite queue rows so another member sees the Add member request", async () => {
    const join = request({ id: "join", kind: "JOIN", targetUserId: "member-b" });
    const api = {
      listRequests: vi.fn(async () => [request({
        id: "invite",
        kind: "INVITE_LINK",
        targetUserId: undefined,
        joinCount: 1,
      })]),
      listWaitingJoins: vi.fn(async () => [join]),
    };

    const inbox = await loadApprovalInbox(api, "space");

    expect(api.listWaitingJoins).toHaveBeenCalledWith("space", "invite");
    expect(inbox).toEqual([join]);
    expect(requestActionLabel(inbox[0]!)).toBe("Add member member-b");
  });
});
