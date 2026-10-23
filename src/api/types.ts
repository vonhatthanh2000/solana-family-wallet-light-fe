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
};

export type WalletDto = {
  _id: string;
  chainId: string;
  chain: "SOL";
  address: string;
  walletIndex: number;
  isActive: boolean;
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

  return {
    spaceId: requireHex(value.spaceId, "spaceId"),
    chainObjectId: requireString(value.chainObjectId, "chainObjectId"),
    chainId: requireString(value.chainId, "chainId"),
    chainType: "SOL",
    address: requireString(value.address, "address"),
    programId: requireString(value.programId, "programId"),
    creator: requireHex(value.creator, "creator", 32),
    digest: requireHex(value.digest, "digest", 32),
    config: requireString(value.config, "config"),
    validAfter,
    validUntil,
    guardian: requireHex(value.guardian, "guardian"),
    owner: requireHex(value.owner, "owner"),
    members: value.members.map((member, index) => requireHex(member, `members[${index}]`)),
  };
}

export function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} response must be an object`);
  return value;
}
