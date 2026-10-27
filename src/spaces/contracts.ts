export type ApprovalRuleDto = {
  alwaysAsk?: boolean;
  thresholdUsd?: string;
  quorumPercent?: number;
  mustIncludeMemberIds?: string[];
};

export type SpaceTokenBalanceDto = {
  token: string;
  tokenId?: string;
  symbol?: string;
  decimals?: number;
  logoURI?: string;
  amount: string | null;
  formatted: string | null;
  priceUsd: number | null;
  change24h: number | null;
  valueUsd: number | null;
  unallocatedAmount: string | null;
  unallocatedFormatted: string | null;
  unallocatedValueUsd: number | null;
  inVaultAmount: string;
  inVaultFormatted: string | null;
  vaultCount: number;
};

export type SpaceChainBalanceDto = {
  chainObjectId: string;
  chainId: string;
  chainType: string;
  chainLogoURI?: string;
  address: string;
  tokens: SpaceTokenBalanceDto[];
};

export type SpaceBalanceDto = {
  spaceId: string;
  totalUsd: number;
  unallocatedUsd: number;
  partial: boolean;
  chains: SpaceChainBalanceDto[];
};

export type SpaceChainDto = {
  chainObjectId: string;
  chainId: string;
  chainType: string;
  address: string | null;
  isDeployed: boolean;
  status?: string;
  deployState?: string;
  deployError?: string;
};

export type SpaceSummaryDto = {
  spaceId: string;
  name: string;
  photo?: string;
  purpose: string;
  role: string;
  memberCount?: number;
  membershipStatus: "ACTIVE" | "PENDING";
  requestId?: string;
  status?: string;
  balance?: SpaceBalanceDto;
  chains?: SpaceChainDto[];
};

export type SpaceDetailDto = SpaceSummaryDto & {
  memberCount: number;
  membershipStatus: "ACTIVE";
  memberChangeInProgress: boolean;
  defaultRule: ApprovalRuleDto;
  chains: SpaceChainDto[];
};

export type VaultDto = {
  vaultId: string;
  spaceId: string;
  name: string;
  token: {
    tokenId: string;
    name: string;
    symbol: string;
    decimals: number;
    logoURI?: string;
    chainId: string;
    chainType: string;
  };
  goalAmount?: string;
  balance: { amount: string; formatted: string };
  approvalRule: ApprovalRuleDto;
  usesDefaultRule: boolean;
  photos: Array<{ photoId: string; url: string }>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type DashboardMemberDto = {
  userId: string;
  role: string;
  status: string;
  joinedAt?: string;
  isVoter: boolean;
  chainPending: boolean;
  spendVaultIds: string[];
  profile?: {
    displayName?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    avatar?: string;
  };
};

export type SpaceMembersDto = { voterCount: number; members: DashboardMemberDto[] };
export type SpaceDashboard = { space: SpaceDetailDto; vaults: VaultDto[]; members: SpaceMembersDto };

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a string`);
  return value;
}

function optionalText(value: unknown, field: string): string | undefined {
  return value === undefined || value === null ? undefined : text(value, field);
}

function finite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a number`);
  return value;
}

function integer(value: unknown, field: string): number {
  const result = finite(value, field);
  if (!Number.isInteger(result)) throw new Error(`${field} must be an integer`);
  return result;
}

function nullable<T>(value: unknown, parse: (value: unknown) => T): T | null {
  return value === null ? null : parse(value);
}

function parseRule(value: unknown, label: string): ApprovalRuleDto {
  if (value === undefined || value === null) return {};
  const input = record(value, label);
  return {
    alwaysAsk: input.alwaysAsk === undefined ? undefined : input.alwaysAsk === true,
    thresholdUsd: optionalText(input.thresholdUsd, `${label}.thresholdUsd`),
    quorumPercent: input.quorumPercent === undefined ? undefined : integer(input.quorumPercent, `${label}.quorumPercent`),
    mustIncludeMemberIds: input.mustIncludeMemberIds === undefined ? undefined : (() => {
      if (!Array.isArray(input.mustIncludeMemberIds)) throw new Error(`${label}.mustIncludeMemberIds must be an array`);
      return input.mustIncludeMemberIds.map((item, index) => text(item, `${label}.mustIncludeMemberIds[${index}]`));
    })(),
  };
}

