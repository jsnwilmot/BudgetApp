// P1.1b1 public pure-model lifecycle. No IndexedDB, files or production imports.
import { RAW, SCHEMA, STORES } from './backupFormat.js';
import { PROFILE, LAYOUT, CAPS, D, P, need, fields, plain, freeze, limits, meter, failure, isHash } from './writerFormat.js';
import { logicalBuilder, materialize } from './writerCore.js';
import { source17 } from './writerSource.js';
import { lookup, indexInventory } from './writerIndex.js';
import { verifyDelta } from './writerVerify.js';
import { verifyInventory } from './writerAudit.js';

const controllers = new WeakMap(), snapshots = new WeakMap(), commands = new WeakMap(), candidates = new WeakMap();
const text = v => typeof v === 'string' && v.trim().length > 0;
function ownData(v, required, optional = []) {
  need(plain(v) && !Object.getOwnPropertySymbols(v).length, 'UNSUPPORTED_TYPE'); const ds = Object.getOwnPropertyDescriptors(v);
  need(required.every(k => ds[k]) && Object.keys(ds).every(k => required.includes(k) || optional.includes(k)), 'INVALID_FIELDS');
  need(Object.values(ds).every(d => 'value' in d && d.enumerable), 'UNSUPPORTED_TYPE');
  return Object.fromEntries(Object.entries(ds).map(([k, d]) => [k, d.value]));
}
function state(snapshot) { const s = snapshots.get(snapshot); need(s, 'INVALID_MODEL'); return s; }
function control(controller) { const c = controllers.get(controller); need(c, 'INVALID_MODEL'); return c; }
function handle(s) {
  const snapshot = freeze({ synthetic: true, profile: PROFILE, layout: LAYOUT, physicalInstance: s.physicalInstance,
    generation: s.generation, revision: String(s.revision), root: s.root, dataRoot: s.dataRoot, stateRoot: s.stateRoot,
    inventoryRoot: s.inventoryRoot, capabilityDigest: s.capabilityDigest }); snapshots.set(snapshot, s); return snapshot;
}
function guardOf(s) { return { physicalInstance: s.physicalInstance, generation: s.generation, revision: s.revision,
  stateRoot: s.stateRoot, logicalRoot: s.root, inventoryRoot: s.inventoryRoot, capabilityDigest: s.capabilityDigest }; }
export function writerGuard(snapshot) { try { return freeze({ ok: true, guard: guardOf(state(snapshot)) }); } catch (e) { return failure(e); } }

