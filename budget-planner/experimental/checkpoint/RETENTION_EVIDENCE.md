# P1.1a evidence, accounting and independent review gate

Issue29, binding G1–G6 from Issue28. Accepted parent is
7bd40fdb0dc23ec94fbc1a522260d0403b1f22ec / draft PR27. Only new files.
Final SHA, exact nine-workload measurements and Windows/Linux logs/results
are recorded in the separate draft PR targeting codex/p1-immutable-history-model.
This document defines how those results must be interpreted. No actual owner
records/backups, native database or production application code is involved.

## What this experiment establishes

- Complete immutable P1 pool enumeration, exact original hash/index/ordinal/
  count/byte census and recognized full typed-reference validation.
- ALL non-map records, full original source17/provenance/history and every
  committed local model root/journal/event/replay/dataset/version are roots.
  Explicit pins add obligations; a current full-inventory pin keeps everything.
- Discovery DFS and a fresh verification scan with independently enumerated
  references/reverse-ordinal propagation agree on every proposed exclusion.
  Test-only independent queue closure and a separate FP/key/map interpreter
  reconstruct original financial/source state from the hypothetical kept set.
- Original IDs/record bodies/digests/ordinals remain unchanged; comparison
  ordinals may have gaps. P1's own all-retained index/reader stays untouched.
- Versioned hypothetical plan, bounded root/exclusion/pin pages and a distinct
  deterministic verification record. None is a P1 archive, native inventory,
  adopted writer state, restore receipt or evidence of verified bank balances.

The sourceIndexRoot binds the unchanged comparator, not a promise that the
hypothesis can erase it. If the entire source pool/index is itself a retained
archive/pin obligation, gross savings are ZERO. Experiment metadata then adds
cost: report net increase, not a false storage benefit. Unknown or old external
index pins refuse rather than silently treating an obligation as absent.

## Independent references and financial proof

generate_retention_vectors.py has its own UTF16 ASCII canonicalizer, SHA256,
P1 record/chunk/value framing, small source index builder and manifest/plan
serializer. It calls no JS/model implementation. retentionGolden.json freezes
empty/full-pin full plan canonical bytes/hashes and a two-row source with exact
record hashes/ordinals and an excluded intermediate leaf (retained ordinal
gaps). The existing historyGolden.json is read but NEVER changed. It supplies
the original0/1/32/64/65/4096/4097 map bodies/roots. The new4,097-key source uses
unchanged P1 builder internals as a TEST-only unoptimized source factory and
explicitly pins observed roots. It adds the original empty data/model roots;
its census is not misreported as the older bare-map microbenchmark.

The hand-authored existing historicalSource/SOURCE_KEYPATHS oracle supplies
all17 original inventories, source controls/revisions/drafts/audits/protected
before-states and envelope. Its25 orphan +22 newer contributions and two actual
tax expenses remain separate;14 unvalidated rows,11 qualified candidate edges,
source corrections, archived bucket, original financial/source/line/occurrence
IDs and Last Entry marker remain exact. No linking/matching/reclassification.

New referenceReader independently interprets stored FP bytes, original keys and
map paths without the candidate's graph/reader/closure helpers. It verifies f64
bits/-0/subnormal, undefined/presence/own-key order and literal safe prototype
keys. It checks every source row/envelope and every changed version/value/
deleted flag/local revision/predecessor. Every committed root is read from the
final hypothetical kept set; every current head matches the independent command
log, unchanged collections preserve their exact original roots, and original
pre-projection roots remain reconstructable. No full pool scan per root.

The nine workloads reproduce EXACTLY the unchanged P1 fixture's370 commands/
year at1/3/5 years: low26 periods/one changed row/32 note units, medium27/two/160,
high27/four/512, slots=years*periods*12, explicit14-day dates,3 stable lines,
validation/amount/marker/evidence changes, every41st command tombstones then
later reinsertion. Two initial registration commands and original imported
archive remain counted. This is invented fixture arithmetic, not generated
live recurrence or actual household periods. No years/commands/versions dropped.

