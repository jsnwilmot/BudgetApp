import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHistoryModel, changeHistory, createHistoryDataset, captureHistoryOrigin, inspectHistoryModel } from '../experimental/checkpoint/historyModel.js';
import { builder, modelState, registerModel } from '../experimental/checkpoint/historyCore.js';
import { emptyMap, mapPut } from '../experimental/checkpoint/historyMap.js';
import { canonical, hash, freeze } from '../experimental/checkpoint/backupFormat.js';
import { analyzeRetention, createRetentionSource, readRetentionPage } from '../experimental/checkpoint/retentionPlan.js';
import { verifyRetention } from '../experimental/checkpoint/retentionVerify.js';
import { modelFixture, goodModel } from './fixtures/historyModel.js';
import { runtime, request, inventory, candidateRecords, independentClosure, proveOriginal17, exact, referenceReader } from './fixtures/retention.js';

const good = goodModel, fail = (r, code) => { assert.equal(r.ok, false); assert.deepEqual(r.diagnostics, [{ code }]); assert.deepEqual(Object.keys(r), ['ok', 'diagnostics']); };
const golden = JSON.parse(await readFile(new URL('./fixtures/retentionGolden.json', import.meta.url), 'utf8'));
const oldGolden = JSON.parse(await readFile(new URL('./fixtures/historyGolden.json', import.meta.url), 'utf8'));
const empty = good(await createHistoryModel({ synthetic: true, instanceId: 'vector-instance', generation: 'local-g' })).model;
const f = await modelFixture(), model = f.model;
const source = m => good(createRetentionSource(m)).source;
const analyze = (m, pins = [], caps, rt = runtime(), io = source(m)) => analyzeRetention(m, request(m, pins, caps), io, rt);
const check = (m, a, pins = [], caps, rt = runtime(), pages = a.pageSource, io = source(m)) => verifyRetention(m, request(m, pins, caps), io, a.plan, pages, rt);
const changed = (m, id, changes) => changeHistory(m, { synthetic: true, operationId: id, datasetId: 'A', expectedRevision: m.revision, expectedRoot: m.root, changes });

test('O01/O11: independent Python complete canonical plan/hash and original ordinal vectors', async () => {
  const a = good(await analyze(empty)); assert.deepEqual(a.plan, golden.empty.plan); assert.equal(canonical(a.plan), golden.empty.canonical);
  const b = good(await analyze(empty, [{ kind: 'full-inventory', id: empty.indexRoot }])); assert.deepEqual(b.plan, golden.fullPin.plan);
  assert.equal(good(await check(empty, a)).status, 'VERIFIED_COUNTERFACTUAL');
  assert.equal(good(await check(empty, b, [{ kind: 'full-inventory', id: empty.indexRoot }])).status, 'VERIFIED_COUNTERFACTUAL');
  assert.equal(a.plan.body.source.inventoryDigest, golden.inventoryDigest);
});

test('O01/O04/G3: independent Python exact P1 record bodies/hashes and sparse retained ordinal vector', async () => {
  const s = modelState(empty), b = builder(s); let root = await emptyMap(b);
  for (const key of ['k00000', 'k00001']) {
    const keyRef = await b.value(['s', key]), valueRef = await b.value({ id: key, amount: '1.25' });
    const versionRef = await b.intern('version', { datasetId: 'vector', store: 'accounts', keyRef, valueRef, deleted: false, previous: null, sourceVersionRef: null, localRevision: '1' });
    root = await mapPut(b, root, key, { valueRef, versionRef });
  }
  const done = b.done(), m = registerModel(freeze({ ...empty, indexRoot: done.pool.digest }), Object.freeze({ ...s, ...done }));
  assert.equal(root, golden.tiny.root); assert.equal(m.indexRoot, golden.tiny.sourceIndexRoot);
  assert.deepEqual([...inventory(m).values()].sort((a, b) => a.ordinal - b.ordinal), golden.tiny.records);
  const a = good(await analyze(m, golden.tiny.pins)); good(await check(m, a, golden.tiny.pins));
  const { kept, excluded } = await candidateRecords(m, a);
  assert.deepEqual([...excluded], golden.tiny.excluded);
  assert.deepEqual([...kept.values()].map(r => r.ordinal).sort((a, b) => a - b), golden.tiny.keptOrdinals);
});

