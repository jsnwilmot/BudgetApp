// Synthetic-only independent record/value/history oracle. No candidate helpers.
import assert from 'node:assert/strict';
import { modelState } from '../../experimental/checkpoint/historyCore.js';
import { changeHistory, inspectHistoryModel } from '../../experimental/checkpoint/historyModel.js';
import { modelFixture, goodModel } from './historyModel.js';
import { BASELINE, createRetentionSource, analyzeRetention } from '../../experimental/checkpoint/retentionPlan.js';
import { verifyRetention } from '../../experimental/checkpoint/retentionVerify.js';

export const runtime = () => ({ now: () => performance.now(), cancelled: () => false });
export const request = (m, pins = [], limits) => ({ synthetic: true, baselineSha: BASELINE, sourceRoot: m.root,
  sourceIndexRoot: m.indexRoot, pins, ...(limits ? { limits } : {}) });
export function inventory(model) {
  const records = new Map(), pending = [modelState(model).pool];
  while (pending.length) { const n = pending.pop(); if (n.tag === 'leaf') records.set(n.record.id, n.record); else for (const c of n.children) if (c) pending.push(c); }
  return records;
}
// Independently enumerated reference schema; no refsOf/discovery/verifier call.
function edges(r) {
  const b = r.body;
  if (r.kind === 'chunk') return [];
  if (r.kind === 'value') return [...b.chunks, ...b.children];
  if (r.kind === 'map') return b.tag === 'leaf' ? b.entries.reduce((a, x) => a.concat(x.keyRef, x.versionRef, x.valueRef || []), []) : b.children.reduce((a, x) => a.concat(x.ref, x.firstKeyRef), []);
  if (r.kind === 'version') return [b.keyRef, b.valueRef, b.previous, b.sourceVersionRef].filter(Boolean);
  if (r.kind === 'origin') return [b.envelopeRef, ...b.inventory.map(x => x.root)];
  if (r.kind === 'dataset') return [b.originRef, ...b.collections.map(x => x.root)];
  if (r.kind === 'data-root') return [b.originsRoot, b.datasetsRoot];
  if (r.kind === 'model-root') return [b.dataRoot, b.operationsRoot, b.journal].filter(Boolean);
  if (r.kind === 'journal') return [b.previous, b.beforeModelRoot, b.afterDataRoot].filter(Boolean);
  if (r.kind === 'event') return [b.journal, b.afterDataRoot, b.originRef].filter(Boolean);
  throw Error('unknown independent reference kind');
}
export function independentClosure(records, pins = []) {
  const full = pins.some(p => p.kind === 'full-inventory'), required = new Set(), queue = [];
  for (const r of records.values()) if (full || r.kind !== 'map') queue.push(r.id);
  for (const p of pins) if (p.kind === 'object') queue.push(p.id);
  let visits = 0;
  for (let at = 0; at < queue.length; at++) {
    assert.ok(++visits <= 12000000); const id = queue[at]; if (required.has(id)) continue;
    const r = records.get(id); assert.ok(r); required.add(id); queue.push(...edges(r));
  }
  return { required, visits };
}
export async function candidateRecords(model, analysis) {
  const records = inventory(model), excluded = new Set(), plan = analysis.plan;
  for (let i = 0; i < plan.body.manifests.excluded.pages; i++) {
    const p = await analysis.pageSource.readPage({ planId: plan.planId, kind: 'excluded', index: i });
    for (const ordinal of p.body.rows) { assert.ok(!excluded.has(ordinal)); excluded.add(ordinal); }
  }
  const kept = new Map([...records].filter(([, r]) => !excluded.has(r.ordinal)));
  return { records, kept, excluded };
}
export function referenceReader(records) {
  const memo = new Map(); let visits = 0;
  function row(id) { assert.ok(++visits <= 200000000); const r = records.get(id); assert.ok(r, 'independent missing retained record'); return r.body; }
  function value(id) {
    if (memo.has(id)) return memo.get(id);
    const descriptor = row(id), n = JSON.parse(descriptor.chunks.map(c => row(c).data).join('')); let out;
    if (n[0] === 'n') out = null;
    else if (n[0] === 'u') out = undefined;
    else if (n[0] === 's' || n[0] === 'b') out = n[1];
    else if (n[0] === 'f64') { const bytes = Uint8Array.from(n[1].match(/../g), v => parseInt(v, 16)); out = new DataView(bytes.buffer).getFloat64(0, false); }
    else if (n[0] === 'arr-leaf') out = n[1].map(value);
    else if (n[0] === 'arr-branch') out = n[2].flatMap(value);
    else {
      assert.equal(n[0], 'obj'); out = {}; const pairs = new Map(n[2]);
      for (const k of n[1]) Object.defineProperty(out, k, { value: value(pairs.get(k)), enumerable: true, writable: true, configurable: true });
    }
    memo.set(id, out); return out;
  }
  function key(id) { const v = value(id); return v[1]; }
  function rows(root) {
    const b = row(root);
    return b.tag === 'branch' ? b.children.flatMap(c => rows(c.ref)) : b.entries.map(e => ({ ...e, key: key(e.keyRef) }));
  }
  function find(root, wanted) {
    // Independent restricted comparator, no implementation keyCompare/mapFind.
    const cmp = (a, b) => typeof a !== typeof b ? (typeof a === 'string' ? -1 : 1) : typeof a === 'string' ? (a < b ? -1 : a > b ? 1 : 0) : (() => {
      for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
      return a.length - b.length;
    })();
    let b = row(root);
    while (b.tag === 'branch') {
      let i = 0; while (i + 1 < b.children.length && cmp(key(b.children[i + 1].firstKeyRef), wanted) <= 0) i++;
      b = row(b.children[i].ref);
    }
    return b.entries.find(e => cmp(key(e.keyRef), wanted) === 0);
  }
  return { row, value, rows, find, visits: () => visits };
}
export function exact(a, b) {
  assert.deepStrictEqual(a, b);
  if (a && typeof a === 'object') { assert.deepEqual(Object.keys(a), Object.keys(b)); for (const k of Object.keys(a)) exact(a[k], b[k]); }
}
export function proveOriginal17(f, kept) {
  const read = referenceReader(kept), origin = [...kept.values()].find(r => r.kind === 'origin').body;
  assert.equal(origin.inventory.length, 17);
  for (const inv of origin.inventory) {
    const actual = read.rows(inv.root).map(e => ({ key: e.key, value: read.value(e.valueRef) }));
    exact(actual, f.source.stores[inv.store]); assert.equal(actual.length, inv.count);
  }
  exact(read.value(origin.envelopeRef), JSON.parse(new TextDecoder().decode(f.bytes)));
  const original = read.rows(origin.inventory.find(x => x.store === 'plannerEntries').root).map(e => read.value(e.valueRef));
  assert.equal(original.filter(r => r.entryKey.startsWith('orphan-')).length, 25);
  assert.equal(original.filter(r => r.entryKey.startsWith('newer-')).length, 22);
  assert.equal(original.filter(r => r.entryKey.startsWith('real-tax-bill-')).length, 2);
  return read.visits();
}
export async function runRetentionWorkload(years, variant) {
  // EXACT unchanged P1 fixture arithmetic; separate generator because accepted
  // runHistoryWorkload intentionally returns counters rather than a model.
  const config = { low: { periods: 26, changes: 1, notes: 32 }, medium: { periods: 27, changes: 2, notes: 160 }, high: { periods: 27, changes: 4, notes: 512 } }[variant];
  const f = await modelFixture(); let model = f.model;
  const commands = [], published = [model.root], operations = years * 370, slots = years * config.periods * 12;
  for (let op = 0; op < operations; op++) {
    const changes = [];
    for (let item = 0; item < config.changes; item++) {
      const slot = (op * config.changes + item) % slots, id = `growth-${slot.toString().padStart(5, '0')}`;
      const date = new Date(Date.UTC(2026, 0, 2) + Math.floor(slot / 12) * 14 * 86400000).toISOString().slice(0, 10);
      const deleted = op % 41 === 40, value = { id, date, amount: `${(op + item) % 1000}.25`, validated: op % 3 === 0,
        lineItems: [{ id: `${id}-A`, amount: '0.10' }, { id: `${id}-B`, amount: '0.15' }, { id: `${id}-C`, amount: `${op % 1000}.00` }],
        plannerLastEntryMarker: { cellKey: `${id}__${date}` }, note: `${'N'.repeat(config.notes)}-revision-${op}-${item}`, evidenceRef: 'synthetic-growth-reference' };
      changes.push(deleted ? { store: 'manualAdjustments', key: id, deleted: true } : { store: 'manualAdjustments', key: id, value });
    }
    commands.push(structuredClone(changes));
    model = goodModel(await changeHistory(model, { synthetic: true, operationId: `work-${op}`, datasetId: 'A', expectedRevision: model.revision, expectedRoot: model.root, changes })).model;
    published.push(model.root);
  }
  const before = inspectHistoryModel(model), source = createRetentionSource(model).source, req = request(model);
  const analysis = goodModel(await analyzeRetention(model, req, source, runtime()));
  const verified = goodModel(await verifyRetention(model, req, source, analysis.plan, analysis.pageSource, runtime()));
  exact(inspectHistoryModel(model), before); // Original census/indexRoot remain immutable.
  const { records, kept, excluded } = await candidateRecords(model, analysis), closure = independentClosure(records);
  exact([...kept.keys()].sort(), [...closure.required].sort());
  const read = referenceReader(kept), heads = new Map(), versions = new Map(); let comparedVersions = 0, rootsRead = 0;
  for (const r of kept.values()) if (r.kind === 'version' && r.body.datasetId === 'A' && r.body.store === 'manualAdjustments' && Number(r.body.localRevision) >= 3) versions.set(`${read.value(r.body.keyRef)[1]}:${r.body.localRevision}`, r);
  const initialRoot = read.row(published[0]), initialData = read.row(initialRoot.dataRoot);
  const initialDataset = read.row(read.find(initialData.datasetsRoot, 'A').valueRef);
  for (let at = 0; at < published.length; at++) {
    if (at) for (const change of commands[at - 1]) {
      const revision = String(at + 2), v = versions.get(`${change.key}:${revision}`); assert.ok(v);
      assert.equal(v.body.previous, heads.get(change.key)?.id ?? null); assert.equal(v.body.deleted, change.deleted === true);
      exact(v.body.valueRef ? read.value(v.body.valueRef) : undefined, change.value); heads.set(change.key, v); comparedVersions++;
    }
    const root = read.row(published[at]); assert.equal(root.revision, String(at + 2));
    const data = read.row(root.dataRoot), dataset = read.row(read.find(data.datasetsRoot, 'A').valueRef);
    for (const collection of dataset.collections) if (collection.store !== 'manualAdjustments') assert.equal(collection.root, initialDataset.collections.find(c => c.store === collection.store).root);
    const rows = read.rows(dataset.collections.find(c => c.store === 'manualAdjustments').root); assert.equal(rows.length, heads.size);
    for (const row of rows) { const v = heads.get(row.key); assert.ok(v); assert.equal(row.versionRef, v.id); assert.equal(row.valueRef, v.body.valueRef); assert.equal(row.deleted, v.body.deleted); }
    rootsRead++;
  }
  assert.equal(comparedVersions, operations * config.changes);
  assert.equal([...kept.values()].filter(r => r.kind === 'model-root').length, operations + 3);
  for (const r of kept.values()) if (r.kind === 'model-root' && ['0', '1'].includes(r.body.revision)) {
    assert.equal(read.rows(read.row(r.body.dataRoot).datasetsRoot).length, 0); rootsRead++;
  }
  const sourceProofVisits = proveOriginal17(f, kept);
  return { years, variant, operations, comparedVersions, rootsRead, keptObjects: kept.size, excludedObjects: excluded.size,
    baseline: before.stats, candidate: analysis.plan.body.candidate, accounting: analysis.plan.body.accounting,
    discovery: analysis.work, verification: verified.work, discoveryReportBytes: analysis.workReportBytes, verificationReportBytes: verified.workReportBytes, independentClosureVisits: closure.visits,
    historicalOracleVisits: read.visits(), sourceProofVisits, planId: analysis.plan.planId };
}
