import test from 'node:test';
import assert from 'node:assert/strict';
import { pairedFixture, commitPair, stage, requestFor } from './fixtures/writerCompletion.js';
import { goodModel } from './fixtures/historyModel.js';
import { runtime, exactOwn } from './fixtures/writerParity.js';
import * as api from '../experimental/checkpoint/writer.js';
import { changeHistory, createHistoryDataset, inspectHistoryModel } from '../experimental/checkpoint/historyModel.js';
import { createMemoryPageSource as createHistorySource } from '../experimental/checkpoint/historyReader.js';
import { inventory, referenceReader, proveOriginal17 } from './fixtures/retention.js';
import { readPhysicalPages } from './fixtures/writerParity.js';
import { writerOptions } from './fixtures/writerParity.js';
import { readFileSync, readdirSync } from 'node:fs';

let fixture;
const shared = () => fixture ??= pairedFixture();
const change = (id, amount = '1.25') => ({ store: 'manualAdjustments', key: id, value: { id, amount, validated: true } });

test('W03: first ordinary changed command preserves exact accepted P1 committed roots', async () => {
  const f = await shared();
  await commitPair(f, 'first-change', [{ store: 'manualAdjustments', key: 'synthetic-first', value: {
    id: 'synthetic-first', amount: '1.25', validated: true, date: '2027-01-13',
    plannerLastEntryMarker: { cellKey: 'synthetic-first__2027-01-13' }, audit: ['synthetic-original'] } }]);
});

test('W11: full authoritative ledger/index closure verifies and rebuilds an independent read-only lookup', async t => {
  const f = await shared(), source = goodModel(api.createWriterSource(f.snapshot, runtime())).source;
  const audit = goodModel(await api.verifyWriterInventory(f.snapshot, source, runtime()));
  assert.equal(audit.proof.status, 'VERIFIED_WRITER_INVENTORY_MODEL');
  assert.equal(audit.proof.byKind['model-root'], 4);
  const rebuilt = audit.rebuilt.open(runtime());
  assert.equal(goodModel(rebuilt.readLogical(f.snapshot.root)).record.body.revision, f.snapshot.revision);
  t.diagnostic(JSON.stringify(audit.proof));
});

test('W05: exact replay after another commit has no effects; changed request/guard conflicts', async () => {
  const f = await shared(), a = await commitPair(f, 'replay-original', [change('replay-row')]);
  await commitPair(f, 'replay-intervening', [change('another-row')]); const before = f.snapshot;
  const replay = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before, guard: a.guard, request: a.request }, runtime()));
  assert.equal(replay.replayed, true); assert.equal(replay.receipt.sealRoot, a.receipt.sealRoot); assert.equal(replay.snapshot, before);
  for (const input of [{ guard: a.guard, request: { ...a.request, changes: [change('replay-row', '9.99')] } },
    { guard: goodModel(api.writerGuard(before)).guard, request: a.request }]) {
    const r = await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before, ...input }, runtime());
    assert.equal(r.ok, false); assert.equal(r.diagnostics[0].code, 'OPERATION_CONFLICT');
  }
  assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, before);
});

