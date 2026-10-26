export type RequestStatus =
  | "PENDING"
  | "APPROVED"
  | "EXECUTING"
  | "DONE"
  | "REJECTED"
  | "CANCELLED"
  | "EXPIRED"
  | "FAILED";

export type MemberChange = "add" | "remove" | "change_owner";
export type MemberSendStatus = "ready" | "signing" | "submitted" | "executed" | "failed";

export type SolMemberSendPayload = {
  chainType: "SOL";
  digest: `0x${string}`;
  requestBoc: string;
  signed: {
    programId: string;
    networkId: number;
    space: string;
    nonce: string;
    validAfter: number;
    validUntil: number;
    maxRefundLamports: string;
    action: {
      kind: MemberChange;
      key: string;
    };
  };
};

export type MemberSendDto = {
  memberSendId: string;
  chainType: string;
  chainId: string;
  change: MemberChange;
  slot: number;
  key: string;
  targetUserId: string;
  signerUserId: string;
  requestId: string;
  status: MemberSendStatus;
  txHash: string | null;
  send: SolMemberSendPayload | null;
};

export type MemberRequestDto = {
  id: string;
  spaceId: string;
  kind: string;
  status: RequestStatus;
  proposerUserId: string;
  targetUserId?: string;
  payload: Record<string, unknown>;
  seals: string[];
  declines: string[];
  need: number;
  eligibleVoters: string[];
  expiresAt: string;
  memberSends: MemberSendDto[];
  joinCount?: number;
};

export type SpaceInviteDto = {
  id: string;
  spaceId: string;
  code: string;
  role: string;
  status: "OPEN" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdBy: string;
};

export type InvitePreviewDto = {
  spaceId: string;
  name: string;
  purpose: string;
  memberCount: number;
  role: string;
  expiresAt: string;
  status: "OPEN" | "REVOKED" | "EXPIRED";
  alreadyMember: boolean;
  requestId?: string;
  owner?: Record<string, unknown>;
};

export type JoinResultDto = { requestId: string; status: RequestStatus };

export type SpaceMemberDto = {
  userId: string;
  role: string;
  status: "ACTIVE" | "LEFT" | "REMOVED";
  slot?: number;
  profile: {
    displayName?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    avatar?: string;
  };
  wallet: { address: string; publicKey?: string; chainId: string } | null;
};

export type SubmittedMemberSendDto = {
  memberSendId: string;
  txHash: string;
  status: "submitted";
};

export type MemberSpaceDto = {
  spaceId: string;
  name: string;
  purpose: string;
  role: string;
  memberCount: number;
  membershipStatus: "ACTIVE" | "PENDING";
  memberChangeInProgress: boolean;
  chains: Array<{
    chainObjectId: string;
    chainId: string;
    chainType: string;
    address: string | null;
    isDeployed: boolean;
    status?: string;
  }>;
};