test('O02/O03/G6: exact original17 and immutable full P1 inventory survive counterfactual source/provenance proof', async () => {
  const before = inspectHistoryModel(model), records = inventory(model), a = good(await analyze(model));
  good(await check(model, a)); const { kept, excluded } = await candidateRecords(model, a);
  exact([...kept.keys()].sort(), [...independentClosure(records).required].sort()); assert.ok(excluded.size > 0);
  proveOriginal17(f, kept); exact(inspectHistoryModel(model), before);
  const after = inventory(model);
  for (const [id, record] of records) { assert.equal(after.get(id), record); if (record.kind !== 'map') assert.equal(kept.get(id), record); }
  assert.equal(a.plan.body.modelOnly, true); assert.equal(a.plan.body.experimentOnly, true); assert.notEqual(a.plan.planId, model.indexRoot);
});

test('O04/G1/G2/G3: intermediate object pin protects closure; complete-inventory pin permits zero exclusions', async () => {
  const a = good(await analyze(model)), { records, excluded } = await candidateRecords(model, a);
  const middle = [...records.values()].find(r => excluded.has(r.ordinal)); assert.ok(middle);
  const pins = [{ kind: 'object', id: middle.id }], b = good(await analyze(model, pins)); good(await check(model, b, pins));
  const kept = (await candidateRecords(model, b)).kept; assert.equal(kept.get(middle.id), middle);
  assert.equal(b.plan.body.candidate.excludedMapCount < a.plan.body.candidate.excludedMapCount, true);
  const full = [{ kind: 'full-inventory', id: model.indexRoot }], c = good(await analyze(model, full)); good(await check(model, c, full));
  assert.equal(c.plan.body.candidate.excludedMapCount, 0); assert.equal(c.plan.body.candidate.keptBytes, inspectHistoryModel(model).stats.retainedBytes);
  assert.equal(c.plan.body.accounting.totalDelta.direction, 'increase'); assert.equal(c.plan.body.accounting.totalGoal, false);
  fail(await analyze(model, [{ kind: 'full-inventory', id: empty.indexRoot }]), 'UNRESOLVED_PIN');
  fail(await analyze(model, [{ kind: 'object', id: 'f'.repeat(64) }]), 'UNRESOLVED_PIN');
  fail(await analyze(model, [pins[0], pins[0]]), 'UNRESOLVED_PIN');
});

test('O05/O06: 1/2/4/128 rows, same/dispersed leaves/stores, stable histories and duplicate refusal', async () => {
  let m = model;
  for (const count of [1, 2, 4, 128]) {
    const changes = Array.from({ length: count }, (_, i) => ({ store: i % 2 ? 'manualAdjustments' : 'savingsBucketAdjustments',
      key: `k-${count}-${i * 97}`, value: { id: `k-${count}-${i * 97}`, amountMinor: '10025', validated: i % 2 === 0 } }));
    m = good(await changed(m, `rows-${count}`, changes)).model;
  }
  const before = inspectHistoryModel(m), a = good(await analyze(m)); good(await check(m, a));
  fail(await changed(m, 'duplicate-key', [{ store: 'manualAdjustments', key: 'same', value: { id: 'same' } }, { store: 'manualAdjustments', key: 'same', value: { id: 'same' } }]), 'INVALID_IDENTITY');
  exact(inspectHistoryModel(m), before); const { kept } = await candidateRecords(m, a); proveOriginal17(f, kept);
  assert.equal(a.plan.body.candidate.byKind.version.count, 169 + 135);
});

