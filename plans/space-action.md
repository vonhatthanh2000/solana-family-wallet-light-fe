# Space frontend action integration plan

Status: source-audited frontend integration guide, 2026-10-26.

Scope: every current user-visible Family Space capability, with Solana-specific signing and
on-chain behavior called out. The backend remains the authority for permission checks; frontend
gating is for navigation and usability, not security.

## 1. Ground rules

- All routes below require the normal bearer JWT unless explicitly described as an external wallet
  transfer.
- Treat `spaceId`, user IDs and Mongo IDs as opaque strings.
- Treat blockchain amounts as strings or `bigint`; never pass them through JavaScript `number`.
- Refresh `GET /family-wallet/roles` and use its `permissions`, `countsInQuorum`, `onChainSigner`,
  `grantableViaInvite` and `grantableViaVote` fields. Roles are database-backed and the seed is not
  overwritten on deploy, so the frontend must not assume the seed is permanent. The current seed is
  documented in [`family-roles.init.ts`](../src/family-wallet/space-wallet/members/seed/family-roles.init.ts#L10)
  and the discovery endpoints are in
  [`family-wallet.controller.ts`](../src/family-wallet/space-wallet/members/family-wallet.controller.ts#L26).
- Every mutation may still return `403` after the UI enabled it. Membership, role, wallet, Vault
  scope and on-chain state can change between rendering and submission.
- A Solana device signs the **raw 32 digest bytes**, not the UTF-8 characters of the `0x...` string.
  Remove `0x`, hex-decode to 32 bytes, then call the wallet's raw Ed25519 signing method.
- A broadcast response is not final success. Poll the corresponding resource until its persisted
  status is terminal.

## 2. Current default role matrix

The canonical permission names are defined in
[`permissions.ts`](../src/family-wallet/space-wallet/members/roles/permissions.ts#L5). Render the
live registry returned by the API; the table below is only the current default seed.

| Capability | Owner | Admin | Member | Child | Viewer |
| --- | ---: | ---: | ---: | ---: | ---: |
| View Space, balances, Vaults, members and activity | yes | yes | yes | yes | yes |
| Propose external spend | yes | yes | yes | scoped Vaults only | no |
| Approve/decline requests and spends | yes | yes | yes | no | no |
| Create/update Vault | yes | yes | no | no | no |
| Manage assets, categories, Space name/photo/default rule | yes | yes | no | no | no |
| Create/revoke invites | yes | yes | no | no | no |
| Propose role/member changes | yes | yes | no | no | no |
| Transfer ownership | yes | no | no | no | no |
| Manage Solana guardian | Owner only | no | no | no | no |

Owner has every permission; Admin has every permission except `TRANSFER_OWNERSHIP`; Member has
`VIEW`, `SPEND`, and `VOTE`; Child has `VIEW` and `SPEND` but is Vault-scoped and is not an
on-chain signer; Viewer has only `VIEW`.
[`family-roles.init.ts`](../src/family-wallet/space-wallet/members/seed/family-roles.init.ts#L14)

## 3. Bootstrap and global frontend state

On authenticated app startup:

1. `GET /family-wallet/roles` — cache the active role definitions.
2. `GET /family-wallet/permissions` — optional capability vocabulary/debug view.
3. `GET /family-wallet/spaces` — returns active Spaces plus the caller's pending joins. Active
   Space rows include balance and `membershipStatus`; pending rows are not usable Spaces yet.
4. For an opened Space fetch in parallel:
   - `GET /family-wallet/spaces/:spaceId`
   - `GET /family-wallet/spaces/:spaceId/members`
   - `GET /family-wallet/spaces/:spaceId/vaults`
   - `GET /family-wallet/spaces/:spaceId/activities`
   - `GET /family-wallet/spaces/:spaceId/categories`

The Space detail includes chain deployment state and `memberChangeInProgress`; use it to disable
actions that would contend with a roster transition. Read routes and their semantics are defined in
[`space.controller.ts`](../src/family-wallet/space-wallet/api/space.controller.ts#L291) and
[`family-activity.controller.ts`](../src/family-wallet/activity/family-activity.controller.ts#L29).

## 4. Complete action inventory

### 4.1 Space lifecycle

| Action | Who | Endpoint | Frontend behavior | Chain effect |
| --- | --- | --- | --- | --- |
| Create Space | authenticated user | `POST /family-wallet/spaces` | Send `{name?, purpose, approvalRule?}`; store returned `spaceId` | Creates backend Space; ready chains include open payloads |
| Rebuild open payloads | Owner | `POST /:spaceId/open-payloads` | Use after missing wallets are fixed or deployment failed | none until submit |
| Submit multi-chain opening | Owner | `POST /:spaceId/open` | Sign each chain item using that chain wallet; poll Space detail | queues deployments |
| Build Solana activation | Owner | `POST /:spaceId/solana/activate-payload` | Raw-sign returned 32-byte `digest` | none |
| Submit Solana activation | Owner | `POST /:spaceId/solana/activate` | Send `{signature, validAfter, validUntil}` exactly from payload | queues PDA initialization |
| Poll deployment | any active member | `GET /:spaceId` | `pending` => keep polling; `failed` => Owner rebuilds payload; `isDeployed` => enable deposits/actions | read only |

Creation and activation contracts are in
[`space.controller.ts`](../src/family-wallet/space-wallet/api/space.controller.ts#L106), while the
Solana DTO requires a 64-byte hex signature and echoes the signed window in
[`space.dto.ts`](../src/family-wallet/space-wallet/api/dto/space.dto.ts#L462).

### 4.2 Read, deposit and money visibility

| Action | Who | Endpoint / wallet action | Notes |
| --- | --- | --- | --- |
| Read aggregate balances | active member | `GET /:spaceId/balance` | `partial: true` means one balance/price was unavailable; do not display missing values as zero |
| Read deposit addresses | active member | `GET /:spaceId/deposit-addresses` | Enable deposit only for deployed chain entries with a non-null address |
| Deposit SOL | anyone with funds | wallet System Program transfer to Solana Space PDA | No backend deposit POST and no family approval |
| Deposit configured SPL token | anyone with funds | wallet SPL transfer to returned Space ATA | Classic SPL only; sender may need to create/fund their own source ATA |
| Read ledger | active member | `GET /:spaceId/ledger?page=&limit=` | Scanner-derived deposit/payout history |
| Read recent activity | active member | `GET /:spaceId/activities?vaultId=` | Pending rows plus five newest settled rows |
| Read full history | active member | `GET /:spaceId/activities/history` | Supports date, Vault and category filtering |
| Read activity detail | active member | `GET /:spaceId/activities/:id` | Includes consensus, chain, tx hash, actual fee and explorer data when present |

Balances are live chain reads, while ledger and activity are indexed projections; their temporary
timing differences are expected. See
[`space.controller.ts`](../src/family-wallet/space-wallet/api/space.controller.ts#L291) and
[`family-activity.controller.ts`](../src/family-wallet/activity/family-activity.controller.ts#L32).

For Solana v1, Vault selection and spending allow native SOL plus the single
`SOLANA_USDT_MINT`; the filter is implemented in
[`vault-token.service.ts`](../src/family-wallet/vault/vault-token.service.ts#L39). Do not offer an
arbitrary token picker for Solana spending.

### 4.3 Space presentation, assets and categories

| Action | Required access | Endpoint |
| --- | --- | --- |
| Rename Space | `MANAGE_ASSETS` (default Owner/Admin) | `PATCH /:spaceId/name` with `{name}` |
| Set/replace Space photo | `MANAGE_ASSETS` | `PUT /:spaceId/photo`, multipart field `file`, jpg/png, max 5 MB |
| Remove Space photo | `MANAGE_ASSETS` | `DELETE /:spaceId/photo` |
| List asset choices | active member | `GET /:spaceId/assets` |
| Add listed asset | `MANAGE_ASSETS` | `POST /:spaceId/assets` |
| Add custom asset | `MANAGE_ASSETS` | `POST /:spaceId/assets/custom` |
| Show/hide asset | `MANAGE_ASSETS` | `PATCH /:spaceId/assets/:tokenId` |
| List categories | active member | `GET /:spaceId/categories` |
| Create/rename/delete category | `MANAGE_ASSETS` | `POST/PATCH/DELETE /:spaceId/categories...` |
| Count category usage | active member | `GET /:spaceId/categories/:id/usage` |
| Re-file any spend | `MANAGE_ASSETS` | `PATCH /:spaceId/spend/:spendId/category` |

These are backend-only product mutations; none consumes the Solana nonce. The route contracts are
in [`space-profile.controller.ts`](../src/family-wallet/space-wallet/api/profile/space-profile.controller.ts#L40),
[`space.controller.ts`](../src/family-wallet/space-wallet/api/space.controller.ts#L306), and
[`space-category.controller.ts`](../src/family-wallet/category/space-category.controller.ts#L16).

### 4.4 Vault actions

| Action | Who | Endpoint / result |
| --- | --- | --- |
| List Vaults/details/tokens | active member | `GET /:spaceId/vaults`, `GET /:vaultId`, `GET /tokens` |
| Create empty Vault | `MANAGE_VAULT` | `POST /:spaceId/vaults` with `{name, tokenId, goalAmount?, approvalRule?}` |
| Rename/change goal | `MANAGE_VAULT` | `PATCH /:vaultId` |
| Add/remove Vault album photo | any active member | multipart `POST /:vaultId/photos`; `DELETE /:vaultId/photos/:photoId` |
| Propose Vault approval-rule change | any active member | `POST /:spaceId/vaults/:vaultId/rule-change`; proposer is vote 1 |
| Withdraw own pending Vault-rule change | proposer | `DELETE /:spaceId/requests/:requestId` |
| Propose shared-wallet default-rule change | `MANAGE_ASSETS` | `POST /:spaceId/rule-change`; proposer is vote 1 |

Vault creation/update permissions are enforced in
[`vault.service.ts`](../src/family-wallet/vault/vault.service.ts#L31); Vault rule proposals
deliberately allow any active member and require a majority vote
([`vault-rule-change.service.ts`](../src/family-wallet/vault/vault-rule-change.service.ts#L34)).

#### Allocate Shared Wallet money to a Vault

1. `GET /:spaceId/vaults/:vaultId/add-money/quote?amount=<decimal>`.
2. Show `available`, source rule, `need`, `voters`, `path`, and `insufficient`.
3. Generate one UUID per user tap.
4. `POST /.../add-money` with `{amount: "150.5", clientRequestId}`.
5. Handle:
   - `MOVED`: refresh Vault/balance/activity immediately.
   - `REQUESTED`: show request approval UI and retain `request.id`.
6. If an approved request could not apply for lack of funds, proposer/Owner/Admin can retry with
   `POST /.../requests/:requestId/apply`.
7. Cancel with `DELETE /.../requests/:requestId` under the rules documented by the endpoint.

#### Move Vault money back to Shared Wallet

Use the identical flow under
`/:spaceId/vaults/:vaultId/move-to-shared`. Both directions are off-chain accounting operations and
have no blockchain network fee. Child is explicitly forbidden from moving money between envelopes.
The source rule and request behavior are defined in
[`vault-add-money.controller.ts`](../src/family-wallet/vault/vault-add-money.controller.ts#L34),
[`vault-move-to-shared.controller.ts`](../src/family-wallet/vault/vault-move-to-shared.controller.ts#L34),
and [`vault-money-request.service.ts`](../src/family-wallet/vault/vault-money-request.service.ts#L99).

### 4.5 External spending flow

#### Propose

Required: `SPEND`, an on-chain signer key, and access to the selected source. Child can spend only
from assigned Vaults and cannot propose from Shared Wallet.

`POST /family-wallet/spaces/:spaceId/spend`:

```json
{
  "chainId": "<Space Solana chainId>",
  "token": "native",
  "amount": "1000000",
  "destination": "<Solana public key>",
  "vaultId": "<optional Mongo id>",
  "categoryId": "<optional Mongo id>",
  "note": "optional, max 60 chars"
}
```

`amount` is smallest-unit integer text: lamports for SOL or mint base units for SPL. The proposer
counts as approval 1. Save the returned `spendId`, `intent.digest`, approval counts, status and
`networkFee`. Open spends reserve both the amount and, on Solana, Shared Wallet SOL fee capacity.
The DTO contract is in [`space.dto.ts`](../src/family-wallet/space-wallet/api/dto/space.dto.ts#L714)
and proposal semantics in
[`space-spend.controller.ts`](../src/family-wallet/space-wallet/api/spend/space-spend.controller.ts#L69).

#### Approve or decline

- Approve: voter raw-signs `intent.digest`, then
  `POST /:spaceId/spend/vote` with `{spendId, signature}`.
- Decline: `POST /:spaceId/spend/decline` with `{spendId}`; no wallet signature.
- The proposer cannot vote again or decline their own proposal.
- Family approvals remain off-chain, even for 100-of-100. Only the final execution signer proof is
  supplied to the Solana program.

#### Execute

Only the original proposer:

1. `POST /:spaceId/spend/execute` with `{spendId}`.
2. If `{status:"queued"}`, poll/list and retry later; another Space action owns the nonce.
3. If `{status:"signing", send}`, verify displayed fields, raw-sign `send.digest` within its
   five-minute window.
4. Repeat the same endpoint with `{spendId, signature}`.
5. A `submitted` response is broadcast only. Poll `GET /:spaceId/spend?chainId=...` and activity.
6. On `SPEND_SEND_AGAIN`, discard the old payload and request a new one. On `SPEND_SEND_RETRY`, the
   same signature may be retried within its window. Never create a second proposal merely because
   broadcast confirmation is slow.

Guarded Solana uses proposer + guardian signatures. After guardian removal, only the on-chain Owner
may execute and the instruction contains only the Owner signature. Execution behavior and retry
codes are documented in
[`space-spend.controller.ts`](../src/family-wallet/space-wallet/api/spend/space-spend.controller.ts#L208).

#### Cancel and fee preview

- `GET /:spaceId/spend/fee?chainId=...` before proposing.
- `DELETE /:spaceId/spend?spendId=...` while waiting; proposer or Owner only.

### 4.6 Invites, joins and member management

| Action | Who | Endpoint |
| --- | --- | --- |
| List roles/permissions | authenticated | `GET /family-wallet/roles`, `/permissions` |
| Preview invite | authenticated non-member allowed | `GET /family-wallet/invites/:code` |
| Join through invite | authenticated non-member | `POST /family-wallet/invites/:code/join` |
| List/cancel own pending joins | requester | `GET /family-wallet/join-requests`; `POST /family-wallet/requests/:requestId/cancel` |
| List/create/revoke invites | `VIEW` for list; `INVITE` for writes | `GET/POST/DELETE /:spaceId/invites...` |
| List approval queue | `VIEW` | `GET /:spaceId/requests?status=&vaultId=` |
| Approve/decline family request | voter (`VOTE`) | `POST /:spaceId/requests/:requestId/approve|decline` |
| Propose role change/removal | `PROPOSE_MEMBER_CHANGE` | member routes |
| Assign Child spending Vaults | default Owner/Admin | `PUT /:spaceId/members/:memberId/spending-vaults` |
| Propose ownership handover | Owner | `POST /:spaceId/members/:memberId/handover-requests` |
| Leave | any member except current Owner | `POST /:spaceId/leave` |

The member routes and descriptions are in
[`members.controller.ts`](../src/family-wallet/space-wallet/members/members.controller.ts#L66).

When approval creates an on-chain change (`AddMember`, `RemoveMember`, or `ChangeOwner`):

1. Read returned `memberSends`, or fetch `GET /:spaceId/member-sends` for rows assigned to caller.
2. `POST /:spaceId/member-sends/execute` with `{memberSendId}` to get a five-minute payload.
3. Raw-sign its Solana `send.digest` and repeat with `{memberSendId, signature}`.
4. Poll `GET /:spaceId/requests/:requestId/member-sends` until every chain is terminal.
5. Do not consider the backend member transition complete while its request is `EXECUTING`.

Member send statuses are `ready`, `signing`, `submitted`, `executed`, `failed`, defined in
[`member-send.schema.ts`](../src/family-wallet/space-wallet/execution/member-send.schema.ts#L11).

### 4.7 Solana guardian lifecycle

These controls belong in an Owner-only security screen.

| Operation | Availability | Signatures |
| --- | --- | --- |
| `rotate_guardian` | guarded Space; current configured guardian must match on-chain | Owner + current guardian |
| `propose_guardian_removal` | guarded, no removal pending | Owner only |
| `cancel_guardian_removal` | removal pending | Owner only |
| `execute-removal` | after on-chain 90-day deadline | no signed request; any authenticated caller may relay |
| `install_guardian` | unguarded Space | Owner only; installs configured backend guardian |

Signed operation flow:

1. `POST /:spaceId/solana/guardian/:operation/payload`.
   For rotation send `{targetGuardian:"<new base58 public key>"}` while the old private key remains
   configured on the backend.
2. Raw-sign response `digest` as Owner.
3. `POST /:spaceId/solana/guardian/actions/:actionId/submit` with `{signature}`.
4. Poll `GET /:spaceId/solana/guardian/actions` until `executed` or `failed`.

For due removal call `POST /:spaceId/solana/guardian/execute-removal`, then poll actions. The route
surface is in
[`sol-guardian.controller.ts`](../src/family-wallet/space-wallet/guardian/sol-guardian.controller.ts#L16)
and persisted states are `signing`, `submitted`, `executed`, `failed`
([`sol-guardian.schema.ts`](../src/family-wallet/space-wallet/guardian/sol-guardian.schema.ts#L12)).

Operational warning: rotation has a deliberate fail-closed handover window. After finalization and
before operators switch `GUARDIAN_PRIVKEY_SOL` to the new private key, guarded actions are refused.
The frontend should show rotation as incomplete until backend operations confirms the key switch.

## 5. State handling and polling

| Resource | Non-terminal states | Terminal states | Recommended reaction |
| --- | --- | --- | --- |
| Chain deploy | pending | deployed / failed | poll Space; rebuild payload on failed |
| Family request | `PENDING`, `APPROVED`, `EXECUTING` | `DONE`, `REJECTED`, `CANCELLED`, `EXPIRED`, `FAILED` | approvals act on request; `EXECUTING` waits for chain writes |
| Spend | `open`, `queued`, `signing`, `submitted` | `executed`, `stale`, `unconfirmed`, `cancelled`, `rejected` | never equate `submitted` with paid |
| Member send | `ready`, `signing`, `submitted` | `executed`, `failed` | assigned signer completes each chain row |
| Guardian action | `signing`, `submitted` | `executed`, `failed` | Owner signs; any caller can relay due removal |

The canonical request and spend state definitions are in
[`request.types.ts`](../src/family-wallet/requests/request.types.ts#L30) and
[`space-request.schema.ts`](../src/family-wallet/space-wallet/schemas/space-request.schema.ts#L8).

Suggested polling policy:

- Poll every 3–5 seconds while the relevant screen is foregrounded.
- Stop on terminal state or after a UI timeout, but retain a “Refresh status” action.
- On app resume, refetch Space detail, requests, spends, member sends and guardian actions rather
  than trusting local state.
- Serialize device signing prompts. Spend, member and guardian actions share one Solana Space nonce;
  `REQUEST_BUSY` or a queued state is expected contention, not data loss.

## 6. Error-to-UI behavior

| Error family | UI behavior |
| --- | --- |
| `ROLE_NOT_ALLOWED`, `NOT_A_MEMBER`, `VAULT_NOT_ALLOWED`, `NOT_A_SIGNER` | refresh Space/member/role state; close unauthorized sheet |
| `INVALID_SIGNATURE` | keep payload visible, explain correct wallet/account and raw digest signing |
| `REQUEST_BUSY` | keep user input and retry with backoff |
| `*_SEND_AGAIN`, expired window, nonce changed | discard signature and fetch a fresh payload |
| `*_ALREADY_SENT`, `submitted` | poll; never resubmit as a new intent |
| `INSUFFICIENT_BALANCE`, `RESERVE_TOO_LOW` | refresh balances/quote and show `available`, `needed`, `short` when returned |
| `ROSTER_CHANGED`, `SPEND_INTENT_MISMATCH`, `GUARDIAN_REFUSED` | stop signing; refresh Space and require a new flow where instructed |
| RPC/service unavailable | show unknown/unavailable, never replace balance with zero |

The detailed spend response semantics are maintained beside the endpoints in
[`space-spend.controller.ts`](../src/family-wallet/space-wallet/api/spend/space-spend.controller.ts#L69).

## 7. Recommended frontend implementation order

1. API client, bearer authentication, lossless amount helpers, error-code normalization.
2. Dynamic role registry and `can(permission)` UI helper.
3. Space list/detail, members, chain deploy status, balance, addresses, ledger and activities.
4. Solana raw-digest signing adapter with account/public-key consistency checks.
5. Deposit UI using external wallet transfers and returned PDA/ATA addresses.
6. Vault list/create/update, quotes, allocate/move flows and request states.
7. Spend proposal, approval/decline, execution signing and settlement polling.
8. Invite/join/member-change flows and member-send signing queue.
9. Profile, assets, categories, photos and rule-change flows.
10. Owner-only guardian security screen.

## 8. Current backend gaps the frontend must account for

- Automatic execution of a due 90-day guardian removal is not scheduled yet; expose the manual
  `execute-removal` action when the deadline has passed.
- There is no standalone completed Solana spend/guardian devnet E2E script yet. Treat those flows as
  integration-ready but require devnet acceptance before production release.
- Guardian controller bodies currently use inline TypeScript shapes rather than class-validator DTOs;
  frontend validation must require a non-empty signature and a valid base58 rotation target.
- Solana v1 supports native SOL and one configured classic-SPL mint, not arbitrary SPL or Token-2022.
- Indexed activity/ledger can lag live RPC balance. Use the live balance endpoint for spendability
  and activity/ledger for presentation and reconciliation.

## 9. Frontend definition of done

- UI visibility comes from the live role registry and backend permission errors are handled.
- All token values remain lossless from input through signing and display.
- Solana signing tests prove raw 32-byte digest input for activation, approvals, execution, member
  changes and guardian actions.
- Deposits use returned addresses and never call an invented backend deposit endpoint.
- Every multi-step action survives reload by restoring state from backend IDs/statuses.
- `submitted` is never displayed as final success.
- Busy/expired nonce flows refresh payloads without duplicating a spend or member request.
- Guarded and unguarded Owner-only Solana execution are both demonstrated on the intended test
  deployment.
