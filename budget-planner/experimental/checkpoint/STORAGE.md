# Stage 2B1 synthetic transaction repository

Issue #20; Architect B0 contract from Issue #19. Base: accepted Stage 2A
`bd447e5e839ae942c5307391be99426681f9cd26`. This is an isolated protocol
experiment, not the production storage implementation or an import/restore tool.
Stage 1/2A APIs and all production code/versions/formats remain unchanged.

## Isolation and API

`openSyntheticRepository({factory, name, synthetic:true})` returns a promise of
`{ok:true, repository}` or `{ok:false, diagnostics:[{code}]}`. There is **no global
IndexedDB fallback**. Both open and delete validate the options **before any IDB
call**. The only namespace is `finpath-synthetic-b1-` followed by 1–64 lowercase
ASCII letters/digits/hyphens, beginning with a letter/digit. Missing names,
`budget-planner-db`, other namespaces, missing factories and unknown options
reject. Validated name/factory are captured, so changing the options later does
not redirect the request. The injected factory is trusted; this is not a sandbox
against a malicious implementation that ignores its arguments.

Only synthetic schema **version 1** is opened. A foreign/newer schema or mismatched
stores/keyPaths/indexes is refused without reset/migration. DB9→10/data3/export2
remain later design proposals, not constants changed here. Never call this API
with actual records, owner profiles or backups: `synthetic:true` is a declaration,
not a financial-data detector.

Repository methods:

- `initialize(seed)`: explicit synthetic fixture bootstrap only into an entirely
  empty database, with consent and caller-supplied operationId/generation. Adds
  raw records, initial revisions/control, immutable empty before-state and audit
  together. Existing data are never reseeded. Repeated initialization refuses;
  `lookupOperation` can resolve an uncertain bootstrap outcome.
- `snapshot()`: one readonly transaction over all 17 stores; actual IDB primary
  keys and raw values, no normalization, writes, default money or ID generation.
  Returns a fresh deeply frozen snapshot only after transaction completion.
- `execute(command, {signal}?)`: guarded command, completion receipt or fixed safe
  error. AbortSignal supports pre-start/during-transaction cancellation. A request
  already committed cannot be undone by a later cancellation.
- `lookupOperation(operationId)`: readonly, completion-bound receipt lookup for
  uncertain outcomes/reopening; never blindly replay after interruption.
- `close()`: closes the captured connection; subsequent calls fail CLOSED.

`prepareSyntheticCommand(snapshot, request)` is pure and synchronous. Returns a
frozen prepared command binding database name, protocol, full expected control,
exact membership **and raw content for all 17 stores**, and the exact request.
No display filters, selected-record-only guard or timestamp-only comparison.

`deleteSyntheticDatabase({factory,name,synthetic:true})` is **test teardown only**,
with the same namespace/factory guard; close all test connections first. It never
enumerates or deletes another database. A blocked cleanup request cannot be
cancelled by IndexedDB and may finish when connections close; this is not a
financial-operation rollback API. No teardown helper is imported by the app.

## Synthetic schema and DTOs

The eleven raw fixture stores retain original keyPaths: appMetadata, appSettings,
budgetTargets, categories, scheduledItems, accounts, manualAdjustments,
savingsBuckets, savingsBucketAdjustments, transfers use `id`; plannerEntries uses
`entryKey`. Rows are `{key,value}` and keyPath must equal the supplied key.
Only finite-number/plain acyclic DTOs (including explicit undefined/-0), dense
arrays and data properties are supported. Accessors/functions/exotic objects are
rejected, never normalized into financial records.

Six additional **test** stores:

| Store | KeyPath / purpose |
| --- | --- |
| financialControl | id; protocolVersion=1, synthetic=true, inactive-only mode, compiled capabilities, caller generation, canonical string stateRevision/financialRevision |
| recordRevisions | [collection,key]; generation/revision, exact raw content token or deletion tombstone |
| checkpointDrafts | [id,revision]; immutable inactive opaque synthetic payload |
| checkpointDraftHeads | id; exact current draft revision, contiguous increments |
| financialAudit | id=operationId; immutable command fingerprint, affected references, consent and completion receipt |
| protectedSnapshots | id=operationId; immutable exact before-state plus immutable history references |

Seed:
`{synthetic:true, operationId, generation, records:{eachRawStore:[{key,value}]},
consent:{confirmed:true,action:'initialize'}}`. All raw collections are explicit,
including empty ones. No application bootstrap/seedData import is used.

