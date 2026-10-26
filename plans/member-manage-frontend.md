# Member-management diagnostic frontend plan

Status: proposed implementation plan based on `plans/member-manage.md` and the current frontend on
2026-10-26.

## 1. Goal

Extend the existing Solana activation diagnostic app so three independently authenticated browser
profiles can prove the complete member lifecycle against the real backend:

```text
create + activate Space
  -> invite B
  -> B joins
  -> eligible users approve
  -> assigned signer signs AddMember
  -> backend relays and settles
  -> repeat for C
  -> leave/remove C
  -> transfer ownership from A to B
```

This is a testing frontend, not a wallet or transaction builder. It displays backend state, signs
only backend-issued 32-byte Solana digests, submits signatures, and waits for authoritative
settlement.

## 2. Product constraints

- One browser profile represents one authenticated actor. Do not model A, B, and C in one React
  session.
- Each profile owns one JWT, one Solflare extension state, and one connected Solana account.
- Share only `spaceId`, invite code, invite ID, and request ID using copy/import controls.
- Continue using the current activation flow; member management begins after a Space ID is known.
- Never construct, sign, or send a Solana transaction in the browser.
- Never optimistically change membership or roles. Only backend `DONE` plus chain `EXECUTED` is
  complete.
- Never persist signatures, payloads, secret keys, or mnemonic material.

## 3. Phase 0: close contract gaps

Implementation must not begin with guessed DTOs. Capture redacted real responses or backend
fixtures for every endpoint in `plans/member-manage.md`, especially:

- invite creation and preview;
- join and pending-join listing;
- approval responses;
- current user's member-send list;
- execute-without-signature response;
- execute-with-signature response;
- request member-send progress;
- member listing;
- leave, removal-request, and handover-request responses.

Resolve these two blocking interface questions:

1. **Current user identity:** document the authoritative user ID source. Prefer an existing
   authenticated profile endpoint. A documented JWT subject claim may be decoded for display, but
   the frontend must not invent or trust an undocumented claim.
2. **Parent request refresh:** identify the endpoint that returns the latest request status,
   `need`, `seals`, and `eligibleVoters` for a known request ID. The supplied endpoint table has
   mutation and chain-progress routes, but no unambiguous request-status read route.

Phase 0 exits when every response has a fixture and both interfaces are confirmed.

## 4. Architecture

Keep the activation module intact and add one deep member-management module behind this interface:

```ts
type MemberCommand =
  | { type: "refresh" }
  | { type: "set-space"; spaceId: string }
  | { type: "create-invite" }
  | { type: "preview-invite"; code: string }
  | { type: "join"; code: string }
  | { type: "approve"; requestId: string }
  | { type: "prepare-send"; memberSendId: string }
  | { type: "sign-and-submit"; memberSendId: string }
  | { type: "leave" }
  | { type: "request-removal"; userId: string }
  | { type: "request-handover"; userId: string };

type MemberFlow = {
  view: MemberView;
  execute(command: MemberCommand): Promise<void>;
};
```

`useSolanaMemberFlow` is the React-facing adapter. Its implementation hides request sequencing,
polling, payload freshness, wallet checks, recovery rules, and refresh fan-out. UI panels render
`MemberView` and emit commands; they do not call HTTP endpoints or wallets directly.

### 4.1 Backend seam

The backend is remote but owned, so define a `MemberApi` port inside the member module. Provide:

- `HttpMemberApi`, backed by the existing `apiRequest`; and
- `ScenarioMemberApi`, an in-memory adapter used by flow and UI tests.

The scenario adapter should model the observable states needed by tests, not reproduce backend
business logic. It should support deterministic transitions such as `PENDING -> EXECUTING -> DONE`
and `SIGNING -> SUBMITTED -> EXECUTED`, plus configured error responses.

### 4.2 Signer seam

Reuse the existing `ConnectedSigner` interface. Add a semantic member wrapper:

```ts
signMemberDigest(payload, signer, nowSeconds): Promise<string>
```

It must:

- parse canonical lowercase `0x`-prefixed 32-byte digest hex;
- ensure the current actor is `signerUserId`;
- ensure connected and stored addresses match;
- apply the 15-second expiry margin;
- pass exactly 32 bytes to `signDigest32`;
- require a 64-byte Ed25519 signature;
- verify the signature locally; and
- return lowercase hex without a prefix, matching activation submission.

### 4.3 Clock seam

Inject `nowSeconds()` into the member-flow implementation. Production uses wall-clock time; tests
use a fixed clock. This makes five-minute payload expiry and retry behavior deterministic.