## Cost and efficiency interpretation

Known parent totals (declared bytes):

| Years | Low | Medium | High | High map bytes |
| --- | ---: | ---: | ---: | ---: |
|1 |20815519 |26548589 |38088521 |22112147 |
|3 |56403253 |77503505 |120017447 |81735280 |
|5 |97187501 |138992729 |223089067 |163063597 |

Every run includes the initial114 source rows,169 model-version wrappers,
12,015 objects and5,808,542 declared bytes. Five-year high has147,573 records,
20,500 maps,7,569 versions,1,852 journals,1,853 roots and55,121 chunks plus55,121
descriptors. Its833,039 private index allocations are cumulative construction,
not native rows or proved live heap. The analyzer separately counts currently
reachable ORIGINAL source-index nodes; it does not build a smaller P1 index.
Older simultaneously pinned handle memory and all future native index costs
remain UNKNOWN. Original incurred P1 hash/lookup/allocation counters remain.

For every object kind report baseline and kept count/bytes; excluded is exactly
baseline minus kept and is permitted only for maps. Report protected map count/
bytes, mandatory roots and pins, exact original input census/digest and all new
required metadata. Header descriptors are the plan's directory; root/pin/
exclusion pages and their IDs/framing are charged. The deterministic verification
record is also charged. No candidate writer/index is implemented or implied.

netTotal = keptP1Payload + allManifestPages + planHeader + verificationRecord.
netMapCost = protectedP1MapPayload + ALL new metadata (conservative attribution).
Header self-byte-size reaches a bounded deterministic fixed point with a64-char
planId placeholder, so there is no hash self-reference. Plan metadata uses exact
canonical ASCII length; this is still a MODEL byte unit, not physical IDB/heap,
UTF8 full backup size, compression, transaction WAL or quota consumption.

Report signed decrease/increase and integer basis points (floor, conservative),
not rounded financial amounts. Goals:>=20% NET map and>=10% NET total reduction
on the five-year-high fixture; no NET regression for any original nine cells.
Goal misses must be reported as efficiency FAIL, independently of correctness
PASS. They do not authorize deletion, shorter histories, adjusted fixtures or
an automatic P1.1b follow-up. All measurements and final pass/fail assessment
belong in the PR table; do not substitute pre-freeze exploratory measurements.

Discovery/verification processing reports include visits, encoded work bytes,
record/ref/index/page counts and injected-clock elapsed time. Their serialized
diagnostic sizes are reported separately; they are benchmark output, not
required persisted candidate metadata. Input inventory hash pages are charged
as processing, not emitted as a second full inventory: the complete source
index and census/digest already bind their membership. All data is caller-owned
synthetic P1 material, already resident in memory. No claim of lower peak RAM,
hashing/mutation work, native writes or real disk savings is supported.

## Acceptance registry

17 new model/adversarial cases +9 exact workload cases; baseline259 and CLI10
are unchanged. Final observed counts (including any failure/skip) are in the PR.

| ID | New evidence |
| --- | --- |
| O01/G3 | Independent Python full plan/record/hash/ordinal-gap vectors; original map boundaries and deterministic split IDs preserved |
| O02/G6 | All17 source keyPaths/keys/values/envelope and foreign before-history; monetary FP fidelity/undefined/order; no tax cohort merging |
| O03/G2 | Every local committed historical root and changed value/version/predecessor reconstructed; initial roots and replay evidence retained |
| O04/G1–G3 | Independent full closure, pin-protected former intermediate, full-inventory zero exclusions, unknown pin refusal, rehashed malicious smaller plan/root omission rejects |
| O05 |1/2/4/128 rows across keys/stores, source map split and unchanged P1 duplicate-key refusal |
| O06 | Original string/compound UTF16/long-surrogate keys, integer own keys and own literal prototype names; no ID rewrite |
| O07 | Bounded independent page/hash/manifest membership; missing/duplicate/extra/tampered pages, wrong context and cancelled prefix refuse |
| O08/G5 | Source/request/runtime descriptors/symbols/prototypes, invalid/cyclic/tampered graph, exact/over count/byte/ref/page/work/plan/time limits, safe codes and immutable caller ownership |
| O09 | Repeated origin retained once; A/B original IDs remain scoped and source generation/claims remain foreign data |
| O10/G4 | All nine exact workloads, all per-kind/metadata/work costs, every changed version/committed root, honest goal PASS/FAIL |
| O11 | Actual exact-head Windows PowerShell5.1/Linux Node22.23.3 full regression/security/lint/build/diff; old tests and vectors untouched |
| O12 | Runtime forbidden-global tripwires and source-path separation; no storage/opener/writer/restore/UI/import changes; explicit deferred native tests |

