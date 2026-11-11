# P1 model evidence and review gate

Issue26; Architect A1–A6 in Issue25. Base accepted B2a
`2c2a7d0f7ee26b26019559d1b119592d788a5eaa`. All execution uses invented
in-memory data. No native repository/IndexedDB/restore exists in this change.
Final SHA, Windows/Linux exact-head CI and observed counts are in the draft PR.
Production functionality, all accepted APIs/contracts/tests and backup formats
are unchanged. No owner data/profile/backup was accessed.

## What is established

- Exact reconstruction of a hand-authored **17-source-store** B1 inventory,
  including independent native-keyPath metadata, keys/own-data values, original
  envelope, source controls/revisions/tombstone, drafts, audits and before-state.
  This is a source-shaped fixture, not a new native database experiment.
- A separate **nine-store conceptual** R1 catalog, dataset-scoped projection and
  local immutable versions. No nine/17 target stores are physically created.
  A foreign verified flag, operationId or generation never becomes local bank
  proof or execution authority. Same original IDs in A/B stay separate.
- 64-way persistent ordered maps with deterministic32/33 splits/path copying,
  tombstones/reinsertion, live versus total counts, original-key references and
  history roots. All prior versions remain readable from the newest model;
  earlier local roots can be queried without restoring/replacing authority.
- Whole retained-object census and bounded injected in-memory page source with
  opaque root/scope/instance/progress continuations, exact membership/digests,
  cancellation and COMPLETE only after complete traversal/count/bytes/closure.
- Explicit source/descriptor/node/value/depth/expanded-work/page/visit budgets,
  immutable inputs and fixed safe errors. Unsupported getters never execute;
  literal own prototype names survive without pollution. No financial rounding.

Logical inventories establish equivalent records. Physical roots may differ
with insertion history. No hash is bank authentication. Original transport
digest is recorded; whitespace/byte spelling cannot be recovered from it.
No recursively embedded generated R1 file, automatic matching or deletion.

## Independent references

`test/fixtures/generate_history_vectors.py` uses its own Python UTF16 canonical
writer, struct/hashlib, FP value references and persistent-map insertion/split
implementation. It never calls the JS model. The committed historyGolden.json
contains fixed initial-model/index/root/journal hashes, exact canonical bytes,
integer-index own-key ordering, mixed Unicode/compound keys and map roots/shapes
at0/1/32/64/65/4096/4097 keys. Tests consume fixed expected vectors, not expected
hashes calculated by the model at assertion time. Optional maintainer regeneration:

```sh
python3 test/fixtures/generate_history_vectors.py
git diff -- test/fixtures/historyGolden.json
```

On Windows use `python` if installed. This developer script writes only a new
synthetic reference fixture; it is not the pure model or an owner-file utility.

The source fixture declares an independent17-store keyPath oracle and compares
every original key/value and original envelope. It retains25 orphan/22 newer
savings contributions and two distinct synthetic real-tax-bill rows,14
unvalidated entries,11 candidate edges, original line/source IDs, Last Entry,
archived bucket, foreign receipts and before-state. No inferred postings.

Growth verification uses an independent append-only per-key record/revision log,
not map outputs to calculate expected values. It compares **every** modeled
version/value/tombstone/local counter and sampled old roots, plus full original
source history. P1 does not run a bank/account balance calculation.

## Acceptance registry / status

19 model cases in historyModel.test.js and9 workloads in historyGrowth.test.js
=28 new cases. Existing231 regression and10 CLI/security cases are retained.
Groups below refer to model evidence only; native deferrals are not passing
tests, hidden skips or implemented restore cases.

