import { describe, expect, it } from "vitest";
import type { MemberSendDto } from "../../members/contracts";
import type { GuardianActionDto, SpendDto } from "../actions/contracts";
import { awaitsMyApproval, awaitsMyExecution, pendingSignatures } from "./signature-queue";

const spend: SpendDto = {
  spendId: "spend-1", chainType: "SOL", chainId: "devnet", status: "open", proposedBy: "proposer",
  action: { token: "native", amount: "1000000", destination: "DestinationPubkey" },
  intent: { digest: `0x${"11".repeat(32)}`, signed: {} },
  note: null, categoryId: null, vaultId: null, requiredApprovals: 2,
  approverIds: ["proposer"], declinerIds: [], readyToSend: false, send: null, txHash: null,
};

const memberSend: MemberSendDto = {
  memberSendId: "send-1", chainType: "SOL", chainId: "devnet", change: "add", slot: 1, key: "k",
  targetUserId: "6adecd9d8d5315639d25a8a8", signerUserId: "voter", requestId: "req-1",
  status: "ready", txHash: null, send: null,
};

const base = {
  spends: [] as SpendDto[],
  guardianActions: [] as GuardianActionDto[],
  memberSends: [] as MemberSendDto[],
  actorUserId: "voter",
  canVote: true,
  onChainSigner: true,
  signerAddress: "VoterWallet",
};

describe("awaitsMyApproval", () => {
  it("asks a voter who has not yet decided", () => {
    expect(awaitsMyApproval(spend, "voter")).toBe(true);
  });

  it("never asks the proposer, who already counts as approval one", () => {
    expect(awaitsMyApproval(spend, "proposer")).toBe(false);
  });

  it("stops asking once the voter approved or declined", () => {
    expect(awaitsMyApproval({ ...spend, approverIds: ["proposer", "voter"] }, "voter")).toBe(false);
    expect(awaitsMyApproval({ ...spend, declinerIds: ["voter"] }, "voter")).toBe(false);
  });

  it("stops asking once the spend is no longer open", () => {
    expect(awaitsMyApproval({ ...spend, status: "submitted" }, "voter")).toBe(false);
  });
});

describe("awaitsMyExecution", () => {
  it("asks only the proposer, and only once the family approved it", () => {
    const ready = { ...spend, readyToSend: true, send: { digest: `0x${"22".repeat(32)}`, signed: {} } };
    expect(awaitsMyExecution(ready, "proposer")).toBe(true);
    expect(awaitsMyExecution(ready, "voter")).toBe(false);
    expect(awaitsMyExecution(spend, "proposer")).toBe(false);
  });

  it("stops asking once the spend reached a terminal state", () => {
    expect(awaitsMyExecution({ ...spend, readyToSend: true, status: "executed" }, "proposer")).toBe(false);
  });
});

describe("pendingSignatures", () => {
  it("is empty when nothing is waiting for this member", () => {
    expect(pendingSignatures(base)).toEqual([]);
  });

  it("lists a spend approval with the raw intent digest the wallet signs", () => {
    const [item] = pendingSignatures({ ...base, spends: [spend] });
    expect(item!.kind).toBe("spend-approval");
    expect(item!.digest).toBe(spend.intent.digest);
    expect(item!.detail).toContain("1000000 lamports to DestinationPubkey");
    expect(item!.detail).toContain("1 of 2 approved");
  });

  it("does not ask a member whose role cannot vote or sign on chain", () => {
    expect(pendingSignatures({ ...base, spends: [spend], canVote: false })).toEqual([]);
    expect(pendingSignatures({ ...base, spends: [spend], onChainSigner: false })).toEqual([]);
  });

  it("asks the proposer to sign the send digest of an approved spend", () => {
    const [item] = pendingSignatures({
      ...base,
      actorUserId: "proposer",
      spends: [{ ...spend, readyToSend: true, send: { digest: `0x${"22".repeat(32)}`, signed: {} } }],
    });
    expect(item!.kind).toBe("spend-execution");
    expect(item!.digest).toBe(`0x${"22".repeat(32)}`);
  });

  it("lists only the member sends assigned to this signer", () => {
    const items = pendingSignatures({
      ...base,
      memberSends: [memberSend, { ...memberSend, memberSendId: "send-2", signerUserId: "someone-else" }],
    });
    expect(items).toHaveLength(1);
    expect(items[0]!.id).toBe("member-send:send-1");
    expect(items[0]!.detail).toContain("on SOL");
  });

  it("ignores a member send that already reached the chain", () => {
    expect(pendingSignatures({ ...base, memberSends: [{ ...memberSend, status: "executed" }] })).toEqual([]);
  });

  it("flags a guardian action stuck in signing without offering a stale digest to sign", () => {
    const [item] = pendingSignatures({
      ...base,
      guardianActions: [{ actionId: "g-1", operation: "rotate_guardian", status: "signing", digest: "0xabcd" }],
    });
    expect(item!.kind).toBe("guardian");
    expect(item!.detail).toContain("fresh payload");
  });

  it("explains that the wallet is missing instead of offering a dead button", () => {
    const [item] = pendingSignatures({ ...base, spends: [spend], signerAddress: undefined });
    expect(item!.blocked).toBe("Connect the signing wallet first");
  });
});