test('O02/O03/O06: exact f64/undefined/own prototype keys/Unicode and retained delete-reinsert lineage', async () => {
  const value = { id: 'unicode-\ud800-💰', n: -0, sub: Number.MIN_VALUE, undef: undefined, lines: [{ id: 'line-A', amountMinor: '10' }], validated: true };
  Object.defineProperty(value, '__proto__', { enumerable: true, value: { original: true } });
  Object.defineProperty(value, 'constructor', { enumerable: true, value: 'original' });
  value['10'] = 'ten'; value['2'] = 'two'; let m = good(await changed(model, 'special', [{ store: 'manualAdjustments', key: value.id, value }])).model;
  const previous = m.root; m = good(await changed(m, 'delete-special', [{ store: 'manualAdjustments', key: value.id, deleted: true }])).model;
  m = good(await changed(m, 'reinsert-special', [{ store: 'manualAdjustments', key: value.id, value }])).model;
  const a = good(await analyze(m)); good(await check(m, a)); const { kept } = await candidateRecords(m, a), read = referenceReader(kept);
  const versions = [...kept.values()].filter(r => r.kind === 'version' && r.body.store === 'manualAdjustments');
  assert.equal(versions.length, 3); for (const v of versions) if (!v.body.deleted) exact(read.value(v.body.valueRef), value);
  assert.ok(kept.has(previous)); assert.equal({}.original, undefined);
});

test('O09: repeated foreign origin and same original IDs in dataset B preserve distinct local authority', async () => {
  const captured = good(await captureHistoryOrigin(model, { synthetic: true, operationId: 'capture-again', expectedRoot: model.root, bytes: f.bytes })).model;
  const b = good(await createHistoryDataset(captured, { synthetic: true, operationId: 'project-B', expectedRoot: captured.root, datasetId: 'B', originId: f.originId })).model;
  const a = good(await analyze(b)); good(await check(b, a)); const { kept } = await candidateRecords(b, a); proveOriginal17(f, kept);
  assert.equal(a.plan.body.candidate.byKind.origin.count, 1); assert.equal(a.plan.body.source.generation, 'local-generation');
  assert.ok([...kept.values()].some(r => r.kind === 'version' && r.body.datasetId === 'B'));
});

test('O07/O08: source hash/context/missing/duplicate/unknown objects refuse without partial results', async () => {
  const io = source(empty);
  fail(await analyze(empty, [], undefined, runtime(), { ...io, readIndex: async () => null }), 'INTEGRITY_MISMATCH');
  fail(await analyze(empty, [], undefined, runtime(), { ...io, readRecord: async () => null }), 'INVALID_FIELDS');
  fail(await analyze(empty, [], undefined, runtime(), { ...io, readRecord: async q => { const r = structuredClone(await io.readRecord(q)); r.ordinal++; return r; } }), 'INTEGRITY_MISMATCH');
  fail(await analyze(empty, [], undefined, runtime(), { ...io, readRecord: async q => { const r = structuredClone(await io.readRecord(q)); r.kind = 'unknown-provenance'; return r; } }), 'INTEGRITY_MISMATCH');
  fail(await analyzeRetention({ ...empty }, request(empty), io, runtime()), 'INVALID_MODEL');
  const wrong = request(empty); wrong.sourceIndexRoot = model.indexRoot;
  fail(await analyzeRetention(empty, wrong, io, runtime()), 'SOURCE_CONTEXT');
});

test('O07: candidate page/hash/accounting tampering, missing/duplicate/extra pages and false P1 claims refuse', async () => {
  const a = good(await analyze(empty));
  for (const mutate of [p => { p.body.candidate.keptCount--; }, p => { p.body.accounting.accountedBytes--; }, p => { p.body.profile = 'P1-MODEL-1'; }]) {
    const p = structuredClone(a.plan); mutate(p); p.planId = await hash('FinPath/P1.1a/plan/1', p.body);
    const r = await verifyRetention(empty, request(empty), source(empty), p, a.pageSource, runtime()); assert.equal(r.ok, false);
  }
  fail(await check(empty, a, [], undefined, runtime(), { readPage: async () => null }), 'INVALID_PAGE');
  fail(await check(empty, a, [], undefined, runtime(), { readPage: async q => q.index === 1 ? a.pageSource.readPage({ ...q, index: 0 }) : a.pageSource.readPage(q) }), 'INVALID_PAGE');
  const first = good(await readRetentionPage(a.plan, 'roots', 0, a.pageSource)).page;
  fail(await check(empty, a, [], undefined, runtime(), { readPage: async q => q.kind === 'roots' ? first : a.pageSource.readPage(q) }), 'INVALID_PAGE');
  const tampered = { readPage: async q => { const p = await a.pageSource.readPage(q); if (!p) return p; const r = structuredClone(p); r.body.rows[0] = 1; return r; } };
  fail(await check(empty, a, [], undefined, runtime(), tampered), 'INTEGRITY_MISMATCH');
  const wrong = structuredClone(a.plan); wrong.planId = '0'.repeat(64); fail(await readRetentionPage(wrong, 'roots', 0, a.pageSource), 'INTEGRITY_MISMATCH');
});