## 5. Proposed source layout

```text
src/
  api/
    endpoints.ts                         add member HTTP adapter calls
    types.ts                             shared transport types only
    member-contracts.ts                  runtime parsers for untrusted responses
    member-contracts.test.ts
  members/
    member-api.ts                        MemberApi port
    http-member-api.ts                   production adapter
    scenario-member-api.ts               deterministic test adapter
    member-flow.ts                       reducer, guards, polling and recovery
    member-flow.test.ts
    member-signing.ts                    strict semantic signing wrapper
    member-signing.test.ts
    useSolanaMemberFlow.ts               React adapter
    MemberDemoPanel.tsx                  orchestration shell
    InvitePanel.tsx
    ApprovalPanel.tsx
    MemberSendPanel.tsx
    MemberListPanel.tsx
```

Keep transport parsing separate from `api/types.ts` once member DTOs grow; this prevents the
existing activation types file from becoming the knowledge surface for the entire backend.

## 6. Member view model

Expose UI-ready state rather than raw DTOs:

```ts
type MemberView = {
  actor: {
    userId?: string;
    label: string;
    connectedAddress?: string;
    storedAddress?: string;
    walletMismatch?: string;
  };
  spaceId: string;
  invite?: InviteView;
  request?: RequestView;
  jobs: MemberSendView[];
  members: MemberViewRow[];
  busyCommand?: MemberCommand["type"];
  polling: boolean;
  error?: DiagnosticError;
};
```

Derived controls belong in the flow implementation:

- `canApprove` is true only for `PENDING`, eligible, and not already sealed;
- `canPrepare` is true only for a SOL job assigned to the current user;
- `canSign` additionally requires a fresh payload and wallet equality;
- `canRemove` excludes invalid or already-removed targets;
- `canHandover` requires current settled Owner status;
- action labels are derived from `add`, `remove`, or `change_owner` signed fields.

## 7. Runtime contract parsing

Parse every response used for control flow. At minimum validate:

- enum statuses and action kinds;
- IDs and addresses as non-empty strings;
- integer timestamps and `validUntil > validAfter`;
- canonical 32-byte digest hex;
- SOL `chainType` before exposing a signing control;
- signed `programId`, `space`, `nonce`, key, and refund amount;
- arrays for `seals`, `eligibleVoters`, members, and sends; and
- transaction signature before generating an explorer link.

Malformed data must produce a client diagnostic error and must never open Solflare.

## 8. UI composition

Add a **Members** section below the existing activation/deployment panels. Keep it visible when a
Space ID has been imported even if the current profile did not create the Space.

### Session banner

Always show actor label/user ID, Space ID, connected address, stored address, and current settled
role. A mismatch is a blocking red banner.

### Invite panel

- Owner: create and copy a `MEMBER` invite.
- Joiner: paste code, preview, then join.
- Show invite ID, code, expiration/status, and returned request ID.

### Approval panel

- Display `status`, `need`, seals count/list, and eligible voters.
- Disable approval immediately after quorum or after the current actor seals.
- Refresh the request after every approval response.

### Member-send panel

- List only jobs returned for the current authenticated user.
- Show state, assigned signer, signed action fields, validity window, and digest.
- Separate **Load fresh payload** from **Sign and submit**.
- Clear loaded payload/signature whenever wallet, Space, job, roster, or signed fields change.
- For `SUBMITTED`, show the transaction signature and Solana devnet explorer link.

### Member list and controls

- Render backend-settled role, status, user ID, and SOL address.
- Provide Leave for the current eligible actor.
- Provide removal controls to eligible members.
- Provide handover only to the settled Owner.

## 9. Polling and recovery

Use one polling owner inside `member-flow.ts`; panels must not create timers.

- Poll every 4 seconds while the parent request is `EXECUTING` or a send is `SUBMITTED`.
- Refresh parent request, per-chain sends, current-user jobs, and members as one reconciliation.
- Stop at `DONE`, `REJECTED`, `CANCELLED`, `EXPIRED`, `FAILED`, or when every relevant send is
  `EXECUTED`/`FAILED`.
- Bound automatic polling to five minutes, then show manual Refresh.
- Cancel timers on Space/JWT changes and component disposal.

Encode backend recovery as data, not scattered catch statements:

