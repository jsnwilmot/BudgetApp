# Issue #34 — B2 PARITY-ONLY PASS; independent review required

**Subsequent owner authorization:** Issue #32 completion resumed from accepted
`8e55c86dc7cb2e9617597f218d431e5b09314885` on this same draft PR. See
[WRITER_COMPLETION.md](WRITER_COMPLETION.md) for the new implementation and
acceptance map, and PR #33 for exact-head results. The parity-only record below
is retained as historical evidence; its original scope/authorization statement
does not describe the later owner-approved work. Full writer acceptance still
requires a new independent Architect review and owner decision.

**The limited bootstrap-parity milestone passes. PR #33 and the general writer
remain INCOMPLETE / NOT ACCEPTED. No efficiency verdict or broader authorization.**

Correction/test commit: `0a2391e10833f8b8939fce6d7b96149fa41f463c`.
Remediation starts at `573d90e441116b22e3a00bcfeb878261e60809fa` on the existing
`codex/p11b1-command-writer-model` branch. Parent PR #30 remains unchanged at
`ca80cc9d74cdf03079febe2bba4e770d8a065db2`. Final documentation/CI head and exact-head
Windows/Linux job links/results are maintained in [draft PR #33](https://github.com/jsnwilmot/BudgetApp/pull/33).

## Limited correction (D1–D5)

`writerSource.js` now parses the **whole canonical transport**, not a hand-sorted
top-level envelope, before FP-TV interning. The small experimental parser
preflights grammar, decoded duplicate keys, ASCII/escape/depth/string/numeric
bounds and canonical bytes before whole-document JSON.parse; it rejects unknown
current-format versions/capabilities/fields. Its input is the fresh synthetic
constructor's generated transport, not a file/import API. All native source
financial values retain the original FP-TV own-order representation.

No accepted codec/history API, hash domain, FP-CJ/TV/MAP rule, original source row,
producer/transport digest, frozen WRITER_FORMAT.md, golden/Python vector, database,
dependency, workflow or production code changed. The accepted codec/P1 model is
used as an independent reference in tests, never to precompute candidate roots.

Only after focused parity passed, the unused `nativeToken` alias was removed.
Its used `token` function and all source-validation rules are unchanged.

The bounded-reader failure was accumulated **copy ownership**, not proof that
valid source data needed a larger cap. `readLogical`/`readMetadata` now release
only their call-local copy reservations when ownership passes to the caller,
including failure paths. `readPage` reserves its new defensive byte buffer before
allocation and releases the call-local reservation after transfer. Session work,
visits, retained encoding caches, cancellation and deadline remain cumulative;
no cap, graph check or interface changed. Caller-retained output/actual JS heap
is outside this source-owned staging meter; this is not a native-memory claim.

## Independent bootstrap evidence

The unchanged original 114-row fixture and accepted P1 reference produce identical
canonical transport/content/transport/snapshot digests, source identity,
`envelopeRef`, all 17 native store keyPaths/compound keys/row keys/values/own order,
all store roots, complete inventory/originRef, data/origins/datasets/operations
roots, journal/event/request digests and model roots at revisions 0/1/2.

| Revision | Accepted P1 AND corrected candidate logical root | Result |
| --- | --- | --- |
|0|822d9bbf21a3a40599cccec3dfd7007e09f964ea80fe853b11fdcf30c9ae8e53|MATCH|
|1|84f6fc93573b68105eff700c3006978a5fd39eb90c8af773a11d358b10c6da0c|MATCH|
|2|9085de88d28f5087deed6695c4bd89e79360212e0ac8feb21b9fc35588d575e6|MATCH|

Correct `envelopeRef` is the unchanged accepted
`a4551453a5a167012f7b3065a31fe391fe0ab7ffa965faf73f846d39bea30e30`.
Every original **11,841 non-map bootstrap fact** is present with its original
logical ID/body, and all candidate map IDs are independently hashed and compared
to P1. The envelope typed closure contains **10,476** exact value/chunk nodes.
Native row assertions cover empty stores, all source histories/revisions/drafts,
audit/protected before-states, validations/Last Entry, and separate 25 orphan /
22 newer savings transfers / two actual tax expenses. These are synthetic facts.
The earlier unisolated descriptor comparison is superseded by exact **per-store
root IDs** and canonical wrapper comparisons; native financial own-order is
asserted separately, not normalized away.

A separate additive typed-metadata fixture keeps the same 114 rows and original
financial fields while exercising -0/subnormal bits, own undefined versus absence,
large exact minor strings, literal prototype names and Unicode/own-key order.
Its accepted-reference and candidate roots match at all three revisions too:
revision 1 `28c9d6ba5224fc0cd86e8a3c6aaac518daad58d835f7cb04dff9424bf4cdb6d1`,
revision 2 `4a18608e70ba9d0874cc8f30d11faf7a65e714189cdc886dae5a088ec8686cb0`.
It preserves **12,015 non-map facts** and **10,640 envelope closure nodes**.
Input own-data remains unchanged in successful and rejected cases.

The independent test reader uses literal physical framing and Node SHA256,
without candidate wire/map/value helpers. Accepted P1/native references and
unchanged literals are separate oracles. First-difference messages identify
kind/ref/location/expected/actual hashes using only synthetic IDs.
The original incorrect envelope/root IDs remain below and in negative regression
assertions. Equal canonical content with different FP-TV own order is explicitly
tested as incorrect. New physical inventory/page/sequence identity intentionally
differs from P1's complete physical indexRoot.

## Focused tests and reproducible validation

Six new `test/writerParity.test.js` cases (not W01–W16):

1. Exact original source17, all bootstrap facts/envelope closure and roots 0/1/2.
2. Exact rich typed metadata, native values/own order and protected histories.
3. Whole transport equivalence; original wrong own-order negative evidence;
   malformed/duplicate/truncated/unsafe/unsupported/over-budget parse refusal.
4. Invalid sources reject like the independent codec: nonsynthetic, active,
   mismatched native key, nonfinite number and getter without execution.
5. All **11,862** logical bootstrap reads succeed; records/metadata stay frozen,
   returned buffers cannot mutate the source, and 2,022 bounded repeated reads
   transfer **9,438,696** serialized bytes without accumulating staging ownership.
6. The same read session still rejects cancellation and >60s elapsed time with
   fixed errors/no partial output; no source/controller changes.

Local Linux **Node v22.23.3**: six targeted tests PASS /0 failed /0 skipped;
CLI/security 10 PASS /0 failed /0 skipped; lint, production build and baseline
diff checks PASS. The original focused gate passed before the alias/read fix.
One development lint run found a missing explicit Node Buffer import in the new
test helper; the import was corrected and lint passed. No assertion was relaxed.

Exact-head CI must independently confirm **291 regression/model tests =285
unchanged +6 limited tests**, plus10 CLI/security, lint/build/diff on Windows
PowerShell5.1 and Ubuntu Node22.23.3. Consult the final PR evidence for actual
job results; these local results alone are not a cross-platform CI claim.
Existing P1/P1.1a growth tests remain unchanged regression requirements; no new
writer nine-workload benchmark was implemented or executed.

From `budget-planner` with Node22.23.3:

```sh
node --import ./test/register.mjs --test test/writerParity.test.js
npm test
npm run test:cli
npm run lint
npm run build
```

Use npm.cmd on PowerShell5.1; run `git diff --check` from the repository root.
Only synthetic fixtures are needed. No owner-file command exists in this remedy.

## Remaining review / STOP

**B2 PARITY-ONLY PASS**, pending independent Architect/owner review. This proves
the explicitly compared bootstrap milestone and focused read behavior only.
General replay/concurrency/cancellation correctness, full physical authority
audit, W01–W16, all changed-command historical states and new nine-workload
storage/performance remain UNIMPLEMENTED / NOT RUN / NOT ACCEPTED as applicable.
No measured writer-efficiency improvement is claimed.
Native R01–R08/N01–N12/H, IndexedDB, complete recovery/restore, old-PWA fences,
quota/heap/mobile/power-loss remain NOT IMPLEMENTED / NOT RUN.
No real financial data/backups, account/Property Taxes changes, activation,
P1.1b2/P2/later phases, merge or deploy. Stop for the required second review.

---

# Archived Issue #32 STOP at 573d90e (original failure evidence)

The remainder records the initial blocked state before the limited Issue #34
correction above. Its pending/failing validation statuses are historical.

**Incomplete experimental work. Not accepted, not usable, no efficiency PASS.**
Branch: `codex/p11b1-command-writer-model`.
Exact parent: `ca80cc9d74cdf03079febe2bba4e770d8a065db2`.
The first commit, `ae84c3a`, froze WRITER_FORMAT.md and independently authored
Python/literal vectors before the writer modules were implemented.

## Binding stop

[Issue #32 B2](https://github.com/jsnwilmot/BudgetApp/issues/32) requires:

> If committed roots differ unexpectedly, report and STOP; do not alter accepted
> FP hashing to make tests pass.

The first complete synthetic initialization comparison encountered this condition.
Implementation stopped; subsequent work only collected read-only synthetic
evidence and preserved this reviewable branch/draft. No accepted source, API,
test, vector, financial record, dependency or workflow was changed.

## Reproduction and observed result

Use `historicalSource()` / `modelFixture()` from the unchanged
`test/fixtures/historyModel.js`. New `createWriter` received:

- producer appVersion `synthetic-p1-fixture`, exportedAt `2026-12-31T00:00:00.000Z`;
- logical instance `p1-instance`, generation `local-generation`;
- physical instance `writer-vector`, physical generation `local-generation`;
- original source operation `foreign-init`, dataset operation `project-A`, dataset `A`;
- explicit runtime `{now:()=>performance.now(),cancelled:()=>false}`.

These are invented synthetic inputs only. Compare returned bootstrapRoots to
all model-root records from the independently run, unchanged P1 fixture.

| Revision | Accepted P1 logical root | Candidate logical root | Result |
| --- | --- | --- | --- |
|0|822d9bbf21a3a40599cccec3dfd7007e09f964ea80fe853b11fdcf30c9ae8e53|822d9bbf21a3a40599cccec3dfd7007e09f964ea80fe853b11fdcf30c9ae8e53|MATCH|
|1|84f6fc93573b68105eff700c3006978a5fd39eb90c8af773a11d358b10c6da0c|b20270f81f9d2ec015945d758d3753ca1d43336e53355bbb0d800aea42854514|FAIL|
|2|9085de88d28f5087deed6695c4bd89e79360212e0ac8feb21b9fc35588d575e6|957e4b8a0b460da59de5cfb81fc6a7b68fcc22310281b576ade06dcb89675b5a|FAIL|

Source content digest, transport digest, snapshot digest and origin identity
matched the accepted source. This is insufficient for exact P1 FP-TV preservation.
The source-capture dataRoot/originsRoot then differs; its journal's afterDataRoot
and all downstream operation/model roots differ. Dataset request digests subsequently
differ because their expectedRoot refers to the already different capture root.

One confirmed discrepancy is **transport-envelope own-property order**:

- P1 captured envelopeRef:
  `a4551453a5a167012f7b3065a31fe391fe0ab7ffa965faf73f846d39bea30e30`.
- Candidate envelopeRef:
  `1d7b9c98ef5b1fceb5c58f4e372486527313550b0e5646fe6c444a407c4c2e28`.
- P1 top-level keys:
  appName, appVersion, data, exportVersion, exportedAt, integrity, metadata, schemaVersion.
- Candidate top-level keys:
  appName, exportVersion, schemaVersion, appVersion, exportedAt, metadata, data, integrity.

The accepted P1 capture decodes canonical transport bytes before encoding the
envelope as an FP-TV value. The new source helper supplies its constructed
in-memory envelope. FP-CJ content digests sort keys, but FP-TV object nodes
preserve own-property order, so equal canonical content does not imply equal
typed envelope IDs. The original17 inventory descriptor comparison also differed;
complete per-store/value cause isolation has NOT been finished. Do not claim
that envelope-order correction alone resolves every difference.

Proposed Architect decision: authorize an experimental-only correction that
exactly reproduces accepted transport decoding/own-order semantics, then rerun
every committed-root and source17 reference assertion. Preserve all accepted
hashes/contracts and original financial record property order. Any remaining
mismatch must be isolated before financial integrity can pass. No correction
was applied after the STOP.

## Validation status

- Independent Python vector generation completed before writer implementation.
- Focused source-encoder content-digest comparison: MATCH (development probe).
- Focused complete initialization parity comparison: FAIL (revisions 1 and 2).
- A full decoded-logical-object read probe also hit RESOURCE_LIMIT; per-read
  staging lifetime/accounting needs review. Bounded raw page inspection provided
  the envelope evidence instead. This does not establish a complete safe reader.
- Development probes used local Node v24.19.0, not the required Node22 CI runtime.
- No formal W01–W16 acceptance tests have been implemented or passed.
- The complete 285 regression/model tests and 10 CLI/security tests were NOT RUN
  locally for this incomplete writer. Any automatic draft CI result must be
  reported separately; old tests alone cannot certify the new writer.
- Lint/production build and exact-head Windows PowerShell5.1/Linux Node22.23.3
  validation are pending. No passing result is inferred from accepted PR #30.
- No nine-workload writer comparison, valid reduction percentage, performance
  target verdict or full historical preservation proof exists. Bootstrap work
  counters are diagnostic only and cannot support an efficiency PASS.
- `git diff --check` is the only completed repository-wide check at this STOP.

## Incomplete implementation inventory

New experimental modules cover metered input/FP construction, fresh-source rules,
command-local transient maps, compressed private lookup, physical page framing,
append inventory/seals/state, delta/index verification and pure CAS lifecycle.
These are unaccepted work in progress. In particular, concurrency/staging
lifecycle edges, independent full inventory verification, finite read-session
budgets, malformed-node checks and complete acceptance coverage remain unfinished.
Do not use the module exports as financial authority or integrate them.

All original 17-store/25-orphan/22-newer/two-tax data is synthetic. Original
accepted P1 and production code remain unchanged. No owner's backup, IndexedDB,
restoration, P1.1b2 packing, P2, activation, reconciliation, merge or deployment.
R01–R08/N01–N12/native H remain NOT IMPLEMENTED / NOT RUN.

Stop for independent Architect and owner direction under B2 before resuming.
