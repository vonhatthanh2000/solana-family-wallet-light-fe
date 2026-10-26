import { describe, expect, it } from "vitest";
import type { MemberRequestDto } from "./contracts";
import { canApproveRequest, decodeJwtSubject, requestActionLabel } from "./member-view";

const request: MemberRequestDto = {
  id: "request",
  spaceId: "space",
  kind: "JOIN",
  status: "PENDING",
  proposerUserId: "new-member",
  targetUserId: "new-member",
  payload: { role: "MEMBER" },
  seals: [],
  declines: [],
  need: 1,
  eligibleVoters: ["approver"],
  expiresAt: new Date().toISOString(),
  memberSends: [],
};

describe("member request presentation", () => {
  it("uses clear human action labels", () => {
    expect(requestActionLabel(request)).toBe("Add member new-member");
    expect(requestActionLabel({ ...request, kind: "REMOVE_MEMBER" })).toBe(
      "Remove member new-member",
    );
    expect(requestActionLabel({ ...request, kind: "HANDOVER" })).toBe(
      "Change owner to new-member",
    );
  });

  it("allows only an eligible voter who has not already approved", () => {
    expect(canApproveRequest(request, "approver")).toBe(true);
    expect(canApproveRequest({ ...request, seals: ["approver"] }, "approver")).toBe(false);
    expect(canApproveRequest(request, "other")).toBe(false);
    expect(canApproveRequest({ ...request, status: "EXECUTING" }, "approver")).toBe(false);
  });

  it("reads the authenticated subject from a JWT", () => {
    const payload = btoa(JSON.stringify({ sub: "member-b" }))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    expect(decodeJwtSubject(`header.${payload}.signature`)).toBe("member-b");
    expect(decodeJwtSubject("not-a-jwt")).toBeUndefined();
  });
});
