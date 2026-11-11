import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as api from '../experimental/checkpoint/historyModel.js';
import * as page from '../experimental/checkpoint/historyReader.js';
import { builder, emptyStats, limits, canonical, P1, keyEncode, modelState, refsOf, get } from '../experimental/checkpoint/historyCore.js';
import { emptyMap, mapPut, mapRows } from '../experimental/checkpoint/historyMap.js';
import { STORES, freeze } from '../experimental/checkpoint/backupFormat.js';
import { sourceRevision } from '../experimental/checkpoint/adapter.js';
import { SOURCE_KEYPATHS, modelFixture } from './fixtures/historyModel.js';

const good = r => { assert.equal(r.ok, true, JSON.stringify(r.diagnostics)); return r; };
const bad = (r, code) => { assert.deepEqual(r, { ok: false, diagnostics: [{ code }] }); return r; };
const vectors = JSON.parse(await readFile(new URL('./fixtures/historyGolden.json', import.meta.url), 'utf8'));
const f = await modelFixture();
const inspect = model => good(api.inspectHistoryModel(model));
const change = (model, operationId, changes, datasetId = 'A') => ({ synthetic: true, operationId, datasetId,
  expectedRevision: model.revision, expectedRoot: model.root, changes });
const shape = (b, root) => { const n = b.get(root).body; return n.tag === 'leaf' ? n.entries.length : n.children.map(c => shape(b, c.ref)); };
const hash = (domain, body) => createHash('sha256').update(domain + '\n' + canonical(body)).digest('hex');

test('H01/H14: independent Python initial-root/journal vectors and deterministic exact model roots', async () => {
  const m = good(await api.createHistoryModel({ synthetic: true, instanceId: 'vector-instance', generation: 'local-g' })).model;
  assert.equal(m.root, vectors.initial.root); assert.equal(m.dataRoot, vectors.initial.dataRoot);
  assert.equal(m.indexRoot, vectors.initial.indexRoot); assert.equal(inspect(m).stats.retainedBytes, vectors.initial.retainedBytes);
  const second = good(await api.createHistoryModel({ synthetic: true, instanceId: 'vector-instance', generation: 'local-g' })).model;
  assert.deepEqual(m, second);
  assert.equal(canonical(vectors.journal.body), vectors.journal.canonical);
  assert.equal(hash(P1 + 'journal/1', vectors.journal.body), vectors.journal.hash);
  const b = builder({ pool: null, stats: emptyStats(), limits: limits() });
  const own = { id: 'indices' }; own['10'] = 'ten'; own['2'] = 'two';
  assert.equal(await b.value(own), vectors.integerOwn.hash); assert.deepEqual(Object.keys(own), vectors.integerOwn.keys);
});

test('H01: fixed independent64-way path/split roots at0/1/32/64/65/4096/4097 with full ordered inventories', async t => {
  const b = builder({ pool: null, stats: emptyStats(), limits: limits() }); let root = await emptyMap(b);
  for (let count = 0; count <= 4097; count++) {
    const v = vectors.maps.find(v => v.count === count);
    if (v) {
      assert.equal(root, v.root); assert.deepEqual(shape(b, root), v.shape);
      const rows = await mapRows(b, root); assert.equal(rows.length, count);
      assert.deepEqual(rows.map(r => r.key), Array.from({ length: count }, (_, i) => `k${String(i).padStart(5, '0')}`));
    }
    if (count === 4097) break;
    const key = `k${String(count).padStart(5, '0')}`, keyRef = await b.value(keyEncode(key)), valueRef = await b.value({ id: key, amount: '1.25' });
    const versionRef = await b.intern('version', { datasetId: 'vector', store: 'accounts', keyRef, valueRef,
      deleted: false, previous: null, sourceVersionRef: null, localRevision: '1' });
    root = await mapPut(b, root, key, { valueRef, versionRef });
  }
  t.diagnostic(JSON.stringify({ case: 'independent4097', ...b.done().stats }));
});

