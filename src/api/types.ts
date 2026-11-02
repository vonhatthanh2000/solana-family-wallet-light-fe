export type ChainDto = {
  _id: string;
  chainId: string;
  chainType: string;
  network: string;
  name: string;
  isActive: boolean;
  wallet?: WalletDto | null;
};

export type ChainListResponse = {
  items: ChainDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
};

export type WalletGroupDto = {
  _id: string;
  name: string;
  walletIndex: number;
  selected: boolean;
  isHidden: boolean;
  walletIds?: Array<WalletDto | string>;
};

export type WalletDto = {
  _id: string;
  chainId: string;
  chain: string;
  address: string;
  publicKey?: string | null;
  walletIndex?: number | null;
  isActive: boolean;
  walletGroup?: WalletGroupDto | null;
};

export type SolanaOpenPayload = {
  spaceId: `0x${string}`;
  chainObjectId: string;
  chainId: string;
  chainType: "SOL";
  address: string;
  programId: string;
  creator: `0x${string}`;
  digest: `0x${string}`;
  config: string;
  validAfter: number;
  validUntil: number;
  guardian: `0x${string}`;
  owner: `0x${string}`;
  members: `0x${string}`[];
};

export type SkippedChain = {
  chainObjectId: string;
  chainId: string;
  chainType: string;
  reason: string;
};

export type CreateSpaceResponse = {
  spaceId: `0x${string}`;
  name: string;
  purpose: "FAMILY" | "FRIENDS" | "WORK";
  role: "OWNER";
  memberCount: number;
  initialize: {
    spaceId: `0x${string}`;
    ready: Array<SolanaOpenPayload | Record<string, unknown>>;
    skipped: SkippedChain[];
  };
};

export type SpaceChainDto = {
  chainObjectId: string;
  chainId: string;
  chainType: string;
  address: string | null;
  isDeployed: boolean;
  deployState?: "pending" | "failed";
  deployError?: string;
};

export type DepositAddressesResponse = {
  spaceId: `0x${string}`;
  chains: SpaceChainDto[];
  tokenDepositAddresses: TokenDepositAddressDto[];
};

export type TokenDepositAddressDto = {
  tokenId: string;
  chainObjectId: string;
  chainId: string;
  chainType: "SOL";
  name: string;
  symbol: string;
  decimals: number;
  mint: string;
  address: string;
  isReady: boolean;
};

export type ActivationResponse = {
  spaceId?: `0x${string}`;
  chainObjectId?: string;
  chainType?: string;
  address?: string | null;
  isDeployed?: boolean;
  deployState: "pending" | "failed";
  deployError?: string;
  [key: string]: unknown;
};

export type ApiErrorBody = {
  statusCode?: number;
  message?: string | string[];
  code?: string;
  [key: string]: unknown;
};

export type DebugEvent = {
  at: string;
  step: string;
  outcome: "start" | "success" | "failure" | "info";
  detail?: unknown;
};

export type DiagnosticError = {
  source: "client" | "wallet" | "backend" | "poll";
  status?: number;
  code?: string;
  message: string;
  raw?: unknown;
  request?: {
    method: string;
    path: string;
    body?: unknown;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid Solana payload: ${field} must be a non-empty string`);
  }
  return value;
}

function requireHex(value: unknown, field: string, byteLength?: number): `0x${string}` {
  const text = requireString(value, field);
  const pattern = byteLength
    ? new RegExp(`^0x[0-9a-fA-F]{${byteLength * 2}}$`)
    : /^0x[0-9a-fA-F]+$/;
  if (!pattern.test(text)) {
    const size = byteLength ? ` exactly ${byteLength} bytes` : " hexadecimal";
    throw new Error(`Invalid Solana payload: ${field} must be${size} with a 0x prefix`);
  }
  return text as `0x${string}`;
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid Solana payload: ${field} must be a finite number`);
  }
  return value;
}

export function isSolanaOpenPayload(value: unknown): value is SolanaOpenPayload {
  try {
    parseSolanaOpenPayload(value);
    return true;
  } catch {
    return false;
  }
}

