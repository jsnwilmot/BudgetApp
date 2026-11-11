# P1 immutable history model contract

Issue26, Architect A1–A6 in Issue25. Base
`2c2a7d0f7ee26b26019559d1b119592d788a5eaa`. Frozen before model code.
This is a pure synthetic in-memory model, not a repository, financial engine,
transaction receipt, backup feature or restoration implementation.

## Fidelity / authority

Capture a caller-supplied synthetic FP-FULL-1 byte array using the unchanged
B2a decoder. Archive its complete normalized envelope, all17 native source
keyPaths/keys/values and provenance. Source operation IDs/generations remain
foreign data. Original raw own-data order, undefined/absent, finite f64 bits,
IDs, validations, revisions/tombstones, drafts, audits, before-states, markers
and corrections are preserved. No transport whitespace recovery from a digest;
retain canonical source-envelope content and actual received transport digest.
Never embed generated whole R1 files or infer/merge financial movements.

The conceptual R1 catalog names control, objects/blobs, origins, datasets,
operations, audit, recovery and verification (nine stores); **none is created**.
Source17 reconstruction and a separate local dataset projection model these
semantics. Local generation is explicit, independent of foreign control. Only
raw11 and the two inactive draft collections project; local model metadata and
versions are separate. No foreign control/audit becomes writer authority.

All results/handles are immutable. Pure functions return a new model; prior
models share immutable index nodes and remain usable. Private WeakMaps validate
opaque handles and hold no external state. Interning changes only a call-local
builder. No accepted API/test change, production imports, IDB, storage, files,
network, clock/random defaults or logging. An injected page source is trusted to
be in-memory; a malicious callback is not sandboxed by this model.

## FP-MAP-1

64-way persistent ordered B+tree. Leaf body:
`{tag:'leaf',entries:[{keyRef,valueRef,versionRef,deleted}],total,live}`.
Branch: `{tag:'branch',children:[{ref,firstKeyRef,total,live}],total,live}`.
Leaf entries and child ranges ordered by exact original FP string/compound key
comparator (UTF16 code units, string before tuple, shorter prefix first).
Keys are themselves exact FP-TV-1 values; keyRef is a storage reference, never
a replacement financial identity. Long keys use bounded value chunks.

Max64 entries/children. Empty root leaf allowed. Non-root min32; branch root
2–64 children. Overflow65 splits deterministically32/33, upward path-copying;
new root wraps two split children. Existing-key edits copy only its path.
Delete retains the key with a new deleted version and null current valueRef;
live count decreases, total does not. Reinsertion updates that retained entry
and chains to its previous version. Reinsertion validates immutable parent/source/date
identity against the last known nondeleted version under a bounded history walk.
Thus deletes cannot cause underflow and
**no structural merge/borrow is performed**. Physical key deletion/compaction
is not in P1; tests explicitly prove tombstones do not trigger destructive
merge. Root shape can differ by update sequence: logical inventory, not equal
physical hashes, establishes equal records.

## Content / roots / deterministic integrity

FP-TV-1 nodes use unchanged B2a canonical/hash rules. Store canonical node bytes
in immutable ASCII chunks <=60KiB. Physical-model record metadata <=4KiB for a
chunk; other descriptor/map records <=64KiB. Chunk cost is raw byte payload plus
canonical metadata (not a JSON-escaped file size or actual native allocation).
Large logical nodes use <=768 chunk refs, original logical digest and child refs;
oversized descriptors fail rather than truncating. No custom prototype/symbol/
accessor/cycle/sparse/nonfinite/BigInt financial value is accepted; getters must
not execute. Literal own prototype names use safe own-property definition.
Pre-storage null-prototype identity already lost by B1 is not recovered.

Model object ID domains, ASCII(domain+LF)+FP-CJ-1(body):
`FinPath/P1/map/1`, `version/1`, `origin/1`, `dataset/1`, `data-root/1`,
`journal/1`, `event/1`, `model-root/1`, `request/1`, `origin-identity/1`,
`record/1`, `continuation/1` (each expanded
with the FinPath/P1 prefix). Chunks use `FinPath/P1/chunk/1`+LF+raw ASCII bytes;
FP-TV value IDs retain `FinPath/FP-TV-1/node`. Index-leaf/branch domains are
`FinPath/P1/index-leaf/1` and `FinPath/P1/index-branch/1`.

Each object has immutable first-insertion ordinal and exact refs; every ref
must already exist at an earlier ordinal. This proves acyclicity even when a
long journal history exceeds a financial value's depth limit. Hash-equal but
different descriptor/bytes is collision failure, never overwrite. A private
functional16-way hash trie indexes all retained model records; leaf binds ID,
ordinal and record digest, branch binds16 child hashes. Updating this **model
adapter index** path-copies its nodes. Its allocations/hashes are measured
separately, not presented as native R1 IDB index cost.

