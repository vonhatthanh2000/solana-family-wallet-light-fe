import { describe, expect, it } from "vitest";
import { backendRecoveryHint } from "./backend-error-help";

describe("backendRecoveryHint", () => {
  it("distinguishes invalid input from conflicting state", () => {
    expect(backendRecoveryHint(400)).toContain("correct them");
    expect(backendRecoveryHint(409)).toContain("do not create a duplicate");
  });

  it("gives token-specific recovery for an unsupported backend token", () => {
    expect(backendRecoveryHint(400, "UNSUPPORTED_TOKEN")).toMatch(/refresh/i);
    expect(backendRecoveryHint(400, "UNSUPPORTED_TOKEN")).toContain("choose another token");
  });
});
