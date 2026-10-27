import { asRecord } from "../../api/types";

export type I18nTextDto = { key: string; params: Record<string, unknown> };
export type ActivityBadgeDto = I18nTextDto & { tone: string };
export type AmountViewDto = { value: string; decimals: number; symbol: string; sign: "+" | "-"; muted: boolean };
export type ActivityTargetDto = {
  screen: string;
  id: string;
  requestId?: string;
  spendId?: string;
  chainType?: string;
  chainId?: string;
};
export type ActivityRowDto = {
  id: string;
  kind: string;
  state: string;
  status: string;
  icon: string;
  occurredAt: string;
  amount?: AmountViewDto;
  title: I18nTextDto;
  subLine: I18nTextDto;
  badge?: ActivityBadgeDto;
  target: ActivityTargetDto | null;
};
export type ActivityListDto = { pending: ActivityRowDto[]; settled: ActivityRowDto[]; hasMore: boolean };
export type PageMetaDto = { currentPage: number; from: number; perPage: number; lastPage: number; to: number; total: number };
export type ActivityHistoryDto = { pending: ActivityRowDto[]; data: ActivityRowDto[]; meta: PageMetaDto };
export type ActivityDetailDto = ActivityRowDto & { detail: Record<string, unknown> };
export type LedgerRowDto = {
  txHash: string;
  direction: string;
  token: string;
  symbol?: string;
  decimals?: number;
  amount: string;
  fee: string | null;
  counterparty: string;
  timestamp: number;
};

const text = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a string`);
  return value;
};
const optionalText = (value: unknown, field: string) => (value === undefined || value === null ? undefined : text(value, field));
const number = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} must be a number`);
  return value;
};
const rows = (value: unknown, field: string) => {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item, index) => parseActivityRow(item, `${field}[${index}]`));
};

// The backend ships i18n keys plus free-form params; params stay untouched so activity-copy owns the wording.
function parseI18nText(value: unknown, label: string): I18nTextDto {
  const row = asRecord(value, label);
  return {
    key: text(row.key, `${label}.key`),
    params: row.params === undefined || row.params === null ? {} : asRecord(row.params, `${label}.params`),
  };
}

function parseAmountView(value: unknown, label: string): AmountViewDto {
  const row = asRecord(value, label);
  const sign = text(row.sign, `${label}.sign`);
  if (sign !== "+" && sign !== "-") throw new Error(`${label}.sign must be + or -`);
  return {
    value: text(row.value, `${label}.value`),
    decimals: number(row.decimals, `${label}.decimals`),
    symbol: text(row.symbol, `${label}.symbol`),
    sign,
    muted: row.muted === true,
  };
}

function parseTarget(value: unknown, label: string): ActivityTargetDto | null {
  if (value === null || value === undefined) return null;
  const row = asRecord(value, label);
  return {
    screen: text(row.screen, `${label}.screen`),
    id: text(row.id, `${label}.id`),
    requestId: optionalText(row.requestId, `${label}.requestId`),
    spendId: optionalText(row.spendId, `${label}.spendId`),
    chainType: optionalText(row.chainType, `${label}.chainType`),
    chainId: optionalText(row.chainId, `${label}.chainId`),
  };
}

export function parseActivityRow(value: unknown, label = "activity"): ActivityRowDto {
  const row = asRecord(value, label);
  return {
    id: text(row.id ?? row._id, `${label}.id`),
    kind: text(row.kind, `${label}.kind`),
    state: text(row.state, `${label}.state`),
    status: text(row.status, `${label}.status`),
    icon: text(row.icon, `${label}.icon`),
    occurredAt: text(row.occurredAt, `${label}.occurredAt`),
    amount: row.amount === undefined || row.amount === null ? undefined : parseAmountView(row.amount, `${label}.amount`),
    title: parseI18nText(row.title, `${label}.title`),
    subLine: parseI18nText(row.subLine, `${label}.subLine`),
    badge: row.badge === undefined || row.badge === null
      ? undefined
      : { ...parseI18nText(row.badge, `${label}.badge`), tone: text(asRecord(row.badge, `${label}.badge`).tone, `${label}.badge.tone`) },
    target: parseTarget(row.target, `${label}.target`),
  };
}

export function parseActivityList(value: unknown): ActivityListDto {
  const row = asRecord(value, "activities");
  return {
    pending: rows(row.pending, "activities.pending"),
    settled: rows(row.settled, "activities.settled"),
    hasMore: row.hasMore === true,
  };
}

export function parseActivityHistory(value: unknown): ActivityHistoryDto {
  const row = asRecord(value, "activity history");
  const meta = asRecord(row.meta, "activity history.meta");
  return {
    pending: row.pending === undefined ? [] : rows(row.pending, "activity history.pending"),
    data: rows(row.data, "activity history.data"),
    meta: {
      currentPage: number(meta.currentPage, "activity history.meta.currentPage"),
      from: number(meta.from, "activity history.meta.from"),
      perPage: number(meta.perPage, "activity history.meta.perPage"),
      lastPage: number(meta.lastPage, "activity history.meta.lastPage"),
      to: number(meta.to, "activity history.meta.to"),
      total: number(meta.total, "activity history.meta.total"),
    },
  };
}

export function parseActivityDetail(value: unknown): ActivityDetailDto {
  const row = asRecord(value, "activity detail");
  return {
    ...parseActivityRow(value, "activity detail"),
    detail: row.detail === undefined || row.detail === null ? {} : asRecord(row.detail, "activity detail.detail"),
  };
}

export function parseLedger(value: unknown): LedgerRowDto[] {
  const list = Array.isArray(value) ? value : asRecord(value, "ledger").items;
  if (!Array.isArray(list)) throw new Error("ledger response must be an array");
  return list.map((item, index) => {
    const row = asRecord(item, `ledger[${index}]`);
    return {
      txHash: text(row.txHash, `ledger[${index}].txHash`),
      direction: text(row.direction, `ledger[${index}].direction`),
      token: text(row.token, `ledger[${index}].token`),
      symbol: optionalText(row.symbol, `ledger[${index}].symbol`),
      decimals: row.decimals === undefined || row.decimals === null ? undefined : number(row.decimals, `ledger[${index}].decimals`),
      amount: text(row.amount, `ledger[${index}].amount`),
      fee: row.fee === undefined || row.fee === null ? null : text(row.fee, `ledger[${index}].fee`),
      counterparty: text(row.counterparty, `ledger[${index}].counterparty`),
      timestamp: number(row.timestamp, `ledger[${index}].timestamp`),
    };
  });
}
