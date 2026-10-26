# Solana member-change frontend demo integration

Status: implementation plan, audited against the backend and the light frontend on 2026-10-26.

Frontend repository: `/home/toncorpdev/Desktop/ton/temp/solana-family-wallet-fe`

This document extends the existing activation diagnostic frontend into a three-user demonstration
of Solana `AddMember`, `RemoveMember`, and `ChangeOwner`.

## 1. Demonstration target

The completed demo proves this sequence through public backend APIs:

```text
Owner creates Space
  -> Owner activates only Solana
  -> Owner invites Member B
  -> family approves B
  -> assigned signer signs AddMember
  -> backend guardian co-signs and relayer submits
  -> B becomes active after on-chain settlement
  -> invite and add Member C
  -> C leaves or is removed
  -> Owner hands ownership to B
```

The browser never builds or sends a Solana transaction. It signs backend-scoped messages; the
backend validates the signed fields, adds the guardian signature when required, pays as relayer,
and settles the result. Sources:
[`members.controller.ts`](../src/family-wallet/space-wallet/members/members.controller.ts),
[`member-send.service.ts`](../src/family-wallet/space-wallet/execution/member-send.service.ts), and
[`sol-member-change-payload.ts`](../src/family-wallet/space-wallet/driver/solana/sol-member-change-payload.ts).

## 2. Important findings from the current frontend

The frontend already provides useful foundations:

- API base URL and per-tab JWT configuration;
- Wallet Standard discovery and Solflare connection;
- chain and wallet-group reconciliation;
- Solana wallet registration;
- Space creation and Solana deployment polling;
- a development-only keypair signer;
- conversion of a 32-byte digest into exact bytes, Ed25519 signing, and local verification; and
- an event/debug panel.

Relevant frontend sources are
[`useSolanaSpaceFlow.ts`](../../temp/solana-family-wallet-fe/src/flow/useSolanaSpaceFlow.ts),
[`endpoints.ts`](../../temp/solana-family-wallet-fe/src/api/endpoints.ts),
[`signing.ts`](../../temp/solana-family-wallet-fe/src/solana/signing.ts), and
[`wallet-standard.ts`](../../temp/solana-family-wallet-fe/src/solana/wallet-standard.ts).

### 2.1 Signing contract

The current frontend signs the activation `digest` as 32 raw bytes. This matches the current
backend and the deployed-program instruction shape.

Current backend rules are:

| Operation | Bytes passed to wallet `signMessage` |
| --- | --- |
| Solana activation | the 32 raw bytes represented by `payload.digest` |
| Add/Remove/ChangeOwner | the 32 raw bytes represented by `send.digest` |
| Solana spend | the 32 raw bytes represented by the spend send `digest` |

For activation, `submitSol()` verifies the Owner signature over `payload.digest`, the guardian
signs that same digest, and `buildSolInitInstructions()` puts those digest bytes into the Ed25519
precompile instruction. Member changes use the same byte-level rule. Sources:
[`space-activate.service.ts`](../src/family-wallet/space-wallet/api/lifecycle/space-activate.service.ts),
[`sol-init-payload.ts`](../src/family-wallet/space-wallet/driver/solana/sol-init-payload.ts),
and [`member-send.service.ts`](../src/family-wallet/space-wallet/execution/member-send.service.ts).

Keep semantic wrappers so UI code cannot accidentally send one operation's digest as another even
though both wrappers use the same strict primitive:

```ts
signActivationDigest(payload, signer) // raw 32-byte payload.digest
signMemberDigest(send, signer)         // raw 32-byte send.digest
```

Both should delegate to the existing `signDigest32` implementation, require exactly 32 bytes, and
locally verify the returned 64-byte Ed25519 signature before submission. Do not add
`signingMessage`, `signingMessageEncoding`, or `signingMessageVersion` to the activation type; the
current backend does not return them.

The frontend currently filters Wallet Standard providers to `wallet.name === "solflare"`. Use
three Solflare browser profiles for the first demo. Supporting Phantom later only requires removing
that product-name filter after verifying its `solana:signMessage` behavior.

