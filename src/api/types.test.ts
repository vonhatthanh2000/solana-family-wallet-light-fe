import { describe, expect, it } from "vitest";
import { canonicalSolanaPayload } from "./solanaPayload.fixture";
import { parseSolanaOpenPayload } from "./types";

const digest = canonicalSolanaPayload.digest;

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    ...canonicalSolanaPayload,
    ...overrides,
  };
}

describe("parseSolanaOpenPayload", () => {
  it("parses a raw-digest Solana activation payload", () => {
    expect(parseSolanaOpenPayload(validPayload())).toMatchObject({
      chainType: "SOL",
      digest,
    });
  });

  it.each([
    ["uppercase digest", { digest: `0x${"AB".repeat(32)}` }],
    ["fractional validAfter", { validAfter: 1.5 }],
    ["missing chain id", { chainId: undefined }],
    ["missing chain type", { chainType: undefined }],
    ["invalid creator", { creator: "0x11" }],
    ["invalid guardian", { guardian: "0x22" }],
    ["invalid owner", { owner: "0x33" }],
    ["non-array members", { members: "0x44" }],
    ["reversed validity window", { validUntil: canonicalSolanaPayload.validAfter }],
  ])("rejects unsupported or malformed %s", (_label, overrides) => {
    expect(() => parseSolanaOpenPayload(validPayload(overrides))).toThrow(
      "Invalid Solana payload",
    );
  });
});
