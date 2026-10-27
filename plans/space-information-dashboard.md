# Space information dashboard implementation plan

## Outcome

Add a clickable Space browser to the existing diagnostic frontend. After a user selects an active
Space, show a read-only dashboard with the Space identity, total and unallocated balances, token
balances by chain, vaults, deployment/deposit information, approval policy, and a concise member
summary. Keep the current create/activate/member-management workflows working with the selected
Space.

This plan does not require a backend change. The necessary authenticated endpoints already exist in
`tonpass-wallet-be`.

## Backend findings

The relevant backend module is `src/family-wallet/space-wallet/api/space.controller.ts`.

| Need | Endpoint | Important response behavior |
| --- | --- | --- |
| Space picker | `GET /family-wallet/spaces` | Returns active Spaces followed by pending joins. Active rows include `balance`; pending rows contain only limited identity/request fields. |
| Selected Space | `GET /family-wallet/spaces/:spaceId` | Returns identity, role, member count, default approval rule, chains, member-change state, and `balance`. |
| Vault cards | `GET /family-wallet/spaces/:spaceId/vaults` | Returns all vaults in creation order, including token, exact/formatted balance, optional goal, approval rule, photos, and timestamps. Active members only. |
| Deposit/deployment detail | Included in `GET /spaces/:spaceId`; optional `GET /spaces/:spaceId/deposit-addresses` | Chain rows contain address/status and deployment state/error. The deposit endpoint additionally exposes derived token deposit addresses. |
| Members | `GET /family-wallet/spaces/:spaceId/members` | Returns voter count plus active member profiles, roles, chain-pending state, and vault spending grants. |
| Future activity tab | `GET /family-wallet/spaces/:spaceId/activities` | Recent pending work plus the five newest settled activity rows. Not required for the first dashboard increment. |

Balance semantics must be preserved in the UI:

- `totalUsd` is the whole on-chain Space value.
- `unallocatedUsd` excludes vault holdings and live shared spends.
- `partial: true` means at least one balance or price was unavailable; the total is understated and
  must not be presented as exact.
- A token `amount`, `formatted`, `priceUsd`, or `valueUsd` may be `null`; null means unknown, not zero.
- `inVaultAmount`/`inVaultFormatted` and `vaultCount` explain how much of a token is earmarked.
- A vault has no independent on-chain address. Its balance is an allocation from the shared wallet,
  represented by ledger entries.

## Current frontend gap

The frontend currently has no Space-list request or clickable selection UI. `SpacePanel.tsx` only
accepts a manually entered Space ID. Once that ID changes, `useSolanaMemberFlow` loads membership
data and polls a broad collection of member-management endpoints every four seconds.

`MemberSpaceDto` and `parseMemberSpace` currently discard backend fields needed by the dashboard,
including `photo`, `defaultRule`, and the complete `balance` object. Vault endpoints have no frontend
contracts yet.

Do not add vault/balance calls to the existing four-second member polling loop. Balance reads are
cached by the backend for about a minute and vault allocation reads are separate; dashboard refresh
should be explicit and should also occur after selecting a Space.

## Proposed interface and module seam

Create a `src/spaces/` module whose public interface is small:

```ts
type SpaceDashboard = {
  space: SpaceDetailDto;
  vaults: VaultDto[];
  members: SpaceMembersDto;
};

type SpaceDashboardFlow = {
  spaces: SpaceSummaryDto[];
  selected?: SpaceDashboard;
  selectedSpaceId?: string;
  loadingList: boolean;
  loadingDetail: boolean;
  error?: DiagnosticError;
  selectSpace(spaceId: string): Promise<void>;
  refreshList(): Promise<void>;
  refreshSelected(): Promise<void>;
};
```

The implementation should hide request fan-out, stale-response protection, parsing, and error
normalization. Callers should only select or refresh. This gives the UI one deep module rather than
teaching several panels which endpoints must be combined.

Suggested files:

- `src/spaces/contracts.ts` — DTOs and strict runtime parsers.
- `src/spaces/space-api.ts` — authenticated endpoint functions.
- `src/spaces/load-space-dashboard.ts` — parallel detail/vault/member orchestration.
- `src/spaces/useSpaceDashboard.ts` — selection and loading state.
- `src/spaces/SpaceBrowserPanel.tsx` — list/picker UI.
- `src/spaces/SpaceDetailPanel.tsx` — selected Space dashboard.
- Focused `*.test.ts(x)` files beside each module.

Reuse the existing `apiRequest` transport and `normalizeError`. Move/share the existing Space parser
rather than creating a second parser that can drift from `src/members/contracts.ts`. The member flow
can continue to consume the shared Space identity type or a narrowed view of it.

## Data contracts to add

Model backend values without converting exact blockchain quantities to JavaScript numbers:

- `SpaceSummaryDto`: Space identity, membership status, pending request/status, role, member count,
  photo, chains, and optional balance.
- `SpaceDetailDto`: summary fields plus `defaultRule` and `memberChangeInProgress`.
- `SpaceBalanceDto`: `totalUsd`, `unallocatedUsd`, `partial`, and chain balances.
- `SpaceTokenBalanceDto`: nullable raw/formatted/pricing fields plus unallocated and in-vault fields.
- `VaultDto`: token metadata, string balance, optional string goal, rule, photos, and timestamps.
- `SpaceMembersDto`: `voterCount` and member rows. Keep this separate from the legacy
  `/list-members?chainId=...` response, which is Solana signing-specific.

Parser rules:

- Keep smallest-unit values and formatted decimal values as strings.
- Accept nullable balance/price fields exactly as documented.
- Treat missing `membershipStatus` as `ACTIVE` only for the single-Space response, matching current
  backend behavior; require it in list results.
- Permit the reduced pending-join shape and never fetch vault/member detail for a pending Space.
- Validate arrays and required identifiers before state is updated, so malformed payloads produce a
  visible backend diagnostic instead of a render crash.

## UI behavior

### 1. Space browser

Add a section above the current create/resume controls after API configuration succeeds:

- Load Spaces when both API URL and JWT are configured.
- Render name/photo fallback, purpose, role, member count, membership status, and total balance.
- Mark partial balances with an “Estimated / incomplete” label.
- Show pending joins as non-dashboard rows with their request status; do not request protected detail.
- Make active rows keyboard-accessible buttons with `aria-current` for the selected Space.
- Keep manual Space-ID entry as a diagnostic escape hatch.
- Provide independent empty, loading, retry, and list-error states.

### 2. Selection

On click:

1. Set the canonical selected Space ID through `flow.setSpaceId`, preserving session storage and the
   existing activation/member workflows.
2. Clear the previous dashboard immediately so data from Space A is never shown under Space B.
3. Fetch `GET /spaces/:id`, `GET /spaces/:id/vaults`, and `GET /spaces/:id/members` concurrently.
4. Ignore an older response if the user selects another Space before it completes (request sequence
   or `AbortController`).
5. Show the detail skeleton without blocking the rest of the diagnostic page.

### 3. Selected Space overview

Render in this order:

- Header: photo/name, purpose, current role, active member count, membership/member-change status.
- Balance hero: total USD, unallocated USD, and a clear partial-data warning.
- Asset groups by chain: token icon/symbol, formatted amount, USD value/change when known, allocated
  amount, and address/deployment state.
- Vault grid: cover photos/gradient, name, token, formatted balance, optional goal progress, and
  whether the vault uses the Space default rule.
- Policy/member summary: default threshold/quorum/always-ask rule, voter count, and compact member
  roles. Keep mutation controls in the existing `MemberManagementPanel`.
- Refresh button and “last refreshed” timestamp. Do not poll balance/vault data every four seconds.

Use `Intl.NumberFormat` for USD display, but preserve exact token strings. Display unknown as `—` or
“Unavailable,” never `$0`/`0`. Clamp vault goal progress visually to 100% while still showing the
actual balance and goal strings.

