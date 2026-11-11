# B2a review evidence and operator limits

Issue #23. Synthetic export/decode/inspection only. The accepted Stage1/2A/B1
implementations, all prior tests and production src/database/export/import/PWA
remain unchanged. Exact final SHA and Windows/Linux run links are in the draft
PR. This is not an owner backup tool and has no filesystem/CLI/restore entrypoint.

## Acceptance registry

Named cases are in `test/backupCodec.test.js` (28) and
`test/backupSizing.test.js` (5). F/C/S names are traceability groups, not a claim
that every later integration criterion is implemented. Existing198 regression
tests and10 CLI security cases remain in place without weakened assertions.

| Group | Implemented synthetic evidence | Deferred portion |
| --- | --- | --- |
| F01 | full17/native IDB key/keyPath/value comparison, round-trip, golden whole envelope | restore projection NOT IMPLEMENTED |
| F02 | original bare legacy bytes/lexemes/absence truth, qualified inventory | legacy restoration NOT IMPLEMENTED |
| F03 | wrapped export1/data2 original envelope and fields retained | legacy restoration NOT IMPLEMENTED |
| F04 | exact original values/validation/source IDs/line IDs/starts/Last Entry/audit, immutable outputs | production/browser storage not exercised |
| F05 | decoded escaped duplicate keys, invalid grammar/UTF8 before whole-document parse | no live parser change |
| F06 | duplicate raw/occurrence/line IDs, keyPath mismatch; missing legacy IDs qualified | no generated IDs or repairs |
| F07 | planner/budget/bucket aliases exact by membership; derived savings multiset exact multiplicity; conflict refusal | ambiguous combined alias inspection only |
| F08 | contradictory aliases, future/unknown schema/profile/integrity versions refused | unknown historical build behavior not certified |
| F09 | portable and B1 capabilities, active control/draft/metadata refused; account.active remains ordinary data | real old-writer fencing NOT IMPLEMENTED |
| F10 | all17 mandatory, explicit empty stores, invalid/null sections refused | no restore transaction |
| F11 | closed fields/caps/provenance/derived, no unregistered extensions | future extension profiles not supported |
| F12 | stored finite f64 exact incl -0/subnormal; canonical minor strings; pre-Number legacy lexical/overflow/round-trip rejection | no recovery of lost original decimals/bank proof |
| F13 | genuine generated file refused by unchanged actual accepted validateBackupFile, exact newer-version result | other historical readers NOT TESTED |
| F14 | **NOT IMPLEMENTED** | every clone/full17 restore, generation projection and receipt test |
| F15 | file/depth/string/rows/graph expansion limits, safe refusal with unchanged source | quota/headroom/commit-abort restore portions NOT IMPLEMENTED |
| F16 | deleted bucket, all draft versions/tombstone/audit/before-states; separate25/22/2 synthetic records,14 unvalidated,11 candidate edges unchanged | no matching, activation or ledger replay |
| C01 | independent Python full canonical envelope/node/key hashes | authenticity not claimed |
| C02 | key/own order, exact domains, metadata-bound content vs time-independent snapshot digest, transport digest | desktop implementation not certified |
| C03 | NFC/NFD/lone surrogate/astral/escapes/UTF16 order fixed vectors | no Unicode normalization |
| C04 | fixed -0/subnormal/0.1 bits, missing/undefined/null, exact minor strings | no float money arithmetic |
| C05 | independent roots/unique-node counts at0/64/65/4096/4097, minimal tree rejection | no alternative chunk format |
| C06 | unsupported types/accessors/cycles/sparse/symbols rejected; getter not invoked; literal own prototype names safe, including native B1 fixture | pre-storage null-prototype identity not recoverable |
| C07 | bounded grammar, decoded duplicate keys, malformed UTF8/BOM/trailing input/numeric attacks, spy proves no whole-document parse before rejection | no production import parser integration |
| C08 | missing/orphan/cyclic/duplicate/collision/noncanonical/hash-mismatched graph, audit/before-state/revision closure, exponential expansion | independent original command authentication impossible from opaque fingerprint |
| S01 | measured1/3/5-year low-write full17 fixtures; independently fixed dense model | high-write multi-year physical scalability NOT ESTABLISHED |
| S02 | graph/expanded/byte measurements,27-period12-draft variant | not a370 operations/year benchmark |
| S03 | actual file/depth/string/row/expansion refusal negatives, no output/truncation | actual JS heap peak not bounded to128MiB |
| S04 | complete retained fixture histories and amplified-source refusal, dense physical-history warning | quota estimation, recovery retention policy and native space/disk behavior NOT IMPLEMENTED |
| R01–R08 | **NOT IMPLEMENTED** | all atomic restore, verification finalization and recovery scenarios |

All33 new test cases must pass; no skipped case is a substitute for a restore
test. Later restore is absent, not hidden in passing tests or counted as TODO
execution. Native browsers/PWA/disk crash/old writers/real recovery are NOT RUN.

## Independent vectors

`test/fixtures/backupGolden.json` is fixed, checked-in expected data. Its
independent generator uses Python standard-library struct/hashlib, UTF16 code-unit
sorting and its own canonical writer/graph construction. It never imports the
JS implementation. CI consumes the committed expected bytes/hashes, not values
generated by the codec under assertion. It covers an entire synthetic empty-raw
initialized17-store envelope plus smaller f64/string/key/chunk vectors.
Full native IDB fixtures separately verify exact original keys/values rather than
trusting only a serializer's own re-encode/digests. Synthetic financial reference
cash600000 and Tax70000 remain unchanged; backup transport does not post money.

