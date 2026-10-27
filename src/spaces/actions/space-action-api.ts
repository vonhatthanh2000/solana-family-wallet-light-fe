import { apiRequest } from "../../api/client";
import { asRecord } from "../../api/types";
import { parseVaults, type ApprovalRuleDto, type VaultDto } from "../contracts";
import {
  parseCategories, parseGuardianActions, parseMoneyQuote, parseMoneyResult, parseSpends,
  parseVaultTokenOptions, type GuardianActionDto, type MoneyQuoteDto, type MoneyResultDto,
  type SpaceCategoryDto, type SpendDto, type VaultTokenOptionDto,
} from "./contracts";

const id = encodeURIComponent;
const json = (method: string, body?: unknown): RequestInit => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const photo = (method: string, file: File): RequestInit => {
  const body = new FormData();
  body.set("file", file);
  return { method, body };
};
const parsed = async <T,>(request: Promise<unknown>, parser: (value: unknown) => T) => parser(await request);

export type CreateVaultInput = { name: string; tokenId: string; goalAmount?: string; approvalRule?: ApprovalRuleDto };
export type SpendInput = { chainId: string; token: string; amount: string; destination: string; vaultId?: string; categoryId?: string; note?: string };

export const spaceActionApi = {
  listCategories: (spaceId: string): Promise<SpaceCategoryDto[]> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/categories`), parseCategories),
  createCategory: (spaceId: string, name: string): Promise<SpaceCategoryDto> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/categories`, json("POST", { name })), (value) => parseCategories([value])[0]!),
  renameCategory: (spaceId: string, categoryId: string, name: string): Promise<SpaceCategoryDto> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/categories/${id(categoryId)}`, json("PATCH", { name })), (value) => parseCategories([value])[0]!),
  deleteCategory: (spaceId: string, categoryId: string) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/categories/${id(categoryId)}`, json("DELETE")),
  renameSpace: (spaceId: string, name: string) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/name`, json("PATCH", { name })),
  setSpacePhoto: (spaceId: string, file: File) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/photo`, photo("PUT", file)),
  removeSpacePhoto: (spaceId: string) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/photo`, json("DELETE")),
  listVaultTokens: (spaceId: string): Promise<VaultTokenOptionDto[]> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/vaults/tokens`), parseVaultTokenOptions),
  createVault: (spaceId: string, input: CreateVaultInput): Promise<VaultDto> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/vaults`, json("POST", input)), (value) => parseVaults([value])[0]!),
  updateVault: (spaceId: string, vaultId: string, input: { name?: string; goalAmount?: string | null }): Promise<VaultDto> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/vaults/${id(vaultId)}`, json("PATCH", input)), (value) => parseVaults([value])[0]!),
  proposeVaultRuleChange: (spaceId: string, vaultId: string, rule: ApprovalRuleDto): Promise<Record<string, unknown>> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/vaults/${id(vaultId)}/rule-change`, json("POST", rule)), (value) => asRecord(value, "vault rule request")),
  addVaultPhoto: (spaceId: string, vaultId: string, file: File) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/vaults/${id(vaultId)}/photos`, photo("POST", file)),
  removeVaultPhoto: (spaceId: string, vaultId: string, photoId: string) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/vaults/${id(vaultId)}/photos/${id(photoId)}`, json("DELETE")),
  quoteVaultMoney: (spaceId: string, vaultId: string, direction: "add-money" | "move-to-shared", amount: string): Promise<MoneyQuoteDto> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/vaults/${id(vaultId)}/${direction}/quote?amount=${id(amount)}`), parseMoneyQuote),
  moveVaultMoney: (spaceId: string, vaultId: string, direction: "add-money" | "move-to-shared", amount: string, clientRequestId: string): Promise<MoneyResultDto> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/vaults/${id(vaultId)}/${direction}`, json("POST", { amount, clientRequestId })), parseMoneyResult),
  listSpends: (spaceId: string, chainId: string): Promise<SpendDto[]> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/spend?chainId=${id(chainId)}`), parseSpends),
  getSpendFee: (spaceId: string, chainId: string): Promise<Record<string, unknown>> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/spend/fee?chainId=${id(chainId)}`), (value) => asRecord(value, "spend fee")),
  proposeSpend: (spaceId: string, input: SpendInput): Promise<SpendDto> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/spend`, json("POST", input)), (value) => parseSpends([value])[0]!),
  voteSpend: (spaceId: string, spendId: string, signature: string): Promise<SpendDto> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/spend/vote`, json("POST", { spendId, signature })), (value) => parseSpends([value])[0]!),
  declineSpend: (spaceId: string, spendId: string): Promise<SpendDto> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/spend/decline`, json("POST", { spendId })), (value) => parseSpends([value])[0]!),
  executeSpend: (spaceId: string, spendId: string, signature?: string): Promise<Record<string, unknown>> => apiRequest(`/family-wallet/spaces/${id(spaceId)}/spend/execute`, json("POST", { spendId, ...(signature ? { signature } : {}) })),
  cancelSpend: (spaceId: string, spendId: string) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/spend?spendId=${id(spendId)}`, json("DELETE")),
  setSpendCategory: (spaceId: string, spendId: string, categoryId: string | null) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/spend/${id(spendId)}/category`, json("PATCH", { categoryId })),
  listGuardianActions: (spaceId: string): Promise<GuardianActionDto[]> => parsed(apiRequest(`/family-wallet/spaces/${id(spaceId)}/solana/guardian/actions`), parseGuardianActions),
  guardianPayload: (spaceId: string, operation: string, targetGuardian?: string): Promise<Record<string, unknown>> => apiRequest(`/family-wallet/spaces/${id(spaceId)}/solana/guardian/${id(operation)}/payload`, json("POST", targetGuardian ? { targetGuardian } : {})),
  submitGuardian: (spaceId: string, actionId: string, signature: string) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/solana/guardian/actions/${id(actionId)}/submit`, json("POST", { signature })),
  executeGuardianRemoval: (spaceId: string) => apiRequest(`/family-wallet/spaces/${id(spaceId)}/solana/guardian/execute-removal`, json("POST")),
  guardianPayloadFields: (value: unknown) => {
    const row = asRecord(value, "guardian payload");
    return { actionId: String(row.actionId ?? row._id ?? ""), digest: String(row.digest ?? "") };
  },
};
