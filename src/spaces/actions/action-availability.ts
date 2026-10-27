import type { SpaceChainDto } from "../contracts";

export function hasActiveSolanaChain(chains: SpaceChainDto[]): boolean {
  return chains.some((chain) => (
    chain.chainType === "SOL" &&
    chain.isDeployed &&
    Boolean(chain.address)
  ));
}

export function shouldLoadGuardianActions(roleKey: string | undefined, chains: SpaceChainDto[]): boolean {
  return roleKey === "OWNER" && hasActiveSolanaChain(chains);
}