test('W04/W05: same-base candidates publish once, and discard/cancellation cannot revive a candidate', async () => {
  const f = await shared(), old = f.snapshot;
  const a = await stage(f, requestFor(old, 'race-A', [change('race-A')]));
  const b = await stage(f, requestFor(old, 'race-B', [change('race-B')]));
  const ca = goodModel(await api.sealCommand(a.command)).candidate, cb = goodModel(await api.sealCommand(b.command)).candidate;
  goodModel(await api.validateCandidate(ca)); goodModel(await api.validateCandidate(cb));
  const result = goodModel(api.publishCandidate(f.candidate.controller, ca));
  assert.equal(api.publishCandidate(f.candidate.controller, cb).diagnostics[0].code, 'STALE_REVISION');
  // Align the separate P1 oracle with only the winning owner operation.
  const { changeHistory } = await import('../experimental/checkpoint/historyModel.js');
  f.model = goodModel(await changeHistory(f.model, requestFor(f.model, 'race-A', [change('race-A')]))).model;
  assert.equal(result.snapshot.root, f.model.root); f.snapshot = result.snapshot;
  const c = await stage(f, requestFor(f.snapshot, 'discarded', [change('discarded')]));
  const candidate = goodModel(await api.sealCommand(c.command)).candidate; goodModel(await api.validateCandidate(candidate));
  goodModel(api.discardCommand(c.command)); assert.equal(api.publishCandidate(f.candidate.controller, candidate).ok, false);
  let cancelled = false; const d = await stage(f, requestFor(f.snapshot, 'cancelled', [change('cancelled')]), { now: () => 0, cancelled: () => cancelled });
  const cd = goodModel(await api.sealCommand(d.command)).candidate; goodModel(await api.validateCandidate(cd)); cancelled = true;
  assert.equal(api.publishCandidate(f.candidate.controller, cd).diagnostics[0].code, 'CANCELLED');
  assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, f.snapshot);
});

test('W02/W03: original order, same-leaf multi-row, tombstone and reinsertion preserve every root and input', async () => {
  const f = await shared();
  for (const count of [2, 4, 128]) {
    const changes = Array.from({ length: count }, (_, i) => change('many-' + String(count - i).padStart(4, '0'))), before = structuredClone(changes);
    await commitPair(f, 'many-' + count, changes, 'A', { now: () => 0, cancelled: () => false }); exactOwn(before, changes, 'immutable changes');
  }
  await commitPair(f, 'tombstone', [{ store: 'manualAdjustments', key: 'many-0001', deleted: true }]);
  await commitPair(f, 'reinsert', [change('many-0001', '4.50')]);
});

test('W03/W10: duplicate changes and protected identities fail atomically; exact financial no-op retains version/audit', async () => {
  const f = await shared(), before = f.snapshot, request = requestFor(before, 'duplicate-pair', [change('d'), change('d')]);
  const command = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before,
    guard: goodModel(api.writerGuard(before)).guard, request }, runtime())).command;
  goodModel(await api.stageNext(command)); assert.equal((await api.stageNext(command)).diagnostics[0].code, 'INVALID_IDENTITY');
  assert.equal((await api.sealCommand(command)).ok, false); assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, before);
  const first = await commitPair(f, 'financial-identical-1', [change('no-op')]);
  const second = await commitPair(f, 'financial-identical-2', [change('no-op')]);
  assert.notEqual(second.snapshot.root, first.snapshot.root); assert.notEqual(second.snapshot.dataRoot, first.snapshot.dataRoot);
  await commitPair(f, 'tombstone-again', [{ store: 'manualAdjustments', key: 'many-0001', deleted: true }]);
  await commitPair(f, 'tombstone-again-2', [{ store: 'manualAdjustments', key: 'many-0001', deleted: true }]);
  await commitPair(f, 'reinsert-again', [change('many-0001')]);
  const source = f.source.stores.plannerEntries[0].value, edited = { ...source, scheduledItemId: 'wrong-source' };
  const bad = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: f.snapshot,
    guard: goodModel(api.writerGuard(f.snapshot)).guard, request: requestFor(f.snapshot, 'invalid-source', [{ store: 'plannerEntries', key: source.entryKey, value: edited }]) }, runtime()));
  assert.equal((await api.stageNext(bad.command)).diagnostics[0].code, 'INVALID_IDENTITY');
});