export type FamilyRoleDto = {
  key: string;
  permissions: string[];
  countsInQuorum: boolean;
  onChainSigner: boolean;
  singleHolder: boolean;
  labels: Record<string, string>;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a string`);
  return value;
}

function integer(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
  return value;
}

function textArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item, index) => text(item, `${field}[${index}]`));
}

const requestStatuses = new Set<RequestStatus>([
  "PENDING", "APPROVED", "EXECUTING", "DONE", "REJECTED", "CANCELLED", "EXPIRED", "FAILED",
]);
const sendStatuses = new Set<MemberSendStatus>([
  "ready", "signing", "submitted", "executed", "failed",
]);
const changes = new Set<MemberChange>(["add", "remove", "change_owner"]);

function enumeration<T extends string>(value: unknown, values: Set<T>, field: string): T {
  const candidate = text(value, field) as T;
  if (!values.has(candidate)) throw new Error(`${field} has unsupported value ${candidate}`);
  return candidate;
}

export function parseSolMemberSendPayload(value: unknown): SolMemberSendPayload {
  const input = record(value, "member send payload");
  if (input.chainType !== "SOL") throw new Error("member send payload chainType must be SOL");
  const digest = text(input.digest, "send.digest");
  if (!/^0x[0-9a-f]{64}$/.test(digest)) {
    throw new Error("send.digest must be canonical lowercase 32-byte hex");
  }
  const signed = record(input.signed, "send.signed");
  const action = record(signed.action, "send.signed.action");
  const validAfter = integer(signed.validAfter, "send.signed.validAfter");
  const validUntil = integer(signed.validUntil, "send.signed.validUntil");
  if (validUntil <= validAfter) throw new Error("member send validity window is invalid");
  return {
    chainType: "SOL",
    digest: digest as `0x${string}`,
    requestBoc: text(input.requestBoc, "send.requestBoc"),
    signed: {
      programId: text(signed.programId, "send.signed.programId"),
      networkId: integer(signed.networkId, "send.signed.networkId"),
      space: text(signed.space, "send.signed.space"),
      nonce: text(signed.nonce, "send.signed.nonce"),
      validAfter,
      validUntil,
      maxRefundLamports: text(signed.maxRefundLamports, "send.signed.maxRefundLamports"),
      action: {
        kind: enumeration(action.kind, changes, "send.signed.action.kind"),
        key: text(action.key, "send.signed.action.key"),
      },
    },
  };
}

export function parseMemberSend(value: unknown): MemberSendDto {
  const input = record(value, "member send");
  const chainType = text(input.chainType, "memberSend.chainType");
  const send = input.send === null || input.send === undefined
    ? null
    : chainType === "SOL"
      ? parseSolMemberSendPayload(input.send)
      : null;
  return {
    memberSendId: text(input.memberSendId, "memberSend.memberSendId"),
    chainType,
    chainId: text(input.chainId, "memberSend.chainId"),
    change: enumeration(input.change, changes, "memberSend.change"),
    slot: integer(input.slot, "memberSend.slot"),
    key: text(input.key, "memberSend.key"),
    targetUserId: text(input.targetUserId, "memberSend.targetUserId"),
    signerUserId: text(input.signerUserId, "memberSend.signerUserId"),
    requestId: text(input.requestId, "memberSend.requestId"),
    status: enumeration(input.status, sendStatuses, "memberSend.status"),
    txHash: input.txHash === null || input.txHash === undefined
      ? null
      : text(input.txHash, "memberSend.txHash"),
    send,
  };
}

export function parseMemberRequest(value: unknown): MemberRequestDto {
  const input = record(value, "member request");
  const memberSends = input.memberSends === undefined
    ? []
    : Array.isArray(input.memberSends)
      ? input.memberSends.map(parseMemberSend)
      : (() => { throw new Error("request.memberSends must be an array"); })();
  return {
    id: text(input.id, "request.id"),
    spaceId: text(input.spaceId, "request.spaceId"),
    kind: text(input.kind, "request.kind"),
    status: input.kind === "INVITE_LINK"
      ? "PENDING"
      : enumeration(input.status, requestStatuses, "request.status"),
    proposerUserId: text(input.proposerUserId, "request.proposerUserId"),
    targetUserId: input.targetUserId === undefined
      ? undefined
      : text(input.targetUserId, "request.targetUserId"),
    payload: record(input.payload, "request.payload"),
    seals: textArray(input.seals, "request.seals"),
    declines: textArray(input.declines, "request.declines"),
    need: integer(input.need, "request.need"),
    eligibleVoters: textArray(input.eligibleVoters, "request.eligibleVoters"),
    expiresAt: text(input.expiresAt, "request.expiresAt"),
    memberSends,
    joinCount: input.joinCount === undefined ? undefined : integer(input.joinCount, "joinCount"),
  };
}

export function parseMemberRequests(value: unknown): MemberRequestDto[] {
  if (!Array.isArray(value)) throw new Error("member requests response must be an array");
  return value.map(parseMemberRequest);
}

export function parseSpaceInvite(value: unknown): SpaceInviteDto {
  const input = record(value, "invite");
  const status = text(input.status, "invite.status");
  if (!["OPEN", "REVOKED", "EXPIRED"].includes(status)) throw new Error("invalid invite status");
  return {
    id: text(input.id, "invite.id"),
    spaceId: text(input.spaceId, "invite.spaceId"),
    code: text(input.code, "invite.code"),
    role: text(input.role, "invite.role"),
    status: status as SpaceInviteDto["status"],
    expiresAt: text(input.expiresAt, "invite.expiresAt"),
    createdBy: text(input.createdBy, "invite.createdBy"),
  };
}

export function parseSpaceInvites(value: unknown): SpaceInviteDto[] {
  if (!Array.isArray(value)) throw new Error("invites response must be an array");
  return value.map(parseSpaceInvite);
}

export function parseInvitePreview(value: unknown): InvitePreviewDto {
  const input = record(value, "invite preview");
  const status = text(input.status, "invite.status");
  if (!["OPEN", "REVOKED", "EXPIRED"].includes(status)) throw new Error("invalid invite status");
  return {
    spaceId: text(input.spaceId, "invite.spaceId"),
    name: text(input.name, "invite.name"),
    purpose: text(input.purpose, "invite.purpose"),
    memberCount: integer(input.memberCount, "invite.memberCount"),
    role: text(input.role, "invite.role"),
    expiresAt: text(input.expiresAt, "invite.expiresAt"),
    status: status as InvitePreviewDto["status"],
    alreadyMember: Boolean(input.alreadyMember),
    requestId: input.requestId === undefined ? undefined : text(input.requestId, "invite.requestId"),
    owner: input.owner === undefined ? undefined : record(input.owner, "invite.owner"),
  };
}

export function parseJoinResult(value: unknown): JoinResultDto {
  const input = record(value, "join result");
  return {
    requestId: text(input.requestId, "join.requestId"),
    status: enumeration(input.status, requestStatuses, "join.status"),
  };
}

export function parseSpaceMember(value: unknown): SpaceMemberDto {
  const input = record(value, "member");
  const profile = record(input.profile, "member.profile");
  const status = text(input.status, "member.status");
  if (!["ACTIVE", "LEFT", "REMOVED"].includes(status)) throw new Error("invalid member status");
  const wallet = input.wallet === null || input.wallet === undefined
    ? null
    : record(input.wallet, "member.wallet");
  return {
    userId: text(input.userId, "member.userId"),
    role: text(input.role, "member.role"),
    status: status as SpaceMemberDto["status"],
    slot: input.slot === undefined ? undefined : integer(input.slot, "member.slot"),
    profile: Object.fromEntries(
      ["displayName", "firstName", "lastName", "username", "avatar"]
        .filter((key) => typeof profile[key] === "string")
        .map((key) => [key, profile[key]]),
    ),
    wallet: wallet ? {
      address: text(wallet.address, "member.wallet.address"),
      publicKey: wallet.publicKey === undefined ? undefined : text(wallet.publicKey, "member.wallet.publicKey"),
      chainId: text(wallet.chainId, "member.wallet.chainId"),
    } : null,
  };
}

export function parseSpaceMembers(value: unknown): SpaceMemberDto[] {
  if (!Array.isArray(value)) throw new Error("members response must be an array");
  return value.map(parseSpaceMember);
}

export function parseSubmittedMemberSend(value: unknown): SubmittedMemberSendDto {
  const input = record(value, "submitted member send");
  if (input.status !== "submitted") throw new Error("member send was not submitted");
  return {
    memberSendId: text(input.memberSendId, "memberSendId"),
    txHash: text(input.txHash, "txHash"),
    status: "submitted",
  };
}

export function parseMemberSpace(value: unknown): MemberSpaceDto {
  const input = record(value, "space");
  if (!Array.isArray(input.chains)) throw new Error("space.chains must be an array");
  // GET /spaces/:spaceId is active-member-only but currently omits the documented
  // membershipStatus field. Treat that response as ACTIVE; list responses still parse it.
  const membershipStatus = input.membershipStatus === undefined
    ? "ACTIVE"
    : text(input.membershipStatus, "space.membershipStatus");
  if (!["ACTIVE", "PENDING"].includes(membershipStatus)) {
    throw new Error("space.membershipStatus is invalid");
  }
  return {
    spaceId: text(input.spaceId, "space.spaceId"),
    name: text(input.name, "space.name"),
    purpose: text(input.purpose, "space.purpose"),
    role: text(input.role, "space.role"),
    memberCount: integer(input.memberCount, "space.memberCount"),
    membershipStatus: membershipStatus as MemberSpaceDto["membershipStatus"],
    memberChangeInProgress: input.memberChangeInProgress === true,
    chains: input.chains.map((value, index) => {
      const chain = record(value, `space.chains[${index}]`);
      return {
        chainObjectId: text(chain.chainObjectId, `space.chains[${index}].chainObjectId`),
        chainId: text(chain.chainId, `space.chains[${index}].chainId`),
        chainType: text(chain.chainType, `space.chains[${index}].chainType`),
        address: chain.address === null || chain.address === undefined
          ? null
          : text(chain.address, `space.chains[${index}].address`),
        isDeployed: chain.isDeployed === true,
        status: chain.status === undefined ? undefined : text(chain.status, `space.chains[${index}].status`),
      };
    }),
  };
}

export function parseFamilyRoles(value: unknown): FamilyRoleDto[] {
  if (!Array.isArray(value)) throw new Error("roles response must be an array");
  return value.map((entry, index) => {
    const input = record(entry, `roles[${index}]`);
    const labels = input.labels === undefined ? {} : record(input.labels, `roles[${index}].labels`);
    return {
      key: text(input.key, `roles[${index}].key`),
      permissions: textArray(input.permissions, `roles[${index}].permissions`),
      countsInQuorum: input.countsInQuorum === true,
      onChainSigner: input.onChainSigner === true,
      singleHolder: input.singleHolder === true,
      labels: Object.fromEntries(
        Object.entries(labels).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      ),
    };
  });
}
