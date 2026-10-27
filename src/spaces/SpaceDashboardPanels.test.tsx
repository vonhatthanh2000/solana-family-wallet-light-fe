import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SpaceBrowserPanel } from "./SpaceBrowserPanel";
import { SpaceDetailPanel } from "./SpaceDetailPanel";
import type { SpaceDashboardFlow } from "./useSpaceDashboard";

function flow(overrides: Partial<SpaceDashboardFlow> = {}): SpaceDashboardFlow {
  return {
    spaces: [],
    selectedSpaceId: "",
    loadingList: false,
    loadingDetail: false,
    selectSpace: vi.fn(),
    refreshList: vi.fn(),
    refreshSelected: vi.fn(),
    ...overrides,
  };
}

describe("Space dashboard panels", () => {
  it("labels active partial balances and pending joins distinctly", () => {
    const html = renderToStaticMarkup(<SpaceBrowserPanel configured flow={flow({ spaces: [
      { spaceId: "active", name: "Family", purpose: "FAMILY", role: "OWNER", memberCount: 2, membershipStatus: "ACTIVE", balance: { spaceId: "active", totalUsd: 42, unallocatedUsd: 40, partial: true, chains: [] } },
      { spaceId: "pending", name: "Friends", purpose: "FRIENDS", role: "MEMBER", membershipStatus: "PENDING", status: "EXECUTING" },
    ] })} />);

    expect(html).toContain("At least $42.00");
    expect(html).toContain("Join request executing");
    expect(html).toContain("aria-label=\"Open Family Space\"");
    expect(html).toContain("aria-label=\"Pending Friends Space\"");
  });

  it("shows partial warnings, vaults, and unknown assets without displaying zero", () => {
    const html = renderToStaticMarkup(<SpaceDetailPanel flow={flow({
      selectedSpaceId: "space",
      selected: {
        space: {
          spaceId: "space", name: "Family", purpose: "FAMILY", role: "OWNER", memberCount: 1,
          membershipStatus: "ACTIVE", memberChangeInProgress: false, defaultRule: { alwaysAsk: true, quorumPercent: 50 },
          chains: [{ chainObjectId: "sol", chainId: "devnet", chainType: "SOL", address: "pda", isDeployed: true }],
          balance: { spaceId: "space", totalUsd: 5, unallocatedUsd: 2, partial: true, chains: [{
            chainObjectId: "sol", chainId: "devnet", chainType: "SOL", address: "pda", tokens: [{
              token: "native", symbol: "SOL", amount: null, formatted: null, priceUsd: null, change24h: null,
              valueUsd: null, unallocatedAmount: null, unallocatedFormatted: null, unallocatedValueUsd: null,
              inVaultAmount: "0", inVaultFormatted: "0", vaultCount: 0,
            }],
          }] },
        },
        vaults: [{
          vaultId: "vault", spaceId: "space", name: "Travel", token: { tokenId: "token", name: "Solana", symbol: "SOL", decimals: 9, chainId: "devnet", chainType: "SOL" },
          goalAmount: "10", balance: { amount: "1000000000", formatted: "1" }, approvalRule: {}, usesDefaultRule: true,
          photos: [], createdBy: "owner", createdAt: "2026-01-01", updatedAt: "2026-01-01",
        }],
        members: { voterCount: 1, members: [] },
      },
    })} />);

    expect(html).toContain("At least $5.00");
    expect(html).toContain("Unavailable");
    expect(html).toContain("Travel");
    expect(html).toContain("Some chain balances or prices are unavailable");
  });
});
