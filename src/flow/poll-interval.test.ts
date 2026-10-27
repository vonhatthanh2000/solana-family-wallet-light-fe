import { describe, expect, it } from "vitest";
import { ACTIVE_POLL_MS, IDLE_POLL_MS, pollIntervalMs } from "./poll-interval";

describe("pollIntervalMs", () => {
  it("uses the plan's 3-5 second cadence while work is in flight", () => {
    expect(pollIntervalMs(true)).toBe(ACTIVE_POLL_MS);
    expect(ACTIVE_POLL_MS).toBeGreaterThanOrEqual(3_000);
    expect(ACTIVE_POLL_MS).toBeLessThanOrEqual(5_000);
  });

  it("still polls when nothing is in flight, so a newly proposed request is not missed", () => {
    expect(pollIntervalMs(false)).toBe(IDLE_POLL_MS);
    expect(IDLE_POLL_MS).toBeGreaterThan(ACTIVE_POLL_MS);
  });
});
