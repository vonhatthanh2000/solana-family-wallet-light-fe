import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiRequest,
  setApiClientConfiguration,
  subscribeApiFailures,
  type ApiFailureNotice,
} from "./client";

describe("global API failure reporting", () => {
  beforeEach(() => setApiClientConfiguration({ apiBaseUrl: "https://api.example.test", jwt: "secret-jwt" }));
  afterEach(() => vi.unstubAllGlobals());

  it("reports a 409 with its backend message, code, endpoint, and redacted values", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "Already waiting on the family",
      code: "RULE_CHANGE_PENDING",
      privateKey: "must-not-leak",
    }), { status: 409, headers: { "Content-Type": "application/json" } })));
    const notices: ApiFailureNotice[] = [];
    const unsubscribe = subscribeApiFailures((failure) => { if (failure) notices.push(failure); });

    await apiRequest("/family-wallet/spaces/space/vaults/vault/rule-change", {
      method: "POST",
      body: JSON.stringify({ thresholdUsd: "200", token: "sensitive-token" }),
    }).catch(() => undefined);
    unsubscribe();

    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      status: 409,
      code: "RULE_CHANGE_PENDING",
      message: "Already waiting on the family",
      request: {
        method: "POST",
        path: "/family-wallet/spaces/space/vaults/vault/rule-change",
        body: { thresholdUsd: "200", token: "[REDACTED]" },
      },
      response: { message: "Already waiting on the family", code: "RULE_CHANGE_PENDING", privateKey: "[REDACTED]" },
    });
    expect(JSON.stringify(notices)).not.toContain("must-not-leak");
    expect(JSON.stringify(notices)).not.toContain("sensitive-token");
    expect(JSON.stringify(notices)).not.toContain("secret-jwt");
  });
});
