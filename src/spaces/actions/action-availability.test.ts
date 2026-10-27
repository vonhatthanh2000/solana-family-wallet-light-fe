import { describe, expect, it } from "vitest";
import type { SpaceChainDto } from "../contracts";
import { shouldLoadGuardianActions } from "./action-availability";

const pendingSolanaChain: SpaceChainDto = {
  chainObjectId: "solana-chain",
  chainId: "devnet",
  chainType: "SOL",
  address: null,
  isDeployed: false,
};

describe("shouldLoadGuardianActions", () => {
  it("does not query the guardian backend for a newly-created Space without active Solana", () => {
    expect(shouldLoadGuardianActions("OWNER", [pendingSolanaChain])).toBe(false);
  });

  it("allows an Owner to query guardian actions after Solana is deployed", () => {
    expect(shouldLoadGuardianActions("OWNER", [{
      ...pendingSolanaChain,
      address: "space-pda",
      isDeployed: true,
    }])).toBe(true);
  });

  it("does not query guardian actions for non-Owners", () => {
    expect(shouldLoadGuardianActions("MEMBER", [{
      ...pendingSolanaChain,
      address: "space-pda",
      isDeployed: true,
    }])).toBe(false);
  });
});