test('W04/W12: stage/hash/page/validation/cas cancellation and expiration never publish partial state', async () => {
  const f = await shared(), before = f.snapshot;
  for (const phase of ['stage', 'seal', 'validate', 'publish']) {
    let cancelled = false;
    const started = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before,
      guard: goodModel(api.writerGuard(before)).guard, request: requestFor(before, 'cancel-' + phase, [change('cancel-' + phase)]) },
    { now: () => 0, cancelled: () => cancelled }));
    if (phase === 'stage') { cancelled = true; assert.equal((await api.stageNext(started.command)).diagnostics[0].code, 'CANCELLED'); }
    else {
      goodModel(await api.stageNext(started.command));
      if (phase === 'seal') { cancelled = true; assert.equal((await api.sealCommand(started.command)).diagnostics[0].code, 'CANCELLED'); }
      else {
        const candidate = goodModel(await api.sealCommand(started.command)).candidate;
        assert.equal(api.publishCandidate(f.candidate.controller, candidate).ok, false);
        // Unverified publication failure permanently revokes that candidate.
        assert.equal((await api.validateCandidate(candidate)).ok, false);
        goodModel(api.discardCommand(started.command));
        const next = await stage(f, requestFor(before, 'cancel-fresh-' + phase, [change('fresh-' + phase)]), { now: () => 0, cancelled: () => cancelled });
        const c = goodModel(await api.sealCommand(next.command)).candidate;
        if (phase === 'validate') { cancelled = true; assert.equal((await api.validateCandidate(c)).diagnostics[0].code, 'CANCELLED'); }
        else { goodModel(await api.validateCandidate(c)); cancelled = true; assert.equal(api.publishCandidate(f.candidate.controller, c).diagnostics[0].code, 'CANCELLED'); }
      }
    }
    assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, before);
  }
  let clock = 0;
  const started = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before,
    guard: goodModel(api.writerGuard(before)).guard, request: requestFor(before, 'deadline', [change('deadline')]) }, { now: () => clock, cancelled: () => false }));
  clock = 2001; assert.equal((await api.stageNext(started.command)).diagnostics[0].code, 'RESOURCE_LIMIT');
  assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, before);
  let stop = false;
  const middle = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before,
    guard: goodModel(api.writerGuard(before)).guard, request: requestFor(before, 'middle-cancel', [change('middle-a'), change('middle-b'), change('middle-c')]) },
  { now: () => 0, cancelled: () => stop })).command;
  goodModel(await api.stageNext(middle)); goodModel(await api.stageNext(middle)); stop = true;
  assert.equal((await api.stageNext(middle)).diagnostics[0].code, 'CANCELLED');
  assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, before);
});

test('W04: injected hash failures during encoding, sealing and independent validation preserve the old head', async () => {
  const f = await shared(), before = f.snapshot, target = globalThis.crypto.subtle;
  for (const phase of ['encoding', 'sealing', 'validation']) {
    const command = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before,
      guard: goodModel(api.writerGuard(before)).guard, request: requestFor(before, 'hash-failure-' + phase, [change('hash-row-' + phase)]) }, runtime())).command;
    if (phase !== 'encoding') goodModel(await api.stageNext(command));
    const candidate = phase === 'validation' ? goodModel(await api.sealCommand(command)).candidate : null;
    const own = Object.getOwnPropertyDescriptor(target, 'digest'), original = target.digest; let calls = 0;
    try {
      Object.defineProperty(target, 'digest', { configurable: true, value(...args) { if (++calls === 2) throw Error('synthetic-private-failure'); return Reflect.apply(original, this, args); } });
      const out = phase === 'encoding' ? await api.stageNext(command) : phase === 'sealing' ? await api.sealCommand(command) : await api.validateCandidate(candidate);
      assert.equal(out.ok, false); assert.equal(calls, 2); assert.deepEqual(out, { ok: false, diagnostics: [{ code: 'INVALID_INPUT' }] });
    } finally { if (own) Object.defineProperty(target, 'digest', own); else delete target.digest; }
    assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, before);
    goodModel(api.discardCommand(command));
  }
});

test('W04/W05: concurrent calls and discard during asynchronous hashing cannot revive staged capabilities', async () => {
  const f = await shared(), before = f.snapshot, guard = goodModel(api.writerGuard(before)).guard;
  const start = id => api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before, guard,
    request: requestFor(before, id, [change(id)]) }, runtime());
  const a = goodModel(await start('async-stage')), inFlight = api.stageNext(a.command);
  const overlap = await api.stageNext(a.command); assert.equal(overlap.ok, false); assert.equal((await inFlight).ok, false);
  const b = goodModel(await start('async-seal')); goodModel(await api.stageNext(b.command)); const sealing = api.sealCommand(b.command);
  goodModel(api.discardCommand(b.command)); assert.equal((await sealing).ok, false);
  const c = await stage(f, requestFor(before, 'async-validation', [change('async-validation')]));
  const candidate = goodModel(await api.sealCommand(c.command)).candidate, validating = api.validateCandidate(candidate);
  goodModel(api.discardCommand(c.command)); assert.equal((await validating).ok, false); assert.equal(api.publishCandidate(f.candidate.controller, candidate).ok, false);
  assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, before);
});

