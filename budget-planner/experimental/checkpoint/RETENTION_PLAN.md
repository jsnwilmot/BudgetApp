# P1.1a frozen counterfactual plan contract

Issue29; G1–G6 in Issue28. Baseline7bd40fdb0dc23ec94fbc1a522260d0403b1f22ec.
Pure synthetic POST-HOC accounting only. Frozen before implementation/vectors.
No writer, reindexer, adopted database, restoration or P1 API change.

## Authority and preservation

An authentic caller-supplied P1 model handle is the trusted in-memory reference.
The injected source supplies readIndex/readRecord, checked against that model's
entire immutable Merkle pool, its exact hashes/ordinals/census. Its preexisting
materialization is not a pre-read memory guarantee or sandbox. Original P1
indexRoot/COMPLETE_MODEL_INVENTORY is never filtered or reinterpreted.

Require synthetic:true, exact baselineSha, sourceRoot/sourceIndexRoot and pins.
Pins are {kind:'object',id:<existing record>} or
{kind:'full-inventory',id:<exact current P1 indexRoot>}. Duplicate/unknown pins
refuse. An unrecognized old index/foreign root promise is unresolved, not an
implicit license to omit records. Full-inventory pin keeps every record: zero
gross reduction, with experiment metadata adding a separately reported cost.

Mandatory roots are ALL non-map records (including every chunk/value/version,
origin/dataset/model-root/data-root/journal/event), plus object pins; full pin
adds every map. Closure follows every recognized typed P1 ref, not hash-looking
strings. All source17 envelope/keyPaths/keys/values/audits/drafts/revisions/
protected before-history and every committed local state remain. Only map
records outside this closure are counterfactually excludable. Original record
IDs/bodies/digests/ordinals remain comparator evidence, including ordinal gaps.
The baseline pool remains unchanged even where a hypothetical subset is smaller.

## DTO, canonicalization and accounting

Profile P1.1a-RETENTION-PLAN-1; domain prefix FinPath/P1.1a/.
Hash framing ASCII(domain + LF) + unchanged FP-CJ-1 ASCII canonical body.
Plan ID = hash(prefix+'plan/1', body); output is {planId,body}.
body has exactly profile,modelOnly:true,experimentOnly:true,source,policy,
manifests,candidate,accounting,qualifications. source contains baseline SHA,
instance/generation,modelRoot/indexRoot,independent inventoryDigest and frozen
census {objects,bytes,byKind:{kind:{count,bytes}}}. policy contains the full-pin
boolean, root rule all-non-map-plus-pins and kept rule source-minus-exclusions.

Inventory digest: enumerate the input index in lexicographic ID order; hash
pages {kind:'inventory',index,previous,rows} under prefix+'page/1'. Rows are
[id,kind,ordinal,payloadBytes,recordDigest]. Final hash under inventory/1 binds
source {sha,instanceId,generation,modelRoot,indexRoot},census and page descriptor.
Inventory hash pages are processing work, not emitted plan pages. Original
indexRoot already commits original membership; this is an independent census
binding, not a candidate P1 index root.

Three emitted manifest kinds: roots,excluded,pins. Page {id,body}; body exactly
{kind,index,previous,rows}; id=hash(prefix+'page/1',body). Roots/excluded rows are
ascending ORIGINAL source ordinal integers (not new IDs); immutable input
inventory binds each ordinal to its exact ID/body. Pins are canonical-sorted
strict pin DTOs. Pages hold<=128 rows, serialize<=64KiB; each response<=256KiB.
Descriptor {tip,pages,rows,bytes}; empty descriptor has null tip,zero counts.
Root rows explicitly enumerate all mandatory roots; excluded rows enumerate
only the complement maps. Kept set is the exact source census minus exclusions.
No giant root/key list in the header. No financial values/notes in the output.

