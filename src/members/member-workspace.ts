import type { MemberApi } from "./member-api";
import type { SpaceMemberDto } from "./contracts";

export async function loadSpaceMembers(input: {
  api: Pick<MemberApi, "listMembers">;
  spaceId: string;
  solanaChainObjectId?: string;
  discoverSolanaChainObjectId(): Promise<string>;
}): Promise<SpaceMemberDto[]> {
  const chainObjectId = input.solanaChainObjectId ?? await input.discoverSolanaChainObjectId();
  if (!chainObjectId) throw new Error("This Space has no Solana chain to load member wallets from");
  return input.api.listMembers(input.spaceId, chainObjectId);
}