| Code/result | Frontend recovery |
| --- | --- |
| `INVALID_SIGNATURE` | clear signature; retain fields for inspection |
| `MEMBER_SEND_AGAIN` | clear payload/signature; request a fresh payload |
| `MEMBER_SEND_WAITING` | retain job; refresh progress |
| `MEMBER_SEND_NO_PAYLOAD` | prepare the job without a signature |
| `MEMBER_SEND_ALREADY_SENT` | stop submission and poll |
| `MEMBER_SEND_RETRY` | retry only if digest/window/job are unchanged and still safe |
| `ROSTER_CHANGED` | clear payload/signature and reconcile all state |
| `REQUEST_BUSY` | one short backoff, then refresh before enabling retry |
| `GUARDIAN_REFUSED` | terminal display; no automatic retry |
| request no longer open | refresh and disable approval |

## 10. Implementation phases

### Phase 1 — contracts and fake scenario

- Complete Phase 0 fixtures and unanswered interfaces.
- Add runtime parsers and endpoint contract tests.
- Implement `MemberApi`, `HttpMemberApi`, and `ScenarioMemberApi`.
- Create a scripted A/B/C happy-path scenario for UI development without chain settlement.

Exit: every endpoint has a typed, parsed fixture; the fake scenario can advance through add,
remove, and handover states deterministically.

### Phase 2 — identity, Space import, invite, and join

- Add actor/session banner and reusable Space ID import/copy control.
- Implement invite create/copy/preview/join.
- Persist only actor label, API URL, JWT, Space ID, and copied IDs in `sessionStorage`.

Exit: separate profiles can exchange an invite code and both display the same request ID.

### Phase 3 — voting

- Render request quorum from backend fields.
- Implement eligibility and duplicate-seal guards.
- Refresh after every mutation.

Exit: the UI cannot issue a second invalid approval after quorum and shows `EXECUTING` distinctly
from `DONE`.

### Phase 4 — member-send signing

- Add SOL member payload parser and `signMemberDigest`.
- Add prepare, inspect, sign, local verify, and submit controls.
- Invalidate signing state on wallet/account/payload changes.

Exit: tests prove Solflare receives exactly the 32 digest bytes, and only `signerUserId` can open
the signing prompt.

### Phase 5 — settlement and member list

- Add bounded polling, transaction links, and settled-member refresh.
- Stop polling on terminal states and expose manual recovery.

Exit: AddMember is shown complete only when request `DONE`, SOL send `EXECUTED`, and the member
appears in the settled list.

### Phase 6 — removal and ownership

- Add voluntary leave, voted removal, and owner handover commands.
- Reuse the same member-send pipeline for all action variants.

Exit: remove and change-owner scenarios pass against the in-memory adapter and real devnet.

### Phase 7 — demo hardening

- Add reset-current-profile action that only clears browser session state.
- Verify redaction of JWT and sensitive headers in debug events.
- Add empty/loading/error states and prevent duplicate in-flight commands.
- Document the three-profile runbook beside the UI.

## 11. Test strategy

Test through the member-flow interface using `ScenarioMemberApi`, a fake signer, and a fixed clock.
Avoid duplicating tests for internal reducer branches once interface-level scenarios cover them.

Required automated scenarios:

1. Invite -> join -> quorum -> AddMember -> submitted -> executed -> done.
2. Non-eligible and already-sealed actors cannot approve.
3. Non-assigned actors cannot prepare or sign a send.
4. Wallet mismatch, malformed digest, stale window, and transformed signature all block submit.
5. Wallet switching clears the loaded member payload and signature.
6. Duplicate clicks produce one mutation.
7. Every recovery mapping in Section 9 produces the expected next action.
8. Leave and voted removal settle before a member disappears.
9. Handover settles before Owner/Admin roles change.
10. Polling stops at every terminal parent/send state and at its time bound.

Keep endpoint tests at the HTTP adapter seam to verify paths, methods, bodies, parsing, and error
propagation. Manual devnet acceptance remains required for guardian co-signing, relayer behavior,
program execution, RPC timing, and worker settlement.

## 12. Final acceptance run

Use three browser profiles with three JWTs and three distinct funded Solflare devnet accounts:

1. A creates and activates the Space on Solana.
2. B and C independently register their SOL wallets.
3. Add B and wait for request `DONE` plus SOL `EXECUTED`.
4. Add C and verify three settled members.
5. C leaves and signs when assigned; verify removal settles.
6. Re-add C, then demonstrate voted removal.
7. A proposes handover to B; approve/sign as directed by backend.
8. Verify B becomes Owner and A becomes Admin only after settlement.
9. Confirm every transaction link opens on the configured Solana cluster explorer.

The feature is complete only when the full sequence succeeds through public backend interfaces and
the UI never signs for the wrong actor, wallet, digest, or validity window.