H01–H04/H06/H13/H14 model continuity is retained. H05/H07–H12/H15 native
portions, ALL R01–R08 and N01–N12 are NOT IMPLEMENTED / NOT RUN. They are NOT
hidden skips or passing model restore cases. Browser/PWA/device/quota/crash,
old writer fences, whole-nine guard and R1 full backup->fresh R1 equivalence
remain future independently authorized work. No bank verification is performed.

## Limits and remaining risks

Read RETENTION_PLAN.md for frozen DTOs, domains and numeric limits. Both phases
bound object/record/refs/financial-depth/expanded/work/page/total/elapsed budgets.
All source objects must authenticate to the original in-memory index; every
ref resolves to an earlier ordinal. Long ancestry uses iterative visits/ordinal
checks, not a recursive64-level journal limit. New analyzer budgets never raise
accepted P1/B2a limits. Failed, unknown, ambiguous, cancelled or partial evidence
cannot certify a smaller plan. Safe codes contain no source financial fields.

Runtime clock/cancellation functions and source callbacks are explicit trusted
in-memory injections. Deadlines are cooperative checks between bounded steps/
returned promises; they do not preempt malicious synchronous code or a callback
that never settles. There is no process sandbox, native watchdog or hard real-
time guarantee. Likewise trusted P1 handles are not security against arbitrary
code importing P1's internal registry. No actual owner file interface exists.

Substantial committed map paths, tiny value/chunk wrappers, original archive,
index overhead and unlimited historical growth remain. The accepted32MiB B2a
file cap, proposed64MiB full-native-nine exact guard, actual mobile heap/quota,
native atomic transaction/deadline and independent external recovery are OPEN.
Do not infer those different units fit from smaller declared plan accounting.
P1.1b optimized construction, packing/compression, new ordinal/index physical
formats, adopted schemas and full recovery need separate approval/review.

Development evidence: an exploratory test expected bookkeeping object-key
insertion order even though the plan contract compares canonical bytes; fixed
to compare canonical output while keeping financial own-order checks exact.
An unnecessary per-record rebuild in the independent TEST oracle was removed;
the superseded partial unit run was stopped. Lint found an ASCII regex and
unused import, fixed. A later independent tiny Python vector exposed the
reference generator charging JSON-wrapped chunks instead of P1 raw-chunk
payload; the Python cost formula was corrected, not the P1/model assertions.
The pre-freeze partial growth run was superseded after verification-record
overhead was made explicit. Final results must use the published tree/CI.

## Reproduce and stop

From budget-planner (Windows uses npm.cmd): npm test; npm run test:cli;
npm run lint; npm run build. Repository: git diff --check 7bd40fd HEAD.
Focused: node --import ./test/register.mjs --test
test/retentionPlan.test.js test/retentionGrowth.test.js. These are synthetic;
growth/oracle checks take minutes. Optional independent Python regeneration:
python3 test/fixtures/generate_retention_vectors.py; inspect only the new vector.

Independent Architect review must inspect G1–G6, every source/committed/pinned
root, typed closure and value bits, independent references, ordinal gaps and
source-index separation, all cost/goal/work accounting, bounded negative
verification and truthful native deferrals. Stop at the separate DRAFT PR.
No real finances/backup, production or accepted code/tests/APIs/DB changes,
garbage collection, P1.1b/P2/restore/later work, M3/Phase2, merge or deployment.