| ID / Architect | P1 evidence | Not established |
| --- | --- | --- |
| H01 /A3 | Independent boundaries, map/node/path roots, string/compound/UTF16/long keys, integer own keys; split propagation, tombstone non-underflow, reinsertion, different roots/equal inventories | Physical key deletion/merge/GC deliberately absent; deletion retains tombstones |
| H02 /A1,A2,A5 | Exact17-source reconstruction, previous roots/versions, amounts/lines/validation/marker edits, tombstone/reinsert, source unchanged, own undefined/-0/subnormal/Unicode/prototype literals | Actual financial data or authoritative ledger not analyzed |
| H03 /A4 | Nine complete1/3/5-year370-write workloads,26/27-period variants, multi-row changes, retained provenance, exact version/byte/map/journal/lookup counters | Actual browser disk/heap/native index size not measured |
| H04 /A1,A2,A4 | Complete origin once, repeated references without recursive files, foreign source controls/receipts remain data, A/B dataset isolation, input/byte ownership | R1 full-file codec and recovery loop NOT IMPLEMENTED |
| H05 model /A6 | Bounded pages, pause/resume at old root while model changes, slow async boundary and pure cancellation version | Native transaction completion, auto-close and writer scheduling NOT IMPLEMENTED |
| H06 /A2,A3 | Missing/tampered/extra/duplicate source responses, wrong context/token/instance/scope, unsupported types/getters, exponential shared-input expansion and safe errors | A malicious callback/factory or arbitrary application code is not sandboxed |
| H07 model /A4,A6 | Actual modeled60KiB chunk boundary,64KiB declared payload bounds and refusal; B1 huge-record limitation documented | Existing B1 getAll or one huge IDB value not retroactively bounded |
| H08 | Resource arithmetic only, no quota methods | Native capacity/headroom/quota abort NOT IMPLEMENTED/NOT RUN |
| H09 model /A5,A6 | Exact expected model root/revision, replay fingerprints, changed request rejected; no shadowing context with extra fields | Full-nine native restore guard/two-tab transaction race NOT IMPLEMENTED |
| H10 model | Module/runtime no-effect tripwires; no native opener/export/restore API; accepted boundaries unchanged | Native namespace/schema/opener tests remain P2 |
| H11 model | Original B1 envelope/profile/canonical and transport digest semantics preserved exactly | R1-native full backup->fresh R1 equivalence NOT IMPLEMENTED |
| H12 | No app UI/verification behavior introduced; model events say MODEL_ONLY | Quarantine/verification finalization/owner consent/PWA NOT IMPLEMENTED |
| H13 /A4,A6 | At/over retained-object/byte limits, depth/string/ref/operation/page/visit bounds, invalid budget structures refused; previous roots still accessible |128/256MiB work accounting is not actual peak memory |
| H14 /A2,A3,A5 | Independent root/index/journal vectors, earlier-ordinal refs prove acyclicity, foreign/local IDs separated, exact effect-free model replay, no full before-store/key-list copies | Model event is not a native commit receipt or bank validation |
| H15 model /A4,A6 | Complete retained history and measured growth, explicit per-object/page limits and native-release blockers | P2/C1/C2/native storage feasibility remains OPEN |
| R01–R08 | **NOT IMPLEMENTED / NOT RUN** | Every database restore/rollback/atomicity/crash/quota/verification case |

All actual Node cases must report passing/failing/skipped separately. Native
deferrals must never be counted as model PASS. Existing CLI guards, symlink
permission policy and negative controls are untouched.

## Measured model workload assumptions

Each workload begins with a complete foreign origin and A projection:
114 original source rows,2 foreign audit/2 protected records,1 draft/head,
169 origin/projection model-version wrappers,12,015 retained objects and
5,808,542 declared bytes (including1,059,581 unique logical FP value bytes).
No part of this import is omitted from the totals below.

Then370 local model operations/year. Low uses26 periods/year,1 changed row/op,
32-character note prefix; medium uses27 periods,2 rows/op,160 note units; high
uses27 periods,4 rows/op,512 note units. All variants edit amounts, three stable
line IDs/amounts, validation and marker data, with explicit synthetic evidence;
every41st operation creates retained tombstones and later writes reinsert keys.
Dates advance14 days across calendar years;27 every year is a stress workload,
not a claim of actual household pay-calendar occurrence counts. Slot count is
years*periods*12.2 initial model registration operations are separate from370/y.
Every changed version is compared, not just ending values. No checkpoint or
transaction recurrence is activated/generated in the application.

Metrics: unique logical FP value bytes, all retained model record payloads,
chunks/descriptors/versions/maps, roots/journal and model-adapter index copies
are separate. Declared chunk cost=raw canonical ASCII bytes+canonical metadata;
other records=canonical body+metadata. This is not compressed wire size, native
IDB serialization, heap, SQLite/MySQL storage or an authenticated backup.
All intermediate path nodes from successful multi-row model actions remain
in the retained object census and its cost; no transient-node pruning/GC hides
space. Adapter index path-copy allocations are measured separately and excluded
from the proposed physical catalog payload estimate; actual native costs remain
unknown. Mutation-building lookup visits exclude later readonly oracle work.

| Years / variant | Ops / compared changed versions | Objects / model versions | Declared bytes | Unique logical FP bytes | Maps / map bytes |
| --- | --- | --- | ---: | ---: | --- |
|1 low |370 /370 |27372 /539 |20815519 |1782061 |1915 /10540686 |
|1 medium |370 /740 |31693 /909 |26548589 |2316789 |2656 /14447447 |
|1 high |370 /1480 |39693 /1649 |38088521 |3777929 |4136 /22112147 |
|3 low |1110 /1110 |57926 /1279 |56403253 |3225126 |5657 /35220689 |
|3 medium |1110 /2220 |70871 /2389 |77503505 |4829527 |7878 /50845340 |
|3 high |1110 /4440 |94859 /4609 |120017447 |9213509 |12318 /81735280 |
|5 low |1850 /1850 |86069 /2019 |97187501 |4652116 |9398 /65691863 |
|5 medium |1850 /3700 |107593 /3869 |138992729 |7326935 |13100 /98375593 |
|5 high |1850 /7400 |147573 /7569 |223089067 |14635017 |20500 /163063597 |

