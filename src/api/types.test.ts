import { describe, expect, it } from "vitest";
import { parseSolanaOpenPayload } from "./types";

const digest = `0x${"ab".repeat(32)}`;

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    spaceId: "0x01",
    chainObjectId: "chain-object-id",
    chainId: "67",
    chainType: "SOL",
    address: "space-pda",
    programId: "program-id",
    creator: `0x${"11".repeat(32)}`,
    digest,
    config: "config",
    validAfter: 1_790_000_000,
    validUntil: 1_790_000_300,
    guardian: `0x${"22".repeat(32)}`,
    owner: `0x${"11".repeat(32)}`,
    members: [`0x${"33".repeat(32)}`],
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
  ])("rejects unsupported or malformed %s", (_label, overrides) => {
    expect(() => parseSolanaOpenPayload(validPayload(overrides))).toThrow(
      "Invalid Solana payload",
    );
  });
});
