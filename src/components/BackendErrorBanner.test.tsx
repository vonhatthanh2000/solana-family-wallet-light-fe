import { describe, expect, it } from "vitest";
import { backendRecoveryHint } from "./backend-error-help";

describe("backendRecoveryHint", () => {
  it("distinguishes invalid input from conflicting state", () => {
    expect(backendRecoveryHint(400)).toContain("correct them");
    expect(backendRecoveryHint(409)).toContain("do not create a duplicate");
  });
});
