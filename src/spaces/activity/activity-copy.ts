import { baseUnitsToDecimal } from "../deposits";
import type { ActivityBadgeDto, AmountViewDto, I18nTextDto } from "./contracts";

// The backend ships only i18n keys and params (noti.family.*); the client owns every translation and
// a published key is never renamed, so this table is the English surface for activity rows.
type Params = Record<string, unknown>;

const record = (value: unknown): Params | undefined => (
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Params : undefined
);

export function memberName(value: unknown): string {
  const row = record(value);
  if (!row) return "Someone";
  if (row.isYou === true) return "You";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (name) return name;
  const id = typeof row.id === "string" ? row.id : "";
  return id ? `${id.slice(0, 6)}…${id.slice(-4)}` : "Someone";
}

export function envelopeName(value: unknown): string {
  const row = record(value);
  if (!row) return "the Shared Wallet";
  if (row.type !== "vault") return "the Shared Wallet";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  return name ? `the ${name} vault` : "a vault";
}

export function categoryName(value: unknown): string {
  const row = record(value);
  if (!row) return "Others";
  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (name) return name;
  return row.key === "others" || row.key === undefined ? "Others" : String(row.key);
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Owner", ADMIN: "Admin", MEMBER: "Member", CHILD: "Child", VIEWER: "Viewer",
};

export function roleName(value: unknown): string {
  const key = typeof value === "string" ? value : "";
  if (!key) return "a member";
  return ROLE_LABELS[key] ?? key;
}

const INTENT_PHRASES: Record<string, string> = {
  send_money: "send money",
  change_rule: "change an approval rule",
  join: "join this Space",
  change_role: "change a member role",
  remove_member: "remove a member",
  hand_over: "hand over ownership",
};

export function intentPhrase(value: unknown): string {
  const key = typeof value === "string" ? value : "";
  return INTENT_PHRASES[key] ?? "make a change";
}

export function ruleSummary(value: unknown): string {
  const row = record(value);
  if (!row) return "a new approval rule";
  const threshold = row.alwaysAsk === true || typeof row.thresholdUsd !== "string"
    ? "always ask"
    : `ask above $${row.thresholdUsd}`;
  const quorum = typeof row.quorumPct === "number" ? `${row.quorumPct}% quorum` : "the same quorum";
  const named = Array.isArray(row.mustInclude) && row.mustInclude.length
    ? ` · must include ${listOf(row.mustInclude.map(memberName))}`
    : "";
  return `${threshold} · ${quorum}${named}`;
}

