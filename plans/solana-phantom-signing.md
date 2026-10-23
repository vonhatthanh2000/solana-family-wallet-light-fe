# Phantom-compatible Solana activation signing migration

Status: Proposed  
Scope: `tonpass-wallet-be`, `tonpass-wallet-fe`, and the FamilySpace Solana program  
Primary flow: Family Space Solana activation (`initialize`)

## 1. Objective

Make Family Space activation signable through Phantom without weakening the existing activation
commitment or trusting message text supplied by the client.

The migration keeps the existing 32-byte activation digest unchanged. It changes the bytes signed
by the Owner and guardian from the raw digest to a versioned, domain-separated UTF-8 message that
contains that digest.

Success means:

- Phantom displays its normal `signMessage` approval prompt;
- the backend accepts a valid Phantom signature;
- the backend and Solana program reject signatures over the raw digest;
- formatting changes, digest changes, wrong keys, stale windows, and expired windows are rejected;
- the existing digest continues to commit to the program, network, Space PDA, creator, member
  configuration, and validity window; and
- the frontend never signs arbitrary text received from the API without reconstructing and
  validating it.

This document supersedes the raw-digest signing instructions in
`docs/solana-create-space-frontend-integration.md` for Solana activation.

## 2. Current behavior and failure

The current activation digest is:

```text
sha256(
  "FamilySpace/v7.2"
  || TAG_INIT
  || program_id
  || network_id
  || space_pda
  || borsh(init_config)
)
```

The backend returns this digest as `0x`-prefixed hex. The frontend is expected to decode it into 32
binary bytes and call a wallet signer. The backend then verifies the Owner's Ed25519 signature over
those 32 bytes, the guardian signs the same bytes, and the deploy worker puts both signatures and
the raw digest into an Ed25519 verification instruction.

Phantom's message-signing flow is intended for a displayable message. Passing the arbitrary
32-byte digest to `signMessage` can be refused before the approval prompt. The display option does
not transform the bytes being signed.

This is a protocol incompatibility, not a hexadecimal presentation bug. Converting the digest to
text only in the frontend would also be incorrect because the backend and Solana program currently
verify the raw bytes.

The checked-out frontend has additional gaps:

- `SpaceChainType` does not include `SOL`;
- `ReadyPayload` has no Solana activation variant;
- `readReadyPayload` accepts only TON and EVM payloads;
- `signReady` only dispatches TON digest signing and EVM typed-data signing; and
- there is no Phantom/Solana signer in the current shared-space flow.

## 3. Decision

### 3.1 Canonical activation message version 1

The exact message is:

```text
Family Wallet Solana activation v1
Digest: 0x<64 lowercase hexadecimal characters>
```

Normative construction:

```ts
const SOLANA_ACTIVATION_MESSAGE_VERSION = 1;
const SOLANA_ACTIVATION_MESSAGE_PREFIX = 'Family Wallet Solana activation v1';

function solanaActivationSigningMessage(digest: string): string {
  if (!/^0x[0-9a-f]{64}$/.test(digest)) {
    throw new Error('Solana activation digest must be canonical lowercase 0x-prefixed hex');
  }
  return `${SOLANA_ACTIVATION_MESSAGE_PREFIX}\nDigest: ${digest}`;
}
```

Canonicalization rules:

- UTF-8 encoding;
- ASCII characters only in version 1;
- exactly one line-feed byte (`0x0a`) between the two lines;
- no carriage return;
- no leading or trailing whitespace;
- no trailing newline;
- fixed capitalization;
- a required lowercase `0x` prefix; and
- exactly 64 lowercase hexadecimal digest characters.

The canonical message is 109 bytes. It increases the shared Ed25519 instruction message by 77
bytes compared with the raw 32-byte digest. Transaction-size tests must prove that the supported
maximum initialization member count still fits Solana's 1,232-byte transaction limit. If it does
not, reduce `SOL_MAX_INIT_MEMBERS` to the largest tested safe value as part of this migration.

### 3.2 What remains unchanged

- `solInitDigest` and its preimage stay unchanged.
- The validity window remains inside `InitConfig` and therefore inside the digest.
- The program id, network id, Space PDA, creator/member configuration, and member ordering remain
  committed by the digest.
- The client submits only the signature and the existing window fields. It does not submit trusted
  message text or a trusted digest.
