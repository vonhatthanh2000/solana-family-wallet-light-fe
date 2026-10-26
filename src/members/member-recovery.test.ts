import { describe, expect, it } from "vitest";
import type { MemberSendDto } from "./contracts";
import { recoverMemberSend, shouldRefreshAfterMemberError } from "./member-recovery";

const send = {
  memberSendId: "send",
  chainType: "SOL",
  chainId: "devnet",
  change: "add",
  slot: 1,
  key: "key",
  targetUserId: "target",
  signerUserId: "signer",
  requestId: "request",
  status: "signing",
  txHash: null,
  send: {} as MemberSendDto["send"],
} satisfies MemberSendDto;

describe("member-send recovery", () => {
  it.each(["MEMBER_SEND_AGAIN", "MEMBER_SEND_NO_PAYLOAD", "ROSTER_CHANGED"])(
    "discards a stale payload for %s",
    (code) => expect(recoverMemberSend(send, code)).toMatchObject({ status: "ready", send: null }),
  );

  it("switches to polling when the backend says it was already sent", () => {
    expect(recoverMemberSend(send, "MEMBER_SEND_ALREADY_SENT")).toMatchObject({
      status: "submitted",
      send: null,
    });
    expect(shouldRefreshAfterMemberError("MEMBER_SEND_ALREADY_SENT")).toBe(true);
  });
});
