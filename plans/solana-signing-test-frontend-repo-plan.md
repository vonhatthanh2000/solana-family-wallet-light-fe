# Solana signing test frontend — technical implementation plan

Status: implementation plan for a new, deliberately small repository.

Related backend guide:
[`space-create-e2e-frontend-implementation.md`](./space-create-e2e-frontend-implementation.md).

## 1. Objective

Build a minimal browser application that proves the backend's Solana Create Space flow end to end:

```text
paste backend URL and JWT
  -> connect Phantom
  -> find Solana Devnet chain metadata
  -> register the connected public address
  -> create a Space
  -> receive the backend's 32-byte digest
  -> sign those exact bytes with the connected Solana wallet
  -> submit the signature
  -> poll until the backend verifies the Space PDA is deployed
```

The application is a diagnostic tool, not a production wallet UI. It should expose each step and
its raw request/response so backend failures are easy to locate.

## 2. Scope

### In scope

- React + TypeScript single-page application.
- Manually entered backend base URL and Bearer JWT.
- Phantom browser-extension connection through its injected provider.
- Solana Devnet chain discovery.
- Existing wallet-group selection.
- Solana wallet registration through `POST /wallets`.
- Family Space creation.
- Solana initialization-payload extraction or refresh.
- Exact raw-digest Ed25519 signing.
- Local signature verification before submission.
- Dedicated Solana activation endpoint.
- Deployment-state polling.
- Raw JSON/debug event log.
- Small unit-test suite for the signing and serialization boundaries.

### Out of scope

- Login, Telegram authentication, or token refresh.
- TON wallet generation, registration, or signing.
- EVM, TON, Tron, or Bitcoin activation.
- Member invitation or a second member.
- Solana transaction construction or submission.
- Direct Solana RPC reads.
- Guardian or relayer keys.
- Mobile deep links.
- Production styling, routing, analytics, localization, or responsive polish.
- Global state libraries such as Redux.

## 3. Required backend preconditions

The test client focuses only on Solana, but the current backend still requires an active TON wallet
with a verified public key before it will create a Space. Prepare one test user outside this repo:

- obtain a valid JWT for the test user;
- ensure that user has a wallet group, normally `walletIndex: 0`;
- ensure the same group already has an active TON testnet wallet with a verified public key;
- set `FAMILY_SPACE_NETWORK=testnet`;
- set metadata `FLAT / DEFAULT_NETWORK` to `testnet` so `/chain/get-chains` exposes Devnet;
- ensure the active Solana testnet chain row exists (`chainType: SOL`, stored `chainId: "67"`);
- configure the Solana program id, guardian key, funded relayer key, and Space/relayer RPCs; and
- run the common worker that owns the deployment schedule.

Changing `DEFAULT_NETWORK` to `testnet` makes `/chain/get-chains` return both mainnet and testnet
rows. The client must explicitly choose `chainType === "SOL" && network === "testnet"`; it must not
select the first Solana row.

The chain-list endpoint formats stored `chainId: "67"` as `"0x67"`. Select by `chainType`,
`network`, and `_id`, not by a hard-coded formatted chain id.

## 4. Technical choices

### Application framework

Use a Vite React TypeScript application:

```bash
npm create vite@latest solana-space-signing-test -- --template react-ts
```

