import { describe, expect, it } from "vitest";
import { lostSpaceMembership } from "./useSpaceDashboard";

describe("lostSpaceMembership", () => {
  it("only evicts a selected Space for the authoritative membership response", () => {
    expect(lostSpaceMembership({ source: "backend", status: 403, code: "NOT_A_MEMBER", message: "not a member" })).toBe(true);
    expect(lostSpaceMembership({ source: "backend", status: 403, code: "ROLE_NOT_ALLOWED", message: "not allowed" })).toBe(false);
    expect(lostSpaceMembership({ source: "backend", status: 409, code: "NOT_A_MEMBER", message: "conflict" })).toBe(false);
  });
});
