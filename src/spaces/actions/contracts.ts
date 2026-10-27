import { asRecord } from "../../api/types";
import { parseVaults, type VaultDto } from "../contracts";

export type SpacePermission =
  | "VIEW" | "SPEND" | "VOTE" | "MANAGE_VAULT" | "MANAGE_ASSETS"
  | "INVITE" | "PROPOSE_MEMBER_CHANGE" | "TRANSFER_OWNERSHIP";

export type SpaceCategoryDto = { id: string; name: string; isOthers: boolean };
export type VaultTokenOptionDto = {
  tokenId: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  tokenAddress: string;
  isNative: boolean;
  chainObjectId: string;
  chainId: string;
  chainType: string;
  chainName: string;
  network: string;
};
export type MoneyQuoteDto = {
  source: string;
  available: { amount: string; formatted: string };
  need: number;
  voters: number;
  amount?: { amount: string; formatted: string; usd: string | null };
  path?: string;
  reason?: string;
  insufficient?: boolean;
};
export type MoneyResultDto = { outcome: "MOVED" | "REQUESTED"; vault: VaultDto; request?: Record<string, unknown> };
export type SpendDto = {
  spendId: string;
  chainType: string;
  chainId: string;
  status: string;
  proposedBy: string;
  action: { token: string; amount: string; destination: string };
  intent: { digest: string; signed: Record<string, unknown> };
  note: string | null;
  categoryId: string | null;
  vaultId: string | null;
  requiredApprovals: number;
  approverIds: string[];
  declinerIds: string[];
  readyToSend: boolean;
  send: { digest: string; signed: Record<string, unknown> } | null;
  txHash: string | null;
};
export type GuardianActionDto = {
  actionId: string;
  operation: string;
  status: string;
  digest?: string;
  validUntil?: number;
  targetGuardian?: string;
  txHash?: string;
  failReason?: string;
};

const text = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a string`);
  return value;
};
const number = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a number`);
  return value;
};
const strings = (value: unknown, field: string) => {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item, index) => text(item, `${field}[${index}]`));
};

export function parseCategories(value: unknown): SpaceCategoryDto[] {
  if (!Array.isArray(value)) throw new Error("categories response must be an array");
  return value.map((item, index) => {
    const row = asRecord(item, `categories[${index}]`);
    return { id: text(row.id ?? row._id, "category.id"), name: text(row.name, "category.name"), isOthers: row.isOthers === true };
  });
}

export function parseVaultTokenOptions(value: unknown): VaultTokenOptionDto[] {
  if (!Array.isArray(value)) throw new Error("vault tokens response must be an array");
  return value.map((item, index) => {
    const row = asRecord(item, `vault tokens[${index}]`);
    return {
      tokenId: text(row.tokenId, "vault token.tokenId"), name: text(row.name, "vault token.name"),
      symbol: text(row.symbol, "vault token.symbol"), decimals: number(row.decimals, "vault token.decimals"),
      logoURI: typeof row.logoURI === "string" ? row.logoURI : undefined,
      tokenAddress: typeof row.tokenAddress === "string" ? row.tokenAddress : "",
      isNative: row.isNative === true, chainObjectId: text(row.chainObjectId, "vault token.chainObjectId"),
      chainId: text(row.chainId, "vault token.chainId"), chainType: text(row.chainType, "vault token.chainType"),
      chainName: text(row.chainName, "vault token.chainName"), network: text(row.network, "vault token.network"),
    };
  });
}

export function parseMoneyQuote(value: unknown): MoneyQuoteDto {
  const row = asRecord(value, "money quote");
  const available = asRecord(row.available, "money quote.available");
  const amount = row.amount === undefined ? undefined : asRecord(row.amount, "money quote.amount");
  return {
    source: text(row.source, "money quote.source"),
    available: { amount: text(available.amount, "available.amount"), formatted: text(available.formatted, "available.formatted") },
    need: number(row.need, "money quote.need"), voters: number(row.voters, "money quote.voters"),
    amount: amount ? {
      amount: text(amount.amount, "quote amount.amount"), formatted: text(amount.formatted, "quote amount.formatted"),
      usd: amount.usd === null ? null : text(amount.usd, "quote amount.usd"),
    } : undefined,
    path: typeof row.path === "string" ? row.path : undefined,
    reason: typeof row.reason === "string" ? row.reason : undefined,
    insufficient: row.insufficient === true,
  };
}

export function parseMoneyResult(value: unknown): MoneyResultDto {
  const row = asRecord(value, "money result");
  if (row.outcome !== "MOVED" && row.outcome !== "REQUESTED") throw new Error("money result outcome is invalid");
  return { outcome: row.outcome, vault: parseVaults([row.vault])[0]!, request: row.request === undefined ? undefined : asRecord(row.request, "money result.request") };
}

export function parseSpends(value: unknown): SpendDto[] {
  if (!Array.isArray(value)) throw new Error("spends response must be an array");
  return value.map((item, index) => {
    const row = asRecord(item, `spends[${index}]`);
    const action = asRecord(row.action, "spend.action");
    const intent = asRecord(row.intent, "spend.intent");
    const send = row.send === null || row.send === undefined ? null : asRecord(row.send, "spend.send");
    return {
      spendId: text(row.spendId, "spend.spendId"), chainType: text(row.chainType, "spend.chainType"),
      chainId: text(row.chainId, "spend.chainId"), status: text(row.status, "spend.status"),
      proposedBy: text(row.proposedBy, "spend.proposedBy"),
      action: { token: text(action.token, "spend.action.token"), amount: text(action.amount, "spend.action.amount"), destination: text(action.destination, "spend.action.destination") },
      intent: { digest: text(intent.digest, "spend.intent.digest"), signed: asRecord(intent.signed, "spend.intent.signed") },
      note: row.note === null ? null : text(row.note, "spend.note"),
      categoryId: row.categoryId === null ? null : text(row.categoryId, "spend.categoryId"),
      vaultId: row.vaultId === null ? null : text(row.vaultId, "spend.vaultId"),
      requiredApprovals: number(row.requiredApprovals, "spend.requiredApprovals"),
      approverIds: strings(row.approverIds, "spend.approverIds"), declinerIds: strings(row.declinerIds, "spend.declinerIds"),
      readyToSend: row.readyToSend === true,
      send: send ? { digest: text(send.digest, "spend.send.digest"), signed: asRecord(send.signed, "spend.send.signed") } : null,
      txHash: row.txHash === null ? null : text(row.txHash, "spend.txHash"),
    };
  });
}

export function parseGuardianActions(value: unknown): GuardianActionDto[] {
  if (!Array.isArray(value)) throw new Error("guardian actions response must be an array");
  return value.map((item, index) => {
    const row = asRecord(item, `guardian actions[${index}]`);
    return {
      actionId: text(row.actionId ?? row._id, "guardian action.actionId"),
      operation: text(row.operation, "guardian action.operation"), status: text(row.status, "guardian action.status"),
      digest: typeof row.digest === "string" ? row.digest : undefined,
      validUntil: typeof row.validUntil === "number" ? row.validUntil : undefined,
      targetGuardian: typeof row.targetGuardian === "string" ? row.targetGuardian : undefined,
      txHash: typeof row.txHash === "string" ? row.txHash : undefined,
      failReason: typeof row.failReason === "string" ? row.failReason : undefined,
    };
  });
}
