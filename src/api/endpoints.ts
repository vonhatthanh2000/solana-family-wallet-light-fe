import { apiRequest } from "./client";
import {
  parseDepositAddressesResponse,
  parseSolanaDepositFeeQuote,
  parseSolanaOpenPayload,
  type ActivationResponse,
  type ChainListResponse,
  type CreateSpaceResponse,
  type DepositAddressesResponse,
  type SolanaDepositFeeQuote,
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

export async function getWalletGroups(): Promise<WalletGroupDto[]> {
  const response = await apiRequest<WalletGroupDto[]>("/wallets/groups");
  if (!Array.isArray(response)) throw new Error("Wallet-group response is not an array");
  return response;
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
  const response = await apiRequest<unknown>(
    `/family-wallet/spaces/${encodeURIComponent(spaceId)}/deposit-addresses`,
  );
  return parseDepositAddressesResponse(response);
}

/**
 * Prices the next deposit of one SPL token before the user commits to it. Re-read it when the screen
 * has been open a while or after a failed send: `ataExists` can flip, which changes the price.
 */
export async function getSolanaDepositFee(spaceId: string, tokenId: string): Promise<SolanaDepositFeeQuote> {
  const response = await apiRequest<unknown>(
    `/family-wallet/spaces/${encodeURIComponent(spaceId)}/solana/deposit-fee?tokenId=${encodeURIComponent(tokenId)}`,
  );
  return parseSolanaDepositFeeQuote(response);
}

export type SendTransactionReport = {
  /**
   * The chain *document* id — chainObjectId from the deposit-addresses response, not the network
   * chain id. Sending the network id is rejected with a 400 naming the field.
   */
  chainId: string;
  txHash: string;
  from: string;
  to: string;
  /**
   * Whole units as a decimal string ("100"), unlike the transaction itself, which uses smallest
   * units. Still a string: never parseFloat it.
   */
  amount: string;
  /**
   * Not a symbol: the endpoint validates against exactly these two. "TOKEN" for any SPL transfer,
   * with tokenAddress carrying the mint; "NATIVE" for SOL, with no tokenAddress.
   */
  coin: "NATIVE" | "TOKEN";
  tokenAddress?: string;
};

/**
 * Records a broadcast transfer in the user's own off-chain history. The Space ledger is credited by
 * the chain scanner regardless, so a failure here never means a lost deposit.
 */
export function reportSendTransaction(report: SendTransactionReport): Promise<unknown> {
  return apiRequest<unknown>("/offchain/transaction/create-send-tx", {
    method: "POST",
    body: JSON.stringify({ ...report, txType: "SEND" }),
  });
}

export function extractSolanaPayload(response: CreateSpaceResponse): SolanaOpenPayload | undefined {
  const candidate = response.initialize?.ready?.find(
    (item) => typeof item === "object" && item !== null && item.chainType === "SOL",
  );
  return candidate ? parseSolanaOpenPayload(candidate) : undefined;
}
