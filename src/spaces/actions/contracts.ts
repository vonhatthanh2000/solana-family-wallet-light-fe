import { asRecord, optionalBaseUnits } from "../../api/types";
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
/**
 * A Solana Space holds no SOL of its own, so it cannot pay for the first spend out until someone
 * funds it. The backend reports this on `GET /:spaceId/spend/fee` (only while short) and in the
 * body of a `RESERVE_TOO_LOW` refusal from propose or execute. Both are the same state.
 */
export type SolReserveDto = {
  /** The Space PDA. Native SOL goes here — never to a token account. */
  spaceAddress: string;
  heldLamports: string;
  neededLamports: string;
  shortfallLamports: string;
  /** What to ask the user for: the shortfall plus headroom for roughly coversSpends spends. */
  topUpLamports: string;
  coversSpends: number;
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
  /** amount already includes rentLamports; rentLamports is present only when this spend opens the recipient's token account. */
  networkFee?: { amount?: string; usd?: string | null; rentLamports?: string };
  txHash: string | null;
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

const record = (value: unknown): Record<string, unknown> | undefined => (
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
);

/**
 * Reads the reserve out of a spend-fee response or an error body, from either place the backend
 * carries it. Lenient on purpose: this runs on an error path, where throwing would hide the
 * refusal's own message. A reserve that is not short is no state to report, so it reads as absent.
 */
export function solReserveFrom(body: unknown): SolReserveDto | undefined {
  const row = record(body);
  const reserve = record(row?.solReserve) ?? record(record(row?.details)?.solReserve);
  if (!reserve) return undefined;
  const spaceAddress = reserve.spaceAddress;
  const shortfallLamports = optionalBaseUnits(reserve.shortfallLamports);
  const topUpLamports = optionalBaseUnits(reserve.topUpLamports);
  if (typeof spaceAddress !== "string" || !spaceAddress) return undefined;
  if (!shortfallLamports || shortfallLamports === "0" || !topUpLamports) return undefined;
  const coversSpends = reserve.coversSpends;
  return {
    spaceAddress,
    heldLamports: optionalBaseUnits(reserve.heldLamports) ?? "0",
    neededLamports: optionalBaseUnits(reserve.neededLamports) ?? "0",
    shortfallLamports,
    topUpLamports,
    coversSpends: typeof coversSpends === "number" && Number.isInteger(coversSpends) && coversSpends > 0 ? coversSpends : 0,
  };
}

/**
 * What one spend execution needs from step 1: the single digest to sign, plus the rent the Space pays
 * when this spend opens the recipient's token account. The rent is on the payload, not something the
 * client may recompute — it is read from the chain.
 */
/** Read-only display values, so an unexpected shape loses the fee line rather than the whole list. */
function networkFeeOf(value: unknown): SpendDto["networkFee"] {
  const fee = record(value);
  if (!fee) return undefined;
  return {
    amount: optionalBaseUnits(fee.amount),
    usd: typeof fee.usd === "string" ? fee.usd : null,
    rentLamports: optionalBaseUnits(fee.rentLamports),
  };
}

export function executionPayload(response: unknown): { digest: string; rentLamports?: string } {
  const send = record(record(response)?.send);
  if (!send || typeof send.digest !== "string" || !send.digest) {
    throw new Error("Signing response is missing send.digest");
  }
  return { digest: send.digest, rentLamports: optionalBaseUnits(send.rentLamports) };
}

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
    const isNative = row.isNative === true;
    return {
      tokenId: text(row.tokenId, "vault token.tokenId"), name: text(row.name, "vault token.name"),
      symbol: text(row.symbol, "vault token.symbol"), decimals: number(row.decimals, "vault token.decimals"),
      logoURI: typeof row.logoURI === "string" ? row.logoURI : undefined,
      tokenAddress: isNative ? (typeof row.tokenAddress === "string" ? row.tokenAddress : "") : text(row.tokenAddress, "vault token.tokenAddress"),
      isNative, chainObjectId: text(row.chainObjectId, "vault token.chainObjectId"),
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
      networkFee: networkFeeOf(row.networkFee),
      txHash: row.txHash === null ? null : text(row.txHash, "spend.txHash"),
    };
  });
}
