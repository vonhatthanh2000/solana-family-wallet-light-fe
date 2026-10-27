import type { MemberSendDto } from "../../members/contracts";
import { sendActionLabel } from "../../members/member-view";
import type { GuardianActionDto, SpendDto } from "../actions/contracts";

export type SignatureKind = "spend-approval" | "spend-execution" | "member-send" | "guardian";

export type SignatureItem = {
  id: string;
  kind: SignatureKind;
  title: string;
  detail: string;
  // A digest the wallet signs raw; absent when the payload is fetched at signing time.
  digest?: string;
  blocked?: string;
};

type Inputs = {
  spends: readonly SpendDto[];
  guardianActions: readonly GuardianActionDto[];
  memberSends: readonly MemberSendDto[];
  actorUserId?: string;
  canVote: boolean;
  onChainSigner: boolean;
  signerAddress?: string;
};

function spendAmount(spend: SpendDto): string {
  const symbol = spend.action.token === "native" ? "lamports" : "base units";
  return `${spend.action.amount} ${symbol} to ${spend.action.destination}`;
}

// A voter still owes a signature only while the spend is open and they have neither approved nor declined.
export function awaitsMyApproval(spend: SpendDto, actorUserId: string | undefined): boolean {
  if (spend.status !== "open" || !actorUserId) return false;
  if (spend.proposedBy === actorUserId) return false;
  return !spend.approverIds.includes(actorUserId) && !spend.declinerIds.includes(actorUserId);
}

// Only the original proposer may execute, and only once the family has approved it.
export function awaitsMyExecution(spend: SpendDto, actorUserId: string | undefined): boolean {
  if (!actorUserId || spend.proposedBy !== actorUserId) return false;
  if (!spend.readyToSend) return false;
  return ["open", "queued", "signing"].includes(spend.status);
}

export function pendingSignatures({
  spends, guardianActions, memberSends, actorUserId, canVote, onChainSigner, signerAddress,
}: Inputs): SignatureItem[] {
  const noWallet = signerAddress ? undefined : "Connect the signing wallet first";
  const items: SignatureItem[] = [];

  for (const spend of spends) {
    if (canVote && onChainSigner && awaitsMyApproval(spend, actorUserId)) {
      items.push({
        id: `spend-approval:${spend.spendId}`,
        kind: "spend-approval",
        title: "Approve a spend",
        detail: `${spendAmount(spend)} · ${spend.approverIds.length} of ${spend.requiredApprovals} approved`,
        digest: spend.intent.digest,
        blocked: noWallet,
      });
    }
    if (awaitsMyExecution(spend, actorUserId)) {
      items.push({
        id: `spend-execution:${spend.spendId}`,
        kind: "spend-execution",
        title: "Sign and send an approved spend",
        detail: `${spendAmount(spend)} · the family approved it; no money has moved yet`,
        digest: spend.send?.digest,
        blocked: noWallet,
      });
    }
  }

  // Only the assigned signer can complete a member send; another member's row is not my work.
  for (const send of memberSends) {
    if (!["ready", "signing"].includes(send.status)) continue;
    if (actorUserId && send.signerUserId !== actorUserId) continue;
    items.push({
      id: `member-send:${send.memberSendId}`,
      kind: "member-send",
      title: "Sign an on-chain member change",
      detail: `${sendActionLabel(send)} on ${send.chainType} · status ${send.status}`,
      digest: send.send?.digest,
      blocked: noWallet,
    });
  }

  for (const action of guardianActions) {
    if (action.status !== "signing") continue;
    items.push({
      id: `guardian:${action.actionId}`,
      kind: "guardian",
      title: "A guardian action is waiting for its signature",
      detail: `${action.operation} · start the operation again to get a fresh payload`,
      digest: action.digest,
      blocked: noWallet,
    });
  }

  return items;
}
