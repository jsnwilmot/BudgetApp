# Issue #32 — command-local writer experiment

Completion work starts at the owner-accepted B2 correction `8e55c86dc7cb2e9617597f218d431e5b09314885`, on existing draft PR #33. The original wire specification, Python/literal vectors, financial hashes and accepted P1/P1.1a APIs remain unchanged. This document supplements [WRITER_FORMAT.md](WRITER_FORMAT.md); [WRITER_BLOCKED.md](WRITER_BLOCKED.md) retains the original discrepancy and parity evidence.

This is a pure, fresh-source17, synthetic experiment. Publication means an in-memory head changed, never native durability. No production import, storage, planner calculation, backup, UI or financial correction is connected to it. Architect review and owner acceptance remain required.

## Implementation

- A command builds mutable paths privately, preserves original request order and materializes only final or explicitly pinned paths. Child records precede parents. Every owner command retains P1's exact version, event, journal and committed model/data roots. Exact financial no-op edits still create historical versions; tombstones remain historical facts.
- Opaque command/candidate capabilities have exclusive staging, pinning, sealing, verification and publication phases. Overlapping calls cannot revive a failed/discarded candidate. Cancellation remains checked during asynchronous hashing and immediately before compare-and-swap. Only a verified candidate bound to the actual current owner snapshot can publish.
- Exact local replay checks the original request and physical guard, returning its original seal even after intervening commits. Altered requests/guards conflict. Foreign imported operation names confer no local authorization. Logical dataset scope remains separate from local physical scope.
- Immutable pages, inventory deltas, seals, headers and pin batches form the authority. A compressed radix accelerator is replaceable and privately scoped. Full-inventory pins keep every published object; pre-seal intermediate pins publish their complete additional closure. Old reader handles remain immutable. Old P1 full inventories retain their original index/ordinals and are refused as new-profile imports.
- `verifyWriterInventory` independently reads authoritative page/metadata bytes and checks exact index membership, sequence, counts, costs, contexts, every logical hash/reference, FP typed-value grammar/expansion, map order/summaries, operation events, physical request bindings and all historical states. It does **not** trust `source.readLogical` or traverse the producer's lookup tree to reconstruct records. Its returned rebuilt lookup is read-only and has no write/restore authority.
- Stateless canonical preflight rejects duplicate/out-of-order keys, nonminimal escaping/numbers, non-ASCII bytes, unknown tags/flags, trailing/truncated data and unsafe sequence conversion. This avoids retaining a session-long canonical quote cache during full reading. Accepted canonical bytes/hashes do not change.
- The new reader enforces the frozen 61,440-byte chunk layout even if a differently split descriptor has the same FP value ID. Full auditing resolves roles directly in its independently authenticated prior-record registry instead of building a redundant per-record map; every edge, hash, role and child-before-parent check remains. Repeated key interpretation is cached and charged. Failure results contain fixed diagnostics and aggregate work counters, never a partial proof or rebuilt reader.
- Index enumeration prechecks the 128-row array bound and validates closed own-data descriptors for each immutable scalar ID/type. It avoids recursively cloning already bounded scalar rows, still meters every row/byte and rejects holes, extra fields, symbols, getters, duplicates, omissions and unexpected membership. Rebuilt logical outputs use the same exact field/locator contract as the qualified producer reader; tests compare every logical object, not just the tip.
- Existing command/bootstrap/audit limits are unchanged. Temporary copy reservations end when ownership transfers; the retained verification registry is separately bounded by the existing 400,000-object/256 MiB full-audit limits. String escaping reserves worst-case scratch before construction. Caller-supplied limits can only lower caps.
- Mutable private radix branches reserve each additional 8-unit child slot before growth. The exact-cap test independently totals three 96-unit leaves plus a 48-unit three-child branch (336 units), and refuses a 328-unit budget. Retained cost, hashes and wire bodies are unchanged.

## Independent evidence and acceptance map

