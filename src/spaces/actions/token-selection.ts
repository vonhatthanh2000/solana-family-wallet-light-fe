import type { VaultDto } from "../contracts";
import type { VaultTokenOptionDto } from "./contracts";

export function vaultsForSupportedToken(
  vaults: readonly VaultDto[],
  chainId: string,
  token: VaultTokenOptionDto | undefined,
): VaultDto[] {
  if (!token) return [];
  return vaults.filter((vault) => (
    vault.token.chainId === chainId && vault.token.tokenId === token.tokenId
  ));
}