test('H01: independent UTF16/compound/long-key ordering and source identity is distinct from storage hash', async () => {
  const b = builder({ pool: null, stats: emptyStats(), limits: limits() }); let root = await emptyMap(b);
  for (const key of vectors.mixed.input) {
    const keyRef = await b.value(keyEncode(key)), valueRef = await b.value({ id: key, amount: '1.25' });
    const versionRef = await b.intern('version', { datasetId: 'vector', store: 'accounts', keyRef, valueRef,
      deleted: false, previous: null, sourceVersionRef: null, localRevision: '1' });
    root = await mapPut(b, root, key, { valueRef, versionRef });
  }
  assert.equal(root, vectors.mixed.root); assert.deepEqual((await mapRows(b, root)).map(r => r.key), vectors.mixed.ordered);
  const long = 'x'.repeat(70000), valueRef = await b.value({ id: long, amount: '1.25' }), keyRef = await b.value(keyEncode(long));
  root = await mapPut(b, root, long, { valueRef, versionRef: keyRef });
  assert.equal((await mapRows(b, root)).find(r => r.key === long).key, long);
});

test('H02/H04/A1: complete source17 keyPaths/keys/values/envelope/provenance independently equal the original inventory', async () => {
  const r = good(await api.reconstructHistoryOrigin(f.model, f.originId));
  assert.deepEqual(Object.keys(r.stores).sort(), STORES);
  assert.deepEqual(Object.keys(r.stores).sort(), Object.keys(SOURCE_KEYPATHS).sort());
  for (const store of STORES) {
    assert.deepEqual(r.stores[store].keyPath, SOURCE_KEYPATHS[store]); assert.deepEqual(r.stores[store].rows, f.source.stores[store]);
    assert.deepEqual(r.stores[store].rows.map(r => r.key), f.source.stores[store].map(r => r.key));
  }
  assert.equal(r.provenance.transportBytesRetained, false);
  assert.equal(r.provenance.transportDigest, createHash('sha256').update(f.bytes).digest('hex'));
  assert.deepEqual(Object.keys(r.envelope.data.nodes[0]), ['id', 'value']);
  assert.equal(inspect(f.model).conceptualNativeStores.length, 9);
  assert.equal(f.model.generation, 'local-generation'); assert.notEqual(f.model.generation, f.source.stores.financialControl[0].value.generation);
  const rows = good(await api.readHistory(f.model, { datasetId: 'A', store: 'plannerEntries' })).rows;
  assert.equal(rows.filter(r => r.value.scheduledItemSnapshot.type === 'expense').length, 2);
  assert.equal(rows.filter(r => r.key.startsWith('orphan-')).length, 25);
  assert.equal(rows.filter(r => r.key.startsWith('newer-')).length, 22);
  assert.equal(rows.filter(r => !r.value.validated).length, 14);
  assert.equal(good(await api.readHistory(f.model, { datasetId: 'A', store: 'appMetadata' })).rows[0].value.candidateEdges.length, 11);
});