The unchanged P1 executes **separately**, using its own previous root. Small command tests compare it after each publication; measured workloads run it first in an independent process, then compare each candidate publication against its corresponding reference root. Original non-map fact bodies are compared by independently computed SHA-256 canonical-body signatures. No expected P1 root/ordinal/fact, retention keep-set or replayed history is supplied to the candidate. Every financial root mismatch triggers a failing first-difference assertion and halts the workload sequence.

| ID | Executable evidence |
| --- | --- |
| W01 | Frozen independent Python wire/domain literals; identical fresh constructor runs; every committed root versus unmodified P1. |
| W02 | Unchanged independent Python 0/1/32/64/65/4096/4097 roots/topologies; Unicode/compound UTF16 order and alternate orders; exact map reuse, financial no-op history, repeated tombstone/reinsertion; zero-change refusal. |
| W03 | 1/2/4/128 changes, shared/dispersed paths and multiple stores; duplicate pair refusal; independent version/cardinality checks. |
| W04 | Cancellation during staging/sealing/verification/CAS, expiration, unverified publication, concurrent asynchronous calls and discard; no staged reads or partial publication. |
| W05 | Same-base CAS winner, exact replay after later writes, changed guard/request conflicts, stale context and foreign operation-name isolation. |
| W06 | Original parity tests plus complete native source17 key/value/keyPath proof in all nine cells, typed own-order/f64/undefined/minor-string evidence, unchanged 25+22+2 tax cohorts. |
| W07 | Pre-seal intermediate/full-inventory/repeated pins, old snapshot reader, missing/late pin rejection and charged overhead. |
| W08 | Original P1 inventory/ordinal archive remains unchanged; incompatible reader and legacy import refusal; coexistence cost. Positive archive conversion remains unimplemented. |
| W09 | Frozen 24/38-byte framing, domain/context/sequence distinction and unsafe/endian/format refusals. Original ordinal/index references are preserved, never reassigned. |
| W10 | Two datasets sharing financial IDs; original source/occurrence identity refusal; retained Last Entry/audits and foreign source authority isolation. |
| W11 | Exact independent whole ledger/index membership and rebuilt reader; corrupt page/metadata/context, extra/missing/duplicate rows, wrong reference roles and closure rejection. |
| W12 | Every configured numeric cap at/over its fixed maximum; deep helper staging/visits/work/key/compare/records/maps/refs/depth/lookup/expansion/page/chunk checks; lowered retained/command/pin/row caps; huge requests, Unicode, getters, cycles, throwing proxies, safe errors and deadlines. |
| W13 | Actual crypto observer counts all producer/verifier hashes and bytes for candidate and original P1; declared copy/encoding/map/index/key work and real-clock 128-row bounded stress. |
| W14 | Original nine workload generators and exact baseline totals; all roots/changed versions, independent retained-fact/source17/history reconstruction; explicit pin and two-dataset/archive variants. Efficiency misses are diagnostic results, never silently skipped financial checks. |
| W15 | Frozen independent Python raw bytes/domain/DTO vectors, strict malformed wire/canonical/typed tests. The frozen newline-chunk example remains an inadmissible logical chunk: its raw byte/hash vector is preserved and the reader must reject it. |
| W16 | Additive tests, unchanged original assertions/guards, denied runtime network/browser-storage globals and static writer import checks; exact-head Node 22.23.3 Windows PowerShell 5.1/Linux CI required. |

Files: `test/writerCommands.test.js`, `test/writerFormat.test.js`, `test/writerGrowth.test.js`, unchanged `test/writerParity.test.js`; independent helpers in `test/fixtures/writerCompletion.js`, `writerWorkload.js`, and unchanged `writerParity.js`/`retention.js`/original golden vectors.

## Measurement rules

Nine cells retain exactly 370 commands/year, 26/27 periods, 1/2/4 changes, 32/160/512 note units and all 114 original source rows. Every original non-map logical fact is compared by canonical logical body; native financial own-property order and numeric bits are independently checked in FP-TV reconstruction. Canonical wrapper order is not native financial object order.