test('W05/W10/W12: stale context, foreign operations, unsafe keys, own getters/proxies/cycles refuse with safe diagnostics', async () => {
  const f = await shared(), before = f.snapshot, guard = goodModel(api.writerGuard(before)).guard;
  const begin = (request, g = guard) => api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before, guard: g, request }, runtime());
  for (const k of ['generation', 'physicalInstance', 'capabilityDigest', 'stateRoot', 'logicalRoot', 'inventoryRoot', 'revision']) {
    const r = await begin(requestFor(before, 'bad-guard-' + k, [change(k)]), { ...guard, [k]: k === 'revision' ? guard[k] + 1 : 'invalid' });
    assert.equal(r.ok, false); assert.equal(r.diagnostics[0].code, 'STALE_REVISION');
  }
  // Imported foreign-init is source evidence, not local operation authority.
  const r = await begin(requestFor(before, 'foreign-draft', [change('new-local-effect')]));
  assert.equal(r.ok, true); assert.equal(r.replayed, false); goodModel(api.discardCommand(r.command));
  const cycle = change('cycle'); cycle.value.self = cycle;
  let getterCalls = 0; const getter = change('getter'); Object.defineProperty(getter.value, 'private', { enumerable: true, get() { getterCalls++; throw Error('synthetic-secret'); } });
  const proxy = new Proxy({}, { ownKeys() { throw Error('synthetic-secret'); } });
  for (const changes of [[], Array.from({ length: 129 }, (_, i) => change(String(i))), [change('é'.repeat(70000))], [cycle], [getter], [change('x', proxy)]]) {
    const out = await begin(requestFor(before, 'invalid-input', changes)); assert.equal(out.ok, false); assert.ok(!JSON.stringify(out).includes('synthetic-secret'));
  }
  const hugeRequest = change('huge'); hugeRequest.value.notes = Array(5).fill('x'.repeat(500000));
  assert.equal((await begin(requestFor(before, 'request-bytes', [hugeRequest]))).diagnostics[0].code, 'RESOURCE_LIMIT');
  assert.equal(getterCalls, 0); assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, before);
});