test('H02: before/after roots, amount/line/validation/marker changes, tombstone/reinsert and exact previous versions', async () => {
  let m = f.model; const original = good(await api.readHistory(m, { datasetId: 'A', store: 'plannerEntries' })).rows[0];
  const edited = { ...original.value, actualAmount: '101.25', validated: !original.value.validated,
    lineItems: [{ ...original.value.lineItems[0], amount: '26.25' }, original.value.lineItems[1]] };
  const request = change(m, 'edit-history', [{ store: 'plannerEntries', key: original.key, value: edited },
    { store: 'appMetadata', key: 'app-metadata', value: { id: 'app-metadata', plannerLastEntryMarker: { cellKey: original.key }, exactMinor: '10125' } }]);
  const beforeRequest = structuredClone(request); freeze(request);
  const first = good(await api.changeHistory(m, request)); m = first.model; assert.deepEqual(request, beforeRequest);
  const firstVersion = good(await api.readHistory(m, { datasetId: 'A', store: 'plannerEntries' })).rows.find(r => r.key === original.key).versionRef;
  assert.deepEqual(good(await api.readHistoryVersion(m, original.versionRef)).value, original.value);
  assert.deepEqual(good(await api.readHistory(f.model, { datasetId: 'A', store: 'plannerEntries' })).rows[0], original);
  m = good(await api.changeHistory(m, change(m, 'tombstone', [{ store: 'plannerEntries', key: original.key, deleted: true }]))).model;
  assert.equal(good(await api.readHistory(m, { datasetId: 'A', store: 'plannerEntries' })).rows.length, 48);
  const deleted = good(await api.readHistory(m, { datasetId: 'A', store: 'plannerEntries', includeDeleted: true })).rows.find(r => r.key === original.key);
  assert.equal(deleted.deleted, true); assert.equal(good(await api.readHistoryVersion(m, deleted.versionRef)).version.previous, firstVersion);
  bad(await api.changeHistory(m, change(m, 'wrong-reinsert', [{ store: 'plannerEntries', key: original.key,
    value: { ...original.value, scheduledItemId: 'wrong-source' } }])), 'INVALID_IDENTITY');
  m = good(await api.changeHistory(m, change(m, 'reinsert', [{ store: 'plannerEntries', key: original.key, value: original.value }]))).model;
  const restored = good(await api.readHistory(m, { datasetId: 'A', store: 'plannerEntries' })).rows.find(r => r.key === original.key);
  assert.deepEqual(restored.value, original.value); assert.notEqual(restored.versionRef, original.versionRef);
  assert.equal(good(await api.readHistoryVersion(m, restored.versionRef)).version.previous, deleted.versionRef);
  assert.deepEqual(good(await api.readHistory(m, { datasetId: 'A', store: 'plannerEntries', atRoot: f.model.root })),
    good(await api.readHistory(f.model, { datasetId: 'A', store: 'plannerEntries' })));
  assert.deepEqual(good(await api.readHistory(m, { datasetId: 'A', store: 'plannerEntries', atRoot: first.model.root })).rows.find(r => r.key === original.key).value, edited);
  assert.deepEqual(good(await api.reconstructHistoryOrigin(m, f.originId)).stores.plannerEntries.rows, f.source.stores.plannerEntries);
  const bytes = new Uint8Array(f.bytes), ownershipRequest = { synthetic: true, operationId: 'owned-byte-input', expectedRoot: m.root, bytes };
  const pending = api.captureHistoryOrigin(m, ownershipRequest); bytes.fill(0); ownershipRequest.expectedRoot = 'changed-after-call';
  const owned = good(await pending); assert.equal(owned.originId, f.originId);
});

test('H01/H02: tombstone deletion cannot underflow/merge/remove keys; reinsertion preserves split shape and prior roots', async () => {
  const b = builder({ pool: null, stats: emptyStats(), limits: limits() }); let root = await emptyMap(b);
  const keys = Array.from({ length: 65 }, (_, i) => `d${i.toString().padStart(2, '0')}`);
  for (const key of keys) { const valueRef = await b.value(key); root = await mapPut(b, root, key, { valueRef, versionRef: valueRef }); }
  const before = root;
  for (const key of keys) root = await mapPut(b, root, key, { valueRef: null, versionRef: (await mapRows(b, before)).find(r => r.key === key).versionRef, deleted: true });
  assert.deepEqual(shape(b, root), [32, 33]); assert.equal((await mapRows(b, root, false)).length, 0);
  assert.equal((await mapRows(b, before, false)).length, 65); assert.equal(b.get(root).body.total, 65);
  for (const key of keys) { const valueRef = await b.value(key); root = await mapPut(b, root, key, { valueRef, versionRef: valueRef }); }
  assert.deepEqual(shape(b, root), [32, 33]); assert.deepEqual((await mapRows(b, root)).map(r => r.key), keys);
});

test('H02/H06: own-data semantics, dangerous literal names, undefined/-0/subnormal/Unicode and exact minor strings', async () => {
  const value = { id: 'literal', amount: 0.1 + 0.2, exactMinor: '-123456789012345678901234567890', validated: true,
    zero: -0, subnormal: Number.MIN_VALUE, missingMetadata: undefined, composed: 'é', decomposed: 'e\u0301', surrogate: '\ud800' };
  Object.defineProperty(value, '__proto__', { value: { literal: true }, enumerable: true });
  value.constructor = 'own'; value.prototype = undefined;
  value['10'] = 'ten'; value['2'] = 'two';
  const before = sourceRevision(f.model), r = good(await api.changeHistory(f.model, change(f.model, 'literals', [{ store: 'manualAdjustments', key: 'literal', value }])));
  const result = good(await api.readHistory(r.model, { datasetId: 'A', store: 'manualAdjustments' })).rows[0].value;
  assert.deepEqual(result, value); assert.deepEqual(Object.keys(result), Object.keys(value)); assert.equal(Object.is(result.zero, -0), true);
  assert.deepEqual(Object.keys(result).slice(0, 2), ['2', '10']);
  assert.equal(Object.hasOwn(result, 'missingMetadata'), true); assert.equal(Object.hasOwn(result, 'absent'), false); assert.equal({}.literal, undefined);
  assert.equal(sourceRevision(f.model), before); assert.ok(Object.isFrozen(result));
});

