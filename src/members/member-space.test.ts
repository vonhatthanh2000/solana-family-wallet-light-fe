import { describe, expect, it } from "vitest";
import { parseFamilyRoles, parseMemberSpace } from "./contracts";

describe("accepted member Space information", () => {
  it("parses the active-member Space response and its Solana chain", () => {
    const space = parseMemberSpace({
      spaceId: "0xf11b3ef677b648b69a4adccccfe9174c",
      name: "Family",
      purpose: "FAMILY",
      role: "MEMBER",
      memberCount: 2,
      memberChangeInProgress: false,
      chains: [{
        chainObjectId: "sol-chain",
        chainId: "devnet",
        chainType: "SOL",
        address: "space-pda",
        isDeployed: true,
      }],
    });

    expect(space.membershipStatus).toBe("ACTIVE");
    expect(space.role).toBe("MEMBER");
    expect(space.chains[0]).toMatchObject({ chainObjectId: "sol-chain", chainType: "SOL" });
  });

  it("parses the backend permission definition for the member's role", () => {
    const [role] = parseFamilyRoles([{
      key: "MEMBER",
      permissions: ["VIEW", "VOTE", "SPEND"],
      countsInQuorum: true,
      onChainSigner: true,
      singleHolder: false,
      labels: { en: "Member" },
    }]);

    expect(role).toMatchObject({
      key: "MEMBER",
      permissions: ["VIEW", "VOTE", "SPEND"],
      countsInQuorum: true,
      onChainSigner: true,
    });
  });
});