Version: `{datasetId,store,keyRef,valueRef,deleted,previous,sourceVersionRef,localRevision}`.
localRevision is null for origin-inventory wrappers and the exact local model
operation counter for projected/changed versions. Request fingerprints bind
the exact own-ordered FP-TV-1 request digest, including explicit expectedRoot;
this supports float/-0/undefined without structural-JSON rounding.
Origin inventory version uses a foreign namespace, never a local operation ID.
Dataset descriptor binds original-key collection roots and originId. Data root
binds origin/dataset catalog roots only. Journal binds previous journal,
beforeModelRoot and afterDataRoot plus explicit operation/revision/request data.
Event references journal/afterDataRoot. Operations map points to events. Model
root references dataRoot/operationsRoot/journal, never its own index digest.
The returned model handle separately pins the retained-object index root.
No receipt/root self-hash cycle; all old roots remain in the object census.

Model replay returns an existing model event without effects for the exact
original request/expected root; changed payload under the same local ID rejects.
Foreign IDs never enter local operation lookup. Same transaction ID in two
datasets remains distinct; imported source controls never choose a generation.

## Proposed public model API

Async functions return `{ok:true,...}` or frozen `{ok:false,diagnostics:[{code}]}`:

- createHistoryModel({synthetic:true,instanceId,generation,limits?})
- captureHistoryOrigin(model,{synthetic:true,operationId,expectedRoot,bytes})
- createHistoryDataset(model,{synthetic:true,operationId,expectedRoot,datasetId,originId})
- changeHistory(model,{synthetic:true,operationId,datasetId,expectedRevision,
  expectedRoot,changes:[{store,key,value}|{store,key,deleted:true}]})
- readHistory(model,{datasetId,store,includeDeleted?,atRoot?})
- reconstructHistoryOrigin(model,originId)
- readHistoryVersion(model,versionRef), lookupHistoryOperation(model,operationId)
- inspectHistoryModel(model): immutable model-only metrics/catalog references
- createMemoryPageSource(model): injected in-memory adapter
- beginPinnedRead(model,{scope:'all-retained',budgets?})
- readHistoryPage(reader,continuation,source), finishHistoryRead(reader),
  cancelHistoryRead(reader)

No method opens a repository, commits restore or finalizes verification. Reader
handles/continuations are opaque and bound to instance/model/index root/scope.
First version supports only all-retained scope, not a partial-full export.
Read source returns exactly requested immutable index node/object; extra/missing/
tampered responses fail. Reader walks the pinned Merkle index, checks original
record membership/bytes/digests, refs and counters, and returns only bounded
pages. It uses the trusted immutable model inventory as expected evidence;
this is an in-memory oracle, not proof of a native snapshot/transaction.
COMPLETE requires exhausted traversal and exact expected count/bytes/closure.
Cancellation/limits/tampering never return a partial COMPLETE. Async callbacks
are outside any transaction. Old model readers stay pinned after new changes.
readHistory may select an earlier retained local model-root from the latest
model without reviving old authority or changing its current root. Foreign
origin/control objects cannot be selected as local model roots.
Cancellation returns an immutable terminal reader version; it does not globally
revoke an independently retained earlier reader state or abort a native task.

## Provisional synthetic limits

Value depth64/string1048576; operation/value working copy uses accepted B2a
bounded domain. Total retained objects400000, declared retained payload256MiB,
map depth64, refs/descriptor768, changes/operation128, operations10000;
source profile keeps B2a32MiB/128MiB expanded limits. Limit overrides may only
lower defaults. Read pages<=128 objects and256KiB declared payload, visits and
total bytes explicitly bounded, single descriptor<=64KiB. Every limit rejects
with RESOURCE_LIMIT without changing the prior model. Hash/intern work and
adapter-index allocations and mutation-building object lookup visits are
separate metrics. hashCalls counts explicit interning/index hashes, excluding
accepted typed-graph preparation/validation; it is not total runtime crypto.
Payload budgets are not actual
heap, browser disk, quota or a latency guarantee.

## Acceptance boundary

H01/H02/H03/H04/H06/H13/H14 model cases plus eligible H05/H07–H12/H15 subsets.
R01–R08 and ALL native nine-store guard/IDB/restore/quota/crash/PWA/old-writer
portions are NOT IMPLEMENTED/NOT RUN. Pure paging cannot prove the candidate
5-second restore transaction or4x native headroom. B1 getAll and a single huge
B1 value are not bounded by this model or cursoring. Independent fixed vectors
and complete historical reconstruction precede any P2 approval. No pruning,
account/Property Taxes correction, checkpoint activation, merge/deploy/Phase2.
