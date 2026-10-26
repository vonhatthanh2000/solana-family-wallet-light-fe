import type { MemberSendDto } from "./contracts";

const FRESH_PAYLOAD_CODES = new Set([
  "MEMBER_SEND_AGAIN",
  "MEMBER_SEND_NO_PAYLOAD",
  "ROSTER_CHANGED",
]);

export function recoverMemberSend(send: MemberSendDto, code?: string): MemberSendDto {
  if (code && FRESH_PAYLOAD_CODES.has(code)) {
    return { ...send, status: "ready", send: null };
  }
  if (code === "MEMBER_SEND_ALREADY_SENT") {
    return { ...send, status: "submitted", send: null };
  }
  return send;
}

export function shouldRefreshAfterMemberError(code?: string): boolean {
  return [
    "MEMBER_SEND_WAITING",
    "MEMBER_SEND_ALREADY_SENT",
    "ROSTER_CHANGED",
    "REQUEST_BUSY",
  ].includes(code ?? "");
}