test('H04/H14: same financial/draft IDs across datasets are isolated; foreign operation IDs are never receipts', async () => {
  let m = good(await api.createHistoryDataset(f.model, { synthetic: true, operationId: 'project-B', datasetId: 'B', originId: f.originId, expectedRoot: f.model.root })).model;
  const original = good(await api.readHistory(m, { datasetId: 'A', store: 'accounts' })).rows[0];
  m = good(await api.changeHistory(m, change(m, 'B-only', [{ store: 'accounts', key: original.key, value: { ...original.value, startingBalance: 1 } }], 'B'))).model;
  assert.equal(good(await api.readHistory(m, { datasetId: 'A', store: 'accounts' })).rows[0].value.startingBalance, original.value.startingBalance);
  assert.equal(good(await api.readHistory(m, { datasetId: 'B', store: 'accounts' })).rows[0].value.startingBalance, 1);
  assert.deepEqual(good(await api.readHistory(m, { datasetId: 'A', store: 'checkpointDrafts' })).rows.map(r => r.key), [['draft-shared', '0']]);
  assert.deepEqual(good(await api.readHistory(m, { datasetId: 'B', store: 'checkpointDrafts' })).rows.map(r => r.key), [['draft-shared', '0']]);
  assert.equal(good(await api.lookupHistoryOperation(m, 'foreign-draft')).found, false);
  const local = good(await api.lookupHistoryOperation(m, 'foreign-init')); assert.equal(local.event.status, 'MODEL_ONLY');
  assert.equal(local.event.operationId, 'foreign-init'); assert.notDeepEqual(local.event, f.source.stores.financialAudit[0].value.receipt);
  assert.equal(local.event.commitStatus, undefined); // Numeric revisions can coincide across namespaces.
});

test('H04: repeated references retain complete provenance without recursively archiving whole generated files', async () => {
  let m = f.model; const before = inspect(m).stats;
  for (let i = 0; i < 3; i++) m = good(await api.captureHistoryOrigin(m, { synthetic: true, operationId: `repeat-${i}`,
    expectedRoot: m.root, bytes: f.bytes })).model;
  const after = inspect(m).stats;
  assert.equal(after.kinds.origin, before.kinds.origin); assert.ok(after.logicalValueBytes - before.logicalValueBytes < 1000);
  assert.equal(good(await api.reconstructHistoryOrigin(m, f.originId)).provenance.envelopeRef,
    good(await api.reconstructHistoryOrigin(f.model, f.originId)).provenance.envelopeRef);
  assert.equal(after.kinds.version, before.kinds.version);
  assert.ok(after.retainedBytes - before.retainedBytes < 30000);
  assert.deepEqual(good(await api.reconstructHistoryOrigin(m, f.originId)).stores.plannerEntries.rows, f.source.stores.plannerEntries);
});

test('H14: model replay is effect-free after later changes; changed payload/root/instance cannot acquire authority', async () => {
  const request = change(f.model, 'replay-me', [{ store: 'manualAdjustments', key: 'm', value: { id: 'm', amount: '1' } }]);
  const first = good(await api.changeHistory(f.model, request));
  const later = good(await api.changeHistory(first.model, change(first.model, 'later', [{ store: 'manualAdjustments', key: 'n', value: { id: 'n', amount: '2' } }])));
  const replay = good(await api.changeHistory(later.model, request)); assert.equal(replay.replayed, true); assert.equal(replay.model, later.model);
  assert.deepEqual(replay.event, first.event);
  bad(await api.changeHistory(later.model, { ...request, changes: [{ store: 'manualAdjustments', key: 'm', value: { id: 'm', amount: '3' } }] }), 'OPERATION_CONFLICT');
  bad(await api.changeHistory(later.model, { ...request, operationId: 'new-stale' }), 'STALE_REVISION');
  bad(await api.changeHistory(later.model, { ...request, kind: 'change-history' }), 'INVALID_FIELDS');
  bad(await api.changeHistory(later.model, { ...request, generation: later.model.generation }), 'INVALID_FIELDS');
  bad(await api.readHistory(later.model, { datasetId: 'A', store: 'manualAdjustments', includeDeleted: 'true' }), 'INVALID_FIELDS');
  bad(await api.changeHistory({ ...later.model, instanceId: 'forged' }, request), 'INVALID_MODEL');
  const state = modelState(later.model);
  assert.ok(Object.isFrozen(state));
});