test('W07/W14: explicit pre-seal intermediate and full-inventory pins preserve closure and charge all cost', async t => {
  const f = await shared(), before = f.snapshot, oldIO = goodModel(api.createWriterSource(before, runtime())).source;
  const changes = [change('pinned', '1.00'), change('pinned-second', '2.00')], request = requestFor(before, 'with-pins', changes);
  const cmd = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before,
    guard: goodModel(api.writerGuard(before)).guard, request }, runtime())).command;
  goodModel(await api.stageNext(cmd)); const pin = goodModel(await api.pinStagedRoot(cmd, 'manualAdjustments')).id;
  assert.equal(goodModel(await api.pinStagedRoot(cmd, 'manualAdjustments')).id, pin);
  assert.equal(oldIO.readLogical(pin).ok, false); // staged data is never visible
  goodModel(api.pinPublished(cmd, { kind: 'full-inventory', id: before.inventoryRoot }));
  goodModel(api.pinPublished(cmd, { kind: 'full-inventory', id: before.inventoryRoot }));
  goodModel(await api.stageNext(cmd)); const candidate = goodModel(await api.sealCommand(cmd)).candidate;
  assert.equal((await api.pinStagedRoot(cmd, 'manualAdjustments')).ok, false); // late attempt revokes; repeat with fresh command below
  assert.equal((await api.validateCandidate(candidate)).ok, false);
  const again = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before,
    guard: goodModel(api.writerGuard(before)).guard, request }, runtime())).command;
  goodModel(await api.stageNext(again)); assert.equal(goodModel(await api.pinStagedRoot(again, 'manualAdjustments')).id, pin);
  goodModel(api.pinPublished(again, { kind: 'full-inventory', id: before.inventoryRoot }));
  goodModel(await api.stageNext(again)); const sealed = goodModel(await api.sealCommand(again)).candidate;
  goodModel(await api.validateCandidate(sealed)); const result = goodModel(api.publishCandidate(f.candidate.controller, sealed));
  f.model = goodModel(await changeHistory(f.model, request)).model; assert.equal(result.snapshot.root, f.model.root); f.snapshot = result.snapshot;
  const io = goodModel(api.createWriterSource(f.snapshot, runtime())).source, records = readPhysicalPages(io).records, read = referenceReader(records);
  assert.equal(read.find(pin, 'pinned-second'), undefined); assert.equal(read.value(read.find(pin, 'pinned').valueRef).amount, '1.00');
  assert.equal(goodModel(oldIO.readLogical(before.root)).record.id, before.root);
  goodModel(await api.verifyWriterInventory(f.snapshot, goodModel(api.createWriterSource(f.snapshot, runtime())).source, runtime()));
  const stats = goodModel(api.inspectWriter(f.snapshot, runtime())); t.diagnostic(JSON.stringify({ variant: 'explicit-intermediate-and-full-pin', ...stats }));
  const bad = await stage(f, requestFor(f.snapshot, 'unknown-pin', [change('unknown-pin')]));
  assert.equal(api.pinPublished(bad.command, { kind: 'object', id: '0'.repeat(64) }).diagnostics[0].code, 'UNRESOLVED_PIN');
});

test('W08/W09: old P1 inventory/ordinals remain unchanged, incompatible readers and legacy archive imports refuse', async () => {
  const f = await shared(), original = inventory(f.reference.model), oldSource = createHistorySource(f.reference.model);
  assert.equal(oldSource.ok, true); assert.equal(createHistorySource(f.snapshot).ok, false);
  assert.equal(api.createWriterSource(f.model, runtime()).ok, false);
  assert.equal((await api.createWriter(f.model, runtime())).diagnostics[0].code, 'LEGACY_INVENTORY_REQUIRES_ARCHIVE');
  exactOwn([...original], [...inventory(f.reference.model)], 'old archive unchanged');
});

test('W03/W10/W14: dispersed stores and dataset-scoped repeated identities preserve source17 and exact roots', async t => {
  const f = await shared();
  const request = { synthetic: true, operationId: 'create-B', datasetId: 'B', originId: f.candidate.originId, expectedRoot: f.snapshot.root };
  const cmd = goodModel(await api.beginCommand(f.candidate.controller, { kind: 'create-dataset', snapshot: f.snapshot,
    guard: goodModel(api.writerGuard(f.snapshot)).guard, request }, runtime())).command;
  const candidate = goodModel(await api.sealCommand(cmd)).candidate; goodModel(await api.validateCandidate(candidate));
  const out = goodModel(api.publishCandidate(f.candidate.controller, candidate));
  f.model = goodModel(await createHistoryDataset(f.model, request)).model; assert.equal(out.snapshot.root, f.model.root); f.snapshot = out.snapshot;
  for (const dataset of ['A', 'B']) await commitPair(f, 'dataset-shared-' + dataset, [change('same-id', dataset === 'A' ? '1.00' : '2.00')], dataset);
  const changes = [change('dispersed-z'), change('dispersed-a'), { store: 'accounts', key: 'extra', value: { id: 'extra', startingBalance: -0 } },
    { store: 'savingsBucketAdjustments', key: 'extra', value: { id: 'extra', amountMinor: '900719925474099312345' } }];
  await commitPair(f, 'multiple-stores', changes);
  const io = goodModel(api.createWriterSource(f.snapshot, runtime())).source, records = readPhysicalPages(io).records;
  proveOriginal17(f.reference, records); const read = referenceReader(records), data = read.row(f.snapshot.dataRoot);
  for (const [dataset, amount] of [['A', '1.00'], ['B', '2.00']]) { const d = read.row(read.find(data.datasetsRoot, dataset).valueRef);
    const map = d.collections.find(c => c.store === 'manualAdjustments').root; assert.equal(read.value(read.find(map, 'same-id').valueRef).amount, amount); }
  t.diagnostic(JSON.stringify({ variant: 'two-datasets-and-original-P1-archive-coexist', writer: goodModel(api.inspectWriter(f.snapshot, runtime())),
    originalP1ArchiveBytes: goodModel(inspectHistoryModel(f.reference.model)).stats.retainedBytes }));
});