function parseChain(value: unknown, index: number): SpaceChainDto {
  const input = record(value, `space.chains[${index}]`);
  return {
    chainObjectId: text(input.chainObjectId, `space.chains[${index}].chainObjectId`),
    chainId: text(input.chainId, `space.chains[${index}].chainId`),
    chainType: text(input.chainType, `space.chains[${index}].chainType`),
    address: input.address === null || input.address === undefined ? null : text(input.address, `space.chains[${index}].address`),
    isDeployed: input.isDeployed === true,
    status: optionalText(input.status, `space.chains[${index}].status`),
    deployState: optionalText(input.deployState, `space.chains[${index}].deployState`),
    deployError: optionalText(input.deployError, `space.chains[${index}].deployError`),
  };
}

function parseTokenBalance(value: unknown, label: string): SpaceTokenBalanceDto {
  const input = record(value, label);
  return {
    token: text(input.token, `${label}.token`),
    tokenId: optionalText(input.tokenId, `${label}.tokenId`),
    symbol: optionalText(input.symbol, `${label}.symbol`),
    decimals: input.decimals === undefined ? undefined : integer(input.decimals, `${label}.decimals`),
    logoURI: optionalText(input.logoURI, `${label}.logoURI`),
    amount: nullable(input.amount, (item) => text(item, `${label}.amount`)),
    formatted: nullable(input.formatted, (item) => text(item, `${label}.formatted`)),
    priceUsd: nullable(input.priceUsd, (item) => finite(item, `${label}.priceUsd`)),
    change24h: nullable(input.change24h, (item) => finite(item, `${label}.change24h`)),
    valueUsd: nullable(input.valueUsd, (item) => finite(item, `${label}.valueUsd`)),
    unallocatedAmount: nullable(input.unallocatedAmount, (item) => text(item, `${label}.unallocatedAmount`)),
    unallocatedFormatted: nullable(input.unallocatedFormatted, (item) => text(item, `${label}.unallocatedFormatted`)),
    unallocatedValueUsd: nullable(input.unallocatedValueUsd, (item) => finite(item, `${label}.unallocatedValueUsd`)),
    inVaultAmount: text(input.inVaultAmount, `${label}.inVaultAmount`),
    inVaultFormatted: nullable(input.inVaultFormatted, (item) => text(item, `${label}.inVaultFormatted`)),
    vaultCount: integer(input.vaultCount, `${label}.vaultCount`),
  };
}

export function parseSpaceBalance(value: unknown): SpaceBalanceDto {
  const input = record(value, "space.balance");
  if (!Array.isArray(input.chains)) throw new Error("space.balance.chains must be an array");
  return {
    spaceId: text(input.spaceId, "space.balance.spaceId"),
    totalUsd: finite(input.totalUsd, "space.balance.totalUsd"),
    unallocatedUsd: finite(input.unallocatedUsd, "space.balance.unallocatedUsd"),
    partial: input.partial === true,
    chains: input.chains.map((value, index) => {
      const chain = record(value, `space.balance.chains[${index}]`);
      if (!Array.isArray(chain.tokens)) throw new Error(`space.balance.chains[${index}].tokens must be an array`);
      return {
        chainObjectId: text(chain.chainObjectId, `space.balance.chains[${index}].chainObjectId`),
        chainId: text(chain.chainId, `space.balance.chains[${index}].chainId`),
        chainType: text(chain.chainType, `space.balance.chains[${index}].chainType`),
        chainLogoURI: optionalText(chain.chainLogoURI, `space.balance.chains[${index}].chainLogoURI`),
        address: text(chain.address, `space.balance.chains[${index}].address`),
        tokens: chain.tokens.map((token, tokenIndex) => parseTokenBalance(token, `space.balance.chains[${index}].tokens[${tokenIndex}]`)),
      };
    }),
  };
}

export function parseSpaceSummary(value: unknown, allowMissingStatus = false): SpaceSummaryDto {
  const input = record(value, "space");
  const membershipStatus = input.membershipStatus === undefined && allowMissingStatus
    ? "ACTIVE"
    : text(input.membershipStatus, "space.membershipStatus");
  if (membershipStatus !== "ACTIVE" && membershipStatus !== "PENDING") throw new Error("space.membershipStatus is invalid");
  const chains = input.chains === undefined ? undefined : (() => {
    if (!Array.isArray(input.chains)) throw new Error("space.chains must be an array");
    return input.chains.map(parseChain);
  })();
  return {
    spaceId: text(input.spaceId, "space.spaceId"),
    name: text(input.name, "space.name"),
    photo: optionalText(input.photo, "space.photo"),
    purpose: text(input.purpose, "space.purpose"),
    role: text(input.role, "space.role"),
    memberCount: input.memberCount === undefined ? undefined : integer(input.memberCount, "space.memberCount"),
    membershipStatus,
    requestId: optionalText(input.requestId, "space.requestId"),
    status: optionalText(input.status, "space.status"),
    balance: input.balance === undefined ? undefined : parseSpaceBalance(input.balance),
    chains,
  };
}