- Owner-key matching, guardian policy, replay controls, deploy claiming, and expiry behavior remain
  in force.

### 3.3 All verifiers must use the same bytes

The Owner, backend, guardian, deploy worker, Ed25519 precompile instruction, and Solana program must
all agree on the canonical UTF-8 bytes:

```text
existing activation fields
          |
          v
    32-byte digest
          |
          v
canonical UTF-8 message
     /          \
Owner signature  guardian signature
     \          /
      Ed25519 instruction
              |
              v
Solana program compares the verified message with the canonical message
it constructs from its independently computed digest
```

Changing only backend verification is prohibited. The creator signature is persisted and later
verified on-chain; a backend-only change would accept activation and then fail deployment.

## 4. API contract

### 4.1 Activation payload response

Both the unified payload response and dedicated Solana payload response add three required fields:

```json
{
  "chainObjectId": "68f0c7a1b2c3d4e5f6a7b8c9",
  "chainId": "67",
  "chainType": "SOL",
  "digest": "0x2c2fa70000000000000000000000000000000000000000000000000000000000",
  "signingMessage": "Family Wallet Solana activation v1\nDigest: 0x2c2fa70000000000000000000000000000000000000000000000000000000000",
  "signingMessageEncoding": "utf8",
  "signingMessageVersion": 1,
  "validAfter": 1790000000,
  "validUntil": 1790000300
}
```

Affected endpoints:

```text
POST /family-wallet/spaces
POST /family-wallet/spaces/:spaceId/open-payloads
POST /family-wallet/spaces/:spaceId/solana/activate-payload
```

`digest` remains in the response for inspection, frontend safety checks, debugging, and protocol
compatibility. It is no longer the direct input to `signMessage`.

### 4.2 Activation submission

The unified request remains:

```json
{
  "items": [
    {
      "chainObjectId": "68f0c7a1b2c3d4e5f6a7b8c9",
      "signature": "<128 lowercase or uppercase hex characters>",
      "validAfter": 1790000000,
      "validUntil": 1790000300
    }
  ]
}
```

The dedicated request remains:

```json
{
  "signature": "<128 lowercase or uppercase hex characters>",
  "validAfter": 1790000000,
  "validUntil": 1790000300
}
```

Do not add `signingMessage` to either request. If a version must be echoed for telemetry or future
multi-version routing, it is an untrusted selector only; the server still reconstructs the message
and must reject any unsupported version before signature verification.

## 5. Backend implementation plan (`tonpass-wallet-be`)

### Phase BE-1: Canonical message primitive

Add a small chain-specific module, for example:

```text
src/family-wallet/space-wallet/driver/solana/sol-signing-message.ts
```

It owns:

- `SOLANA_ACTIVATION_MESSAGE_VERSION`;
- `SOLANA_ACTIVATION_MESSAGE_ENCODING`;
- `solanaActivationSigningMessage(digest)`;
- `solanaActivationSigningBytes(digest)`; and
- canonical digest validation.

The module accepts only the canonical digest produced by the backend. It does not accept a message
from an API request.

Add independent fixed-vector tests for the exact string and UTF-8 bytes. The expected value must be
a literal from this document, not a value assembled with the production constants.

### Phase BE-2: Payload response

Update `SpaceActivateService.buildSolPayload` to:

1. build the existing `SolInitPayload` and digest;
2. construct the canonical signing message;
3. return `signingMessage`, `signingMessageEncoding: "utf8"`, and
   `signingMessageVersion: 1`; and
4. keep returning `digest` and the existing activation fields.

Update the Swagger DTO used by both activation flows. The three new fields are required for
`chainType: "SOL"` and must be documented as exact protocol values rather than display hints.

### Phase BE-3: Submission verification and guardian signature

Update `SpaceActivateService.submitSol` to:

1. rebuild `InitConfig` from server-side state and the submitted validity window;
2. rebuild the existing activation digest;
3. construct the canonical version-1 bytes from that digest;
4. verify the Owner signature against those UTF-8 bytes and the stored Owner key;
5. run the existing window and guardian policy checks; and
6. make the guardian sign the same canonical bytes.

Refactor `GuardianKeyService.signSol` so its parameter makes the signed bytes explicit. Preferred
shape:

```ts
signSolMessage(message: Uint8Array): Promise<string>
```