export function listOf(items: string[]): string {
  if (!items.length) return "nobody";
  if (items.length === 1) return items[0]!;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]!}`;
}

const members = (value: unknown): string => listOf(Array.isArray(value) ? value.map(memberName) : []);
const envelopes = (value: unknown): string => listOf(Array.isArray(value) ? value.map(envelopeName) : []);
const plain = (value: unknown, fallback: string): string => (
  typeof value === "string" && value.trim() ? value : typeof value === "number" ? String(value) : fallback
);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
const spaceName = (params: Params): string => plain(params.space, "this Space");

// "{Actor}'s request to {intent}" — the backend hands over the raw intent so the client picks the phrasing.
const requestOf = (params: Params): string => `${memberName(params.actor)}’s request to ${intentPhrase(params.intent)}`;

const P = "noti.family";

const ACTIVITY_COPY: Record<string, (params: Params) => string> = {
  [`${P}.spend_request.title`]: (p) => `${memberName(p.actor)} asked to send money`,
  [`${P}.rule_change_request.title_vault`]: (p) => `${memberName(p.actor)} asked to change the approval rule for ${envelopeName(p.vault)}`,
  [`${P}.rule_change_request.title_family`]: (p) => `${memberName(p.actor)} asked to change the Shared Wallet approval rule`,
  [`${P}.rule_change_request.sub`]: (p) => `Proposed rule: ${ruleSummary(p.rule)}`,
  [`${P}.join_request.title`]: (p) => `${memberName(p.actor)} asked to join ${spaceName(p)}`,
  [`${P}.join_request.sub`]: (p) => `Joining as ${roleName(p.role)}`,
  [`${P}.spend_expired.title`]: (p) => `${memberName(p.actor)}’s spend request expired`,
  [`${P}.money_in.title`]: (p) => `Money added to ${envelopeName(p.envelope)}`,
  [`${P}.money_out.title`]: (p) => `Money sent from ${envelopeName(p.source)}`,
  [`${P}.rule_changed.title_vault`]: (p) => `Approval rule changed for ${envelopeName(p.vault)}`,
  [`${P}.rule_changed.title_shared`]: () => "Shared Wallet approval rule changed",
  [`${P}.stamps_bought.title`]: (p) => `${count(p.count)} stamp${count(p.count) === 1 ? "" : "s"} bought`,
  [`${P}.member_joined.title`]: (p) => `${memberName(p.actor)} joined ${spaceName(p)}`,
  [`${P}.member_joined.sub`]: (p) => `Now a ${roleName(p.role)}`,
  [`${P}.member_left.title`]: (p) => `${memberName(p.actor)} left ${spaceName(p)}`,
  [`${P}.member_left.sub`]: (p) => `Was a ${roleName(p.role)} in ${spaceName(p)}`,
  [`${P}.role_change_request.title`]: (p) => `${memberName(p.actor)} asked to make ${memberName(p.name)} ${roleName(p.role)}`,
  [`${P}.role_change_request.sub`]: () => "Needs more than half of the voters",
  [`${P}.role_changed.title`]: (p) => `${memberName(p.name)} is now ${roleName(p.role)}`,
  [`${P}.role_changed.sub`]: (p) => `Proposed by ${memberName(p.actor)}`,
  [`${P}.removal_request.title`]: (p) => `${memberName(p.actor)} asked to remove ${memberName(p.name)}`,
  [`${P}.removal_request.sub`]: () => "Needs more than half of the voters",
  [`${P}.member_removed.title`]: (p) => `${memberName(p.name)} was removed`,
  [`${P}.member_removed.sub`]: (p) => `Proposed by ${memberName(p.actor)}`,
  [`${P}.handover_request.title`]: (p) => `${memberName(p.actor)} asked to hand ownership to ${memberName(p.name)}`,
  [`${P}.handover_request.sub`]: (p) => `Ownership would move from ${memberName(p.actor)} to ${memberName(p.name)}`,
  [`${P}.ownership_handed_over.title`]: (p) => `${memberName(p.actor)} handed ownership to ${memberName(p.name)}`,
  [`${P}.ownership_handed_over.sub`]: (p) => `${memberName(p.name)} is now the Owner`,
  [`${P}.spending_vaults.title_set`]: (p) => `${memberName(p.actor)} set ${memberName(p.name)}’s spending to ${envelopes(p.vaults)}`,
  [`${P}.spending_vaults.title_emptied`]: (p) => `${memberName(p.actor)} cleared ${memberName(p.name)}’s spending vaults`,
  [`${P}.spending_vaults.sub`]: () => "A Child can spend only from assigned vaults",
  [`${P}.space_profile.title_renamed`]: (p) => `${memberName(p.actor)} renamed this Space to ${spaceName(p)}`,
  [`${P}.space_profile.title_photo`]: (p) => `${memberName(p.actor)} changed the Space photo`,
  [`${P}.space_profile.sub`]: () => "Space profile updated",
  [`${P}.plan.title_upgraded`]: (p) => `${memberName(p.actor)} upgraded ${spaceName(p)} to ${plain(p.plan, "a new plan")}`,
  [`${P}.plan.sub_upgraded`]: (p) => planTerm(p),
  [`${P}.plan.title_renewed`]: (p) => `${memberName(p.actor)} renewed ${plain(p.plan, "the plan")}`,
  [`${P}.plan.sub_renewed`]: (p) => (typeof p.price === "string" ? `${planTerm(p)} · $${p.price}/month` : planTerm(p)),
  [`${P}.plan.title_ended`]: (p) => `${plain(p.plan, "The plan")} ended`,
  [`${P}.plan.sub_ended`]: (p) => `Now on ${plain(p.next, "the free plan")}`,
  [`${P}.plan.sub_ended_over_limit`]: (p) => `Now on ${plain(p.next, "the free plan")} and over its limit`,
  [`${P}.request_rejected.title`]: (p) => `${requestOf(p)} was rejected`,
  [`${P}.request_cancelled.title_self`]: (p) => `${memberName(p.actor)} cancelled their request to ${intentPhrase(p.intent)}`,
  [`${P}.request_cancelled.title_other`]: (p) => `${memberName(p.actor)} cancelled ${memberName(p.proposer)}’s request to ${intentPhrase(p.intent)}`,
  [`${P}.request_cancelled.title_auto`]: (p) => `${requestOf(p)} was closed`,
  [`${P}.request_closed.sub`]: (p) => `In ${spaceName(p)}`,
  [`${P}.common.from_for`]: (p) => `From ${envelopeName(p.source)} · ${categoryName(p.category)}`,
  [`${P}.common.from_to_shared`]: (p) => `From ${envelopeName(p.source)} to the Shared Wallet`,
  [`${P}.common.from_to`]: (p) => `From ${envelopeName(p.source)} to ${envelopeName(p.destination)}`,
  [`${P}.common.by`]: (p) => `By ${memberName(p.actor)}`,
  [`${P}.badge.approved_count`]: (p) => `${count(p.v)} of ${count(p.n)} approved${count(p.declined) ? ` · ${count(p.declined)} declined` : ""}`,
  [`${P}.badge.waiting_named`]: (p) => `${count(p.v)} of ${count(p.n)} approved · waiting for ${members(p.names)}`,
  [`${P}.badge.waiting_owner_admin`]: (p) => `${count(p.v)} of ${count(p.n)} approved · waiting for an Owner or Admin`,
  [`${P}.badge.waiting_send`]: (p) => `Approved · waiting for ${members(p.names)} to send`,
  [`${P}.badge.paused_no_stamps`]: () => "Paused: no stamps left",
  [`${P}.badge.in_progress`]: () => "In progress",
  [`${P}.badge.failed`]: () => "Failed",
  [`${P}.badge.expired`]: () => "Expired",
  [`${P}.badge.rejected_count`]: (p) => `${count(p.declined)} of ${count(p.n)} declined`,
  [`${P}.badge.rejected_required`]: () => "Declined by a required approver",
  [`${P}.badge.rejected_revoked`]: () => "The invite was revoked",
  [`${P}.badge.cancelled`]: () => "Cancelled",
};

function planTerm(params: Params): string {
  const months = count(params.months);
  const free = count(params.freeMonths);
  const term = months ? `${months} month${months === 1 ? "" : "s"}` : "the current term";
  const bonus = free ? ` plus ${free} free` : "";
  const ends = typeof params.date === "string" ? ` · ends ${params.date}` : "";
  return `${term}${bonus}${ends}`;
}

// An unknown key must still read as a sentence, so fall back to the key's own words.
function fallbackCopy(key: string): string {
  const tail = key.split(".").slice(-2).join(" ").replace(/_/g, " ").trim();
  if (!tail) return key;
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

export function activityText(value: I18nTextDto | undefined): string {
  if (!value) return "";
  const template = ACTIVITY_COPY[value.key];
  return template ? template(value.params) : fallbackCopy(value.key);
}

export function badgeText(value: ActivityBadgeDto | undefined): string {
  return activityText(value);
}

export function hasActivityCopy(key: string): boolean {
  return key in ACTIVITY_COPY;
}

// Amounts stay lossless, and a row must still render when the backend sends something unexpected.
export function formatAmountView(amount: AmountViewDto): string {
  return `${amount.sign}${formatBaseUnits(amount.value, amount.decimals)} ${amount.symbol}`;
}

export function formatBaseUnits(value: string, decimals: number): string {
  try {
    return baseUnitsToDecimal(value, decimals);
  } catch {
    return value;
  }
}