test('W11: independent audit rejects forged metadata/context/index/bytes without consulting the private logical reader', async () => {
  const f = await shared(), source = () => goodModel(api.createWriterSource(f.snapshot, { now: () => 0, cancelled: () => false })).source;
  const good = { ...source(), readLogical() { throw Error('must not consult producer logical lookup'); } };
  goodModel(await api.verifyWriterInventory(f.snapshot, good, { now: () => 0, cancelled: () => false }));
  for (const mutate of [s => ({ ...s, context: { ...s.context, generation: 'foreign' } }),
    s => ({ ...s, readMetadata(id) { const r = s.readMetadata(id); return { ok: true, record: { ...r.record, body: { ...r.record.body, revision: 999 } } }; } }),
    s => ({ ...s, readPage(id) { const b = s.readPage(id).bytes; b[b.length - 1] ^= 1; return { ok: true, bytes: b }; } }),
    s => ({ ...s, readIndex(c) { const r = s.readIndex(c); return { ...r, rows: r.rows.length ? [r.rows[0], r.rows[0]] : r.rows }; } }),
    s => ({ ...s, readIndex(c) { const r = s.readIndex(c); return { ...r, rows: r.rows.filter((_, i) => i !== 0) }; } }),
    s => ({ ...s, readIndex(c) { const r = s.readIndex(c); return { ...r, rows: [{ id: '0'.repeat(64), type: 'logical' }, ...r.rows.slice(1)] }; } })]) {
    const result = await api.verifyWriterInventory(f.snapshot, mutate(source()), { now: () => 0, cancelled: () => false }); assert.equal(result.ok, false);
  }
  let getters = 0; const unsafe = { ...source() }; Object.defineProperty(unsafe, 'readPage', { enumerable: true, get() { getters++; throw Error('private'); } });
  assert.equal((await api.verifyWriterInventory(f.snapshot, unsafe, runtime())).ok, false); assert.equal(getters, 0);
  assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, f.snapshot);
});