test('H06/H13: unsupported values/getters/identity edits and over-budget changes reject with safe codes and unchanged roots', async () => {
  let executed = 0; const accessor = { id: 'bad' }; Object.defineProperty(accessor, 'amount', { enumerable: true, get() { executed++; return 'PRIVATE_NOTE_12.34'; } });
  const cycle = { id: 'bad' }; cycle.self = cycle;
  for (const value of [accessor, cycle, { id: 'bad', [Symbol('x')]: true }, { id: 'bad', amount: Infinity }, { id: 'bad', amount: 1n }, { id: 'bad', list: Array(2) }, { id: 'bad', date: new Date(0) }, { id: 'bad', object: Object.create({ inherited: true }) }]) {
    const r = await api.changeHistory(f.model, change(f.model, 'bad-input', [{ store: 'manualAdjustments', key: 'bad', value }]));
    assert.equal(r.ok, false); assert.doesNotMatch(JSON.stringify(r), /PRIVATE|12.34|stack|TypeError/);
  }
  assert.equal(executed, 0);
  let nested = []; for (let i = 0; i < 24; i++) nested = [nested, nested];
  bad(await api.changeHistory(f.model, change(f.model, 'expansion', [{ store: 'manualAdjustments', key: 'bomb', value: { id: 'bomb', nested } }])), 'RESOURCE_LIMIT');
  bad(await api.changeHistory(f.model, change(f.model, 'wrong-id', [{ store: 'accounts', key: 'C', value: { id: 'different', amount: '1' } }])), 'INVALID_KEY');
  bad(await api.changeHistory(f.model, change(f.model, 'raw-compound', [{ store: 'accounts', key: ['C', '0'], value: { id: ['C', '0'], amount: '1' } }])), 'INVALID_KEY');
  bad(await api.changeHistory(f.model, change(f.model, 'too-many', Array(129).fill({ store: 'accounts', key: 'C', deleted: true }))), 'RESOURCE_LIMIT');
  const small = good(await api.createHistoryModel({ synthetic: true, instanceId: 'small', generation: 'g', limits: { objects: 20 } })).model;
  const stats = inspect(small);
  bad(await api.captureHistoryOrigin(small, { synthetic: true, operationId: 'over', bytes: f.bytes, expectedRoot: small.root }), 'RESOURCE_LIMIT');
  assert.deepEqual(inspect(small), stats);
  bad(await api.createHistoryModel({ synthetic: true, instanceId: 'x', generation: 'g', limits: { objects: 400001 } }), 'RESOURCE_LIMIT');
});

test('H05/H06/H13: pinned bounded pages prove exact retained census; partial/cancelled/forged tokens never COMPLETE', async () => {
  const source = good(page.createMemoryPageSource(f.model)).source;
  let read = good(await page.beginPinnedRead(f.model, { scope: 'all-retained', budgets: { pageRows: 17, pageBytes: 65536 } }));
  bad(page.finishHistoryRead(read.reader), 'INCOMPLETE_READ');
  const oldReader = read;
  bad(await page.readHistoryPage(read.reader, { ...read.continuation, scope: 'projection-only' }, source), 'INVALID_CONTINUATION');
  bad(await page.readHistoryPage({ ...read.reader }, read.continuation, source), 'INVALID_CONTINUATION');
  let count = 0, bytes = 0;
  while (true) {
    read = good(await page.readHistoryPage(read.reader, read.continuation, source));
    assert.ok(read.page.length <= 17 && read.payloadBytes <= 65536); count += read.page.length; bytes += read.payloadBytes;
    if (read.exhausted) break;
  }
  const done = good(page.finishHistoryRead(read.reader)); assert.equal(done.objects, inspect(f.model).stats.objects);
  assert.equal(done.objects, count); assert.equal(done.payloadBytes, bytes);
  const cancelled = good(await page.cancelHistoryRead(oldReader.reader));
  bad(page.finishHistoryRead(cancelled.reader), 'CANCELLED'); bad(await page.readHistoryPage(cancelled.reader, cancelled.continuation, source), 'CANCELLED');
  bad(await page.beginPinnedRead(f.model, { scope: 'active-only' }), 'UNSUPPORTED_SCOPE');
  bad(await page.beginPinnedRead(f.model, { scope: 'all-retained', budgets: { totalBytes: 1 } }), 'RESOURCE_LIMIT');
});