test('O08: getters/symbols/prototypes and malformed budget/pin/source/runtime boundaries are safe', async () => {
  let calls = 0; const getter = Object.defineProperty({}, 'synthetic', { enumerable: true, get() { calls++; return true; } });
  fail(await analyzeRetention(empty, getter, source(empty), runtime()), 'UNSUPPORTED_TYPE');
  const req = request(empty); req[Symbol('hidden')] = true; fail(await analyzeRetention(empty, req, source(empty), runtime()), 'UNSUPPORTED_TYPE');
  fail(await analyzeRetention(empty, Object.create({ synthetic: true }), source(empty), runtime()), 'UNSUPPORTED_TYPE');
  const io = Object.defineProperty({}, 'readIndex', { enumerable: true, get() { calls++; throw Error('private note'); } });
  fail(await analyze(empty, [], undefined, runtime(), io), 'UNSUPPORTED_TYPE');
  fail(await analyze(empty, [], []), 'INVALID_FIELDS'); fail(await analyze(empty, [], { visits: 999999999 }), 'RESOURCE_LIMIT');
  fail(await analyze(empty, [{ kind: 'bank-verified', id: empty.root }]), 'UNRESOLVED_PIN');
  const rt = Object.defineProperty({}, 'now', { enumerable: true, get() { calls++; throw Error('private amount'); } });
  fail(await analyze(empty, [], undefined, rt), 'UNSUPPORTED_TYPE'); assert.equal(calls, 0);
});

test('O08: exact and over discovery/verification budgets retain original state and return safe errors', async () => {
  const a = good(await analyze(empty)), v = good(await check(empty, a));
  good(await analyze(empty, [], { objects: 3, bytes: a.plan.body.source.census.bytes, visits: a.work.visits }));
  fail(await analyze(empty, [], { objects: 2 }), 'RESOURCE_LIMIT'); fail(await analyze(empty, [], { bytes: a.plan.body.source.census.bytes - 1 }), 'RESOURCE_LIMIT');
  fail(await analyze(empty, [], { visits: a.work.visits - 1 }), 'RESOURCE_LIMIT');
  good(await check(empty, a, [], { visits: v.work.visits })); fail(await check(empty, a, [], { visits: v.work.visits - 1 }), 'RESOURCE_LIMIT');
  good(await analyze(empty, [], { planBytes: a.plan.body.accounting.overheadBytes }));
  fail(await analyze(empty, [], { planBytes: a.plan.body.accounting.overheadBytes - 1 }), 'RESOURCE_LIMIT');
  fail(await analyze(empty, [], { refs: 1 }), 'RESOURCE_LIMIT'); fail(await analyze(empty, [], { workBytes: 1 }), 'RESOURCE_LIMIT');
  fail(await analyze(empty, [], { record: 1 }), 'RESOURCE_LIMIT');
  fail(await analyze(empty, [], { pageRows: 1, pages: 1 }), 'RESOURCE_LIMIT');
});

