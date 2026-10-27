import { describe, expect, it } from "vitest";
import {
  activityText, badgeText, formatAmountView, formatBaseUnits, hasActivityCopy, memberName,
} from "./activity-copy";

const minho = { id: "6adecd9d8d5315639d25a8a8", name: "Minho", isYou: false };
const viewer = { id: "6adecd9d8d5315639d25a8a8", name: "Minho", isYou: true };

describe("memberName", () => {
  it("addresses the viewer as You instead of by name", () => {
    expect(memberName(viewer)).toBe("You");
    expect(memberName(minho)).toBe("Minho");
  });

  it("falls back to a shortened id when the backend has no name", () => {
    expect(memberName({ id: "6adecd9d8d5315639d25a8a8", name: "", isYou: false })).toBe("6adecd…a8a8");
  });
});

describe("activityText", () => {
  it("renders every key the backend can send for a shared-wallet activity row", () => {
    expect(activityText({ key: "noti.family.spend_request.title", params: { actor: minho } }))
      .toBe("Minho asked to send money");
    expect(activityText({ key: "noti.family.money_in.title", params: { envelope: { type: "vault", id: "v1", name: "Holiday" } } }))
      .toBe("Money added to the Holiday vault");
    expect(activityText({ key: "noti.family.money_out.title", params: { source: { type: "shared_wallet" } } }))
      .toBe("Money sent from the Shared Wallet");
    expect(activityText({ key: "noti.family.common.by", params: { actor: viewer } })).toBe("By You");
  });

  it("names the vault and the family variants of a rule-change request apart", () => {
    expect(activityText({ key: "noti.family.rule_change_request.title_vault", params: { actor: minho, vault: { type: "vault", name: "Holiday" } } }))
      .toBe("Minho asked to change the approval rule for the Holiday vault");
    expect(activityText({ key: "noti.family.rule_change_request.title_family", params: { actor: minho } }))
      .toBe("Minho asked to change the Shared Wallet approval rule");
  });

  it("summarizes a proposed approval rule without losing the threshold text", () => {
    expect(activityText({
      key: "noti.family.rule_change_request.sub",
      params: { rule: { alwaysAsk: false, thresholdUsd: "200", quorumPct: 50, mustInclude: [minho, viewer] } },
    })).toBe("Proposed rule: ask above $200 · 50% quorum · must include Minho and You");
  });

  it("turns a raw intent into a readable request phrase", () => {
    expect(activityText({ key: "noti.family.request_rejected.title", params: { actor: minho, intent: "remove_member" } }))
      .toBe("Minho’s request to remove a member was rejected");
    expect(activityText({ key: "noti.family.request_cancelled.title_other", params: { actor: viewer, proposer: minho, intent: "send_money" } }))
      .toBe("You cancelled Minho’s request to send money");
  });

  it("reads the category of a spend sub-line, defaulting to Others", () => {
    expect(activityText({ key: "noti.family.common.from_for", params: { source: { type: "shared_wallet" }, category: { key: "others" } } }))
      .toBe("From the Shared Wallet · Others");
    expect(activityText({ key: "noti.family.common.from_for", params: { source: { type: "shared_wallet" }, category: { name: "Groceries" } } }))
      .toBe("From the Shared Wallet · Groceries");
  });

  it("reads an unknown key as a sentence instead of leaking a raw key", () => {
    expect(hasActivityCopy("noti.family.brand_new.title")).toBe(false);
    expect(activityText({ key: "noti.family.brand_new.title", params: {} })).toBe("Brand new title");
  });

  it("renders nothing for a missing text block", () => {
    expect(activityText(undefined)).toBe("");
  });
});

describe("badgeText", () => {
  it("counts approvals and declines on an open request", () => {
    expect(badgeText({ key: "noti.family.badge.approved_count", params: { v: 1, n: 3 }, tone: "amber" }))
      .toBe("1 of 3 approved");
    expect(badgeText({ key: "noti.family.badge.approved_count", params: { v: 1, n: 3, declined: 1 }, tone: "amber" }))
      .toBe("1 of 3 approved · 1 declined");
  });

  it("names who the request is still waiting for", () => {
    expect(badgeText({ key: "noti.family.badge.waiting_named", params: { v: 1, n: 2, names: [minho] }, tone: "amber" }))
      .toBe("1 of 2 approved · waiting for Minho");
    expect(badgeText({ key: "noti.family.badge.waiting_send", params: { v: 2, n: 2, names: [viewer] }, tone: "amber" }))
      .toBe("Approved · waiting for You to send");
  });

  it("labels the terminal badges", () => {
    expect(badgeText({ key: "noti.family.badge.failed", params: {}, tone: "red" })).toBe("Failed");
    expect(badgeText({ key: "noti.family.badge.expired", params: {}, tone: "grey" })).toBe("Expired");
    expect(badgeText({ key: "noti.family.badge.rejected_count", params: { declined: 2, n: 3 }, tone: "red" })).toBe("2 of 3 declined");
  });
});

describe("formatAmountView", () => {
  it("keeps a smallest-unit amount lossless through display", () => {
    expect(formatAmountView({ value: "45000000", decimals: 6, symbol: "USDT", sign: "-", muted: true }))
      .toBe("-45 USDT");
    expect(formatAmountView({ value: "1", decimals: 9, symbol: "SOL", sign: "+", muted: false }))
      .toBe("+0.000000001 SOL");
  });

  it("does not round an amount past the precision JavaScript numbers hold", () => {
    expect(formatBaseUnits("900719925474099312345", 9)).toBe("900719925474.099312345");
  });

  it("shows the raw value when the backend sends something that is not an integer", () => {
    expect(formatBaseUnits("not-a-number", 9)).toBe("not-a-number");
  });
});