test('W01/W16: identical synthetic context is physically deterministic with runtime storage/network effects denied', async () => {
  const f = await shared(), keys = ['indexedDB', 'localStorage', 'sessionStorage', 'fetch', 'window', 'document', 'navigator', 'caches'];
  const previous = new Map(keys.map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  let calls = 0;
  try {
    for (const key of keys) Object.defineProperty(globalThis, key, { configurable: true, get() { calls++; throw Error('forbidden synthetic effect'); } });
    const second = goodModel(await api.createWriter(writerOptions(f.source), { now: () => 0, cancelled: () => false }));
    assert.equal(second.snapshot.stateRoot, f.candidate.snapshot.stateRoot);
    assert.deepEqual(second.bootstrapRoots, f.candidate.bootstrapRoots); assert.equal(calls, 0);
  } finally { for (const [k, d] of previous) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; } }
  const directory = new URL('../experimental/checkpoint/', import.meta.url);
  for (const file of readdirSync(directory).filter(f => /^writer.*\.js$/.test(f))) {
    const text = readFileSync(new URL(file, directory), 'utf8');
    assert.doesNotMatch(text, /(?:from|import\s*\()\s*['"](?:node:|.*src\/)/);
    assert.doesNotMatch(text, /\b(?:indexedDB|fetch|localStorage|sessionStorage|Date\.now|Math\.random)\s*(?:\(|\.)/);
  }
});

test('W03/W12/W13: real-clock 128-row stress either commits exact P1 history within budget or refuses atomically', async t => {
  const f = await shared(), before = f.snapshot, changes = Array.from({ length: 128 }, (_, i) => change('stress-' + String((i * 43) % 128).padStart(3, '0')));
  const request = requestFor(before, 'real-clock-128', changes), start = performance.now();
  let command, result = await api.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: before,
    guard: goodModel(api.writerGuard(before)).guard, request }, runtime());
  if (result.ok) {
    command = result.command;
    for (let i = 0; i < 128 && result.ok; i++) result = await api.stageNext(command);
    if (result.ok) { result = await api.sealCommand(command); if (result.ok) {
      const candidate = result.candidate; result = await api.validateCandidate(candidate);
      if (result.ok) result = api.publishCandidate(f.candidate.controller, candidate);
    } }
  }
  if (result.ok) {
    const old = goodModel(await changeHistory(f.model, request)); assert.equal(result.snapshot.root, old.model.root);
    f.model = old.model; f.snapshot = result.snapshot;
    t.diagnostic(JSON.stringify({ stressRows: 128, outcome: 'MODEL_COMMITTED', elapsedMs: performance.now() - start, work: result.work }));
  } else {
    assert.equal(result.diagnostics[0].code, 'RESOURCE_LIMIT');
    assert.equal(goodModel(api.currentSnapshot(f.candidate.controller)).snapshot, before);
    if (command) goodModel(api.discardCommand(command));
    t.diagnostic(JSON.stringify({ stressRows: 128, outcome: 'BOUNDED_REFUSAL', elapsedMs: performance.now() - start }));
  }
});

test('W12: lowered changed-row, pin, command and retained-inventory caps refuse without raising global limits', async () => {
  const f = await shared(), limited = goodModel(await api.createWriter({ ...writerOptions(f.source), limits: { changes: 1, pins: 1, commands: 3 } }, { now: () => 0, cancelled: () => false }));
  let snapshot = limited.snapshot;
  const begin = (id, changes) => api.beginCommand(limited.controller, { kind: 'change-history', snapshot,
    guard: goodModel(api.writerGuard(snapshot)).guard, request: requestFor(snapshot, id, changes) }, { now: () => 0, cancelled: () => false });
  assert.equal((await begin('too-many', [change('a'), change('b')])).diagnostics[0].code, 'RESOURCE_LIMIT');
  const pin = goodModel(await begin('too-many-pins', [change('a')])).command;
  goodModel(api.pinPublished(pin, { kind: 'object', id: snapshot.root }));
  goodModel(api.pinPublished(pin, { kind: 'object', id: snapshot.root })); // duplicate is free at exact cap
  assert.equal(api.pinPublished(pin, { kind: 'full-inventory', id: snapshot.inventoryRoot }).diagnostics[0].code, 'RESOURCE_LIMIT');
  const at = goodModel(await begin('last-allowed-command', [change('a')])).command;
  goodModel(await api.stageNext(at)); const c = goodModel(await api.sealCommand(at)).candidate; goodModel(await api.validateCandidate(c));
  const committed = goodModel(api.publishCandidate(limited.controller, c));
  const reference = goodModel(await changeHistory(f.reference.model, requestFor(f.reference.model, 'last-allowed-command', [change('a')]))).model;
  assert.equal(committed.snapshot.root, reference.root); snapshot = committed.snapshot;
  const over = goodModel(await begin('over-command-cap', [change('b')])).command; goodModel(await api.stageNext(over));
  assert.equal((await api.sealCommand(over)).diagnostics[0].code, 'RESOURCE_LIMIT');
  assert.equal(goodModel(api.currentSnapshot(limited.controller)).snapshot, snapshot);
  for (const limits of [{ objects: 6 }, { retainedBytes: 2142 }]) {
    const out = await api.createWriter({ ...writerOptions(f.source), limits }, { now: () => 0, cancelled: () => false });
    assert.equal(out.ok, false); assert.equal(out.diagnostics[0].code, 'RESOURCE_LIMIT'); assert.equal(out.controller, undefined);
  }
});