test('O07/O08: injected time/cancellation budgets govern both traversals and cannot certify a prefix', async () => {
  let clock = 0; const rt = () => ({ now: () => clock++, cancelled: () => false });
  clock = 0; const a = good(await analyze(empty, [], undefined, rt())); const duration = a.work.elapsedMicros / 1000;
  clock = 0; good(await analyze(empty, [], { durationMs: duration }, rt()));
  clock = 0; fail(await analyze(empty, [], { durationMs: duration - 1 }, rt()), 'RESOURCE_LIMIT');
  fail(await analyze(empty, [], undefined, { now: () => 0, cancelled: () => true }), 'CANCELLED');
  fail(await check(empty, a, [], undefined, { now: () => 0, cancelled: () => true }), 'CANCELLED');
  fail(await analyze(empty, [], undefined, { now: () => NaN, cancelled: () => false }), 'INVALID_CLOCK');
  let n = 10; fail(await analyze(empty, [], undefined, { now: () => n--, cancelled: () => false }), 'INVALID_CLOCK');
  clock = 0; const v = good(await check(empty, a, [], undefined, rt())); const verifyDuration = v.work.elapsedMicros / 1000;
  clock = 0; good(await check(empty, a, [], { durationMs: verifyDuration }, rt()));
  clock = 0; fail(await check(empty, a, [], { durationMs: verifyDuration - 1 }, rt()), 'RESOURCE_LIMIT');
});

test('O04/O07: validly rehashed smaller inventory/root-manifest cannot omit committed state', async () => {
  const a = good(await analyze(empty)), p = structuredClone(a.plan), map = p.body.source.census.byKind.map;
  p.body.candidate.keptCount--; p.body.candidate.keptBytes -= map.bytes;
  p.body.candidate.excludedMapCount = 1; p.body.candidate.excludedMapBytes = map.bytes;
  p.body.candidate.protectedMapCount = 0; p.body.candidate.protectedMapBytes = 0;
  p.body.candidate.byKind.map = { count: 0, bytes: 0 }; p.planId = await hash('FinPath/P1.1a/plan/1', p.body);
  fail(await verifyRetention(empty, request(empty), source(empty), p, a.pageSource, runtime()), 'INTEGRITY_MISMATCH');
  const page = structuredClone(good(await readRetentionPage(a.plan, 'roots', 0, a.pageSource)).page);
  page.body.rows = [1, 2]; page.id = await hash('FinPath/P1.1a/page/1', page.body);
  const q = structuredClone(a.plan); q.body.manifests.roots.tip = page.id; q.planId = await hash('FinPath/P1.1a/plan/1', q.body);
  const pages = { readPage: async r => r.kind === 'roots' ? (r.index === 0 ? page : null) : null };
  fail(await verifyRetention(empty, request(empty), source(empty), q, pages, runtime()), 'INTEGRITY_MISMATCH');
});

test('O08: record accessors/symbols/prototypes/cycles/extra index members fail safely before completion', async () => {
  const io = source(empty); let calls = 0;
  const wrappers = [
    r => { const clone = structuredClone(r); Object.defineProperty(clone.body, 'private', { enumerable: true, get() { calls++; throw Error('sensitive note'); } }); return clone; },
    r => { const clone = structuredClone(r); clone[Symbol('hidden')] = 'sensitive amount'; return clone; },
    r => Object.assign(Object.create({ unsafe: true }), r),
  ];
  for (const wrap of wrappers) fail(await analyze(empty, [], undefined, runtime(), { ...io, readRecord: async q => wrap(await io.readRecord(q)) }), 'UNSUPPORTED_TYPE');
  const cycle = { ...io, readRecord: async q => { const r = structuredClone(await io.readRecord(q)); r.body.previous = r.id; return r; } };
  fail(await analyze(empty, [], undefined, runtime(), cycle), 'INTEGRITY_MISMATCH');
  const extra = { ...io, readIndex: async q => { const d = structuredClone(await io.readIndex(q)); if (d.tag === 'branch') d.children[0] = 'f'.repeat(64); return d; } };
  fail(await analyze(empty, [], undefined, runtime(), extra), 'INTEGRITY_MISMATCH'); assert.equal(calls, 0);
});

