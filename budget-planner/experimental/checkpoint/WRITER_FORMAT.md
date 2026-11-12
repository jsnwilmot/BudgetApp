# P1.1b1 frozen synthetic writer contract — version 1

Issue #32 / Architect B1–B6. Frozen before writer source implementation.
Baseline ca80cc9d74cdf03079febe2bba4e770d8a065db2. Synthetic memory only.
Accepted FP-CJ-1, FP-TV-1 and FP-MAP-1 bodies/domains are unchanged.
There is no database, restore, bank proof, financial reconciliation or packing API.

## Closed physical grammar

Profile `P1.1b-WRITER-MODEL-1`, layout `fp-tv-chunk61440-cj1`.
Capabilities (exact order): `command-transients-v1`, `logical-fp-map1-v1`,
`committed-sequence-v1`, `bounded-batch-pages-v1`, `append-inventory-v1`.
SHA256 input is ASCII(domain + LF) followed by exact bytes; DTOs use FP-CJ-1.
Domains: `FinPath/P1.1b/page/1`, `inventory-delta/1`, `command-seal/1`,
`state/1`, `pins/1`, `capabilities/1`, `physical-request/1` (all expand the
`FinPath/P1.1b/` prefix). Logical domains keep their accepted names.

Binary page header, unsigned BE, exactly 24 bytes:

| Offset | Bytes | Meaning |
| --- | --- | --- |
|0|4|ASCII FPW1|
|4|1|pageType = 1 (logical records), no other type accepted|
|5|1|flags = 0|
|6|2|headerLength = 24|
|8|8|firstNativeSequence, 1..Number.MAX_SAFE_INTEGER, decoded as BigInt first|
|16|2|frameCount, 1..128|
|18|2|reserved = 0|
|20|4|payloadLength, exact remaining bytes|

Frame prefix exactly 38 bytes: kindCode u8, bodyCodec u8, logical ID raw32,
bodyLength u32 BE; then bodyLength bytes. Kind codes in order 1..10:
chunk, value, map, version, origin, dataset, data-root, journal, event, model-root.
Codec 1 = uncompressed ASCII FP-CJ-1 body; codec 2 = raw ASCII chunk data,
reconstructing exactly `{data: bytesAsString}`. Codec 2 iff chunk; no other tags.
Canonical bytes are compared after parsing, rejecting duplicate JSON keys,
non-ASCII/noncanonical/trailing/truncated encodings. No frame crosses a page.
Page bytes plus its raw32 key <=65,536. Chunk <=61,440. No fragmentation.
At most 128 logical frames or 262,144 declared output bytes per read page.

Fixed logical layout has one descriptor per logical ID. Different foreign chunk
layouts are not admitted. The writer refuses old P1/full-inventory inputs with
`LEGACY_INVENTORY_REQUIRES_ARCHIVE`; old readers refuse this new profile.
The old full inventory/indexRoot/ordinal/pins stay with unchanged original P1.
No foreign generation, source ordinal, receipt or operation ID becomes local authority.

Sequences identify new logical frames only, never financial IDs/revisions.
New records are emitted child-before-parent by deterministic DFS: roots are
staged non-map records in original creation order followed by explicit pins;
edges follow the accepted refsOf field order. On first visit emit descendants,
then parent; skip already emitted/existing IDs. New sequences are contiguous.
All published pages remain retained. Temporary unpinned map bodies are not
interned. Map edits retain original order, UTF16 comparison and 32/33 splits.
Every accepted owner command produces the original logical versions/journal/
event/model root, including value-identical changes. No command squashing.

## Exact DTOs (closed field sets)

All hashes are lowercase hex64; null means absent. Strings are nonempty where
used as identities. Revisions and sequence/count/byte fields use safe nonnegative
integers unless an original logical revision is the accepted decimal string.

Inventory delta: `{profile:'FP-WRITER-INVENTORY-1', physicalInstance,generation,
revision,previous,firstSequence,objects,pages,logicalRoot}`. pages is 1..128
tuples `[pageHash,pageByteLength,frameCount]`. objects is this delta's frame count.
Multiple deltas chain in command order; an empty delta is used only when there
are no data pages (pages=[], objects=0). Metadata is not assigned logical sequences.

Pin batch: `{profile:'FP-WRITER-PINS-1',physicalInstance,generation,revision,
previous,pins}`. pins <=128 closed `{kind,id}` entries, kind `object` or
`full-inventory`. Object pin must exist before sealing; a transient pin freezes
its closure immediately. A full pin names the existing new-profile inventory
tip. No pin removal, inferred late root or legacy full inventory conversion.