async function semantic(base, b, kind, request, m) {
  const shapes = { 'capture-origin': ['synthetic', 'operationId', 'expectedRoot', 'sourceContentDigest', 'sourceTransportDigest'],
    'create-dataset': ['synthetic', 'operationId', 'datasetId', 'originId', 'expectedRoot'],
    'change-history': ['synthetic', 'operationId', 'datasetId', 'expectedRevision', 'expectedRoot', 'changes'] };
  need(Object.hasOwn(shapes, kind), 'INVALID_FIELDS'); fields(request, shapes[kind]);
  need(request.synthetic === true && text(request.operationId), 'SYNTHETIC_INPUT_REQUIRED');
  const typedRequest = await b.fingerprint({ kind, instanceId: base.logicalInstance, generation: base.logicalGeneration, ...request });
  return m.hash(P + 'request/1', { typedRequest });
}
async function completeLogical(base, b, request, digest, dataRoot, details, m) {
  const revision = String(base.revision + 1); need(base.revision + 1 <= m.bound.commands, 'RESOURCE_LIMIT');
  const journal = await b.intern('journal', { previous: base.journal, beforeModelRoot: base.root,
    afterDataRoot: dataRoot, operationId: request.operationId, requestDigest: digest, revision, kind: 'MODEL_ONLY' });
  const event = await b.intern('event', { operationId: request.operationId, requestDigest: digest, journal,
    afterDataRoot: dataRoot, revision, status: 'MODEL_ONLY', ...details });
  const operationsRoot = await b.maps.finish(await b.maps.put(base.operationsRoot, request.operationId, { valueRef: event, versionRef: event }));
  const root = await b.intern('model-root', { instanceId: base.logicalInstance, generation: base.logicalGeneration,
    revision, dataRoot, operationsRoot, journal });
  return { root, dataRoot, operationsRoot, journal, event: b.get(event).body, ...details };
}
async function buildOrigin(base, b, r, digest, source, m) {
  const originId = await m.hash(P + 'origin-identity/1', { snapshotDigest: source.snapshotDigest,
    contentDigest: source.contentDigest, transportDigest: source.transportDigest });
  const envelopeRef = await b.value(source.envelope), inventory = [];
  for (const store of STORES) {
    let root = b.maps.empty();
    for (const row of source.snapshot.stores[store]) {
      m.tick(); const keyRef = await b.value(m.key(row.key)), valueRef = await b.value(row.value);
      const versionRef = await b.intern('version', { datasetId: null, originId, store, keyRef, valueRef,
        deleted: false, previous: null, sourceVersionRef: null, localRevision: null });
      root = await b.maps.put(root, row.key, { valueRef, versionRef });
    }
    inventory.push({ store, keyPath: SCHEMA[store], root: await b.maps.finish(root), count: source.snapshot.stores[store].length });
  }
  const originRef = await b.intern('origin', { originId, sourceProfile: source.envelope.data.sourceProfile,
    databaseName: source.snapshot.databaseName, envelopeRef, inventory, snapshotDigest: source.snapshotDigest,
    contentDigest: source.contentDigest, transportDigest: source.transportDigest, transportBytesRetained: false });
  const current = b.get(base.dataRoot).body;
  const originsRoot = await b.maps.finish(await b.maps.put(current.originsRoot, originId, { valueRef: originRef, versionRef: originRef }));
  const dataRoot = await b.intern('data-root', { ...current, originsRoot });
  return completeLogical(base, b, r, digest, dataRoot, { originId, originRef }, m);
}
async function buildDataset(base, b, r, digest, m) {
  need(text(r.datasetId) && text(r.originId), 'INVALID_DATASET'); const current = b.get(base.dataRoot).body;
  need(!await b.maps.find(current.datasetsRoot, r.datasetId), 'INVALID_DATASET');
  const origin = await b.maps.find(current.originsRoot, r.originId); need(origin, 'INVALID_ORIGIN');
  const source = b.get(origin.valueRef).body, collections = [];
  for (const store of [...RAW, 'checkpointDrafts', 'checkpointDraftHeads']) {
    let root = b.maps.empty();
    for (const row of b.maps.rows(source.inventory.find(i => i.store === store).root)) {
      const versionRef = await b.intern('version', { datasetId: r.datasetId, store, keyRef: row.keyRef, valueRef: row.valueRef,
        deleted: false, previous: null, sourceVersionRef: row.versionRef, localRevision: String(base.revision + 1) });
      root = await b.maps.put(root, row.key, { valueRef: row.valueRef, versionRef });
    }
    collections.push({ store, root: await b.maps.finish(root) });
  }
  const datasetRef = await b.intern('dataset', { datasetId: r.datasetId, originId: r.originId, originRef: origin.valueRef, collections });
  const datasetsRoot = await b.maps.finish(await b.maps.put(current.datasetsRoot, r.datasetId, { valueRef: datasetRef, versionRef: datasetRef }));
  const dataRoot = await b.intern('data-root', { ...current, datasetsRoot });
  return completeLogical(base, b, r, digest, dataRoot, { datasetId: r.datasetId }, m);
}
async function bootstrapPublish(base, b, logical, operationId, digest, m) {
  const binding = { physicalInstance: base.physicalInstance, generation: base.generation, revision: logical.root === base.root ? 0 : base.revision + 1,
    operationId, semanticDigest: digest, requestFingerprint: digest === null ? null : await m.hash(D + 'physical-request/1', { guard: guardOf(base), semanticDigest: digest }) };
  const next = await materialize(base, b, logical, binding, m); await verifyDelta(base, next, m); next.work = m.report();
  delete next.candidate; b.cleanup(); return next;
}
export async function createWriter(input, runtime) {
  let m;
  try {
    if (input && typeof input === 'object' && Object.getOwnPropertyDescriptor(input, 'format')?.value === 'P1-MODEL-1') need(false, 'LEGACY_INVENTORY_REQUIRES_ARCHIVE');
    const r = ownData(input, ['synthetic', 'source', 'producer', 'instanceId', 'generation', 'physicalInstance', 'physicalGeneration', 'originOperationId', 'datasetOperationId', 'datasetId'], ['limits']);
    const srcFormat = r.source && typeof r.source === 'object' ? Object.getOwnPropertyDescriptor(r.source, 'format')?.value : null;
    need(srcFormat !== 'P1-MODEL-1', 'LEGACY_INVENTORY_REQUIRES_ARCHIVE'); need(r.synthetic === true, 'SYNTHETIC_INPUT_REQUIRED');
    for (const k of ['instanceId', 'generation', 'physicalInstance', 'physicalGeneration', 'originOperationId', 'datasetOperationId', 'datasetId']) need(text(r[k]) && r[k].length <= 32768, 'INVALID_IDENTITY');
    need(r.originOperationId !== r.datasetOperationId, 'OPERATION_CONFLICT'); const l = limits(r.limits); m = meter(l, runtime, true);
    const source = await source17(r.source, r.producer, m), bootstrapRoots = [], phaseWork = [m.report()], sourceStage = m.stats.stageBytes;
    const startup = m; m = meter(l, runtime, true); m.reserve(sourceStage);
    let base = { pool: null, replayPool: null, root: null, dataRoot: null, operationsRoot: null, journal: null,
      stateRoot: null, inventoryRoot: null, sealRoot: null, pinRoot: null, revision: -1,
      sequence: 0, objects: 0, payloadBytes: 0, pageCount: 0, lookupBytes: 0, lookupAllocations: 0, counts: {}, kindBytes: {},
      logicalInstance: r.instanceId, logicalGeneration: r.generation, physicalInstance: r.physicalInstance, generation: r.physicalGeneration,
      capabilityDigest: await m.hash(D + 'capabilities/1', CAPS), limits: l };
    let b = logicalBuilder(base, m), empty = await b.maps.finish(b.maps.empty());
    const dataRoot = await b.intern('data-root', { originsRoot: empty, datasetsRoot: empty });
    const root = await b.intern('model-root', { instanceId: r.instanceId, generation: r.generation, revision: '0', dataRoot, operationsRoot: empty, journal: null });
    base = await bootstrapPublish(base, b, { root, dataRoot, operationsRoot: empty, journal: null }, null, null, m); bootstrapRoots.push(base.root); phaseWork.push(m.report());
    startup.tick(); m = meter(l, runtime, true); m.reserve(sourceStage);
    b = logicalBuilder(base, m);
    const originRequest = { synthetic: true, operationId: r.originOperationId, expectedRoot: base.root,
      sourceContentDigest: source.contentDigest, sourceTransportDigest: source.transportDigest };
    const originDigest = await semantic(base, b, 'capture-origin', originRequest, m);
    const captured = await buildOrigin(base, b, originRequest, originDigest, source, m);
    base = await bootstrapPublish(base, b, captured, originRequest.operationId, originDigest, m); bootstrapRoots.push(base.root); phaseWork.push(m.report());
    startup.tick(); m = meter(l, runtime, true); m.reserve(sourceStage);
    b = logicalBuilder(base, m);
    const datasetRequest = { synthetic: true, operationId: r.datasetOperationId, datasetId: r.datasetId, originId: captured.originId, expectedRoot: base.root };
    const datasetDigest = await semantic(base, b, 'create-dataset', datasetRequest, m);
    base = await bootstrapPublish(base, b, await buildDataset(base, b, datasetRequest, datasetDigest, m), datasetRequest.operationId, datasetDigest, m); bootstrapRoots.push(base.root); phaseWork.push(m.report()); startup.tick();
    const snapshot = handle(base), controller = freeze({ synthetic: true, profile: PROFILE, physicalInstance: base.physicalInstance });
    controllers.set(controller, { snapshot, limits: l });
    return freeze({ ok: true, controller, snapshot, originId: captured.originId, bootstrapRoots, work: { phases: phaseWork, elapsedMicros: startup.report().elapsedMicros },
      sourceDigests: { content: source.contentDigest, transport: source.transportDigest } });
  } catch (e) { return freeze({ ...failure(e), ...(m ? { work: m.report() } : {}) }); }
}
export async function beginCommand(controller, input, runtime) {
  try {
    const owner = control(controller), r = ownData(input, ['kind', 'snapshot', 'guard', 'request']), base = state(r.snapshot);
    need(base.physicalInstance === controller.physicalInstance && r.snapshot === owner.snapshot, 'STALE_REVISION');
    need(['change-history', 'create-dataset'].includes(r.kind), 'INVALID_FIELDS');
    const rt = ownData(runtime, ['now', 'cancelled']); need(typeof rt.now === 'function' && typeof rt.cancelled === 'function', 'UNSUPPORTED_TYPE');
    let revoked = false;
    const m = meter(owner.limits, { now: rt.now, cancelled: () => revoked || rt.cancelled() }), request = m.copy(r.request), guard = m.copy(r.guard);
    need(m.stats.copiedBytes <= m.bound.requestBytes, 'RESOURCE_LIMIT');
    fields(guard, ['physicalInstance', 'generation', 'revision', 'stateRoot', 'logicalRoot', 'inventoryRoot', 'capabilityDigest']);
    // Native keys must be bounded before request FP encoding or hashing.
    m.key(request.operationId);
    if (r.kind === 'change-history') {
      need(Array.isArray(request.changes) && request.changes.length > 0 && request.changes.length <= m.bound.changes, 'RESOURCE_LIMIT');
      for (const change of request.changes) { m.tick(); need(plain(change) && typeof change.key === 'string', 'INVALID_KEY'); m.key(change.key); }
    } else m.key(request.datasetId);
    const b = logicalBuilder(base, m), digest = await semantic(base, b, r.kind, request, m);
    const fingerprint = await m.hash(D + 'physical-request/1', { guard, semanticDigest: digest });
    const old = await b.maps.find(base.operationsRoot, request.operationId);
    if (old) {
      const event = b.get(old.valueRef).body, receipt = lookup(base.replayPool, event.requestDigest, m);
      need(event.requestDigest === digest && receipt?.requestFingerprint === fingerprint && receipt.operationId === request.operationId, 'OPERATION_CONFLICT');
      return freeze({ ok: true, replayed: true, snapshot: owner.snapshot, receipt: { status: 'MODEL_COMMITTED', sealRoot: receipt.sealRoot, operationId: receipt.operationId } });
    }
    need(m.canonical(guard) === m.canonical(guardOf(base)) && request.expectedRoot === base.root, 'STALE_REVISION');
    const ctx = { owner, controller, base, snapshot: r.snapshot, b, m, request, kind: r.kind, digest, fingerprint, at: 0, phase: 'open', seen: new Set(), revoke: () => { revoked = true; } };
    if (r.kind === 'change-history') {
      need(request.expectedRevision === String(base.revision), 'STALE_REVISION');
      need(Array.isArray(request.changes) && request.changes.length > 0 && request.changes.length <= m.bound.changes, 'RESOURCE_LIMIT');
      ctx.current = b.get(base.dataRoot).body; const found = await b.maps.find(ctx.current.datasetsRoot, request.datasetId); need(found, 'INVALID_DATASET');
      ctx.dataset = b.get(found.valueRef).body; ctx.collections = ctx.dataset.collections.map(c => ({ ...c }));
    }
    const command = freeze({ profile: PROFILE, stage: 'COMMAND' }); ctx.command = command; commands.set(command, ctx); return freeze({ ok: true, command, replayed: false });
  } catch (e) { return failure(e); }
}
function open(command) { const c = commands.get(command); need(c?.phase === 'open', 'INVALID_CANDIDATE'); return c; }
function failed(c) { if (c && !['published', 'discarded'].includes(c.phase)) { c.phase = 'failed'; c.revoke(); } }
function minorStrings(v, m, depth = 0) {
  m.tick(); need(depth <= m.bound.depth, 'RESOURCE_LIMIT'); if (!v || typeof v !== 'object') return;
  for (const [k, x] of Object.entries(v)) { if (k.endsWith('Minor')) need(typeof x === 'string' && /^(0|-?[1-9]\d*)$/.test(x), 'UNSAFE_NUMBER'); minorStrings(x, m, depth + 1); }
}
export async function stageNext(command) {
  try {
    const c = open(command), { b, m, request, base } = c; need(c.kind === 'change-history' && c.at < request.changes.length, 'INVALID_CANDIDATE'); c.phase = 'staging'; m.tick();
    const change = request.changes[c.at]; need(plain(change) && Object.keys(change).every(k => ['store', 'key', 'value', 'deleted'].includes(k)), 'INVALID_FIELDS');
    need(RAW.includes(change.store) && text(change.key), 'INVALID_KEY'); m.key(change.key);
    const identity = m.canonical([change.store, m.key(change.key)]); need(!c.seen.has(identity), 'INVALID_IDENTITY'); c.seen.add(identity);
    const collection = c.collections.find(row => row.store === change.store), previous = await b.maps.find(collection.root, change.key), keyRef = await b.value(m.key(change.key)); let valueRef = null;
    if (change.deleted === true) need(!Object.hasOwn(change, 'value'), 'INVALID_FIELDS');
    else {
      need(change.deleted === undefined && plain(change.value), 'INVALID_FIELDS');
      need(m.canonical(m.key(change.value[SCHEMA[change.store]])) === m.canonical(m.key(change.key)), 'INVALID_KEY');
      let identityRef = previous?.valueRef;
      if (previous && !identityRef) {
        let cursor = previous.versionRef, hops = 0;
        while (cursor) { m.tick(); need(++hops <= m.bound.commands, 'RESOURCE_LIMIT'); const v = b.get(cursor); need(v.kind === 'version', 'INVALID_GRAPH'); if (v.body.valueRef) { identityRef = v.body.valueRef; break; } cursor = v.body.previous; }
      }
      if (identityRef) { const old = b.decode(identityRef);
        for (const field of ['id', 'entryKey', 'scheduledItemId', 'payPeriodDate']) if (old[field] !== undefined) need(Object.is(old[field], change.value[field]), 'INVALID_IDENTITY'); }
      minorStrings(change.value, m); valueRef = await b.value(change.value);
    }
    const versionRef = await b.intern('version', { datasetId: request.datasetId, store: change.store, keyRef, valueRef,
      deleted: change.deleted === true, previous: previous?.versionRef ?? null, sourceVersionRef: null, localRevision: String(base.revision + 1) });
    collection.root = await b.maps.put(collection.root, change.key, { valueRef, versionRef, deleted: change.deleted === true });
    need(c.phase === 'staging', 'INVALID_CANDIDATE'); c.at++; c.phase = 'open';
    return freeze({ ok: true, staged: c.at });
  } catch (e) { failed(commands.get(command)); return failure(e); }
}
export async function pinStagedRoot(command, store) {
  try { const c = open(command); need(c.kind === 'change-history' && c.at > 0, 'UNRESOLVED_PIN');
    const row = c.collections.find(r => r.store === store); need(row, 'UNRESOLVED_PIN'); c.phase = 'pinning'; const id = await c.b.maps.finish(row.root);
    need(c.phase === 'pinning', 'INVALID_CANDIDATE');
    if (!c.b.pins.some(p => p.kind === 'object' && p.id === id)) { need(c.b.pins.length < c.m.bound.pins, 'RESOURCE_LIMIT'); c.b.pins.push({ kind: 'object', id }); }
    c.phase = 'open'; return freeze({ ok: true, id });
  } catch (e) { failed(commands.get(command)); return failure(e); }
}
export function pinPublished(command, input) {
  try { const c = open(command), p = c.m.copy(input); fields(p, ['kind', 'id']); need(isHash(p.id), 'UNRESOLVED_PIN');
    if (p.kind === 'object') { try { c.b.get(p.id); } catch (e) { if (e.code !== 'MISSING_OBJECT') throw e; need(false, 'UNRESOLVED_PIN'); } }
    else need(p.kind === 'full-inventory' && p.id === c.base.inventoryRoot, 'UNRESOLVED_PIN');
    if (!c.b.pins.some(x => x.kind === p.kind && x.id === p.id)) { need(c.b.pins.length < c.m.bound.pins, 'RESOURCE_LIMIT'); c.b.pins.push(p); }
    return freeze({ ok: true });
  } catch (e) { failed(commands.get(command)); return failure(e); }
}
export async function sealCommand(command) {
  try {
    const c = open(command), { b, m, request, base } = c; c.phase = 'sealing'; let logical;
    if (c.kind === 'change-history') {
      need(c.at === request.changes.length, 'INVALID_CANDIDATE');
      for (const row of c.collections) row.root = await b.maps.finish(row.root);
      const dataset = await b.intern('dataset', { ...c.dataset, collections: c.collections });
      const datasetsRoot = await b.maps.finish(await b.maps.put(c.current.datasetsRoot, request.datasetId, { valueRef: dataset, versionRef: dataset }));
      const dataRoot = await b.intern('data-root', { ...c.current, datasetsRoot });
      logical = await completeLogical(base, b, request, c.digest, dataRoot, { datasetId: request.datasetId }, m);
    } else logical = await buildDataset(base, b, request, c.digest, m);
    const next = await materialize(base, b, logical, { physicalInstance: base.physicalInstance, generation: base.generation, revision: base.revision + 1,
      operationId: request.operationId, semanticDigest: c.digest, requestFingerprint: c.fingerprint }, m);
    need(c.phase === 'sealing', 'INVALID_CANDIDATE'); c.phase = 'sealed';
    const candidate = freeze({ profile: PROFILE, stage: 'CANDIDATE' }); c.candidate = candidate; candidates.set(candidate, { c, next, verified: false });
    return freeze({ ok: true, candidate });
  } catch (e) { failed(commands.get(command)); return failure(e); }
}
export async function validateCandidate(candidate) {
  try { const entry = candidates.get(candidate); need(entry && entry.c.phase === 'sealed', 'INVALID_CANDIDATE');
    if (entry.verified) return freeze({ ok: true, proof: entry.proof });
    entry.c.phase = 'validating'; const proof = await verifyDelta(entry.c.base, entry.next, entry.c.m);
    need(entry.c.phase === 'validating', 'INVALID_CANDIDATE'); entry.c.phase = 'sealed'; entry.proof = proof; entry.verified = true; return freeze({ ok: true, proof });
  } catch (e) { failed(candidates.get(candidate)?.c); return failure(e); }
}
export function publishCandidate(controller, candidate) {
  try {
    const owner = control(controller), entry = candidates.get(candidate); need(entry && entry.verified && entry.c.phase === 'sealed' && entry.c.owner === owner, 'INVALID_CANDIDATE');
    entry.c.phase = 'publishing'; entry.c.m.tick(); need(entry.c.phase === 'publishing', 'INVALID_CANDIDATE'); need(owner.snapshot === entry.c.snapshot, 'STALE_REVISION');
    const next = entry.next; next.work = entry.c.m.report(); delete next.candidate;
    const snapshot = handle(next); owner.snapshot = snapshot; entry.c.phase = 'published'; candidates.delete(candidate);
    entry.c.b.cleanup(); entry.c.b = null; entry.c.request = null; commands.delete(entry.c.command);
    return freeze({ ok: true, snapshot, receipt: { status: 'MODEL_COMMITTED', sealRoot: next.sealRoot, operationId: next.operationId }, work: next.work });
  } catch (e) { failed(candidates.get(candidate)?.c); return failure(e); }
}
export function discardCommand(command) {
  const c = commands.get(command); if (!c || c.phase === 'published') return failure({ code: 'INVALID_CANDIDATE' });
  c.revoke(); c.phase = 'discarded'; c.b = null; c.request = null; if (c.candidate) candidates.delete(c.candidate); commands.delete(command); return freeze({ ok: true });
}
export function currentSnapshot(controller) { try { return freeze({ ok: true, snapshot: control(controller).snapshot }); } catch (e) { return failure(e); } }
export function inspectWriter(snapshot, runtime) {
  try { const s = state(snapshot), m = meter(s.limits, runtime, false, true), live = indexInventory(s.pool, m), replay = indexInventory(s.replayPool, m);
    return freeze({ ok: true, state: s.state, stateRoot: s.stateRoot, logicalCounts: s.counts, logicalFrameBytes: s.kindBytes,
      pages: s.pageCount, physicalBytes: s.payloadBytes, conservativeTotalBytes: s.payloadBytes + s.lookupBytes,
      cumulativeLookupBytes: s.lookupBytes, cumulativeLookupAllocations: s.lookupAllocations,
      liveLookupNodes: live.nodes + replay.nodes, liveLookupBytes: live.bytes + replay.bytes,
      requiredCurrentTotalBytes: s.payloadBytes + live.bytes + replay.bytes,
      nativeIndexBytes: 'UNKNOWN', peakJSHeap: 'UNKNOWN' });
  } catch (e) { return failure(e); }
}
export async function verifyWriterInventory(snapshot, source, runtime) {
  try { const s = state(snapshot); return await verifyInventory({ state: s.state, stateRoot: s.stateRoot, physicalInstance: s.physicalInstance,
    generation: s.generation, logicalInstance: s.logicalInstance, logicalGeneration: s.logicalGeneration, revision: s.revision, limits: s.limits }, source, runtime); }
  catch (e) { return failure(e); }
}
// Bounded snapshot-qualified reader. An explicit full audit may enumerate history;
// no constructor, staging, verification or publication invokes that full scan.
export function createWriterSource(snapshot, runtime) {
  try {
    const s = state(snapshot), m = meter(s.limits, runtime, false, true), reads = new WeakMap();
    // Output copies are borrowed only during this call, then owned by the
    // caller. Keep session visits/work/deadline cumulative; release only new
    // copy reservations, never the session's retained encoding caches.
    function copiedRead(action) {
      const prior = m.stats.stageBytes;
      try { return action(); }
      catch (e) { return failure(e); }
      finally { m.release(m.stats.stageBytes - prior); }
    }
    function get(id, type) { m.tick(); const r = lookup(s.pool, id, m); need(r && (type ? r.physicalType === type : !r.physicalType), 'MISSING_OBJECT'); return r; }
    const source = { context: freeze({ physicalInstance: s.physicalInstance, generation: s.generation, stateRoot: s.stateRoot }),
      readPage(id) { return copiedRead(() => { const r = get(id, 'page'); m.tick(r.bytes.length); m.reserve(r.bytes.length);
        return { ok: true, bytes: new Uint8Array(r.bytes) }; }); },
      readMetadata(id) { return copiedRead(() => { const r = lookup(s.pool, id, m); need(r && r.physicalType && r.physicalType !== 'page', 'MISSING_OBJECT');
        return freeze({ ok: true, record: m.copy(r) }); }); },
      readLogical(id) { return copiedRead(() => { const r = get(id); return freeze({ ok: true, record: m.copy({ id: r.id, kind: r.kind, body: r.body,
        sequence: r.sequence, locator: r.locator }) }); }); },
      beginIndex() { const reader = Object.freeze({ profile: PROFILE }); reads.set(reader, { queue: s.pool ? [s.pool] : [], done: false }); return reader; },
      readIndex(reader) {
        return copiedRead(() => { const r = reads.get(reader); need(r && !r.done, 'INVALID_MODEL'); const rows = []; let bytes = 0;
          while (r.queue.length && rows.length < 128) {
            m.tick(); const n = r.queue.pop();
            if (n.tag === 'branch') { for (let i = n.children.length - 1; i >= 0; i--) r.queue.push(n.children[i][1]); continue; }
            const row = { id: n.id, type: n.record.physicalType ?? 'logical' };
            need(['logical', 'page', 'delta', 'pins', 'seal', 'state'].includes(row.type), 'INVALID_GRAPH');
            const size = 19 + row.id.length + row.type.length; // Exact closed ASCII {id,type} CJ framing.
            need(bytes + size <= 262144, 'RESOURCE_LIMIT'); m.tick(size); m.reserve(size); rows.push(row); bytes += size;
          }
          r.done = r.queue.length === 0; return freeze({ ok: true, rows, exhausted: r.done });
        });
      } };
    return freeze({ ok: true, source: Object.freeze(source), state: s.state, stateRoot: s.stateRoot });
  } catch (e) { return failure(e); }
}