Prepared request:
`{synthetic:true, operationId, kind, requiredCapabilities, consent, ...payload}`.
Use the exported frozen STORAGE_CAPABILITIES set. Consent action must equal kind;
both consent and dependencies are part of exact operation identity.

- `financial`: nonempty changes `[{store,key,value}|{store,key,delete:true}]` to
  allowlisted raw stores only. Duplicated keys, keyPath mismatch, protocol-store
  writes and changing an existing id/entryKey/scheduledItemId/payPeriodDate reject.
  Explicit synthetic changes preserve their exact original before-images; no
  posting/recurrence/financial calculation or financial classification is inferred.
- `replace`: all eleven raw collections in replacement, explicit **new generation**.
  Atomic synthetic fixture-set replacement, not production backup import. Removed
  keys get tombstones. Old protocol history/draft versions are retained; this does
  not implement later format/restore/readiness policies.
- `inactive-draft`: `{draft:{id,revision,status:'inactive',payload:{synthetic:true,...}}}`.
  New head starts at revision '0', then contiguous revisions; old bundles use add,
  never put/delete. No source/entry/metadata/recordRevisions/financialRevision
  change. Payload is opaque experimental data, not an approved B4 draft form or
  bank verification/activation capability.

Every successful command advances stateRevision; financial/replace commands also
advance financialRevision. Raw financial numbers/strings, flags, IDs, timestamps,
line items, starting values, notes and historical audits are never coerced.

## Transaction, error and exactly-once contract

1. Clone/validate request, compute exact-token command fingerprint using Web Crypto
   SHA-256 **before opening** the readwrite transaction. The accepted sourceRevision
   helper is reused unchanged. This test identity scheme is not approval of a
   portable backup digest/canonicalization policy (B0.5 remains open).
2. Open **one** readwrite transaction over all 17 stores, including the common
   control/reference/audit stores. Queue IDB getAllKeys/getAll through callbacks;
   no nested repository transaction or await/file/network/hash work inside it.
3. Recheck actual protocol/mode/compiled capabilities. If operationId already
   exists, require the exact request + original dependencies fingerprint and
   compatible current generation. Return the original receipt **without writes**,
   even after a later command in that generation. Different payload/dependencies
   reject OPERATION_CONFLICT. A different current generation rejects replay.
4. Otherwise require exact generation, state/financial revisions, full control and
   every store's complete raw key/value token. Inserted/deleted records and changes
   with the same timestamp conflict. All writers through this protocol serialize
   through the common control scope; stale commands never auto-rebase/retry.
5. Enqueue requested raw/draft changes, revisions/tombstones, mandatory before-state,
   append-only audit and final control in that **same transaction**. Snapshot/audit
   use add; callers cannot target them or erase old history.
6. Any synchronous clone/write failure, request/quota error, validation conflict or
   cancellation aborts everything. The transaction error handler cancels the
   duplicate *default* abort and explicitly aborts once; it never converts a failed
   request into a successful transaction. Success resolves only from oncomplete;
   onabort returns one fixed diagnostic, no receipt or private exception text.

Receipt: operationId, kind, committed generation, stateRevision,
financialRevision and before-snapshot ID. Reading success from a request is not a
commit. After an uncertain result, query the operation ID and refresh the current
snapshot; an old receipt describes its historic commit, not the current balance.

Before-state snapshots embed exact raw/control/revision/draft values and reference
prior immutable audit/snapshot keys. Reconstruction joins those keys to retained
append-only records; snapshots do **not** recursively embed previous snapshots or
audit command dependency strings. Audits retain fixed-length command fingerprints.
All history remains retained in this experiment. Sizing/growth/retention/storage
headroom and portable integrity schemes require B2/B3 review; no 32 MiB production
cap or truncation/garbage-collection policy was imposed.

Diagnostics include INVALID_DTO/COMMAND/RECORD/CONSENT/DRAFT,
SYNTHETIC_DATABASE_REQUIRED, FACTORY_REQUIRED, SCHEMA_MISMATCH, CLOSED,
NOT_INITIALIZED/ALREADY_INITIALIZED, DATABASE_CONTEXT_MISMATCH,
STALE_GENERATION/REVISION/CONTENT, UNSUPPORTED_CAPABILITY, IDENTITY_CONFLICT,
OPERATION_CONFLICT/REPLAY_CONTEXT_CONFLICT, IMMUTABLE_RECORD_CONFLICT,
DATA_CLONE_FAILED, STORAGE_QUOTA, CANCELLED/TRANSACTION_ABORTED and DATABASE_ERROR.
No original notes, monetary values or exception messages appear in error results.
Successful snapshots/receipts are intentionally detailed synthetic data, not an
anonymized financial report or secure vault.

