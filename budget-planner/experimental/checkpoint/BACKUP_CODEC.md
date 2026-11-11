# Stage 2B2a synthetic backup contract

Issue #23; binding C1–C6 from Issue #22. Base B1:
`97c9c3af6b25705963d35544b7207bfded8ae9b7`. This contract is frozen before
implementation. Identifiers below describe a **synthetic** format, not live
DB/data/export version changes. No restore API is provided.

## API and fidelity boundary (C1, C5)

`encodeSyntheticBackup(snapshot, producer)`, `decodeSyntheticBackup(bytes)` and
`inspectSyntheticLegacy(bytes, {synthetic:true})` are async pure functions.
Inputs are caller-supplied synthetic DTOs/Uint8Array bytes only. Producer is
exactly `{appVersion, exportedAt}`: nonempty build and a UTC ISO timestamp.
There are no file/network/storage/clock/random/production imports. SHA-256 uses
WebCrypto. Returned inventories are fresh deeply frozen ordinary own-data
objects; encoded bytes are a fresh caller-owned Uint8Array (typed arrays cannot
be deeply frozen portably). Failures expose only fixed `{ok:false,
diagnostics:[{code}]}`. Synthetic declarations are not private-data detection.

Losslessness means the supported **B1 snapshot's** values/keys/keyPaths, own-data
property presence/order, array order, finite f64 bits and explicit undefined.
It does not recover original file lexemes, reference alias identity, property
descriptors or null-prototype identity already lost through B1 cloning/IDB.
Null/ordinary own-data objects decode to ordinary objects using defineProperty;
literal `__proto__`, `constructor`, `prototype` are data, never inherited setters.
Accessors (never invoked), symbols, custom prototypes, cycles, sparse arrays,
extra array properties, nonfinite numbers, functions and exotic types reject.

## FP-CJ-1 canonical structural JSON (C2)

UTF-8 without BOM/newline/whitespace. Structural object keys sort by UTF-16 code
units (`<`/`>`), not locale. Strings escape quote/backslash; every control code
unit U+0000–001F and every non-ASCII UTF-16 unit uses lowercase `\uXXXX`.
Other printable ASCII is literal. No NFC normalization; lone surrogates survive
as escaped code units. Arrays preserve order. Only nonnegative safe integer
structural numeric literals (no -0/exponent/fraction) are allowed. Raw financial
numbers occur only in typed f64 nodes. Unknown structural fields reject.

Reader accepts legal whitespace/alternative string escaping, after fatal UTF-8
and grammar preflight, decoded duplicate-key checks and resource checks **before
whole-document JSON.parse**. BOM/trailing input/invalid escapes/control chars,
unsafe numeric tokens and duplicate escaped aliases reject. Structural reserved
prototype names are rejected by closed schemas; raw typed object names are safe.

## FP-TV-1 / FP-GRAPH-1

Tags (exact tuple arity): `["n"]`, `["u"]`, `["b",boolean]`, `["s",string]`,
`["f64",16 lowercase hex big-endian IEEE-754 bits]`,
`["obj",originalOwnKeyOrder,sorted [key,childHash] pairs]`,
`["arr-leaf",[childHash...]]` (0–64),
`["arr-branch",totalLength,[arrayChildHash...]]` (2–64 children).
Object order lists each own key exactly once; decoded Object.keys must equal it
(integer index keys obey JS own-key order). All children are hashes, not inline
values. A literal financial string resembling a hash stays a string.

For array length >64 choose the smallest height whose capacity 64^(height+1)
covers length. Child capacity is 64^height; all but the last child are full;
last recursively uses minimal height. E.g. 65 -> leaf64+leaf1;
4096 -> 64 leaf64; 4097 -> branch4096+leaf1. No unary branch/alternative tree.
Node table is sorted by hash, one entry per node. Missing/duplicate/collision,
cycle, noncanonical tree and unreachable nodes reject. Structural sharing saves
transport representation only; financial records are never merged/deduplicated.
Expanded resource costs are computed over the DAG *before* allocating decoded
values. Every root occurrence is charged, even if the node is shared.

Keys: `["s",string]` or `["k",[string,...]]`; compound tuples remain strings,
including B1 draft revision strings. Key order is native IDB-compatible for this
restricted domain: string before tuple; components compare UTF-16, shorter
prefix first. Validate actual row key against value keyPath, without coercion.

## Digests

H(domain,payload) = lowercase SHA-256 hex of ASCII(domain + LF) concatenated
with FP-CJ-1(payload). No unframed field concatenation.

| Domain | Payload |
| --- | --- |
| FinPath/FP-TV-1/node | tagged node tuple |
| FinPath/FP-FULL-1/keys | `{store,keyPath,keys}` |
| FinPath/FP-FULL-1/collection | `{store,keyPath,count,rows}` |
| FinPath/FP-FULL-1/snapshot | `{sourceProfile,storageSchema,protocolVersion,controlRef,manifest}` |
| FinPath/FP-FULL-1/envelope | whole envelope, omitting only integrity.contentDigest |

Node/order/manifest/digests are reproducible independently of locale, host OS
and export time. Source snapshot digest excludes producer metadata; content
digest includes it. Received transportDigest is SHA-256 of actual received bytes,
not canonical bytes. Checksums are not signatures/bank authenticity. Original
B1 sourceRevision/contentToken/commandIdentity are preserved verbatim, not
renamed portable hashes. Original command fingerprints cannot generally be
independently authenticated because B1 does not retain submitted commands.

## FP-FULL-1 envelope (closed schema)

