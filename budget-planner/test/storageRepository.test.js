import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore, IDBDatabase } from 'fake-indexeddb';
import { openSyntheticRepository, deleteSyntheticDatabase, prepareSyntheticCommand, RAW_STORES } from '../experimental/checkpoint/storageRepository.js';
import { buildCheckpointPreview, sourceRevision } from '../experimental/checkpoint/adapter.js';
import { deepFreeze } from './fixtures/checkpointAdapter.js';
import { storageFixture, request, draftRequest } from './fixtures/syntheticStorage.js';

let suffix = 0;
const good = value => { assert.equal(value.ok, true, JSON.stringify(value.diagnostics)); return value; };
const bad = (value, code) => { assert.equal(value.ok, false); assert.equal(value.diagnostics[0].code, code); assert.equal(value.receipt, undefined); };
const snapshot = async repo => good(await repo.snapshot()).snapshot;
const command = (snap, req) => good(prepareSyntheticCommand(snap, req)).command;
const accountChange = (snap, id = 'C', startingBalance = '2001.00') => ({ store: 'accounts', key: id,
  value: { ...snap.stores.accounts.find(row => row.key === id).value, startingBalance } });
async function setup(t) {
  const factory = new IDBFactory(), name = `finpath-synthetic-b1-case-${++suffix}`;
  const options = { factory, name, synthetic: true }, repo = good(await openSyntheticRepository(options)).repository;
  t.after(async () => { repo.close(); good(await deleteSyntheticDatabase(options)); });
  const fixture = deepFreeze(storageFixture()); good(await repo.initialize(fixture.seed));
  return { repo, factory, name, options, fixture };
}
async function nativeRead(factory, name) {
  const db = await new Promise((resolve, reject) => { const r = factory.open(name, 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([...db.objectStoreNames], 'readonly'), all = {}, keyPaths = {};
      for (const s of db.objectStoreNames) {
        const store = tx.objectStore(s); keyPaths[s] = store.keyPath;
        let keys, values;
        const keyRequest = store.getAllKeys(), valueRequest = store.getAll();
        const done = () => { if (keys && values) all[s] = keys.map((key, i) => ({ key, value: values[i] })); };
        keyRequest.onsuccess = () => { keys = keyRequest.result; done(); };
        valueRequest.onsuccess = () => { values = valueRequest.result; done(); };
      }
      tx.oncomplete = () => resolve({ stores: all, keyPaths }); tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
async function nativeChange(factory, name, store, mutate) {
  const db = await new Promise((resolve, reject) => { const r = factory.open(name, 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
  try { await new Promise((resolve, reject) => { const tx = db.transaction(store, 'readwrite'); mutate(tx.objectStore(store)); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error); }); }
  finally { db.close(); }
}
async function patched(method, replacement, run) {
  const original = IDBObjectStore.prototype[method]; IDBObjectStore.prototype[method] = replacement(original);
  try { await run(); } finally { IDBObjectStore.prototype[method] = original; }
}
async function unchanged(context, prepared, code, executeOptions) {
  const before = await nativeRead(context.factory, context.name);
  bad(await context.repo.execute(prepared, executeOptions), code);
  const after = await nativeRead(context.factory, context.name);
  assert.deepEqual(after, before); assert.deepEqual((await snapshot(context.repo)).stores, before.stores);
  assert.equal(good(await context.repo.lookupOperation(prepared.request.operationId)).found, false);
}
function recoverBefore(current, protectedRecord) {
  return { ...protectedRecord.before.stores, ...Object.fromEntries(['financialAudit', 'protectedSnapshots'].map(s =>
    [s, current.stores[s].filter(row => protectedRecord.before.history[s].includes(row.key))])) };
}

test('T01: consistent readonly snapshot equals independently read IDB primary keys, raw values and revisions', async t => {
  const c = await setup(t), before = await nativeRead(c.factory, c.name), s = await snapshot(c.repo);
  assert.deepEqual(s.stores, before.stores); assert.equal(before.keyPaths.plannerEntries, 'entryKey');
  assert.deepEqual(before.keyPaths.recordRevisions, ['collection', 'key']);
  assert.deepEqual(before.keyPaths.checkpointDrafts, ['id', 'revision']);
  assert.deepEqual(s.stores.accounts.map(row => row.key), ['C', 'C2', 'S', 'S2']);
  assert.deepEqual(s.stores.plannerEntries.map(row => row.key), ['salary__2026-12-30', 'tax-bill__2026-12-30', 'tax-save__2026-12-30', 'tax-save__2027-01-13']);
  assert.equal(s.stores.recordRevisions.length, 20);
  assert.ok(s.stores.recordRevisions.every(row => row.value.revision === '0' && row.value.deleted === false));
  assert.ok(Object.isFrozen(s.stores.appMetadata[0].value));
  assert.deepEqual(await nativeRead(c.factory, c.name), before); // Snapshot itself writes nothing.
});

test('T02: guarded write returns success only after transaction completion, exact independent committed state', async t => {
  const c = await setup(t), before = await snapshot(c.repo), prepared = command(before, request('valid', [accountChange(before)]));
  const original = IDBDatabase.prototype.transaction; let completed = false, requestSucceeded = false, resolved = false;
  IDBDatabase.prototype.transaction = function(names, mode, ...args) {
    const tx = original.call(this, names, mode, ...args);
    if (mode === 'readwrite') tx.addEventListener('complete', () => { completed = true; }); return tx;
  };
  try {
    await patched('put', originalPut => function(value, ...args) {
      const r = originalPut.call(this, value, ...args);
      if (this.name === 'accounts') r.addEventListener('success', () => { requestSucceeded = true; assert.equal(resolved, false); }); return r;
    }, async () => {
      const result = await c.repo.execute(prepared).then(r => { resolved = true; assert.equal(completed, true); return good(r); });
      assert.equal(requestSucceeded, true); assert.equal(result.replayed, false);
      assert.deepEqual(result.receipt, { operationId: 'valid', kind: 'financial', generation: 'synthetic-generation-1',
        stateRevision: '1', financialRevision: '1', snapshotId: 'valid' });
    });
  } finally { IDBDatabase.prototype.transaction = original; }
  const after = await nativeRead(c.factory, c.name);
  assert.equal(after.stores.accounts[0].value.startingBalance, '2001.00');
  assert.deepEqual(after.stores.plannerEntries, before.stores.plannerEntries);
  assert.equal(after.stores.financialAudit.length, 2); assert.equal(after.stores.protectedSnapshots.length, 2);
  assert.deepEqual(recoverBefore(after, after.stores.protectedSnapshots.find(row => row.key === 'valid').value), before.stores);
});

test('T03: complete multistore replacement commits exact rows, generation, revisions, tombstones and immutable before-state', async t => {
  const c = await setup(t), before = await snapshot(c.repo), replacement = structuredClone(c.fixture.seed.records);
  replacement.accounts[0].value.startingBalance = '1234.56';
  replacement.categories = [{ key: 'replacement-cat', value: { id: 'replacement-cat', type: 'general', notes: 'synthetic' } }];
  replacement.transfers = [];
  const req = { ...request('replace', []), kind: 'replace', changes: undefined, generation: 'synthetic-generation-2', replacement,
    consent: { confirmed: true, action: 'replace' } };
  good(await c.repo.execute(command(before, req))); const after = await nativeRead(c.factory, c.name);
  for (const s of RAW_STORES) assert.deepEqual(after.stores[s], [...replacement[s]].sort((a, b) => a.key < b.key ? -1 : 1));
  assert.equal(after.stores.financialControl[0].value.generation, 'synthetic-generation-2');
  assert.equal(after.stores.financialControl[0].value.stateRevision, '1');
  assert.equal(after.stores.financialControl[0].value.financialRevision, '1');
  const removed = after.stores.recordRevisions.find(row => row.value.collection === 'transfers' && row.value.key === 'tax-funding');
  assert.deepEqual(removed.value, { collection: 'transfers', key: 'tax-funding', generation: 'synthetic-generation-2', revision: '1', deleted: true, contentToken: null });
  assert.deepEqual(after.stores.financialAudit.find(row => row.key === 'bootstrap'), before.stores.financialAudit[0]);
  assert.deepEqual(recoverBefore(after, after.stores.protectedSnapshots.find(row => row.key === 'replace').value), before.stores);
});

test('T04: failure of the first raw store request aborts every store, control, audit and snapshot', async t => {
  const c = await setup(t), s = await snapshot(c.repo), prepared = command(s, request('fail-first', [accountChange(s), accountChange(s, 'S', '3001.00')]));
  await patched('put', original => function(value, ...args) { return this.name === 'accounts' && value.id === 'C' ? this.add(value) : original.call(this, value, ...args); },
    () => unchanged(c, prepared, 'IMMUTABLE_RECORD_CONFLICT'));
});

test('T05: middle store request failure rolls back earlier executed raw/revision writes', async t => {
  const c = await setup(t), s = await snapshot(c.repo); let earlierWriteExecuted = false;
  const prepared = command(s, request('fail-middle', [accountChange(s), { store: 'categories', key: 'salary', value: { id: 'salary', type: 'income', notes: 'new' } }]));
  await patched('put', original => function(value, ...args) {
    if (this.name === 'categories') return this.add(value);
    const r = original.call(this, value, ...args);
    if (this.name === 'accounts') r.addEventListener('success', () => { earlierWriteExecuted = true; }); return r;
  }, () => unchanged(c, prepared, 'IMMUTABLE_RECORD_CONFLICT'));
  assert.equal(earlierWriteExecuted, true);
});

test('T06: final audit and final control request failures roll back all prior successful writes', async t => {
  for (const target of ['financialAudit', 'financialControl']) {
    const c = await setup(t), s = await snapshot(c.repo), prepared = command(s, request(`fail-${target}`, [accountChange(s)]));
    let rawSucceeded = false;
    await patched('put', original => function(value, ...args) {
      if (this.name === target) return this.add(value);
      const r = original.call(this, value, ...args);
      if (this.name === 'accounts') r.addEventListener('success', () => { rawSucceeded = true; }); return r;
    }, async () => {
      await patched('add', original => function(value, ...args) {
        return original.call(this, this.name === target && target === 'financialAudit' ? { ...value, id: 'bootstrap' } : value, ...args);
      }, () => unchanged(c, prepared, 'IMMUTABLE_RECORD_CONFLICT'));
    });
    assert.equal(rawSucceeded, true);
  }
});

test('T07: synchronous DataCloneError aborts a live transaction; unsafe serialization is rejected without writes', async t => {
  const c = await setup(t), s = await snapshot(c.repo), prepared = command(s, request('clone', [accountChange(s)]));
  await patched('put', original => function(value, ...args) {
    if (this.name === 'accounts') throw new DOMException('private fixture content', 'DataCloneError'); return original.call(this, value, ...args);
  }, () => unchanged(c, prepared, 'DATA_CLONE_FAILED'));
  const req = request('uncloneable', [{ ...accountChange(s), value: { id: 'C', fn: () => {} } }]);
  bad(prepareSyntheticCommand(s, req), 'INVALID_DTO'); assert.deepEqual(await snapshot(c.repo), s);
});

test('T08: simulated quota and native injected-IDB transaction abort retain exact prior state', async t => {
  for (const quota of [true, false]) {
    const c = await setup(t), s = await snapshot(c.repo), prepared = command(s, request(`abort-${quota}`, [accountChange(s)]));
    await patched('put', original => function(value, ...args) {
      if (this.name === 'accounts') {
        if (quota) throw new DOMException('private quota detail', 'QuotaExceededError');
        this.transaction.abort();
      }
      return original.call(this, value, ...args);
    }, () => unchanged(c, prepared, quota ? 'STORAGE_QUOTA' : 'TRANSACTION_ABORTED'));
  }
});

test('T09: explicit cancellation before or during transaction yields no success receipt or partial writes', async t => {
  const c = await setup(t), s = await snapshot(c.repo), prepared = command(s, request('cancel', [accountChange(s)]));
  const controller = new AbortController();
  await patched('put', original => function(value, ...args) {
    const r = original.call(this, value, ...args); if (this.name === 'accounts') r.addEventListener('success', () => controller.abort()); return r;
  }, () => unchanged(c, prepared, 'CANCELLED', { signal: controller.signal }));
  await unchanged(c, prepared, 'CANCELLED', { signal: controller.signal });
});

test('T10: stale local generation fails inside transaction without changing the newer dataset', async t => {
  const c = await setup(t), old = await snapshot(c.repo), stale = command(old, request('stale-gen', [accountChange(old)]));
  const replace = { ...request('new-generation', []), kind: 'replace', changes: undefined, replacement: c.fixture.seed.records,
    generation: 'synthetic-generation-2', consent: { confirmed: true, action: 'replace' } };
  good(await c.repo.execute(command(old, replace))); await unchanged(c, stale, 'STALE_GENERATION');
});

test('T11: exact content catches an edit with identical timestamps and no cooperating revision increment', async t => {
  const c = await setup(t), s = await snapshot(c.repo), prepared = command(s, request('stale-content', [accountChange(s)]));
  await nativeChange(c.factory, c.name, 'accounts', store => store.put({ ...s.stores.accounts[0].value, startingBalance: '9999.99' }));
  await unchanged(c, prepared, 'STALE_CONTENT');
});

test('T12: full dependency membership catches insertion of absent-at-preview records and deletion', async t => {
  for (const insert of [true, false]) {
    const c = await setup(t), s = await snapshot(c.repo), prepared = command(s, request(`keyset-${insert}`, [accountChange(s)]));
    await nativeChange(c.factory, c.name, 'scheduledItems', store => insert ? store.add({ id: 'new-obligation', type: 'expense', amount: '10' }) : store.delete('tax-save'));
    await unchanged(c, prepared, 'STALE_CONTENT');
  }
});

test('T13: unsupported requested and stored writer capabilities fail closed inside transaction', async t => {
  const c = await setup(t), s = await snapshot(c.repo);
  const req = { ...request('unsupported', [accountChange(s)]), requiredCapabilities: ['future-writer-v9'] };
  await unchanged(c, command(s, req), 'UNSUPPORTED_CAPABILITY');
  const prepared = command(s, request('stored-capability', [accountChange(s)]));
  await nativeChange(c.factory, c.name, 'financialControl', store => store.put({ ...s.stores.financialControl[0].value, capabilities: ['future-v9'] }));
  await unchanged(c, prepared, 'UNSUPPORTED_CAPABILITY');
});

test('T14: exact operation replay returns original completed receipt, also after later commands and reopen; never reapplies', async t => {
  const c = await setup(t), s = await snapshot(c.repo), first = command(s, request('once', [accountChange(s)]));
  const receipt = good(await c.repo.execute(first)).receipt;
  let before = await snapshot(c.repo); const replay = good(await c.repo.execute(first));
  assert.equal(replay.replayed, true); assert.deepEqual(replay.receipt, receipt); assert.deepEqual(await snapshot(c.repo), before);
  const later = command(before, request('later', [accountChange(before, 'C', '2222.22')])); good(await c.repo.execute(later));
  before = await snapshot(c.repo); c.repo.close();
  const reopened = good(await openSyntheticRepository(c.options)).repository;
  try {
    assert.deepEqual(good(await reopened.lookupOperation('once')).receipt, receipt);
    assert.equal(good(await reopened.execute(first)).replayed, true); assert.deepEqual(await snapshot(reopened), before);
    assert.equal((await snapshot(reopened)).stores.accounts[0].value.startingBalance, '2222.22');
  } finally { reopened.close(); }
});

test('T15: reused operationId with changed payload or dependencies refuses without changing committed history', async t => {
  const c = await setup(t), s = await snapshot(c.repo), original = command(s, request('same-id', [accountChange(s)])); good(await c.repo.execute(original));
  const before = await snapshot(c.repo);
  for (const changed of [command(s, request('same-id', [accountChange(s, 'C', '7777.77')])), command(before, request('same-id', [accountChange(s)]))]) {
    bad(await c.repo.execute(changed), 'OPERATION_CONFLICT'); assert.deepEqual(await snapshot(c.repo), before);
  }
});

test('T16: inactive-draft-only commits leave every raw historical key/value, source, validation, marker and financial output exact', async t => {
  const c = await setup(t), before = await snapshot(c.repo), fixtureBefore = sourceRevision(c.fixture);
  const reconstruct = stores => {
    const f = structuredClone(c.fixture.financial);
    for (const s of RAW_STORES.filter(s => !['appSettings', 'appMetadata', 'plannerEntries'].includes(s))) f.data[s] = stores[s].map(row => row.value);
    f.data.plannerEntries = Object.fromEntries(stores.plannerEntries.map(row => [row.key, row.value])); return f;
  };
  const expected = buildCheckpointPreview(reconstruct(before.stores)); assert.equal(expected.ok, true);
  good(await c.repo.execute(command(before, draftRequest('draft-only')))); const after = await nativeRead(c.factory, c.name);
  for (const s of RAW_STORES) assert.deepEqual(after.stores[s], before.stores[s]);
  assert.deepEqual(after.stores.recordRevisions, before.stores.recordRevisions);
  assert.equal(after.stores.financialControl[0].value.financialRevision, '0'); assert.equal(after.stores.financialControl[0].value.stateRevision, '1');
  assert.equal(after.stores.checkpointDrafts[0].value.status, 'inactive'); assert.equal(after.stores.checkpointDrafts[0].value.payload.openingMinor, '700000');
  assert.deepEqual(after.stores.checkpointDrafts[0].key, ['synthetic-draft', '0']);
  assert.deepEqual(buildCheckpointPreview(reconstruct(after.stores)), expected);
  assert.equal(expected.calculation.validated.aggregate.cash, '600000'); assert.equal(expected.calculation.validated.buckets.tax, '70000');
  assert.equal(sourceRevision(c.fixture), fixtureBefore);
  assert.deepEqual(recoverBefore(after, after.stores.protectedSnapshots.find(row => row.key === 'draft-only').value), before.stores);
});

test('isolation: absent/production/nonallowlisted names and absent factory never call any IDB open/delete method', async () => {
  const calls = [], factory = { open: (...args) => { calls.push(['open', ...args]); throw new Error('must not open'); },
    deleteDatabase: (...args) => { calls.push(['delete', ...args]); throw new Error('must not delete'); } };
  for (const name of [undefined, '', 'budget-planner-db', 'other', 'finpath-synthetic-b1-', 'finpath-synthetic-b1-a/b']) {
    for (const fn of [openSyntheticRepository, deleteSyntheticDatabase]) bad(await fn({ factory, name, synthetic: true }), 'SYNTHETIC_DATABASE_REQUIRED');
  }
  for (const fn of [openSyntheticRepository, deleteSyntheticDatabase]) {
    bad(await fn({ name: 'finpath-synthetic-b1-valid', synthetic: true }), 'FACTORY_REQUIRED');
    bad(await fn(undefined), 'INVALID_OPTIONS');
    bad(await fn({ factory, name: 'finpath-synthetic-b1-valid', synthetic: false }), 'SYNTHETIC_DATABASE_REQUIRED');
  }
  assert.deepEqual(calls, []);
});

test('isolation: validated name is captured before caller mutation; deletion is restricted to disposable names', async () => {
  const native = new IDBFactory(), calls = [], options = { name: 'finpath-synthetic-b1-captured', synthetic: true,
    factory: { open: (name, version) => { calls.push(['open', name, version]); return native.open(name, version); },
      deleteDatabase: name => { calls.push(['delete', name]); return native.deleteDatabase(name); } } };
  const pending = openSyntheticRepository(options); options.name = 'budget-planner-db';
  const repo = good(await pending).repository; repo.close();
  good(await deleteSyntheticDatabase({ ...options, name: 'finpath-synthetic-b1-captured' }));
  assert.deepEqual(calls, [['open', 'finpath-synthetic-b1-captured', 1], ['delete', 'finpath-synthetic-b1-captured']]);
});

test('guards: wrong keyPath values, direct audit/recovery changes, active drafts and missing consent cannot write', async t => {
  const c = await setup(t), s = await snapshot(c.repo);
  for (const req of [request('bad-key', [{ ...accountChange(s), value: { id: 'replacement-id' } }]),
    request('audit-overwrite', [{ store: 'financialAudit', key: 'bootstrap', value: { id: 'bootstrap' } }]),
    { ...draftRequest('active'), draft: { ...draftRequest('active').draft, status: 'active' } },
    { ...request('no-consent', [accountChange(s)]), consent: { confirmed: false, action: 'financial' } }]) {
    assert.equal(prepareSyntheticCommand(s, req).ok, false);
  }
  assert.deepEqual(await snapshot(c.repo), s);
});

test('history: deletion writes tombstone; snapshots/audits are append-only, nonrecursive and inspectable as they grow', async t => {
  const c = await setup(t), original = await snapshot(c.repo);
  for (let i = 0; i < 4; i++) { const s = await snapshot(c.repo); good(await c.repo.execute(command(s, request(`growth-${i}`, [accountChange(s, 'C', `200${i}.00`)])))); }
  let s = await snapshot(c.repo); good(await c.repo.execute(command(s, request('delete', [{ store: 'transfers', key: 'tax-funding', delete: true }])))); s = await snapshot(c.repo);
  assert.equal(s.stores.financialAudit.length, 6); assert.equal(s.stores.protectedSnapshots.length, 6);
  for (const row of original.stores.financialAudit) assert.deepEqual(s.stores.financialAudit.find(r => r.key === row.key), row);
  const revision = s.stores.recordRevisions.find(row => row.key[0] === 'transfers' && row.key[1] === 'tax-funding');
  assert.equal(revision.value.deleted, true); assert.equal(revision.value.revision, '5');
  for (const row of s.stores.protectedSnapshots) {
    assert.equal(row.value.before.stores.protectedSnapshots, undefined); assert.equal(row.value.before.stores.financialAudit, undefined);
    assert.ok(Array.isArray(row.value.before.history.financialAudit));
  }
  const sizes = s.stores.financialAudit.map(row => row.value.commandIdentity.length); assert.deepEqual(sizes, Array(6).fill(64));
});

test('guards: competing prepared commands conflict; old-generation receipts cannot authorize replay into a replacement dataset', async t => {
  const c = await setup(t), s = await snapshot(c.repo), a = command(s, request('a', [accountChange(s)])), b = command(s, request('b', [accountChange(s, 'C', '2002.00')]));
  const results = await Promise.all([c.repo.execute(a), c.repo.execute(b)]);
  assert.equal(results.filter(r => r.ok).length, 1); bad(results.find(r => !r.ok), 'STALE_REVISION');
  const committed = results[0].ok ? a : b, beforeReplace = await snapshot(c.repo);
  const replace = { ...request('new-dataset', []), kind: 'replace', changes: undefined, generation: 'generation-other', replacement: c.fixture.seed.records,
    consent: { confirmed: true, action: 'replace' } };
  good(await c.repo.execute(command(beforeReplace, replace))); const final = await snapshot(c.repo);
  bad(await c.repo.execute(committed), 'REPLAY_CONTEXT_CONFLICT'); assert.deepEqual(await snapshot(c.repo), final);
});

test('snapshot: a readonly snapshot requested after the first uncommitted write sees only the whole completed transaction', async t => {
  const c = await setup(t), s = await snapshot(c.repo); let pendingRead;
  const prepared = command(s, request('coherent', [accountChange(s), accountChange(s, 'S', '3001.00')]));
  await patched('put', original => function(value, ...args) {
    const r = original.call(this, value, ...args);
    if (this.name === 'accounts' && value.id === 'C') r.addEventListener('success', () => { pendingRead = c.repo.snapshot(); }); return r;
  }, async () => { good(await c.repo.execute(prepared)); });
  const read = good(await pendingRead).snapshot;
  assert.equal(read.stores.accounts.find(row => row.key === 'C').value.startingBalance, '2001.00');
  assert.equal(read.stores.accounts.find(row => row.key === 'S').value.startingBalance, '3001.00');
  assert.equal(read.stores.financialControl[0].value.stateRevision, '1');
  assert.ok(read.stores.financialAudit.some(row => row.key === 'coherent'));
  assert.ok(read.stores.protectedSnapshots.some(row => row.key === 'coherent'));
});

test('isolation: no global IndexedDB fallback; prepared commands cannot cross synthetic database contexts', async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB'); let accesses = 0;
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get: () => { accesses++; throw new Error('global IDB forbidden'); } });
  try {
    const a = await setup(t), b = await setup(t), s = await snapshot(a.repo);
    const prepared = command(s, request('wrong-context', [accountChange(s)]));
    await unchanged(b, prepared, 'DATABASE_CONTEXT_MISMATCH');
    assert.equal(accesses, 0);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor); else delete globalThis.indexedDB; }
});

test('schema: foreign or newer synthetic schema is rejected without changing it; no silent upgrade/reset', async () => {
  for (const version of [1, 2]) {
    const factory = new IDBFactory(), name = `finpath-synthetic-b1-foreign-${version}`;
    const db = await new Promise((resolve, reject) => {
      const r = factory.open(name, version); r.onupgradeneeded = () => r.result.createObjectStore('foreign', { keyPath: 'id' });
      r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    db.close(); const options = { factory, name, synthetic: true };
    bad(await openSyntheticRepository(options), 'SCHEMA_MISMATCH');
    const check = await new Promise(resolve => { const r = factory.open(name); r.onsuccess = () => resolve(r.result); });
    assert.equal(check.version, version); assert.deepEqual([...check.objectStoreNames], ['foreign']); check.close();
    good(await deleteSyntheticDatabase(options));
  }
});

test('draft history: exact head revisions, immutable old bundles and mandatory immutable snapshot/audit additions', async t => {
  const c = await setup(t); let s = await snapshot(c.repo);
  good(await c.repo.execute(command(s, draftRequest('draft-0')))); s = await snapshot(c.repo);
  const original = s.stores.checkpointDrafts[0];
  const repeatedRevision = command(s, draftRequest('overwrite-attempt'));
  await unchanged(c, repeatedRevision, 'INVALID_DRAFT');
  good(await c.repo.execute(command(s, draftRequest('draft-1', '1')))); s = await snapshot(c.repo);
  assert.equal(s.stores.checkpointDrafts.length, 2); assert.deepEqual(s.stores.checkpointDrafts[0], original);
  assert.equal(s.stores.checkpointDraftHeads[0].value.revision, '1');
  assert.deepEqual(s.stores.financialAudit.find(row => row.key === 'draft-1').value.affected,
    [{ collection: 'checkpointDrafts', key: ['synthetic-draft', '1'] }]);
  assert.equal(s.stores.protectedSnapshots.length, 3); assert.equal(s.stores.financialAudit.length, 3);
});

test('diagnostics: injected private details and unsafe DTOs cannot escape as errors or partially committed values', async t => {
  const c = await setup(t), s = await snapshot(c.repo), prepared = command(s, request('safe-error', [accountChange(s)]));
  await patched('put', original => function(value, ...args) {
    if (this.name === 'accounts') throw { code: 'PRIVATE-FINANCIAL-TEXT', message: 'private raw details' }; return original.call(this, value, ...args);
  }, async () => {
    const result = await c.repo.execute(prepared); bad(result, 'DATABASE_ERROR');
    assert.ok(!JSON.stringify(result).includes('private') && !JSON.stringify(result).includes('PRIVATE'));
  });
  assert.deepEqual(await snapshot(c.repo), s);
  let invoked = false;
  const invalid = { get request() { invoked = true; return prepared.request; } };
  bad(await c.repo.execute(invalid), 'INVALID_DTO'); assert.equal(invoked, false);
});

test('identities: ordinary synthetic writes cannot replace existing record IDs, source IDs or assigned dates', async t => {
  const c = await setup(t), s = await snapshot(c.repo), entry = s.stores.plannerEntries[0];
  for (const change of [{ scheduledItemId: 'different-source' }, { payPeriodDate: '2027-01-13' }]) {
    const prepared = command(s, request(`identity-${Object.keys(change)[0]}`, [{ store: 'plannerEntries', key: entry.key, value: { ...entry.value, ...change } }]));
    await unchanged(c, prepared, 'IDENTITY_CONFLICT');
  }
});