## 3. Test identities and browser isolation

Use three browser profiles, not three tabs in one profile:

| Browser profile | JWT | Connected Solana wallet | Initial role |
| --- | --- | --- | --- |
| Owner | User A | Wallet A | Owner |
| Member B | User B | Wallet B | outside, then Member |
| Member C | User C | Wallet C | outside, then Member |

Each profile gets isolated extension state, `sessionStorage`, JWT, and connected account. Reusing
one extension across tabs risks signing with an account selected in another tab.

Minimal wallet prerequisites:

- User A needs an active TON wallet because `POST /family-wallet/spaces` currently resolves a TON
  creator key before creating any Space. This is an application prerequisite, not a Solana program
  requirement. Source: [`space.service.ts`](../src/family-wallet/space-wallet/api/lifecycle/space.service.ts).
- A, B and C need distinct, active Solana devnet wallets registered against the Solana chain
  document ID.
- B and C do not need TON wallets when TON is not opened and Solana is the only roster-bound chain.
  A signer join requires wallets for every open or queued roster-bound chain. Source:
  [`member-join.service.ts`](../src/family-wallet/space-wallet/members/invite/member-join.service.ts).
- Do not submit the TON open payload during this Solana-only demo. Space creation may return it, but
  the frontend should call the dedicated Solana activation endpoints only.

Backend prerequisites are a running API and worker, active Solana devnet chain row, program/RPC
configuration, guardian key, and a funded relayer.

## 4. Backend state model the frontend must represent

There are two related state machines.

### Family request

```text
PENDING -> EXECUTING -> DONE
       \-> REJECTED / CANCELLED / EXPIRED / FAILED
```

`PENDING` means the family is still voting. `EXECUTING` means the vote passed but one or more chain
writes are still owed. `DONE` means every required chain change settled and the database membership
was applied. Source: [`request.types.ts`](../src/family-wallet/requests/request.types.ts).

### Per-chain member send

```text
READY -> SIGNING -> SUBMITTED -> EXECUTED
                         \-----> FAILED
```

- `READY`: the chain write exists but no current payload is issued.
- `SIGNING`: a five-minute payload exists for `signerUserId`.
- `SUBMITTED`: relayed; show the explorer link and poll.
- `EXECUTED`: on-chain state matched and settled.
- `FAILED`: terminal; show `failReason` when available.

Source: [`member-send.schema.ts`](../src/family-wallet/space-wallet/execution/member-send.schema.ts).

The UI must not mark a join, removal, or ownership change complete at approval time. It completes
only when the request reaches `DONE` and its Solana send reaches `EXECUTED`.

## 5. API contract used by the demo

All calls use the current profile's Bearer JWT.

| Purpose | Method and path | Actor |
| --- | --- | --- |
| Discover Solana chain | `GET /chain/get-chains?page=1&limit=100` | each user |
| Register connected wallet | `POST /wallets` | each user |
| Create Space | `POST /family-wallet/spaces` | A |
| Build Solana activation | `POST /family-wallet/spaces/:spaceId/solana/activate-payload` | A |
| Submit activation | `POST /family-wallet/spaces/:spaceId/solana/activate` | A |
| Poll Space/deployment | `GET /family-wallet/spaces/:spaceId` or `GET .../deposit-addresses` | A |
| Create invite | `POST /family-wallet/spaces/:spaceId/invites` | A |
| Preview invite | `GET /family-wallet/invites/:code` | B/C |
| Join | `POST /family-wallet/invites/:code/join` | B/C |
| Read pending joins | `GET /family-wallet/spaces/:spaceId/invites/:inviteId/joins` | A/B |
| Approve request | `POST /family-wallet/spaces/:spaceId/requests/:requestId/approve` | eligible voter |
| My signing jobs | `GET /family-wallet/spaces/:spaceId/member-sends` | current user |
| Get signing payload | `POST /family-wallet/spaces/:spaceId/member-sends/execute` | assigned signer |
| Submit signature | same endpoint, with `signature` | assigned signer |
| Chain progress | `GET /family-wallet/spaces/:spaceId/requests/:requestId/member-sends` | member |
| List members | `GET /family-wallet/spaces/:spaceId/list-members?chainId=:chainObjectId` | member |
| Voluntary leave | `POST /family-wallet/spaces/:spaceId/leave` | leaving user |
| Propose removal | `POST /family-wallet/spaces/:spaceId/members/:userId/removal-requests` | member |
| Propose handover | `POST /family-wallet/spaces/:spaceId/members/:userId/handover-requests` | Owner |