test('H06: missing/tampered/extra/duplicate page content, wrong source and accessor methods fail closed', async () => {
  const original = good(page.createMemoryPageSource(f.model)).source;
  const start = good(await page.beginPinnedRead(f.model));
  const sources = [
    { ...original, readIndex: async () => null },
    { ...original, readIndex: async r => ({ ...await original.readIndex(r), extra: true }) },
    { ...original, readRecord: async r => { const record = await original.readRecord(r); return { ...record, ordinal: 999999 }; } },
    { ...original, readRecord: async r => [await original.readRecord(r), await original.readRecord(r)] },
  ];
  for (const source of sources) { const r = await page.readHistoryPage(start.reader, start.continuation, source); assert.equal(r.ok, false); assert.equal(r.status, undefined); }
  const newer = good(await api.changeHistory(f.model, change(f.model, 'new', [{ store: 'manualAdjustments', key: 'new', value: { id: 'new', amount: '1' } }]))).model;
  bad(await page.readHistoryPage(start.reader, start.continuation, good(page.createMemoryPageSource(newer)).source), 'SOURCE_CONTEXT');
  let executed = false; const accessor = { readRecord: original.readRecord }; Object.defineProperty(accessor, 'readIndex', { enumerable: true, get() { executed = true; return original.readIndex; } });
  bad(await page.readHistoryPage(start.reader, start.continuation, accessor), 'INVALID_PAGE'); assert.equal(executed, false);
});

test('H14: all retained refs have earlier ordinals and journal/root links are acyclic without old-key-list copies', () => {
  const state = modelState(f.model), records = [];
  function walk(n) { if (n.tag === 'leaf') records.push(n.record); else for (const c of n.children) if (c) walk(c); } walk(state.pool);
  for (const record of records) for (const ref of refsOf(record.kind, record.body)) assert.ok(get(state.pool, ref).ordinal < record.ordinal);
  for (const r of records.filter(r => ['journal', 'model-root', 'event'].includes(r.kind))) {
    assert.ok(canonical(r.body).length < 2048); assert.equal(r.body.oldKeys, undefined); assert.equal(r.body.beforeStores, undefined);
  }
});

test('H01: equal logical inventories can have different persistent physical roots', async () => {
  const b = builder({ pool: null, stats: emptyStats(), limits: limits() });
  const keys = Array.from({ length: 129 }, (_, i) => `shape-${i.toString().padStart(3, '0')}`);
  async function build(order) {
    let root = await emptyMap(b);
    for (const key of order) { const valueRef = await b.value(key); root = await mapPut(b, root, key, { valueRef, versionRef: valueRef }); }
    return root;
  }
  const ascending = await build(keys), descending = await build([...keys].reverse());
  assert.notEqual(ascending, descending); assert.deepEqual(await mapRows(b, ascending), await mapRows(b, descending));
});

test('H13: exact creation budgets and oversized strings/depth/refs/page budgets fail without losing earlier roots', async () => {
  const options = { synthetic: true, instanceId: 'budget-vector', generation: 'g' };
  const initial = good(await api.createHistoryModel(options)).model, cost = inspect(initial).stats.retainedBytes;
  good(await api.createHistoryModel({ ...options, limits: { retainedBytes: cost, objects: 3 } }));
  bad(await api.createHistoryModel({ ...options, limits: { retainedBytes: cost - 1 } }), 'RESOURCE_LIMIT');
  const huge = { id: 'limit', note: 'x'.repeat(1048577) };
  const deep = { id: 'limit' }; let current = deep; for (let i = 0; i < 65; i++) { current.child = {}; current = current.child; }
  const wide = { id: 'limit' }; for (let i = 0; i < 1000; i++) wide[`field-${i}`] = 'shared';
  for (const value of [huge, deep, wide]) bad(await api.changeHistory(f.model, change(f.model, 'limit-case', [{ store: 'manualAdjustments', key: 'limit', value }])), 'RESOURCE_LIMIT');
  for (const exactMinor of ['01', '-0', '+1', '', 0.25]) bad(await api.changeHistory(f.model,
    change(f.model, 'minor-bad', [{ store: 'manualAdjustments', key: 'minor', value: { id: 'minor', amount: '1', exactMinor } }])), 'UNSAFE_NUMBER');
  for (const budgets of [{ pageRows: 129 }, { pageBytes: 262145 }, { visits: 4000001 }]) bad(await page.beginPinnedRead(f.model, { scope: 'all-retained', budgets }), 'RESOURCE_LIMIT');
  for (const budgets of [null, [], 0, false]) bad(await page.beginPinnedRead(f.model, { scope: 'all-retained', budgets }), 'INVALID_FIELDS');
  const source = good(page.createMemoryPageSource(f.model)).source;
  for (const budgets of [{ pageBytes: 1 }, { visits: 1 }]) {
    const r = good(await page.beginPinnedRead(f.model, { scope: 'all-retained', budgets }));
    bad(await page.readHistoryPage(r.reader, r.continuation, source), 'RESOURCE_LIMIT');
    bad(page.finishHistoryRead(r.reader), 'INCOMPLETE_READ');
  }
  assert.equal(good(await api.readHistory(f.model, { datasetId: 'A', store: 'plannerEntries' })).rows.length, 49);
});