Root exact fields: appName="FinPath", exportVersion=2, schemaVersion=3,
appVersion, exportedAt, metadata, data, integrity.
Metadata exact: appName, appVersion, exportVersion=2, schemaVersion=3,
appDataVersion=3, exportedAt, source="synthetic-harness", synthetic=true,
requiredCapabilities. Root/metadata aliases must agree.
Data exact: appDataVersion=3, format="FP-FULL-1",
sourceProfile="finpath-b1-raw17-v1", requiredCapabilities, source, manifest,
nodes, provenance, derived. Source exact: storageSchema=1, protocolVersion=1,
databaseName (original synthetic B1 name), snapshotDigest, controlRef.
Provenance exact: sourceEnvelopes=[] and qualifications=[] in this first B1
profile; all retained original envelopes already present in raw values survive.
Legacy originals are a separate inspection result, not promoted to this profile.
Derived={}; no extensions registered. Integrity exact: algorithm="SHA-256",
canonicalization="FP-CJ-1", valueCodec="FP-TV-1", graph="FP-GRAPH-1",
contentDigest. No partial/active format is accepted.

Both requiredCapabilities arrays are exactly sorted:
`canonical-json-v1`, `closed-content-graph-v1`, `foreign-provenance-v1`,
`full-raw17-v1`, `inactive-state-only-v1`, `typed-values-v1`.
These differ from unchanged B1 control capabilities.

Manifest has exactly 17 entries, store-name sorted. Entry exact fields:
`{store,keyPath,count,rows,keysetDigest,collectionDigest}`; row exactly
`{key,valueRef}`; node exactly `{id,value}`. All stores including empty ones:
appMetadata/appSettings/budgetTargets/categories/scheduledItems/accounts/
manualAdjustments/savingsBuckets/savingsBucketAdjustments/transfers use id;
plannerEntries uses entryKey; financialControl/checkpointDraftHeads/
financialAudit/protectedSnapshots use id; recordRevisions uses [collection,key];
checkpointDrafts uses [id,revision]. No display filtering or alias collections.

Validate control inactive-only/schema1/synthetic/exact B1 capabilities and
canonical revision strings; raw revision/tombstone membership; draft versions
and heads; audit/receipt/before-state identity and retained history closure.
Audit operation IDs are scoped original data, not current replay authority.
Qualified missing historical sources/account references do not block archival
fidelity and cannot establish financial readiness. Duplicate nonblank occurrence
identities or line IDs within their parent reject; absent historical line IDs
are qualified, never generated. Unknown raw fields remain opaque own-data values,
not executable checkpoint semantics. Known protocol active flags/modes reject.

## Precision and legacy inspection (C3)

Raw B1 f64 values preserve all finite bits, even a historical overprecision value;
such archival fidelity is **not** valid ledger input. Exact new `*Minor` fields
must be canonical signed integer strings (no +, leading zero or -0), not Number
or BigInt. No rounding, normalization, empty-to-zero or amount repair occurs.
Recognized legacy money field numeric lexemes must be signed decimal, no
exponent, <=2 fractional digits, exact BigInt cents abs<=9007199254740991 and
Number shortest-decimal round-trip cents/sign-of-zero identical before Number
projection. String money is validated similarly but retained as a string.

Legacy inspector supports known synthetic bare data0/1 and wrapped export1/data2
only, keeping copied original bytes as a frozen number array plus exact envelope,
lexeme inventory and absent-field qualifications. No all17 claim/restore/ledger.
Known aliases must have equal primary-key memberships/values; preserve original
ordering in original bytes. Ambiguous combined savings aliases are qualified;
never replay derived rows. Unknown required financial collections/versions block.
Missing historical references remain qualified. Genuine generated new files are
tested against unchanged actual accepted validateBackupFile: old data2 validator
must refuse data3. Unknown historical readers are not certified.

## Provisional synthetic resource profile (C4)

32 MiB input/output UTF-8, depth64, nodes200000, rows100000, edges1000000,
strings1048576 UTF-16 units each, expanded128 MiB, visits2000000. Count actual
occurrences, not just unique graph nodes. Materialization accounting is a
conservative portable work budget (string 2*units+16, scalar16, arrays32+8/item,
objects32+16/property+2*key units), not measured JS heap bytes. The parser also
caps structural values/visits at2000000 and bounds aggregate text before parse.
Code does not truncate; exceeding any bound rejects with RESOURCE_LIMIT.
Post-snapshot budget cannot protect B1's preceding unbounded getAll.
Shared transport nodes do not optimize physical IndexedDB before-state retention.
No pruning, archive deletion, compaction, quota probe or storage policy changes.

## Acceptance / implementation boundary (C6)

F01 codec-only full17; F02/F03 legacy inspection only; F04 source preservation;
F05 duplicate text; F06 IDs/keyPaths; F07 aliases; F08 versions; F09 inactive/caps;
F10 completeness; F11 extensions; F12 precision; F13 actual old-validator refusal;
F15 parser/expansion limits only; F16 retained history/derived separation.
**F14, R01–R08, every database restore and F15 quota/commit portions are NOT
IMPLEMENTED.** No native browser/PWA/old-writer/durability certification.
Golden C01–C08 and measured S01–S04 evidence are recorded with the PR.
Stage1/2A/B1 APIs and all existing tests remain unchanged.

Independent Architect review must assess parser grammar/bounds, supported value
domain, exact hashes/canonical graph, immutable key/value history comparisons,
safe diagnostics, legacy qualifications, independent vectors and truthful limits.
Stop at a separate draft PR; no B2b/R1, B2c, B3/B4, production integration,
activation, financial corrections, merge/deploy or Continuous Planner Phase2.