No router dependency is needed for this diagnostic app: use a master-detail section and keep the
selected ID in the existing session-backed flow. If shareable URLs become a requirement later, add
route state as a separate increment.

## Implementation sequence

1. **Extract and expand Space contracts.** Move the current Space types/parser into `src/spaces`, add
   balance, approval-rule, pending-row, vault, and members contracts, then update member code imports.
2. **Add read endpoints.** Implement `listSpaces`, `getSpace`, `listVaults`, and `getMembers` in
   `space-api.ts`, with encoded path parameters and runtime parsing.
3. **Build the dashboard loader.** Fetch detail/vault/member data concurrently and return one
   `SpaceDashboard`. Keep list loading separate so a detail failure does not erase the picker.
4. **Build the dashboard hook.** Load the list from configured credentials, synchronize selection
   through `setSpaceId`, protect against stale responses, and expose explicit refresh operations.
5. **Add the Space browser UI.** Render active/pending rows and selection states; retain create and
   manual resume controls.
6. **Add the detail UI.** Implement summary, balance/assets, vault cards, chains, policy, and members
   as small presentation modules fed only by parsed dashboard data.
7. **Integrate in `App.tsx`.** Instantiate the dashboard flow beside `useSolanaSpaceFlow`; make its
   selected ID the same canonical ID already passed to `useSolanaMemberFlow`.
8. **Separate refresh rates.** Leave member workflow polling unchanged initially, but ensure the new
   dashboard is selection/manual-refresh driven and does not join that interval.
9. **Polish accessibility and responsive styles.** Ensure list rows are real buttons, status is not
   color-only, long addresses wrap, and vault/asset grids collapse cleanly on narrow screens.

## Tests

### Contract tests

- Parse an active Space with complete balance, multiple chains/tokens, vault allocation fields, and
  a default rule.
- Parse a pending Space with its reduced shape.
- Preserve `null` unknown balances/prices and large integer strings.
- Reject malformed arrays, IDs, membership status, vault balances, and timestamps.

### HTTP adapter tests

- Assert exact URLs and URI encoding for list, detail, vault, and member requests.
- Assert bearer/auth behavior continues through the shared client.
- Verify backend error bodies remain available to `normalizeError`.

### Loader/hook tests

- Detail, vault, and member reads run concurrently and combine correctly.
- Pending Spaces do not trigger protected detail calls.
- Selecting B before A finishes cannot restore A into state.
- Detail refresh failure keeps the selected ID/list and exposes a retryable error.
- Credential or selected-ID changes clear stale detail.

### UI tests

- Loading, empty, active, pending, selected, partial-balance, unavailable-token, no-vault, and error
  states render correctly.
- Clicking an active Space updates the canonical Space ID and loads its dashboard.
- Clicking a pending row does not load vaults.
- Vault goal progress and default/custom-rule labels are correct.
- Keyboard selection and accessible names are present.

Run `npm test`, `npm run lint`, and `npm run build` after implementation.

## Acceptance criteria

- An authenticated user sees every Space returned by `GET /family-wallet/spaces` without manually
  copying an ID.
- Clicking an active Space selects it for the existing signing/member flows and opens its dashboard.
- The dashboard shows total/unallocated balance, per-token allocation, vaults and goals, chain/address
  state, default policy, and member summary from real backend responses.
- Unknown or partial financial data is never rendered as zero or as an exact total.
- Pending memberships are visible but do not cause active-member-only endpoint errors.
- Fast selection changes never show one Space's data under another Space's name.
- Dashboard data is not added to the existing four-second member polling loop.
- Existing create, activation, payload-signing, deployment, and member-management tests still pass.

## Later increments

After the read-only dashboard is stable, add separate tabs/modules for recent activities, full ledger
analytics, plan/stampi information, vault detail/mutations, and asset management. Those backend
interfaces already exist, but including them in the initial click-to-view slice would couple too many
independent workflows and make its loading/error interface unnecessarily wide.
