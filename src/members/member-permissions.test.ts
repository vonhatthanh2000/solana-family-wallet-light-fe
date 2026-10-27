import { describe, expect, it } from "vitest";
import type { FamilyRoleDto } from "./contracts";
import { hasActiveMemberWork, memberRefreshCapabilities } from "./member-permissions";

const memberRole: FamilyRoleDto = {
  key: "MEMBER",
  permissions: ["VIEW", "SPEND", "VOTE"],
  countsInQuorum: true,
  onChainSigner: true,
  singleHolder: false,
  labels: { en: "Member" },
};

describe("permission-aware member refresh", () => {
  it("never lists invites for MEMBER while retaining its relevant queues", () => {
    expect(memberRefreshCapabilities(memberRole)).toEqual({
      canViewRequests: true,
      canListInvites: false,
      canListSends: true,
    });
  });

  it("does not poll when every known resource is terminal", () => {
    expect(hasActiveMemberWork(undefined, [], [])).toBe(false);
    expect(hasActiveMemberWork(undefined, [{ status: "DONE" } as never], [{ status: "executed" } as never])).toBe(false);
    expect(hasActiveMemberWork(undefined, [{ status: "PENDING" } as never], [])).toBe(true);
  });
});