export function parseSpaceList(value: unknown): SpaceSummaryDto[] {
  if (!Array.isArray(value)) throw new Error("spaces response must be an array");
  return value.map((item) => parseSpaceSummary(item));
}

export function parseSpaceDetail(value: unknown): SpaceDetailDto {
  const input = record(value, "space");
  const summary = parseSpaceSummary(input, true);
  if (summary.membershipStatus !== "ACTIVE") throw new Error("selected space is not active");
  if (summary.memberCount === undefined || !summary.chains) throw new Error("space detail is incomplete");
  return {
    ...summary,
    memberCount: summary.memberCount,
    chains: summary.chains,
    membershipStatus: "ACTIVE",
    memberChangeInProgress: input.memberChangeInProgress === true,
    defaultRule: parseRule(input.defaultRule, "space.defaultRule"),
  };
}

export function parseVaults(value: unknown): VaultDto[] {
  if (!Array.isArray(value)) throw new Error("vault response must be an array");
  return value.map((item, index) => {
    const input = record(item, `vaults[${index}]`);
    const token = record(input.token, `vaults[${index}].token`);
    const balance = record(input.balance, `vaults[${index}].balance`);
    if (!Array.isArray(input.photos)) throw new Error(`vaults[${index}].photos must be an array`);
    return {
      vaultId: text(input.vaultId, `vaults[${index}].vaultId`),
      spaceId: text(input.spaceId, `vaults[${index}].spaceId`),
      name: text(input.name, `vaults[${index}].name`),
      token: {
        tokenId: text(token.tokenId, `vaults[${index}].token.tokenId`),
        name: text(token.name, `vaults[${index}].token.name`),
        symbol: text(token.symbol, `vaults[${index}].token.symbol`),
        decimals: integer(token.decimals, `vaults[${index}].token.decimals`),
        logoURI: optionalText(token.logoURI, `vaults[${index}].token.logoURI`),
        chainId: text(token.chainId, `vaults[${index}].token.chainId`),
        chainType: text(token.chainType, `vaults[${index}].token.chainType`),
      },
      goalAmount: optionalText(input.goalAmount, `vaults[${index}].goalAmount`),
      balance: {
        amount: text(balance.amount, `vaults[${index}].balance.amount`),
        formatted: text(balance.formatted, `vaults[${index}].balance.formatted`),
      },
      approvalRule: parseRule(input.approvalRule, `vaults[${index}].approvalRule`),
      usesDefaultRule: input.usesDefaultRule === true,
      photos: input.photos.map((photo, photoIndex) => {
        const row = record(photo, `vaults[${index}].photos[${photoIndex}]`);
        return { photoId: text(row.photoId, "photo.photoId"), url: text(row.url, "photo.url") };
      }),
      createdBy: text(input.createdBy, `vaults[${index}].createdBy`),
      createdAt: text(input.createdAt, `vaults[${index}].createdAt`),
      updatedAt: text(input.updatedAt, `vaults[${index}].updatedAt`),
    };
  });
}

export function parseDashboardMembers(value: unknown): SpaceMembersDto {
  const input = record(value, "space members");
  if (!Array.isArray(input.members)) throw new Error("space members.members must be an array");
  return {
    voterCount: integer(input.voterCount, "space members.voterCount"),
    members: input.members.map((item, index) => {
      const member = record(item, `space members.members[${index}]`);
      const profile = member.profile === undefined ? undefined : record(member.profile, `space members.members[${index}].profile`);
      if (!Array.isArray(member.spendVaultIds)) throw new Error(`space members.members[${index}].spendVaultIds must be an array`);
      return {
        userId: text(member.userId, `space members.members[${index}].userId`),
        role: text(member.role, `space members.members[${index}].role`),
        status: text(member.status, `space members.members[${index}].status`),
        joinedAt: optionalText(member.joinedAt, `space members.members[${index}].joinedAt`),
        isVoter: member.isVoter === true,
        chainPending: member.chainPending === true,
        spendVaultIds: member.spendVaultIds.map((id, idIndex) => text(id, `spendVaultIds[${idIndex}]`)),
        profile: profile ? Object.fromEntries(Object.entries(profile).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : undefined,
      };
    }),
  };
}
