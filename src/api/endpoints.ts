import { apiRequest } from "./client";
import {
  asRecord,
  parseSolanaOpenPayload,
  type ActivationResponse,
  type ChainListResponse,
  type CreateSpaceResponse,
  type DepositAddressesResponse,
  type SolanaOpenPayload,
  type WalletDto,
  type WalletGroupDto,
} from "./types";

export type RegisterWalletInput = {
  chainId: string;
  address: string;
  publicKey: string;
  walletIndex: number;
};

export type ActivateSolanaInput = {
  signature: string;
  validAfter: number;
  validUntil: number;
};

export async function getChains(): Promise<ChainListResponse> {
  const response = await apiRequest<ChainListResponse>("/chain/get-chains?page=1&limit=100");
  if (!response || !Array.isArray(response.items)) {
    throw new Error("Chain response is missing its items array");
  }
  return response;
}

export function createWalletGroup(name: string): Promise<WalletGroupDto> {
  return apiRequest<WalletGroupDto>("/wallets/groups", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getWallets(chainObjectId: string): Promise<WalletDto[]> {
  const path = `/wallets?chainId=${encodeURIComponent(chainObjectId)}`;
  const response = await apiRequest<WalletDto[] | { items: WalletDto[] }>(path);
  const wallets = Array.isArray(response) ? response : response.items;
  if (!Array.isArray(wallets)) throw new Error("Wallet response is not an array");
  return wallets;
}

export function registerWallet(input: RegisterWalletInput): Promise<WalletDto> {
  const body: RegisterWalletInput = {
    chainId: input.chainId,
    address: input.address,
    publicKey: input.publicKey,
    walletIndex: input.walletIndex,
  };
  return apiRequest<WalletDto>("/wallets", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function createSpace(name: string): Promise<CreateSpaceResponse> {
  const path = "/family-wallet/spaces";
  const body = {
    name,
    purpose: "FAMILY" as const,
    approvalRule: {
      alwaysAsk: false,
      thresholdUsd: "200",
      quorumPercent: 50,
    },
  };

  console.log("[Create Space request]", {
    method: "POST",
    path,
    body,
    json: JSON.stringify(body),
  });

  return apiRequest<CreateSpaceResponse>("/family-wallet/spaces", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getSolanaPayload(spaceId: string): Promise<SolanaOpenPayload> {
  const response = await apiRequest<unknown>(
    `/family-wallet/spaces/${encodeURIComponent(spaceId)}/solana/activate-payload`,
    { method: "POST" },
  );
  return parseSolanaOpenPayload(response);
}

export function activateSolana(
  spaceId: string,
  input: ActivateSolanaInput,
): Promise<ActivationResponse> {
  const body: ActivateSolanaInput = {
    signature: input.signature,
    validAfter: input.validAfter,
    validUntil: input.validUntil,
  };
  return apiRequest<ActivationResponse>(
    `/family-wallet/spaces/${encodeURIComponent(spaceId)}/solana/activate`,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function getDepositAddresses(spaceId: string): Promise<DepositAddressesResponse> {
  const response = await apiRequest<DepositAddressesResponse>(
    `/family-wallet/spaces/${encodeURIComponent(spaceId)}/deposit-addresses`,
  );
  const record = asRecord(response, "Deposit-addresses");
  if (!Array.isArray(record.chains)) {
    throw new Error("Deposit-addresses response is missing its chains array");
  }
  return response;
}

export function extractSolanaPayload(response: CreateSpaceResponse): SolanaOpenPayload | undefined {
  const candidate = response.initialize?.ready?.find(
    (item) => typeof item === "object" && item !== null && item.chainType === "SOL",
  );
  return candidate ? parseSolanaOpenPayload(candidate) : undefined;
}