| Years / variant | Chunks = value descriptors | Journal / model roots | Adapter index allocations |
| --- | ---: | --- | ---: |
|1 low |11528 |372 /373 |138003 |
|1 medium |13133 |372 /373 |161157 |
|1 high |16023 |372 /373 |204894 |
|3 low |22714 |1112 /1113 |306333 |
|3 medium |27521 |1112 /1113 |379994 |
|3 high |36185 |1112 /1113 |519014 |
|5 low |32695 |1852 /1853 |467739 |
|5 medium |40681 |1852 /1853 |594138 |
|5 high |55121 |1852 /1853 |833039 |

These are deterministic counts from the local full synthetic run. Per-workload
building lookup visits are printed in final test diagnostics and the PR (the final reinsertion-identity guard includes additional reads).
Exact-head Windows/Linux diagnostics must agree on the final model counters; any differences require investigation.
Current/different insertion histories can have different map hashes with equal
logical records, so hash equality is not the sole financial oracle.

### Comparison and unresolved storage risk

Prior B1 figures209.61/1777.47/4876.96MiB at1/3/5 years are **arithmetic
estimates**, not the same measured workload or native database. Prior R1
7/26/68KiB/op sensitivity estimates3.59/10.45/25.63MiB,10.67/31.26/76.79MiB,
17.74/52.07/127.95MiB also excluded this imported archive and used different
per-operation costs. The measured P1 totals are higher; don't substitute those
hypothetical estimates for these results or claim a controlled native speedup.

Maps dominate: five-year high retains163,063,597 map bytes out of223,089,067
declared total. Journal and model-root bodies remain small per operation,
without full old-state/key-list arrays, but path copying and descriptor overhead
are substantial. The private persistent index also allocates833,039 nodes in
that workload (an implementation model metric, not native allocation evidence).

**Release blockers remain:** five-year variants exceed the proposed64MiB whole
nine-store guard and many exceed the accepted32MiB B2a file cap. These are
different budgets, so crossing a model payload figure is a warning requiring
native measurement, not proof of a particular serialized file/guard size.
P1 does not solve native quota/heap/latency or approve a larger file format.
Before P2, Architect must evaluate map granularity, staging/transient retention,
descriptor/physical encoding and exact bounded-reader/guard workload; owners
must separately authorize any changed contract. Never prune history, lower
oracle coverage or relax guards to make a benchmark fit.

## Reproduction / truthful validation

From budget-planner; Windows PowerShell5.1 uses `npm.cmd`:

```sh
npm test
npm run test:cli
npm run lint
npm run build
git diff --check 2c2a7d0
```

Focused P1 synthetic checks:

```sh
node --import ./test/register.mjs --test test/historyModel.test.js test/historyGrowth.test.js
```

Full regression count is259 = accepted231 +19 model +9 growth. CLI10 unchanged.
Growth tests can take several minutes; wall time varies with host load. No
actual browser/native transaction/disk/PWA/private-file tests are claimed.
The PR records local and exact-head Node22.23.3 Windows/Linux results separately.

Development evidence: first19-boundary/model work started with15 cases:
12 passed/3 failed/0 skipped from test assumptions (long strings sort before
compound keys; local/foreign revision strings can coincide; an8KiB page cannot
hold a larger single record). Corrected expectations and added explicit too-
small-page refusal. Later19 model cases and9 growth workloads passed. One test
edit had a duplicate variable declaration and failed at module load0/1/0;
renamed the test variable and reran it. Early lint caught unused imports, fixed.
Final audits added strict request-field validation before replay, raw-string-key
checks, malformed budget refusal, input ownership, latest-model old-root
queries and identity protection through retained tombstones. Focused guards and
exact-head CI must validate these; no accepted
security assertion was removed or weakened. Final PR evidence supersedes
exploratory counts without presenting cancelled/unexecuted native tests as PASS.

## Required independent review / stop

Review A1–A6, exact17-source semantics, original-key/version/tombstone fidelity,
foreign/local authority, map/index/golden independence, page completion/bounds,
model allocation/byte definitions, every historical oracle and storage costs.
Pure source callbacks and opaque handles are not a sandbox against malicious
application code. Cancellation is a new immutable reader version, not global
revocation/native abort. Long local history is ordinal-acyclic, not limited to
the depth64 of a single financial value. No actual R1 receipt, restore, quota,
guard runtime, encryption, old-writer fencing or native durability is proven.

No P2, C1/C2, B2c/B3/B4, production integration, checkpoint activation, financial
correction, real-data use, merge/deploy or Continuous Planner Phase2. Stop at
the separate draft PR for independent Architect and owner acceptance.