test('H02/H07/H13: large exact values are chunked <=60KiB and native payload model <=64KiB, without truncation', async () => {
  const value = { id: 'long-note', note: 'U'.repeat(70000), amount: '0.01' };
  const m = good(await api.changeHistory(f.model, change(f.model, 'long-note', [{ store: 'manualAdjustments', key: value.id, value }]))).model;
  assert.deepEqual(good(await api.readHistory(m, { datasetId: 'A', store: 'manualAdjustments' })).rows[0].value, value);
  let fullChunk = false;
  function walk(n) {
    if (n.tag === 'branch') { n.children.filter(Boolean).forEach(walk); return; }
    assert.ok(n.record.payloadBytes <= 65536);
    if (n.record.kind === 'chunk') { assert.ok(n.record.body.data.length <= 61440); fullChunk ||= n.record.body.data.length === 61440; }
  }
  walk(modelState(m).pool); assert.equal(fullChunk, true);
});

test('H05 model: a paused old reader stays pinned while new model roots change', async () => {
  const source = good(page.createMemoryPageSource(f.model)).source;
  let read = good(await page.beginPinnedRead(f.model, { scope: 'all-retained' }));
  read = good(await page.readHistoryPage(read.reader, read.continuation, source));
  const m = good(await api.changeHistory(f.model, change(f.model, 'interleave', [{ store: 'manualAdjustments', key: 'new', value: { id: 'new', amount: '1' } }]))).model;
  assert.notEqual(m.indexRoot, f.model.indexRoot);
  while (!read.exhausted) read = good(await page.readHistoryPage(read.reader, read.continuation, source));
  const proof = good(page.finishHistoryRead(read.reader)); assert.equal(proof.root, f.model.indexRoot);
  assert.equal(proof.objects, inspect(f.model).stats.objects); assert.ok(proof.objects < inspect(m).stats.objects);
});

test('A6/H07–H12: module/runtime effect tripwires; this is not an IndexedDB or restoration API', async () => {
  for (const file of ['historyCore.js', 'historyMap.js', 'historyModel.js', 'historyReader.js']) {
    const source = await readFile(new URL(`../experimental/checkpoint/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"](?:node:|.*\/src\/)|\b(?:fetch|indexedDB|localStorage|XMLHttpRequest|Date\.now|Math\.random)\s*\(/);
  }
  assert.ok(!Object.keys(api).some(k => /restore|commit|transaction|open|deleteDatabase/i.test(k)));
  const keys = ['indexedDB', 'localStorage', 'fetch', 'XMLHttpRequest'], prior = keys.map(k => Object.getOwnPropertyDescriptor(globalThis, k));
  let calls = 0;
  try {
    for (const k of keys) Object.defineProperty(globalThis, k, { configurable: true, get() { calls++; throw Error('forbidden'); } });
    good(await api.changeHistory(f.model, change(f.model, 'pure', [{ store: 'manualAdjustments', key: 'pure', value: { id: 'pure', amount: 0.125, zero: -0 } }])));
    assert.equal(calls, 0);
  } finally { keys.forEach((k, i) => { if (prior[i]) Object.defineProperty(globalThis, k, prior[i]); else delete globalThis[k]; }); }
});