Avoid an ambiguous `signSol(digest: string)` API after this change. Solana spending still uses a
raw digest today; give activation and spending distinct call sites or a byte-oriented primitive so
one flow cannot accidentally adopt the other's encoding.

### Phase BE-4: Persist the signing version

Add an optional chain-row field such as:

```ts
pendingInitSigningMessageVersion?: number;
```

Set it to `1` when claiming or requeueing a Solana activation. The deploy worker must fail closed
on a missing or unsupported version once the version-1 rollout is complete.

Persisting the version avoids interpreting queued signatures according to whatever the current
application default happens to be after a future deployment.

No message text needs to be stored. The worker can rebuild the digest from the stored config and
derive the canonical message from the stored version.

### Phase BE-5: Ed25519 instruction construction

Update `buildSolInitInstructions` so the Ed25519 verification instruction carries the canonical
version-1 message bytes instead of `getBytes(digest)`.

The builder must:

- independently rebuild the digest from the Space reference and stored config;
- construct the message according to `pendingInitSigningMessageVersion`;
- put the Owner and guardian signatures over the same shared message into the Ed25519 instruction;
- reject an unknown version before constructing a transaction; and
- preserve the current self-contained Ed25519 instruction offsets.

Update the deploy sender to pass the persisted version into the instruction builder.

### Phase BE-6: Backend tests

Add or update tests at these public seams:

| Seam | Required cases |
|---|---|
| Canonical message module | fixed literal; exact UTF-8 bytes; uppercase/missing-prefix/wrong-length digest rejected; no trailing newline |
| `buildSolPayload` | returns digest plus exact message, encoding, and version |
| `submitSol` | valid signature over canonical message accepted; raw-digest signature rejected; CRLF, extra newline, changed capitalization, and uppercase digest message signatures rejected |
| `submitSol` security | one changed digest character rejected; wrong Owner key rejected; changed window rejected; expired/stale window rejected |
| Queued row | version `1` persisted with creator and guardian signatures |
| Instruction builder | Ed25519 message is exact UTF-8 envelope; both real signatures verify over it; neither verifies over raw digest |
| Transaction sizing | maximum supported member count fits 1,232 bytes, or cap is reduced and boundary tested |
| Deploy retry | queued version survives lease/retry and reconstructs identical message bytes |

Retain the existing digest test vectors. They prove the underlying commitment did not change.

## 6. Solana program implementation plan

The program currently computes the activation digest and requires the Ed25519 instruction message
to equal those raw 32 bytes. Update the program and its fixture helpers together.

### Phase SOL-1: Canonical message construction

Add constants matching the API protocol exactly:

```rust
const ACTIVATION_MESSAGE_PREFIX_V1: &[u8] = b"Family Wallet Solana activation v1\nDigest: 0x";
```

Implement a deterministic lowercase hexadecimal encoder and construct:

```text
prefix bytes || lowercase_hex(digest)
```

The program must derive the digest itself from the instruction arguments and account context. It
must never trust a digest or message passed as an unchecked instruction argument.

### Phase SOL-2: Signature lookup

Update the initialization signature check so `sig.rs` searches the Instructions sysvar for Owner
and guardian Ed25519 verifications over the canonical version-1 message.

Both signatures must cover identical bytes. A valid raw-digest Ed25519 instruction must no longer
satisfy initialization after the final rollout.

Do not change:

- PDA derivation;
- `InitConfig` serialization;
- the account layout;
- the activation digest function; or
- Owner/guardian key selection.

### Phase SOL-3: Program tests and shared vectors

Add Rust/program tests proving:

- exact version-1 message construction from a fixed digest;
- valid Owner and guardian signatures over the envelope initialize successfully;
- raw-digest signatures fail;
- CRLF, trailing newline, changed case, changed version, and changed digest fail;
- wrong Owner and guardian keys fail;
- changed config/window creates a different digest and fails with the old signature; and
- maximum supported member initialization still fits and succeeds.

Export a fixed JSON vector from the contract repository containing at least:

```json
{
  "digest": "0x...",
  "signingMessage": "Family Wallet Solana activation v1\nDigest: 0x...",
  "signingMessageUtf8Hex": "...",
  "ownerPublicKey": "...",
  "ownerSignature": "...",
  "guardianPublicKey": "...",
  "guardianSignature": "..."
}
```

