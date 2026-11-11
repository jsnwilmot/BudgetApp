# Issue #32 — BLOCKED: B2 committed-root parity STOP

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