candidate contains keptCount,keptBytes,excludedMapCount,excludedMapBytes,
protectedMapCount,protectedMapBytes,byKind and ordinalPolicy source-gaps-preserved.
accounting has pageBytes,headerBytes,verificationBytes,overheadBytes,accountedBytes,mapDelta,
totalDelta,mapGoal,totalGoal,noRegression. ALL emitted page and header bytes
(including their hashes and manifest descriptors) and the deterministic
verificationRecord count as overhead. verificationRecord binds planId, source
inventory digest, all three manifest tips, kept count/bytes and method
reverse-ordinal-v1; it says modelOnly/experimentOnly, never native/bank receipt.
Its serialized size uses a64-character planId placeholder (no hash cycle).
Runtime timing/work reports are diagnostic processing output, not required
persisted plan metadata; their serialized byte size is reported separately.
Map delta
conservatively charges all overhead against map savings. Delta is
{direction:'decrease'|'increase'|'equal',bytes,basisPoints}; bps=floor(abs(delta)
*10000/baseline). Full pin has zero gross savings and a net metadata increase.
The serialized {planId,body} header's self-size is a bounded fixed point using
a64-character placeholder; plan hash excludes planId. No hash self-reference.
Goal>=20% NET map and>=10% NET total reduction; any nine-cell regression or
goal miss is evidence of efficiency failure, never permission to drop history.

qualifications are MODEL_ONLY,EXPERIMENT_ONLY,NOT_P1_INVENTORY,NOT_BACKUP,
NOT_RESTORE,WRITER_INDEX_NATIVE_COST_UNKNOWN. Native writer/index/disk/heap,
backup bytes and P1 hash/allocation/runtime savings remain UNKNOWN. Emitted
plan payload bytes are measured; JS array/lookup heap is not native storage.

## APIs and independent verification

createRetentionSource(model) returns the unchanged P1 in-memory source adapter.
analyzeRetention(model,request,source,runtime) -> safe result with small plan,
injected manifest pageSource and discovery work report. It does not mutate P1.
verifyRetention(model,request,source,plan,pageSource,runtime) ->
VERIFIED_COUNTERFACTUAL only after a fresh full bounded source scan, independent
reverse-ordinal closure, exact manifest membership/accounting/hash verification.
Discovery uses DFS/refsOf; verification independently extracts references and
propagates requirements in descending source ordinal order. Test/Python oracles
independently reconstruct exact financial states, not just hash roundtrips.
No candidate writer/reindexer or substitute P1 reader is exposed.

request required fields: synthetic,baselineSha,sourceRoot,sourceIndexRoot,pins;
optional limits may only LOWER the defaults. Runtime has own data methods now
and cancelled, both injected trusted functions, no clock/random/global defaults.
now supplies monotonic finite milliseconds; elapsed deadlines and cancellation
are checked throughout discovery/verification. Times are reported outside plan
identity. A cancelled/failed prefix never produces a complete plan/verification.
Manifest source has own readPage({planId,kind,index}); null only after exact end.
Verifier probes after the declared last page: extra/duplicate/missing/tampered
pages fail. Async callbacks are in-memory, not malicious-code sandboxing.

## Synthetic bounds

Defaults: objects400000,bytes256MiB,refs768,depth64,visits12000000,
workBytes2GiB,pages10000,planBytes16MiB,pageRows128,pageBytes256KiB,
record64KiB,durationMs1200000,pins256. New analyzer work limits do NOT change
accepted P1/B2a limits. Financial typed-value/map depth is64; long journal/
version ancestry is bounded by object/visit/ordinal budgets, not value depth.
Each source object/field/accessor/symbol/prototype is checked before use; every
ref resolves to an earlier source ordinal. Complete input census and original
index membership/hashes must match. Closed schemas/types, bounded value
expansion and canonical chunks refuse malformed data. Time/visit/bytes/page
and plan limits apply to verification too. Fixed safe diagnostic codes, no
input values or exception stack disclosure. No partial COMPLETE claim.

R01–R08 and N01–N12 NOT IMPLEMENTED/NOT RUN. No P1.1b, P2/native database,
production/accepted API changes, actual owner data, restore, merge or deploy.