Controller sources:
[`space.controller.ts`](../src/family-wallet/space-wallet/api/space.controller.ts),
[`family-wallet.controller.ts`](../src/family-wallet/space-wallet/members/family-wallet.controller.ts),
[`members.controller.ts`](../src/family-wallet/space-wallet/members/members.controller.ts), and
[`invite-queue.controller.ts`](../src/family-wallet/space-wallet/members/invite/invite-queue.controller.ts).

### 5.1 Wallet registration

Select the chain by `chainType === "SOL" && network === "testnet"`; use its Mongo `_id`, not the
displayed chain number, as `chainId` in this request:

```json
{
  "chainId": "<Solana chain document _id>",
  "address": "<connected base58 public key>",
  "publicKey": "<same base58 value used by current frontend>",
  "walletIndex": 0
}
```

Before signing anything, compare the connected Wallet Standard address with the stored wallet
address. Never silently register or sign using a different selected account.

### 5.2 Invite and join

Owner creates a signer-role invite:

```http
POST /family-wallet/spaces/:spaceId/invites
Content-Type: application/json

{"role":"MEMBER"}
```

The response contains `id` (the invite ID) and `code`. Send only the code/link to the joiner.
The joiner's `POST /family-wallet/invites/:code/join` returns `{requestId, status}`. Joining twice
returns the same open request, so the button is naturally retry-safe. Sources:
[`member-invite.service.ts`](../src/family-wallet/space-wallet/members/invite/member-invite.service.ts)
and [`member-join.service.ts`](../src/family-wallet/space-wallet/members/invite/member-join.service.ts).

### 5.3 Voting

Do not hard-code “two votes.” Render these response fields:

- `status`;
- `need`;
- `seals`;
- `eligibleVoters`; and
- `memberSends` when approval creates the chain work.

Enable Approve only when the request is `PENDING`, the current user is in `eligibleVoters`, and the
current user is not already in `seals`. Refresh after every approval. This prevents the observed
`This request is no longer open` error when a second approval is sent after the first one already
reached quorum.

### 5.4 Two-call member-send protocol

First request the payload:

```http
POST /family-wallet/spaces/:spaceId/member-sends/execute
Content-Type: application/json

{"memberSendId":"<id>"}
```

For SOL, the returned `send` contains:

```ts
type SolMemberSendPayload = {
  chainType: "SOL";
  digest: `0x${string}`;       // exactly 32 bytes; sign these raw bytes
  requestBoc: string;          // base64 borsh request; display/debug only
  signed: {
    programId: string;
    networkId: number;
    space: string;
    nonce: string;
    validAfter: number;
    validUntil: number;
    maxRefundLamports: string; // "0" for member changes
    action: {
      kind: "add" | "remove" | "change_owner";
      key: string;
    };
  };
};
```

Sign and submit:

```ts
const bytes = hexToBytes32(row.send.digest);
const signature = await signer.signDigest32(bytes);

await post(`/family-wallet/spaces/${spaceId}/member-sends/execute`, {
  memberSendId: row.memberSendId,
  signature: bytesToHex(signature),
});
```

Do not sign `requestBoc`, the JSON under `signed`, or the UTF-8 characters of the digest. Locally
verify the 64-byte Ed25519 signature over the 32 digest bytes before submission, as the current
frontend already does.

Also validate before opening the wallet:

- `row.chainType === "SOL"`;
- `row.signerUserId` belongs to the current JWT user;
- connected address equals the current user's stored Solana address;
- `signed.programId`, `signed.space`, action and key are visibly shown;
- current time is inside the signed window with a 15-second safety margin; and
- `digest` is canonical 32-byte hex.

## 6. Frontend design

Keep the existing application as a diagnostic tool and add a second top-level flow after
deployment rather than rewriting the activation reducer.

Suggested structure:

```text
src/
  api/
    endpoints.ts                 add invite/request/member-send calls
    types.ts                     add request/member DTOs and SOL payload parser
  solana/
    signing.ts                   shared strict digest signer + operation wrappers
  members/
    MemberDemoPanel.tsx          orchestration shell
    InvitePanel.tsx              create/copy/preview/join
    ApprovalPanel.tsx            request state and vote actions
    MemberSendPanel.tsx          payload inspection, signing, submission
    MemberListPanel.tsx          settled roles and wallet addresses
    member-flow.ts               pure UI state derivation
    member-flow.test.ts
  flow/
    useSolanaMemberFlow.ts       API effects and polling
```

Do not put the three users into one React state tree. Each browser profile represents exactly one
authenticated actor. Exchange only `spaceId`, invite code, invite ID and request ID through copy
buttons.

### UI rules

- Always show `current user/JWT label`, connected wallet address, and stored wallet address.
- Show a red blocking mismatch before any signing button.
- Show action details in human form: “Add wallet X”, “Remove wallet X”, or “Make wallet X Owner.”
- Treat the backend's `signerUserId` as authoritative; do not guess which voter signs.
- Show one green check per completed step and one red line with HTTP status/code/message on failure.
- Disable duplicate actions while a request is in flight.
- Poll request chain progress every 3–5 seconds while `EXECUTING` or a send is `SUBMITTED`.
- Stop polling at `DONE`/`EXECUTED`/`FAILED`, and provide a manual Refresh button.

## 7. Implementation plan

### Phase 0 — preserve and reuse strict digest signing

- Keep `SolanaOpenPayload.digest` as canonical lowercase, `0x`-prefixed 32-byte hex.
- Reuse `hexToBytes32`, `ConnectedSigner.signDigest32`, and local Ed25519 verification.
- Add semantic `signActivationDigest` and `signMemberDigest` wrappers over the same primitive.
- Do not introduce a UTF-8 envelope or sign the displayed hex characters.
- Add tests proving activation and member changes each pass exactly 32 raw bytes to the wallet.

### Phase 1 — API types and endpoints

- Add types for invite, request, member, member-send, submitted-send, and SOL signed fields.
- Add runtime parsers at the signing boundary; do not trust `Record<string, unknown>`.
- Add all endpoints from §5.
- Preserve `ApiError` status/code/body logging.

### Phase 2 — three-session invite and approval UI

- Add Space ID import/copy controls available to all profiles.
- Owner can create and copy a MEMBER invite.
- Outside user can preview and join using the code.
- Members can list requests and approve only while eligible.
- Drive the UI from returned `need`, `seals`, `eligibleVoters`, and `status`.

### Phase 3 — member-send signing and settlement

- List `GET .../member-sends` for the logged-in user.
- Request a fresh payload without a signature.
- Display every signed field and validate connected/stored wallet equality.
- Sign the raw digest, locally verify it, then submit it.
- Show transaction signature and a devnet explorer link.
- Poll chain progress until `EXECUTED`, then refresh member/request lists.

### Phase 4 — removal and ownership controls

- Add voluntary Leave for B or C.
- Add voted removal by selecting a member `userId`.
- Add Owner-only handover targeting B.
- Reuse the exact same member-send component for all three action variants.
- After settlement, assert roles/membership in the member list rather than optimistically changing
  local UI state.

### Phase 5 — demo hardening

- Persist only API URL, JWT, Space ID and useful copied IDs in `sessionStorage`.
- Never persist signatures or secret keys.
- Add bounded polling and manual recovery.
- Add a “Reset profile session” action that does not mutate backend state.
- Keep the development keypair signer behind `import.meta.env.DEV`.