Consume the same vector in backend tests. This prevents TypeScript and Rust implementations from
drifting while both local test suites remain green.

## 7. Frontend implementation plan (`tonpass-wallet-fe`)

### Phase FE-1: Model the Solana payload

In `apps/family/app/features/shared-wallet/api/space-api.ts`:

- add `SOL` to `SpaceChainType`;
- define `SolReadyPayload` with the existing Solana fields plus:
  - `signingMessage: string`;
  - `signingMessageEncoding: "utf8"`;
  - `signingMessageVersion: 1`;
  - `validAfter: number`;
  - `validUntil: number`;
- include `SolReadyPayload` in `ReadyPayload`;
- add `validUntil?: number` to `OpenItem`; and
- extend `readReadyPayload` to parse and validate the Solana variant.

The parser must reject unknown encodings and versions. It must not silently treat Solana as EVM.

### Phase FE-2: Frontend safety validation

Add a frontend canonical-message helper with literal protocol constants. For a Solana payload:

1. require `digest` to match `^0x[0-9a-f]{64}$`;
2. locally construct the expected version-1 message;
3. require byte-for-byte/string equality with `payload.signingMessage`;
4. require `signingMessageEncoding === "utf8"`;
5. require `signingMessageVersion === 1`;
6. require integer `validAfter` and `validUntil` and a non-expired window;
7. require the connected Phantom public key to match `creator`/`owner` after decoding both to the
   same 32-byte representation; and
8. retain the current roster/member safety checks adapted to Solana's key representation.

The frontend cannot independently reproduce the Borsh activation digest unless it deliberately
implements that protocol. It can and must verify that the displayable message is the unique
canonical envelope for the digest the backend returned.

### Phase FE-3: Phantom signer adapter

Introduce a narrow adapter instead of accessing `window.phantom` from orchestration code:

```ts
export interface SolanaMessageSigner {
  publicKeyBytes(): Uint8Array;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
}
```

Signing behavior:

```ts
const expected = solanaActivationSigningMessage(payload.digest);
if (payload.signingMessage !== expected) throw new Error('INVALID_OPEN_PAYLOAD');

const message = new TextEncoder().encode(expected);
const signature = await signer.signMessage(message);

if (signature.length !== 64) throw new Error('INVALID_SOLANA_SIGNATURE');
```

Hex-encode the returned 64-byte signature for the existing API. The Phantom presentation option is
not an encoding step and must not be used to transform the message.

### Phase FE-4: Shared open orchestration

Extend `verifyReady` and `signReady` in
`apps/family/app/features/shared-wallet/lib/space-chains.ts` with an explicit `SOL` branch.

The branch must:

- run the Solana payload safety checks;
- request the correct Phantom account;
- sign the exact UTF-8 message;
- compare the signer public key with the payload Owner;
- return `chainObjectId`, hex signature, `validAfter`, and `validUntil`; and
- submit through the existing unified `/open` endpoint.

Do not let the existing `else` branch classify `SOL` as EVM. Prefer an exhaustive switch with a
`never` check so future chain types fail compilation until handled.

The dedicated resume flow must use the same parser, validator, signer adapter, and submission model
for:

```text
POST /family-wallet/spaces/:spaceId/solana/activate-payload
POST /family-wallet/spaces/:spaceId/solana/activate
```

### Phase FE-5: Frontend tests

Add tests proving:

- a valid Solana ready payload is parsed;
- unsupported message versions and encodings are rejected;
- an API message differing by one character is rejected before Phantom is called;
- CRLF, trailing newline, capitalization differences, uppercase digest text, and missing `0x` are
  rejected;
- Phantom receives the exact `TextEncoder` bytes of the canonical literal;
- the returned signature is submitted with the original `validAfter`/`validUntil`;
- a raw-digest byte array is never passed to Phantom;
- a wrong connected public key is rejected before submission;
- cancellation leaves the Space resumable rather than reporting it as deployed;
- stale payload responses request a fresh payload before another signature; and
- the unified create/open flow and dedicated resume flow use the same signer implementation.

Use a deterministic fake `SolanaMessageSigner` at the adapter seam. Do not mock Phantom throughout
the store and API layers.

## 8. Rollout plan

The final protocol must reject raw-digest signatures. A coordinated rollout is therefore required.

### Preferred rollout with a short activation maintenance window