Seal: `{profile:'FP-WRITER-SEAL-1',physicalInstance,generation,revision,
baseState,logicalRoot,inventoryRoot,previous,operationId,semanticDigest,
requestFingerprint,pinRoot,effects}`. effects = `{versions,newObjects}`.
Genesis has null baseState/previous/operationId/digests and revision 0.

State: `{profile,capabilities,layout,physicalInstance,generation,revision,
logicalRoot,dataRoot,inventoryRoot,sealRoot,pinRoot,sequence,objects,payloadBytes}`.
objects counts all retained physical logical frames and DTO metadata records;
sequence counts only logical frames. payloadBytes cumulatively charges data
pages+raw32 keys and each inventory/pin/seal/state canonical body+raw32 key.
State payloadBytes uses a bounded integer-length fixed point for its own cost,
not its own hash. The state digest is NOT a member of its own inventory.
Inventory authenticates logical pages, seals separately bind authority, state
binds both: no hash cycle and no complete-native-nine-store claim.

Physical guard: `{physicalInstance,generation,revision,stateRoot,logicalRoot,
inventoryRoot,capabilityDigest}`. Its fingerprint hashes
`{guard,semanticDigest}` in physical-request/1. Logical request hashing retains
exact P1 own-ordered FP-TV request semantics and original fields, not this guard.
Exact local replay is checked before stale-head refusal and has zero effects.
Changed request/guard under the same operation ID refuses. Publication compares
the actual current opaque base handle once; only one same-base candidate wins.
Before-publication failure/cancel discards all private staging. A published
receipt is MODEL_COMMITTED only, never native durable success.

Private lookup is a persistent path-compressed, un-hashed hex radix tree;
command-local copies coalesce touched branches. It is a replaceable accelerator,
not persisted authority. Leaf declared cost = 96 bytes (ID/location/pointers);
branch = 24 + prefix.length + 8*childCount. Charge every retained historic
allocation cumulatively when old snapshots are retained; report live separately.
Local replay accelerator entries cost 160+2*operationId.length declared bytes.
Report physical payload and conservative total including private index costs.
These are model accounting units, NOT JS heap or native index bytes.

## Frozen budgets / input trust

Only caller-lowered limits: changes128, keyUnits32768, comparedUnits4194304,
requestBytes4194304, stageBytes8388608, stagedRecords16384, dirtyMaps8192,
refs768, depth64, oldLookups65536, visits1000000, workBytes67108864,
durationMs2000, pageFrames128, pageBytes65504, chunkBytes61440,
objects400000, retainedBytes268435456, commands10000, pins128.
Bootstrap: stageBytes16777216, workBytes134217728, durationMs60000;
stagedRecords remains16384; source request uses that bootstrap stage budget.
Read/full-audit sessions are independently bounded, not run per command;
full audit cap400000 objects/268435456 physical bytes,4M visits,60000ms.
Every copy/typed-node/compare/hash/page/index helper meters work before size-based
allocation and inside bounded loops. Visits include pre-dedup work; timers and
cancellation injected, checked cooperatively. A nonsettling injected callback
cannot be preempted. No default clock/random, network, files or storage.
Never expose mutable byte views; read copies are metered. Safe diagnostics
contain only fixed codes, not keys, values, amounts or arbitrary exception text.
Accessors/cycles/symbols/unsupported values refuse. Proxy traps/callbacks cannot
be sandboxed by pure JavaScript; throwing traps refuse with safe errors.

Source is fresh explicit synthetic source17 + producer metadata, not an old
model. Full source17 typed encoding/envelope/provenance must equal accepted B2a
under the same supplied producer. Source capture and dataset projection preserve
the exact accepted logical command shape. Financial reference anomalies are
preserved/qualified, never automatically repaired or interpreted as bank proof.

## Pre-implementation independent vectors

`test/fixtures/generate_writer_vectors.py` is an independent Python reference,
never importing JS. It freezes literal new page bytes/hash, all kind/codec codes,
capability/domain DTO hashes, initial logical roots and invalid wire mutations
in writerGolden.json. Later JS must match these without rewriting old vectors.
Changing this version after implementation requires a new reviewed format/version;
do not regenerate expected hashes to bless a mismatch.

Integrity and efficiency verdicts are separate. All nine accepted fixtures and
every committed root must remain exact. Research targets and native STOP gates
are Issue #32/B6; missed targets are reported, not license to prune or pack.
R01–R08/N01–N12/native H, IndexedDB/restore/mobile/PWA/quota remain NOT IMPLEMENTED.