Use a current Node version accepted by Vite. At the time this plan was written, Vite documents
Node 20.19+ or 22.12+ in its [official setup guide](https://vite.dev/guide/).

### Wallet integration

Use Phantom's injected `window.phantom.solana` provider for version one of this test tool. Phantom's
[official integration guide](https://docs.phantom.com/solana/integrating-phantom) explicitly supports
direct injected-provider integration, and its
[message-signing guide](https://docs.phantom.com/solana/signing-a-message) documents Ed25519
`signMessage` over a supplied `Uint8Array`.

Why direct integration is preferred here:

- only one test wallet is required;
- no transaction or RPC provider is required;
- it avoids a large multi-wallet adapter dependency tree; and
- it makes the raw bytes passed to `signMessage` easy to inspect.

Keep Phantom behind a local `SolanaSigner` interface. A later multi-wallet version can replace only
the provider module with Solana Wallet Adapter or Wallet Standard. Message signing is optional in
wallet-adapter APIs, so any later implementation must still feature-detect it.

### Dependencies

Runtime:

```text
react
react-dom
tweetnacl
```

Development:

```text
typescript
vite
@vitejs/plugin-react
vitest
eslint
```

Do not add Axios; native `fetch` is sufficient. Do not add a Solana RPC SDK for the first version.
The injected provider supplies the connected public-key bytes, and this app never creates a
transaction or queries the chain directly.

`tweetnacl` is used only to verify the returned Ed25519 signature locally before sending it to the
backend. That check makes a prefixed or otherwise transformed wallet signature fail immediately at
the client boundary.

## 5. Repository structure

```text
solana-space-signing-test/
├── .env.example
├── .gitignore
├── README.md
├── package.json
├── tsconfig.json
├── vite.config.ts
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── styles.css
    ├── api/
    │   ├── client.ts
    │   ├── endpoints.ts
    │   └── types.ts
    ├── solana/
    │   ├── phantom.ts
    │   ├── signing.ts
    │   └── signing.test.ts
    ├── flow/
    │   ├── state.ts
    │   └── useSolanaSpaceFlow.ts
    └── components/
        ├── ConfigurationPanel.tsx
        ├── WalletPanel.tsx
        ├── SpacePanel.tsx
        ├── PayloadPanel.tsx
        ├── DeploymentPanel.tsx
        └── DebugLog.tsx
```

This is intentionally shallow. Do not introduce routing or a design-system directory.

## 6. Environment and runtime configuration

`.env.example`:

```dotenv
VITE_API_BASE_URL=http://localhost:3000
VITE_EXPECTED_NETWORK=testnet
```

Do not put a JWT in `.env`. Add a password-style text input and keep the token in React state or
`sessionStorage`. Never store it in source control or `localStorage`.

The configuration panel contains:

- backend base URL;
- JWT;
- expected network, fixed to `testnet` by default;
- “Test API” button; and
- “Clear session” button.

The backend must allow the Vite development origin, normally `http://localhost:5173`, through CORS.

## 7. Data contracts

Define local types instead of generating them from the current OpenAPI document. The backend DTOs
do not yet describe the create `initialize` object and Solana payload accurately.

```ts
export type ChainDto = {
  _id: string;
  chainId: string;
  chainType: string;
  network: string;
  name: string;
  isActive: boolean;
  wallet?: WalletDto | null;
};

export type ChainListResponse = {
  items: ChainDto[];
  meta: {
    page: number;
    limit: number;
    total: number;
  };
};

export type WalletGroupDto = {
  _id: string;
  name: string;
  walletIndex: number;
  selected: boolean;
  isHidden: boolean;
};

export type WalletDto = {
  _id: string;
  chainId: string;
  chain: "SOL";
  address: string;
  walletIndex: number;
  isActive: boolean;
};

export type SolanaOpenPayload = {
  spaceId: `0x${string}`;
  chainObjectId: string;
  chainId: string;
  chainType: "SOL";
  address: string;
  programId: string;
  creator: `0x${string}`;
  digest: `0x${string}`;
  config: string;
  validAfter: number;
  validUntil: number;
  guardian: `0x${string}`;
  owner: `0x${string}`;
  members: `0x${string}`[];
};

export type SkippedChain = {
  chainObjectId: string;
  chainId: string;
  chainType: string;
  reason: string;
};

export type CreateSpaceResponse = {
  spaceId: `0x${string}`;
  name: string;
  purpose: "FAMILY" | "FRIENDS" | "WORK";
  role: "OWNER";
  memberCount: number;
  initialize: {
    spaceId: `0x${string}`;
    ready: Array<SolanaOpenPayload | Record<string, unknown>>;
    skipped: SkippedChain[];
  };
};

export type SpaceChainDto = {
  chainObjectId: string;
  chainId: string;
  chainType: string;
  address: string | null;
  isDeployed: boolean;
  deployState?: "pending" | "failed";
  deployError?: string;
};

export type DepositAddressesResponse = {
  spaceId: `0x${string}`;
  chains: SpaceChainDto[];
};

export type ApiErrorBody = {
  statusCode: number;
  message: string | string[];
  code: string;
};
```

Add runtime checks for the fields used at security boundaries. TypeScript types alone do not
validate HTTP JSON.

## 8. HTTP client

Create one small wrapper around `fetch`:

```ts
export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { apiBaseUrl, jwt } = getRuntimeConfiguration();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  const body = await response.json().catch(() => null);
  appendDebugEvent({ path, status: response.status, body });

  if (!response.ok) {
    throw new ApiError(response.status, body);
  }

  return body as T;
}
```

Redact the JWT from every debug event. The request logger may show method, path, body, status, and
response, but never authorization headers.

Implement these endpoint functions:

```ts
getChains(): Promise<ChainListResponse>
getWalletGroups(): Promise<WalletGroupDto[]>
getWallets(chainObjectId: string): Promise<WalletDto[]>
registerWallet(input): Promise<WalletDto>
createSpace(name: string): Promise<CreateSpaceResponse>
getSolanaPayload(spaceId: string): Promise<SolanaOpenPayload>
activateSolana(spaceId: string, input): Promise<ActivationResponse>
getDepositAddresses(spaceId: string): Promise<DepositAddressesResponse>
```

Use `GET /chain/get-chains?page=1&limit=100` so pagination does not silently hide Solana Devnet.

## 9. Phantom provider adapter

Keep all injected-provider assumptions inside `src/solana/phantom.ts`.

```ts
export type PublicKeyLike = {
  toBase58(): string;
  toBytes(): Uint8Array;
};

export type PhantomProvider = {
  isPhantom?: boolean;
  isConnected?: boolean;
  publicKey?: PublicKeyLike | null;
  connect(): Promise<{ publicKey: PublicKeyLike }>;
  disconnect(): Promise<void>;
  signMessage(
    message: Uint8Array,
    display?: "hex" | "utf8",
  ): Promise<{ signature: Uint8Array; publicKey: PublicKeyLike }>;
};

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
  }
}
```

Functions:

```ts
getPhantom(): PhantomProvider
connectPhantom(): Promise<ConnectedWallet>
disconnectPhantom(): Promise<void>
signRawMessage(bytes: Uint8Array): Promise<Uint8Array>
```

If Phantom is absent, show a clear install/open-in-Phantom message. Do not silently fall back to a
generated keypair; the purpose of this tool is to test a real wallet signature.

Listen for account-change/disconnect events if exposed by the provider. If the account changes,
clear the current payload and signature because they were issued for a particular `creator` key.

## 10. Solana signing boundary

`src/solana/signing.ts` owns every byte conversion and validation used by signing.

```ts
import nacl from "tweetnacl";

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes32(value: string): Uint8Array {
  const hex = value.replace(/^0x/i, "");
  if (hex.length !== 64 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error("Digest must be exactly 32 bytes of hexadecimal");
  }
  return Uint8Array.from(
    hex.match(/.{2}/g)!.map(byte => Number.parseInt(byte, 16)),
  );
}

export function publicKeyHex(publicKey: Uint8Array): `0x${string}` {
  if (publicKey.length !== 32) throw new Error("Solana public key must be 32 bytes");
  return `0x${bytesToHex(publicKey)}`;
}

export async function signSolanaPayload(
  payload: SolanaOpenPayload,
  wallet: ConnectedWallet,
): Promise<string> {
  const expected = payload.creator.toLowerCase();
  const connected = publicKeyHex(wallet.publicKeyBytes).toLowerCase();
  if (connected !== expected) {
    throw new Error("Connected Phantom account does not match payload.creator");
  }

  const now = Math.floor(Date.now() / 1000);
  if (now < payload.validAfter || now >= payload.validUntil - 15) {
    throw new Error("Payload is not currently safe to sign; request a fresh payload");
  }

  const digestBytes = hexToBytes32(payload.digest);
  const signatureBytes = await wallet.signMessage(digestBytes);
  if (signatureBytes.length !== 64) {
    throw new Error("Wallet returned a signature that is not 64 bytes");
  }

  if (!nacl.sign.detached.verify(digestBytes, signatureBytes, wallet.publicKeyBytes)) {
    throw new Error("Wallet signature does not verify over the raw backend digest");
  }

  return bytesToHex(signatureBytes);
}
```

The only value passed to Phantom is:

```ts
hexToBytes32(payload.digest)
```

Do not pass the hex text, JSON, config, PDA address, or a transaction. Use the raw-message signing
feature, not Solana's off-chain-message wrapper: the backend currently verifies the signature over
the exact 32 digest bytes.

## 11. UI layout

Use one page with six plain bordered sections. Each section has an explicit action button so a
developer can stop and inspect the state between steps.

### A. Configuration

- API base URL input.
- JWT password input.
- Expected network display: `testnet`.
- Test API button.

### B. Phantom wallet

- Connect/disconnect button.
- Connected base58 address.
- Connected key as `0x` hex.
- `signMessage` availability.

### C. Chain and wallet registration

- Load chains button.
- Display selected Solana Devnet chain `_id`, API-formatted chain id, and name.
- Load wallet groups button and simple group/index selector.
- Register/check wallet button.
- Show stored address and whether it matches the connected wallet.

If `POST /wallets` returns an existing wallet whose address differs from Phantom, stop. The backend
may return the already active record for that wallet index; continuing would produce a payload for
the wrong signer.

### D. Create or resume Space

- Space name input, default `Solana signing test <timestamp>`.
- Create button.
- Existing `spaceId` input and Load Fresh Solana Payload button.
- Display created Space id.

Use a fixed minimal create request:

```json
{
  "name": "Solana signing test 2026-10-23T10:00:00Z",
  "purpose": "FAMILY",
  "approvalRule": {
    "alwaysAsk": false,
    "thresholdUsd": "200",
    "quorumPercent": 50
  }
}
```

Disable the Create button while its request is in flight. Never automatically retry Create after a
network error because the first call may have committed.

### E. Payload and signature

- Render the full payload JSON.
- Prominently display `creator`, connected key, digest, byte length, `validAfter`, `validUntil`, and
  seconds remaining.
- Sign button.
- Signature hex and local-verification status.

Disable Sign unless:

- wallet is connected;
- wallet supports `signMessage`;
- connected key equals `payload.creator`;
- digest decodes to exactly 32 bytes; and
- at least 15 seconds remain in the signed window.

### F. Activation and deployment

- Submit signature button.
- Start/stop polling button.
- Current `deployState`, `isDeployed`, `deployError`, and deposit address.
- Fetch fresh payload and retry button when failed or expired.
- Timestamped debug log.

## 12. Solana-only API sequence

### Step 1 — discover Solana Devnet

```http
GET /chain/get-chains?page=1&limit=100
```

```ts
const solanaDevnet = response.items.find(
  chain =>
    chain.chainType === "SOL" &&
    chain.network === "testnet" &&
    chain.isActive === true,
);
```

If absent, show the likely cause explicitly: `DEFAULT_NETWORK` is not `testnet`, the row is inactive,
or the backend points to a different database.

### Step 2 — choose an existing wallet group

```http
GET /wallets/groups
```

The preferred test path requires the pre-provisioned group containing the verified TON wallet.
Select its `walletIndex`. Do not create an unrelated new group because that group would not meet the
current TON prerequisite.

### Step 3 — register the connected Solana wallet

First read existing records:

```http
GET /wallets?chainId=<solanaDevnet._id>
```

If an active record already exists at the chosen index, require its address to equal Phantom's
base58 address. Otherwise call:

```http
POST /wallets
Content-Type: application/json

{
  "chainId": "<solanaDevnet._id>",
  "address": "<connected Phantom base58 public key>",
  "walletIndex": 0
}
```

Read the returned record and verify the address again.

### Step 4 — create the Space

```http
POST /family-wallet/spaces
Content-Type: application/json
```

Take the Solana payload from:

```ts
created.initialize.ready.find(item => item.chainType === "SOL")
```

If Solana appears in `initialize.skipped`, display the supplied reason and keep the `spaceId` so the
tester can correct the backend state and request a payload later.

### Step 5 — fetch/refresh a Solana payload

For an existing Space, an expired payload, or a retry:

```http
POST /family-wallet/spaces/:spaceId/solana/activate-payload
```

No request body is required. Replace any prior payload and signature with the new response.

### Step 6 — sign

```ts
const digestBytes = hexToBytes32(payload.digest);
const signatureBytes = await phantom.signMessage(digestBytes, "hex");
```

Normalize the injected provider's result to its `signature: Uint8Array`, verify it locally, and
serialize it as exactly 128 hexadecimal characters without requiring a `0x` prefix.

### Step 7 — submit through the dedicated Solana endpoint

Use the dedicated endpoint to keep the test repo free of multi-chain result handling:

```http
POST /family-wallet/spaces/:spaceId/solana/activate
Content-Type: application/json

{
  "signature": "<128-character hex signature>",
  "validAfter": 1790000000,
  "validUntil": 1790000300
}
```

Send only those three fields. Do not send `digest`, `creator`, `config`, `address`, or `programId`.
Unknown fields are rejected by backend validation.

A successful response has `deployState: "pending"`. That is queue acceptance, not deployment
success.

### Step 8 — poll deployment

```http
GET /family-wallet/spaces/:spaceId/deposit-addresses
```

Poll every five seconds for three minutes. The backend worker normally ticks every 15 seconds.

Find the chain by `payload.chainObjectId`, falling back to `chainType === "SOL"` only for diagnostic
display. Interpret it as follows:

| Condition | Test-client state | Next action |
|---|---|---|
| no Solana entry | not activated | fetch a payload |
| `deployState === "pending"` | queued/deploying | continue polling |
| `isDeployed === true` and address is non-null | pass | stop polling and show address |
| `deployState === "failed"` | failed | stop; show error; fetch a fresh payload |
| three-minute client timeout | delayed | stop automatic polling; allow manual continuation |

Never report PASS or safe-to-deposit while only `pending`.

## 13. State model

Keep one reducer or hook state object:

```ts
type FlowStatus =
  | "configuration-required"
  | "wallet-disconnected"
  | "wallet-connected"
  | "chain-loaded"
  | "wallet-registered"
  | "space-created"
  | "payload-ready"
  | "awaiting-wallet-approval"
  | "signed"
  | "submitting"
  | "pending"
  | "deployed"
  | "failed"
  | "expired";
```

Store separately:

```ts
type FlowState = {
  status: FlowStatus;
  connectedWallet?: ConnectedWallet;
  solanaChain?: ChainDto;
  walletGroup?: WalletGroupDto;
  storedWallet?: WalletDto;
  spaceId?: string;
  payload?: SolanaOpenPayload;
  signatureHex?: string;
  deployment?: SpaceChainDto;
  error?: DiagnosticError;
  events: DebugEvent[];
};
```

Clear `payload` and `signatureHex` whenever the connected account, selected wallet group, Space id,
or payload changes.

Persist only base URL, JWT, and the last Space id in `sessionStorage`. Do not persist payloads or
signatures because their validity window is short and their member roster can become stale.

## 14. Error handling

Normalize backend errors into:

```ts
type DiagnosticError = {
  source: "client" | "wallet" | "backend" | "poll";
  status?: number;
  code?: string;
  message: string;
  raw?: unknown;
};
```

Required handling:

| Error | Behavior |
|---|---|
| HTTP 401 | stop; request a new JWT |
| Solana Devnet absent | show `DEFAULT_NETWORK`/database diagnostic |
| wallet group absent | tell tester to provision the backend test user with TON first |
| stored address differs from Phantom | stop; choose the matching account/group |
| user rejects connection/signing | return to payload-ready; do not discard a still-fresh payload |
| `INVALID_SIGNATURE` | show signer/digest checks and fetch a new payload |
| `OPEN_PAYLOAD_STALE` | discard signature and fetch a new payload |
| `MEMBER_CHANGE_IN_PROGRESS` | wait; retry payload creation later |
| `GUARDIAN_REFUSED` | stop automatic retries; show backend error |
| HTTP 409 while queued | switch to polling |
| `deployState: failed` | display `deployError`; require fresh payload/signature |
| network error during Create | mark ambiguous; never auto-retry Create |

## 15. Debug logging

Each action should append a timestamped event:

```ts
type DebugEvent = {
  at: string;
  step: string;
  outcome: "start" | "success" | "failure" | "info";
  detail?: unknown;
};
```

Provide “Copy log” and “Clear log” buttons. Redact:

- JWT and Authorization headers;
- any accidentally returned private material; and
- browser-extension internal objects that may include unrelated account data.

It is acceptable to display the public address, digest, signature, payload, Space id, PDA, and API
error response; these are not private keys.

## 16. Tests

### Unit tests

`src/solana/signing.test.ts`:

- accepts a valid `0x` 32-byte digest;
- rejects missing, malformed, odd-length, short, or long digest input;
- converts a 32-byte public key to the same lowercase hex format as `payload.creator`;
- rejects a connected key different from `payload.creator`;
- rejects expired and nearly expired payloads;
- produces a 128-character signature hex value;
- locally verifies the signature over the raw digest;
- fails verification if the UTF-8 hex string was signed instead of decoded bytes; and
- fails verification if any digest byte changes.

Endpoint serialization tests:

- wallet registration sends only `chainId`, `address`, and `walletIndex`;
- activation sends only `signature`, `validAfter`, and `validUntil`;
- timestamps are unchanged from the payload; and
- authorization headers are never included in debug output.

Reducer/state tests:

- account change clears payload and signature;
- `pending` never transitions directly to success without `isDeployed`;
- failed deployment requires a fresh payload; and
- Create is not automatically retried after an ambiguous error.

### Manual Devnet test

1. Start backend API and common worker.
2. Open Phantom in Devnet mode and select the intended account.
3. Paste a valid test-user JWT.
4. Load chains and confirm `Solana Devnet` is selected.
5. Select the pre-provisioned wallet group.
6. Register the Phantom address and confirm the stored address matches.
7. Create the Space.
8. Confirm the payload digest decodes to 32 bytes.
9. Confirm connected-key hex equals `payload.creator`.
10. Sign and confirm local Ed25519 verification passes.
11. Submit and confirm `deployState: pending`.
12. Poll until `isDeployed: true` and a non-null PDA address is returned.
13. Repeat once with the wrong Phantom account and confirm the client blocks signing.
14. Let one payload expire, fetch a new one, and confirm the old signature is not reused.

## 17. Implementation phases and effort

### Phase 1 — scaffold and diagnostics: 2–3 hours

- Create Vite React TypeScript repo.
- Add environment/configuration panel.
- Add fetch wrapper, error type, and redacted debug log.
- Implement chain discovery.

### Phase 2 — wallet registration: 2–3 hours

- Implement Phantom injected-provider adapter.
- Load wallet groups and existing Solana wallets.
- Register/check the Solana address.
- Enforce address and wallet-index match.

### Phase 3 — create and sign: 3–4 hours

- Create Space.
- Extract or refresh Solana payload.
- Implement raw 32-byte signing.
- Implement local signature verification.
- Render payload and countdown diagnostics.

### Phase 4 — activate and poll: 2–3 hours

- Submit through the dedicated Solana endpoint.
- Poll deposit-address state.
- Add failed/expired retry controls.
- Add pass/fail summary.

### Phase 5 — tests and Devnet verification: 3–5 hours

- Unit-test byte conversion and serialization.
- Test wrong-account and expired-payload paths.
- Run an end-to-end Devnet deployment.
- Record setup and troubleshooting in README.

Estimated total: **12–18 engineering hours**, normally **two focused working days** if the backend,
JWT, TON prerequisite, Phantom account, relayer, and worker are already ready.

## 18. Definition of done

- A developer can clone the repo, install dependencies, and start it from the README.
- No backend/user secret is committed.
- The tool connects to Phantom and shows its base58 and hex public key.
- It discovers the active Solana Devnet row dynamically.
- It registers or validates the wallet against the intended existing wallet group.
- It creates a Space or resumes an existing Space id.
- It obtains a runtime Solana payload from the backend.
- It signs exactly the decoded 32 digest bytes.
- It verifies the signature locally against the connected public key.
- It submits only the dedicated Solana activation DTO fields.
- It reports queue acceptance separately from deployment success.
- It reports PASS only after `isDeployed === true` and `address !== null`.
- It provides actionable raw diagnostics for every failed step.
- The signing and request-serialization tests pass.