## 8. Recovery behavior

| Backend result | Frontend response |
| --- | --- |
| `INVALID_SIGNATURE` | discard signature; verify wallet and signed byte mode |
| `MEMBER_SEND_AGAIN` | discard payload/signature and request a fresh payload |
| `MEMBER_SEND_WAITING` | retain job; refresh after another chain action settles |
| `MEMBER_SEND_NO_PAYLOAD` | call execute without signature first |
| `MEMBER_SEND_ALREADY_SENT` | stop submitting and poll chain progress |
| `MEMBER_SEND_RETRY` | reuse the same signature only while the displayed window remains valid |
| `ROSTER_CHANGED` | refresh wallets, members and job; do not retry old signature |
| `REQUEST_BUSY` | short backoff, then refresh before retrying |
| `GUARDIAN_REFUSED` | terminal for the current request; show backend reason |
| “request is no longer open” | refresh; do not issue another approval |

The execute endpoint's documented error contract is in
[`members.controller.ts`](../src/family-wallet/space-wallet/members/members.controller.ts).

## 9. Demonstration runbook

1. Open Profile A, enter JWT A, connect Wallet A, and reconcile/register it.
2. Create the Space. The prepared active TON wallet satisfies creation; do not open TON.
3. Load the dedicated Solana activation payload, sign its raw 32-byte `digest`, submit, and wait
   for `isDeployed`.
4. Open Profiles B and C, enter their JWTs, connect and register Wallets B and C.
5. A creates a MEMBER invite and copies the code to B.
6. B previews and joins. A refreshes pending joins and approves. If the response still says
   `PENDING`, another eligible voter approves; otherwise stop voting.
7. The profile named by `signerUserId` loads its member-send payload, checks `action.kind === "add"`,
   signs the raw digest, and submits it.
8. All profiles poll until the request is `DONE`; verify B appears as ACTIVE and the SOL send is
   `EXECUTED`.
9. Repeat for C. This gives three on-chain members.
10. C calls Leave, signs their `remove` job when assigned, and waits for settlement.
11. Add C again if needed, then demonstrate voted removal.
12. A proposes handover to B. Approve according to returned quorum; A signs the
    `change_owner` payload. Verify B becomes Owner and A becomes Admin only after settlement.

For a compact presentation, show three browser windows side by side and keep the debug panel open.

## 10. Acceptance checklist

- [ ] Activation signs exactly 32 raw digest bytes and deploys successfully.
- [ ] Member changes sign exactly 32 raw digest bytes.
- [ ] Three profiles use three JWTs and three distinct Solana addresses.
- [ ] B and C can register Solana wallets without creating TON wallets.
- [ ] AddMember reaches `EXECUTED` and the join reaches `DONE`.
- [ ] The UI never asks a non-`signerUserId` user to sign.
- [ ] Duplicate approval is disabled after quorum.
- [ ] Voluntary RemoveMember reaches `EXECUTED`.
- [ ] Voted RemoveMember reaches `EXECUTED`.
- [ ] ChangeOwner settles before frontend roles change.
- [ ] A stale five-minute payload is discarded and refreshed.
- [ ] Wallet switching invalidates any loaded payload/signature.
- [ ] Every submitted transaction has a clickable Solana devnet explorer link.

## 11. Recommended tests

Unit tests:

- activation and member helpers both pass exactly 32 raw digest bytes;
- 32-byte digest and 64-byte signature validation;
- SOL member payload runtime parsing;
- approval-button derivation from status/eligibility/seals;
- signing disabled on wallet mismatch or near-expiry;
- state mapping for every request and member-send status; and
- error-to-recovery mapping in §8.

Component tests:

- assigned signer sees the Sign button; other users do not;
- action details render Add/Remove/ChangeOwner correctly;
- a successful submit switches to transaction/polling state; and
- `EXECUTED` triggers member/request refresh.

Manual devnet acceptance remains necessary because the backend guardian, relayer, worker, deployed
program, account rent, and final settlement cannot be proven by frontend unit tests.
