import { describe, expect, it, vi } from "vitest";
import { loadSpaceMembers } from "./member-workspace";

describe("accepted member workspace", () => {
  it("loads membership even when this profile only imported a Space ID", async () => {
    const member = {
      userId: "6adecd9d8d5315639d25a8a8",
      role: "MEMBER",
      status: "ACTIVE" as const,
      profile: { displayName: "Member B" },
      wallet: { address: "solana-wallet-b", chainId: "sol-chain" },
    };
    const listMembers = vi.fn(async () => [member]);
    const discoverSolanaChainObjectId = vi.fn(async () => "sol-chain");

    const members = await loadSpaceMembers({
      api: { listMembers },
      spaceId: "0xf11b3ef677b648b69a4adccccfe9174c",
      solanaChainObjectId: undefined,
      discoverSolanaChainObjectId,
    });

    expect(discoverSolanaChainObjectId).toHaveBeenCalledOnce();
    expect(listMembers).toHaveBeenCalledWith(
      "0xf11b3ef677b648b69a4adccccfe9174c",
      "sol-chain",
    );
    expect(members).toEqual([member]);
  });
});