test('O07/O08: cancellation after an async source boundary and caller request mutation cannot publish a prefix', async () => {
  const io = source(empty); let cancelled = false;
  const stopping = { ...io, readRecord: async q => { const r = await io.readRecord(q); cancelled = true; return r; } };
  fail(await analyze(empty, [], undefined, { now: () => 0, cancelled: () => cancelled }, stopping), 'CANCELLED');
  const req = request(empty), promise = analyzeRetention(empty, req, io, { now: () => 0, cancelled: () => false });
  req.pins.push({ kind: 'object', id: 'f'.repeat(64) }); req.sourceIndexRoot = 'f'.repeat(64);
  const a = good(await promise); assert.equal(a.plan.body.policy.fullInventoryPinned, false);
  let ended = false;
  const pages = { readPage: async q => { const p = await a.pageSource.readPage(q); if (p === null) ended = true; return p; } };
  fail(await check(empty, a, [], undefined, { now: () => 0, cancelled: () => ended }, pages), 'CANCELLED');
});

test('O01/O04/O06: original 0/1/32/64/65/4096/4097 roots are explicit pins, with independent vector identity', async t => {
  const base = good(await createHistoryModel({ synthetic: true, instanceId: 'boundaries', generation: 'local' })).model;
  const s = modelState(base), b = builder({ ...s, pool: s.pool, stats: s.stats }); let root = await emptyMap(b); const pins = [];
  for (let count = 0; count <= 4097; count++) {
    const vector = oldGolden.maps.find(v => v.count === count);
    if (vector) { assert.equal(root, vector.root); pins.push({ kind: 'object', id: root }); }
    if (count === 4097) break;
    const key = `k${String(count).padStart(5, '0')}`, keyRef = await b.value(['s', key]), valueRef = await b.value({ id: key, amount: '1.25' });
    const versionRef = await b.intern('version', { datasetId: 'vector', store: 'accounts', keyRef, valueRef, deleted: false, previous: null, sourceVersionRef: null, localRevision: '1' });
    root = await mapPut(b, root, key, { valueRef, versionRef });
  }
  // Test-only unchanged P1 builder evidence. No candidate writer or reindexer.
  const done = b.done(), augmented = registerModel(freeze({ ...base, indexRoot: done.pool.digest }), Object.freeze({ ...s, ...done }));
  const a = good(await analyze(augmented, pins)); good(await check(augmented, a, pins)); const { kept } = await candidateRecords(augmented, a);
  for (const pin of pins) assert.ok(kept.has(pin.id));
  t.diagnostic(JSON.stringify({ boundaryObjects: a.plan.body.source.census.objects, mapDelta: a.plan.body.accounting.mapDelta, totalDelta: a.plan.body.accounting.totalDelta }));
});

test('O06/O12: long Unicode/compound keys survive; modules invoke no forbidden global effects', async () => {
  const s = modelState(empty), b = builder(s); let root = await emptyMap(b);
  const keys = ['x'.repeat(70000), '\ud800', ['draft', '0'], ['draft', '1'], ['z', ...Array.from({ length: 70 }, (_, i) => String(i))]];
  for (const key of keys) {
    const valueRef = await b.value({ id: key }), versionRef = await b.value(key); root = await mapPut(b, root, key, { valueRef, versionRef });
  }
  const done = b.done(), augmented = registerModel(freeze({ ...empty, indexRoot: done.pool.digest }), Object.freeze({ ...s, ...done }));
  const pins = [{ kind: 'object', id: root }], planned = good(await analyze(augmented, pins)); good(await check(augmented, planned, pins));
  const { kept } = await candidateRecords(augmented, planned), reader = referenceReader(kept);
  assert.deepEqual(reader.rows(root).map(r => r.key), keys);
  const descriptors = new Map(); let calls = 0;
  try {
    for (const name of ['indexedDB', 'localStorage', 'fetch']) { descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name)); Object.defineProperty(globalThis, name, { configurable: true, get() { calls++; throw Error('forbidden effect'); } }); }
    const a = good(await analyze(empty, [], undefined, { now: () => 0, cancelled: () => false })); good(await check(empty, a, [], undefined, { now: () => 0, cancelled: () => false })); assert.equal(calls, 0);
  } finally { for (const [name, d] of descriptors) if (d) Object.defineProperty(globalThis, name, d); else delete globalThis[name]; }
});
