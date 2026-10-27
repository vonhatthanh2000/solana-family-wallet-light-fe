import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FamilyRoleDto } from "../../members/contracts";
import type { SpaceDashboard, VaultDto } from "../contracts";
import { SpaceActionPanel } from "./SpaceActionPanel";

function vault(vaultId: string, name: string): VaultDto {
  return {
    vaultId, spaceId: "space", name,
    token: { tokenId: "sol", name: "Solana", symbol: "SOL", decimals: 9, chainId: "devnet", chainType: "SOL" },
    balance: { amount: "0", formatted: "0" }, approvalRule: {}, usesDefaultRule: true,
    photos: [], createdBy: "owner", createdAt: "2026-01-01", updatedAt: "2026-01-01",
  };
}

const dashboard: SpaceDashboard = {
  space: {
    spaceId: "space", name: "Family", purpose: "FAMILY", role: "CHILD", memberCount: 2,
    membershipStatus: "ACTIVE", memberChangeInProgress: false, defaultRule: {},
    chains: [{ chainObjectId: "sol", chainId: "devnet", chainType: "SOL", address: "pda", isDeployed: true }],
  },
  vaults: [vault("assigned", "Allowance"), vault("other", "Parents")],
  members: { voterCount: 1, members: [{
    userId: "child", role: "CHILD", status: "ACTIVE", isVoter: false,
    chainPending: false, spendVaultIds: ["assigned"],
  }] },
};

describe("SpaceActionPanel", () => {
  it("limits a Child spend source to assigned Vaults and never offers Shared Wallet", () => {
    const role: FamilyRoleDto = {
      key: "CHILD", permissions: ["VIEW", "SPEND"], countsInQuorum: false,
      onChainSigner: false, singleHolder: false, labels: { en: "Child" },
    };
    const html = renderToStaticMarkup(<SpaceActionPanel
      dashboard={dashboard}
      role={role}
      actorUserId="child"
      fallbackNetwork="devnet"
      onChanged={vi.fn(async () => undefined)}
    />);

    expect(html).toContain("Select assigned Vault");
    expect(html).toContain("Allowance");
    expect(html).not.toContain(">Parents<");
    expect(html).not.toContain(">Shared Wallet<");
    expect(html).toContain("SOL amount");
    expect(html).toContain("Lamports");
    expect(html).toContain("Create Vault");
    expect(html).toContain("does not grant Manage Vault permission");
  });

  it("shows approval-rule configuration to a Vault manager", () => {
    const role: FamilyRoleDto = {
      key: "OWNER", permissions: ["VIEW", "MANAGE_VAULT"], countsInQuorum: true,
      onChainSigner: true, singleHolder: true, labels: { en: "Owner" },
    };
    const html = renderToStaticMarkup(<SpaceActionPanel
      dashboard={{ ...dashboard, space: { ...dashboard.space, role: "OWNER" } }}
      role={role}
      actorUserId="owner"
      fallbackNetwork="devnet"
      onChanged={vi.fn(async () => undefined)}
    />);

    expect(html).toContain("Create Vault");
    expect(html).toContain("Approval rule");
    expect(html).toContain("Use Space default");
    expect(html).toContain("Custom rule");
    expect(html).toContain("Current approval rule");
    expect(html).toContain("Propose rule change");
  });
});