Optional maintainer regeneration, synthetic vectors only:

```sh
python3 test/fixtures/generate_backup_vectors.py
git diff -- test/fixtures/backupGolden.json
```

On Windows with Python installed use `python` instead of `python3`. This script
writes only the synthetic expected fixture; it is not part of the pure module
and never processes an owner file. Review vector diffs independently.

## Actual bounded size measurements

Measured with the unchanged B1 repository and injected fake-indexeddb factory.
Fixtures build12 saved cells/period,3 lines/cell,2 manual transfers/period,
2 accounts,1 bucket,12 scheduled sources and an original Last Entry marker.
Periods advance14 days across years; no historical data are read.
**Six draft saves TOTAL per fixture**, not per year, follow one seed operation.
Every B1 audit/before-state and draft is retained. These are explicit low-write
fixtures, not an estimate of normal owner behavior or a physical storage test.

| Years / periods per year / draft saves | Cells / lines / manual transfers | Manifest rows | Nodes / edges | Encoded UTF8 bytes | Expanded work-budget bytes / visits |
| --- | --- | ---: | --- | ---: | --- |
| 1 /26 /6 |312 /936 /52 |782 |5082 /12547 |1748518 |6583740 /77563 |
| 3 /26 /6 |936 /2808 /156 |2238 |14623 /36076 |5035227 |19478244 /227681 |
| 5 /26 /6 |1560 /4680 /260 |3694 |24162 /59603 |8325453 |32430492 /377787 |
| 1 /27 /12 |324 /972 /54 |828 |5399 /13481 |1866686 |12830964 /151997 |

Numbers above are deterministic byte/count results, not wall-clock guarantees.
Expanded budget counts all typed root occurrences before materialization; it is
not process peak memory or native IDB storage. The parser separately budgets its
AST work. Manifest row limit counts actual17-store rows, not nested historical
before-image copies (those are charged by expanded/traversal budgets).

An amplified source using70 references to a1,048,576-code-unit string fails
RESOURCE_LIMIT before any output; all retained histories remain in input. A tiny
exponential graph likewise rejects before allocation/hashing. Limits are
provisional **synthetic**32MiB file /128MiB expanded work and documented counters,
not approved production policies. No partial full export is returned.

The separate Issue #22 **dense arithmetic model** remains:
D0=49152B, growth1059264B/year,370 operations/year,70B per history-key pair,
768B per audit/wrapper. Current state D0+A*years; before-images
N*D0+(A/370)*N*(N-1)/2; key refs70*N*(N-1)/2; audit768*N.

| Years | Current MiB | Literal current+retained-history MiB |
| --- | ---: | ---: |
|1 |1.06 |209.61 |
|3 |3.08 |1777.47 |
|5 |5.10 |4876.96 |

This is independently fixed arithmetic, **not generated multi-gigabyte fixture
measurement**. We deliberately do not allocate that physical history or claim
it passes B2a. Sharing transport nodes cannot fix B1 physical before-state
growth; even a compact file may expand beyond this reader's limits. A bounded
repository reader and a lossless retention/materialization solution remain
separate approval gates before B2c/B3. Never prune/truncate history to pass.

## Reproduction and observed development results

From budget-planner (Windows PowerShell5.1 uses `npm.cmd`):

```sh
npm test
npm run test:cli
npm run lint
npm run build
git diff --check 97c9c3a
```

Focused synthetic-only review:

```sh
node --import ./test/register.mjs --test test/backupCodec.test.js test/backupSizing.test.js
```

Expected final regression count231 = accepted198 +28 codec +5 sizing; CLI10
unchanged. PR records exact observed pass/fail/skipped per environment, final
SHA and Node22.23.3 Windows/Linux CI URLs. Local Node24 evidence alone does not
certify Node22/Windows. No user-facing manual data flow is introduced: review
the synthetic commands above, never select or supply an actual backup.

Development runs honestly recorded: initial codec21 pass/3 fail/0 skipped
(independent empty-array vector incorrectly counted unreachable null, negative
BigInt test helper rejected before codec invocation, old-validator test used
wrong return-field names). Corrected test/reference expectations, preserving
negative assertions. Later full suite228/1/0 exposed test assuming bucket index
instead of its stable ID; exact-ID assertion corrected. One lint run caught an
unnecessary regex escape in a test spy; corrected. Final results supersede these
exploratory failures without claiming they never occurred.

## Remaining limitations / mandatory review

No restore, mutation, quota/storage headroom, B1 API extension or physical storage
optimization. No bank authentication, financial-readiness certification, owner
backup use or universal historical-reader refusal. Only this stored plain-data
profile, own-data semantics and bounded graph are supported; unknown types or
versions refuse. Original legacy bytes are inspectable data, not verified cash.
Same-origin malicious code can rewrite and rehash data. Memory work budgets are
not native heap guarantees, and B1's preceding unbounded snapshot read remains
unprotected by this codec. No telemetry/logging/automatic correction or posting.

Architect review must independently inspect all C1–C6, especially parser-before-
Number checks, own-key/prototype safety, canonical/graph amplification, original
native inventories, fixed vector independence and the F14/R/S04 deferrals.
Owner acceptance is separate. Stop at the draft PR; no merge/deploy/later stage.