export function parseSolanaOpenPayload(value: unknown): SolanaOpenPayload {
  if (!isRecord(value)) throw new Error("Invalid Solana payload: expected an object");
  if (value.chainType !== "SOL") {
    throw new Error("Invalid Solana payload: chainType must be SOL");
  }
  if (!Array.isArray(value.members)) {
    throw new Error("Invalid Solana payload: members must be an array");
  }

  const validAfter = requireFiniteNumber(value.validAfter, "validAfter");
  const validUntil = requireFiniteNumber(value.validUntil, "validUntil");
  if (!Number.isInteger(validAfter) || !Number.isInteger(validUntil) || validUntil <= validAfter) {
    throw new Error("Invalid Solana payload: signing timestamps are invalid");
  }

  const digest = requireHex(value.digest, "digest", 32);
  if (!/^0x[0-9a-f]{64}$/.test(digest)) {
    throw new Error(
      "Invalid Solana payload: digest must be canonical lowercase 0x-prefixed hex",
    );
  }

  return {
    spaceId: requireHex(value.spaceId, "spaceId"),
    chainObjectId: requireString(value.chainObjectId, "chainObjectId"),
    chainId: requireString(value.chainId, "chainId"),
    chainType: "SOL",
    address: requireString(value.address, "address"),
    programId: requireString(value.programId, "programId"),
    creator: requireHex(value.creator, "creator", 32),
    digest,
    config: requireString(value.config, "config"),
    validAfter,
    validUntil,
    guardian: requireHex(value.guardian, "guardian", 32),
    owner: requireHex(value.owner, "owner", 32),
    members: value.members.map((member, index) =>
      requireHex(member, `members[${index}]`, 32),
    ),
  };
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} response must be an object`);
  return value;
}

function parseDepositToken(
  value: unknown,
  index: number,
  chainDefaults: Partial<SpaceChainDto> = {},
): TokenDepositAddressDto {
  const row = asRecord(value, `tokenDepositAddresses[${index}]`);
  const metadata = isRecord(row.token) ? row.token : row;
  const chainType = row.chainType ?? metadata.chainType ?? chainDefaults.chainType;
  if (chainType !== "SOL") throw new Error(`tokenDepositAddresses[${index}].chainType must be SOL`);
  const decimals = requireFiniteNumber(row.decimals ?? metadata.decimals, `tokenDepositAddresses[${index}].decimals`);
  if (!Number.isInteger(decimals) || decimals < 0) throw new Error(`tokenDepositAddresses[${index}].decimals must be a non-negative integer`);
  const mint = requireString(
    row.mint ?? row.tokenAddress ?? metadata.mint ?? metadata.tokenAddress ?? metadata.address,
    `tokenDepositAddresses[${index}].mint`,
  );
  const symbol = requireString(row.symbol ?? metadata.symbol, `tokenDepositAddresses[${index}].symbol`);
  return {
    tokenId: requireString(row.tokenId ?? metadata.tokenId ?? metadata._id ?? metadata.id ?? mint, `tokenDepositAddresses[${index}].tokenId`),
    chainObjectId: requireString(row.chainObjectId ?? metadata.chainObjectId ?? chainDefaults.chainObjectId, `tokenDepositAddresses[${index}].chainObjectId`),
    chainId: requireString(row.chainId ?? metadata.chainId ?? chainDefaults.chainId, `tokenDepositAddresses[${index}].chainId`),
    chainType: "SOL",
    name: typeof (row.name ?? metadata.name) === "string" && String(row.name ?? metadata.name).trim() ? String(row.name ?? metadata.name) : symbol,
    symbol,
    decimals,
    mint,
    address: requireString(row.address ?? row.ata ?? row.depositAddress, `tokenDepositAddresses[${index}].address`),
    isReady: row.isReady === true || row.exists === true || row.ataExists === true || row.isInitialized === true || row.status === "ready",
  };
}

function depositRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return Object.values(value);
  return [];
}

export function parseDepositAddressesResponse(value: unknown): DepositAddressesResponse {
  const row = asRecord(value, "Deposit-addresses");
  if (!Array.isArray(row.chains)) throw new Error("Deposit-addresses response is missing its chains array");
  const chains = row.chains.map((value, index) => {
    const chain = asRecord(value, `Deposit-addresses.chains[${index}]`);
    return {
      chainObjectId: requireString(chain.chainObjectId ?? chain._id, `chains[${index}].chainObjectId`),
      chainId: requireString(chain.chainId, `chains[${index}].chainId`),
      chainType: requireString(chain.chainType, `chains[${index}].chainType`),
      address: chain.address === null || chain.address === undefined ? null : requireString(chain.address, `chains[${index}].address`),
      isDeployed: chain.isDeployed === true,
      deployState: chain.deployState === "pending" || chain.deployState === "failed" ? chain.deployState : undefined,
      deployError: typeof chain.deployError === "string" ? chain.deployError : undefined,
    } satisfies SpaceChainDto;
  });
  const topLevel = depositRows(row.tokenDepositAddresses);
  const nested = row.chains.flatMap((value, chainIndex) => {
    const chain = asRecord(value, `Deposit-addresses.chains[${chainIndex}]`);
    return depositRows(chain.tokenDepositAddresses).map((token) => ({ token, defaults: chains[chainIndex] }));
  });
  const tokenDepositAddresses = [
    ...topLevel.map((token) => ({ token, defaults: {} })),
    ...nested,
  ].map(({ token, defaults }, index) => parseDepositToken(token, index, defaults));
  return {
    spaceId: requireString(row.spaceId, "spaceId") as `0x${string}`,
    chains,
    tokenDepositAddresses,
  };
}