1. Merge backend, program, and frontend changes behind a disabled Solana-activation feature flag.
2. Disable new Solana activation requests.
3. Wait longer than the maximum activation signature lifetime so no version-0 signature remains
   valid or queued without an explicit version.
4. Upgrade the existing Solana program in place. Preserve the program id so existing PDAs and
   Spaces do not move.
5. Deploy the backend version that emits/verifies/stores version 1 and constructs version-1
   Ed25519 instructions.
6. Deploy the frontend version with explicit Solana parsing and Phantom UTF-8 signing.
7. Run the devnet smoke tests below.
8. Enable Solana activation.

Do not solve rollout by changing `FAMILY_SPACE_SOLANA_PROGRAM_ID` unless migration to new PDAs is an
explicit product decision. The program id is part of the digest and PDA derivation.

### Zero-downtime alternative

If activation cannot be paused:

1. temporarily deploy a program version that accepts both raw-digest version 0 and canonical
   version 1;
2. deploy a backend that persists the signing version and can send either queued format;
3. deploy the version-1 frontend;
4. wait for all version-0 windows and queued deployments to settle or expire; then
5. deploy the final program and backend that reject version 0.

Dual acceptance is transitional only. The final acceptance tests must run after version 0 is
removed.

## 9. Devnet verification checklist

Run these tests against the deployed devnet program, backend, and Phantom:

1. Create a Space and find the `SOL` entry in `initialize.ready`.
2. Confirm the returned message exactly equals the locally reconstructed canonical message.
3. Request a Phantom signature and confirm the approval window appears.
4. Submit the signature and confirm the Solana chain row appears with `deployState: "pending"`.
5. Wait for the worker and confirm `isDeployed: true`.
6. Read the deployed account and confirm its creator, guardian, member list, and validity-derived
   initialization match the payload.
7. Submit a signature over the raw digest and confirm backend rejection.
8. Submit signatures over CRLF, a trailing newline, changed capitalization, and one changed digest
   character; confirm rejection.
9. Sign with a different Phantom account and confirm rejection.
10. Let a payload expire, sign it, and confirm stale/expired rejection remains unchanged.
11. Retry a failed queued deployment and confirm the persisted signing version reconstructs the
    same message.
12. Exercise the maximum supported initial member count and confirm the transaction fits.

## 10. Observability and failure handling

Add structured, non-secret fields to activation/deploy logs:

- `spaceId`;
- `chainObjectId`;
- `signingMessageVersion`;
- activation phase (`payload`, `verify`, `queue`, `deploy`); and
- stable refusal/error code.

Never log the full signed message, signatures, private keys, guardian material, or RPC credentials.
The digest may be logged only if current project logging policy permits it.

Recommended error distinctions:

- unsupported signing-message version;
- malformed signature;
- signature not from Owner;
- payload/message stale because server state changed;
- validity window closed;
- guardian refusal;
- unsupported queued signing version; and
- deploy transaction too large.

## 11. Follow-up: Solana spending and member actions

This plan intentionally changes activation first. Any later Phantom flow that currently asks
`signMessage` to sign a raw Solana spend or member-action digest will have the same compatibility
problem.

Do not reuse the activation prefix for those actions. Define a distinct versioned domain per
intent, for example:

```text
Family Wallet Solana spend v1
Digest: 0x...
```

Each new envelope requires the same end-to-end agreement between frontend, backend, guardian,
Ed25519 instruction builder, and Solana program. Complete a separate threat review before enabling
Phantom-backed spending.

## 12. Definition of done

- Backend, frontend, and program consume a shared fixed protocol vector.
- API responses expose the exact canonical version-1 message metadata.
- Frontend reconstructs and validates the message before requesting a signature.
- Phantom signs UTF-8 message bytes and displays an approval prompt.
- Backend reconstructs the message server-side and accepts the valid Phantom signature.
- Guardian and Owner signatures cover identical canonical bytes.
- Deploy worker and program verify those same bytes.
- Raw-digest and non-canonical signatures are rejected end to end.
- Existing digest, expiry, key matching, guardian policy, and replay protections remain covered.
- Maximum-size initialization remains within the transaction limit or the supported cap is safely
  reduced.
- Devnet activation reaches `isDeployed: true` through the normal worker.
- Existing raw-signing documentation is updated before release.