## Acceptance mapping and independent evidence

All tests use fresh injected fake-indexeddb factories, dedicated names and synthetic
fixtures. Native helper reads inspect actual IDB keys/values/keyPaths separately
from repository output. Failure cases compare **all 17 stores** before/after,
including control/revisions/drafts/audit/recovery, and verify no success receipt.

| Test ID | Evidence in test/storageRepository.test.js |
| --- | --- |
| T01 | raw readonly snapshot, actual keys/keyPaths/values/revisions; no writes |
| T02 | request success still unresolved; completion observer precedes durable receipt; independent expected post-state |
| T03 | all-raw-store replacement, exact intended rows/new generation/tombstones, audit and reconstructable before-state |
| T04 | first raw request fails; complete equality after abort |
| T05 | middle store fails after earlier source/revision writes execute |
| T06 | final audit and final control failures after successful raw writes |
| T07 | synchronous injected DataCloneError; unsafe serialization rejected |
| T08 | injected quota and explicit injected-IDB transaction abort |
| T09 | cancellation before start and after a raw write succeeds, no receipt |
| T10 | actual new generation rejects old prepared command |
| T11 | changed raw content with unchanged timestamp/revision is rejected |
| T12 | inserted absent-at-preview obligation and deleted dependency key rejected |
| T13 | requested and stored unknown capabilities reject inside transaction |
| T14 | same operation replay, after later legitimate command and after reopening, no new effects |
| T15 | same ID/different payload or original dependencies rejects |
| T16 | inactive-only draft preserves every raw row/source/revision/marker/audit and accepted financial outputs |

Additional tests cover denied open/delete names and absent factory before any IDB
call; captured names; no global fallback/cross-database command; foreign schema;
concurrent snapshot after first uncommitted write; competing commands; immutable
draft heads; safe errors/accessors; retained nonrecursive history/tombstones; and
source/occurrence identity protection.

Independent financial reference: the accepted fixture's confirmed cash stays
**600000 minor units** and Tax reserve **70000** after saving an inactive draft
whose candidate opening says 700000. Four accounts and original line/occurrence
IDs, validated flags, Last Entry and correction audits are raw-equal. The draft
does not rebase/activate any financial calculation.

Reproduce from budget-planner (Windows uses npm.cmd):

```sh
node --import ./test/register.mjs --test test/storageRepository.test.js
npm test
npm run test:cli
npm run lint
npm run build
git diff --check bd447e5 HEAD
```

Exact final SHA, full suite counts and Windows/Linux Node 22 CI links are in the
separate Stage 2B1 draft PR. Exploratory runs: 2 pass/19 fail/0 skipped from a
missing explicit empty budget collection in the new fixture; then 17/4/0 exposed
duplicate abort handling in fake-indexeddb and an array-order assumption in T16.
The handler now explicitly owns one abort; T16 compares the same IDB-order DTO
before/after plus independent financial totals. No negative control/guard was
removed. Subsequent focused suites passed; final evidence is recorded in the PR.

Final local Linux / Node 24.19.0 code validation:

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Full regression/checkpoint/adapter/repository | 198 | 0 | 0 |
| Of those: new repository (T01–T16 plus isolation/extra guards) | 27 | 0 | 0 |
| CLI/security | 10 | 0 | 0 |

Lint and production build PASS; existing Browserslist/npm-update advisories only.
Exact-head Windows PowerShell 5.1/Linux Node 22.23.3 CI logs and final diff checks
are recorded in the PR; local Node 24 is not Windows/Node 22 proof.

## Review limits and stop

These are **injected-IDB simulations**, including quota/clone/request errors and
abort/cancellation. No native browser, installed PWA, process crash, disk/power-loss
durability, real DB9 old writer or actual backup recovery was tested or certified.
Snapshots/epochs do not exclude non-cooperative direct writers. Actual old-build
DB9→10 barrier and all-writer/backup integration remain separately authorized B3;
portable text/digest/retention/restore decisions remain B2/B3.

Independent Architect review must assess namespace isolation, full dependency
coverage, transaction lifecycle/explicit abort, replay after later writes and
generation change, immutable reconstructable history, exact T01–T16 assertions
and unchanged accepted Stage 1/2A APIs. Owner acceptance remains separate.

No production code/database/version/backup/UI/SW changes, actual owner records,
financial repairs, checkpoint activation, merge/deploy, B2–B4, Stage 2C–E or
Continuous Planner Phase 2. Stop at the separate draft PR for review.