Report physical page+32-byte-key bytes and **all** delta/seal/state/pin metadata. Required-current total adds the live logical/page/metadata radix lookup and replay lookup. A separate conservative total charges **all cumulative lookup allocations**, covering retention of obsolete snapshot handles; neither is actual JavaScript heap or native database size. New metadata and current lookup overhead are conservatively attributed to net map cost. Old P1 totals do not charge a comparable live private cache, making the current candidate comparison conservative rather than concealing its cache.

The original P1.1a figures are post-hoc counterfactual estimates, not writer results. Coexistence additionally retains the entire old P1 archive. Pinned variants charge all retained intermediate nodes and pin metadata; no archive/pin savings are promised.

Actual crypto observation includes candidate verification, request fingerprints and P1's index hashing. Report current versus cumulative index allocations, copied/encoded/staged work, transient/finalized maps, logical and radix-node lookups, key units and median/p95/total time. P1 non-hash serialization work is UNKNOWN; observed hash input bytes cannot prove absence of a total serialization regression. Native index bytes and actual peak heap are UNKNOWN. Timing is one trial per host/OS under the test runner, not a mobile performance promise. The 128-row deterministic correctness test injects a stationary clock; a separate real-clock stress test must commit within the fixed budget or report bounded refusal with unchanged head.

Bootstrap is reported separately: actual external crypto observation for both implementations, writer source/genesis/origin/dataset phase counters and construction wall time. Writer bootstrap hash counts/bytes must equal the sum of its phase meters. Normal-command totals exclude bootstrap and the final full audit (whose full work/time is reported separately). `elapsedMs` covers the writer measurement/proof phase; TAP case duration additionally includes constructors, the sequential reference process and process startup.

Each measured cell runs in a fresh test-only Node process. The P1 oracle runs in a separate preceding process and exits before the writer begins; its reference roots/fact signatures are used only by assertions. Earlier attempts holding both P1 and candidate heaps, including fresh-per-cell attempts under simultaneous heavy suites, hit normal-command resource bounds; those runs are not passing measurements. Process isolation releases fixtures/reference heaps without changing any operation, real clock, cap, assertion or cancellation check. No failed command is retried, omitted or accepted as a committed workload operation. Both implementations' observed crypto work and timing distributions are measured in their respective sequential processes; this is not a paired interleaved timing trial.

## Results

The exact-head PR evidence records complete passing/failing/skipped counts, OS job URLs and the nine measured cells. A test run interrupted or refused by a resource budget is not counted as a passing workload. Financial-integrity verdicts and efficiency verdicts are separate. Unmet targets require independent review; they do not authorize pruning, fixture changes or packing.

## Remaining limits and review gates

All R01–R08, N01–N12 and native H portions are **NOT IMPLEMENTED / NOT RUN**: IndexedDB transactions, quota/device heap, crash/power loss, browser suspension, multi-tab/PWA fencing, old-version protection, oncomplete receipts, independent real backup restoration, and production screen integration. No browser/native financial tests are implied by pure in-memory results.

This model is cooperative and assumes supplied clock/cancellation/crypto callbacks execute; it is not a preemptive sandbox for malicious JavaScript proxies or a hard wall-time/memory guarantee. Retaining arbitrary caller handles/candidates can retain additional state. Physical pages coexist with in-memory logical objects; declared serialized storage is not process RSS. Full auditing is an explicit bounded operation; normal command validation uses an append-frontier proof, not a full-history scan. No automatic pruning/GC or old-P1 conversion exists.

Architect review must independently inspect B1–B6, the accepted B2 parser preservation, every committed-root comparison, wire/parser/closure and CAS/replay/cancellation boundaries, inventory accounting and all efficiency misses before owner acceptance. No P1.1b2, native P2, restoration, financial correction, checkpoint activation, merge, deployment or Continuous Planner Phase 2 follows from this experiment.
