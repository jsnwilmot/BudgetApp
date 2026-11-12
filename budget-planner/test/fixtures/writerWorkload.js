// Exact accepted nine workloads. The UNMODIFIED P1 oracle uses a separate heap.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { requestFor, stage } from './writerCompletion.js';
import { historicalSource, goodModel } from './historyModel.js';
import { referenceReader, proveOriginal17, exact } from './retention.js';
import { runtime, equalHash, readPhysicalPages, writerOptions, ORIGINAL_ROOTS } from './writerParity.js';
import * as writer from '../../experimental/checkpoint/writer.js';
import { canonical } from '../../experimental/checkpoint/backupFormat.js';

export const COMPARISONS = Object.freeze({
  '1-low': [20815519, 10540686, 20010575], '1-medium': [26548589, 14447447, 21615330], '1-high': [38088521, 22112147, 25386853],
  '3-low': [56403253, 35220689, 55800357], '3-medium': [77503505, 50845340, 61142026], '3-high': [120017447, 81735280, 72741021],
  '5-low': [97187501, 65691863, 96768261], '5-medium': [138992729, 98375593, 107062183], '5-high': [223089067, 163063597, 127142050],
});
const config = { low: { periods: 26, changes: 1, notes: 32 }, medium: { periods: 27, changes: 2, notes: 160 }, high: { periods: 27, changes: 4, notes: 512 } };
export function workloadChanges(op, years, variant) {
  const c = config[variant], slots = years * c.periods * 12, changes = [];
  for (let item = 0; item < c.changes; item++) {
    const slot = (op * c.changes + item) % slots, id = `growth-${slot.toString().padStart(5, '0')}`;
    const date = new Date(Date.UTC(2026, 0, 2) + Math.floor(slot / 12) * 14 * 86400000).toISOString().slice(0, 10);
    const deleted = op % 41 === 40, value = { id, date, amount: `${(op + item) % 1000}.25`, validated: op % 3 === 0,
      lineItems: [{ id: `${id}-A`, amount: '0.10' }, { id: `${id}-B`, amount: '0.15' }, { id: `${id}-C`, amount: `${op % 1000}.00` }],
      plannerLastEntryMarker: { cellKey: `${id}__${date}` }, note: `${'N'.repeat(c.notes)}-revision-${op}-${item}`, evidenceRef: 'synthetic-growth-reference' };
    changes.push(deleted ? { store: 'manualAdjustments', key: id, deleted: true } : { store: 'manualAdjustments', key: id, value });
  }
  return changes;
}
export function observeCrypto() {
  const target = globalThis.crypto.subtle, own = Object.getOwnPropertyDescriptor(target, 'digest'), original = target.digest;
  let calls = 0, bytes = 0, maps = 0; const mapPrefix = new TextEncoder().encode('FinPath/P1/map/1\n');
  Object.defineProperty(target, 'digest', { configurable: true, value: function (algorithm, input) {
    calls++; bytes += input.byteLength;
    const view = ArrayBuffer.isView(input) ? new Uint8Array(input.buffer, input.byteOffset, input.byteLength) : new Uint8Array(input);
    if (view.length >= mapPrefix.length && mapPrefix.every((n, i) => view[i] === n)) maps++;
    return Reflect.apply(original, this, [algorithm, input]);
  } });
  return { reset() { calls = 0; bytes = 0; maps = 0; }, read: () => ({ calls, bytes, maps }), close() { if (own) Object.defineProperty(target, 'digest', own); else delete target.digest; } };
}
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)];
const decrease = (before, after) => (before - after) * 100 / before;
export async function runWriterWorkload(years, variant) {
  const reference = await new Promise((resolve, reject) => execFile(process.execPath,
    ['--import', new URL('../register.mjs', import.meta.url).href, fileURLToPath(new URL('./writerOracleWorker.mjs', import.meta.url)), String(years), variant],
    { encoding: 'utf8', maxBuffer: 50331648 }, (error, stdout, stderr) => {
      if (error) reject(Error(stderr || error.message)); else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } }
    }));
  const source = historicalSource(), c = config[variant], commands = years * 370, changesByCommand = [];
  let f, roots;
  { // Do not retain a second, obsolete private-index handle.
    const candidate = goodModel(await writer.createWriter(writerOptions(source), runtime()));
    assert.deepEqual(candidate.bootstrapRoots, ORIGINAL_ROOTS);
    f = { source, candidate: { controller: candidate.controller }, snapshot: candidate.snapshot }; roots = [...candidate.bootstrapRoots];
  }
  // Only current lookup handles are required here; every historical LOGICAL
  // root remains in the append-only ledger. All-handles costs are also reported.
  const sourceFixture = { source: f.source, bytes: new Uint8Array(Buffer.from(reference.sourceBytes, 'base64')) };
  delete reference.sourceBytes;
  const initialP1 = reference.initial, referenceTimes = reference.times;
  const times = [], work = {}, observed = { candidateCalls: 0, candidateBytes: 0, candidateMapCalls: 0,
    p1Calls: reference.observed.calls, p1Bytes: reference.observed.bytes, p1MapCalls: reference.observed.maps }, crypto = observeCrypto();
  const started = performance.now();
  try {
    for (let op = 0; op < commands; op++) {
      const changes = workloadChanges(op, years, variant); changesByCommand.push(changes);
      const request = requestFor(f.snapshot, 'work-' + op, changes); crypto.reset(); const start = performance.now();
      let staged, sealed, committed;
      try {
        staged = await stage(f, request); sealed = goodModel(await writer.sealCommand(staged.command));
        goodModel(await writer.validateCandidate(sealed.candidate)); committed = goodModel(writer.publishCandidate(f.candidate.controller, sealed.candidate));
      } catch (e) { throw Error(`synthetic writer operation ${op}, elapsed ${performance.now() - start}ms: ${e.message}`, { cause: e }); }
      times.push(performance.now() - start); const measured = crypto.read(); observed.candidateCalls += measured.calls; observed.candidateBytes += measured.bytes; observed.candidateMapCalls += measured.maps;
      assert.equal(committed.work.hashCalls, measured.calls); assert.equal(committed.work.hashedBytes, measured.bytes);
      for (const [key, n] of Object.entries(committed.work)) if (typeof n === 'number') {
        if (key === 'peakStageBytes') work[key] = Math.max(work[key] ?? 0, n); else work[key] = (work[key] ?? 0) + n;
      }
      equalHash('model-root', committed.snapshot.root, 'work-' + op, reference.roots[op][0], committed.snapshot.root);
      equalHash('data-root', committed.snapshot.dataRoot, 'work-' + op, reference.roots[op][1], committed.snapshot.dataRoot);
      f.snapshot = committed.snapshot; roots.push(f.snapshot.root);
    }
  } finally { crypto.close(); }
  const expected = COMPARISONS[`${years}-${variant}`];
  assert.deepEqual([reference.final.retainedBytes, reference.final.kindBytes.map], expected.slice(0, 2));
  const metrics = goodModel(writer.inspectWriter(f.snapshot, runtime())), io = goodModel(writer.createWriterSource(f.snapshot, runtime()));
  const auditStarted = performance.now(), audited = await writer.verifyWriterInventory(f.snapshot, io.source, runtime());
  if (!audited.ok) throw Error('synthetic whole inventory refusal: ' + JSON.stringify({ years, variant, committedRootsCompared: roots.length,
    physicalBytes: metrics.physicalBytes, diagnostics: audited.diagnostics, work: audited.work }));
  const audit = audited.proof;
  const auditMs = performance.now() - auditStarted;
  const records = readPhysicalPages(goodModel(writer.createWriterSource(f.snapshot, runtime())).source).records;
  for (const [id, kind, digest] of reference.facts) { const actual = records.get(id); assert.ok(actual, 'missing original non-map fact'); assert.equal(actual.kind, kind);
    assert.equal(createHash('sha256').update(canonical(actual.body)).digest('hex'), digest, 'independent original fact body'); }
  // Native FP-TV own order/bits live inside the typed nodes, not CJ wrapper order.
  proveOriginal17(sourceFixture, records); const read = referenceReader(records), heads = new Map(); let comparedVersions = 0;
  for (let at = 0; at < roots.length; at++) {
    const root = read.row(roots[at]); assert.equal(root.revision, String(at));
    if (at < 3) continue;
    const data = read.row(root.dataRoot), dataset = read.row(read.find(data.datasetsRoot, 'A').valueRef);
    const map = dataset.collections.find(x => x.store === 'manualAdjustments').root;
    for (const change of changesByCommand[at - 3]) {
      const current = read.find(map, change.key); assert.ok(current); const v = read.row(current.versionRef);
      assert.equal(v.previous, heads.get(change.key) ?? null); assert.equal(v.localRevision, String(at)); assert.equal(v.deleted, change.deleted === true);
      exact(v.valueRef ? read.value(v.valueRef) : undefined, change.value); heads.set(change.key, current.versionRef); comparedVersions++;
    }
    const journal = read.row(root.journal); assert.equal(journal.beforeModelRoot, roots[at - 1]); assert.equal(journal.afterDataRoot, root.dataRoot);
  }
  assert.equal(comparedVersions, commands * c.changes); assert.equal(audit.records, records.size);
  const physical = metrics.physicalBytes, required = metrics.requiredCurrentTotalBytes, allHandles = metrics.conservativeTotalBytes;
  const mapFrames = metrics.logicalFrameBytes.map, totalFrames = Object.values(metrics.logicalFrameBytes).reduce((a, b) => a + b, 0);
  const overhead = physical - totalFrames + metrics.liveLookupBytes;
  const netMap = mapFrames + overhead, goals = { noRequiredCurrentRegression: required <= expected[0],
    highFiveMap20: decrease(expected[1], netMap) >= 20, highFiveTotal10: decrease(expected[0], required) >= 10,
    mapHashes20: observed.candidateMapCalls <= observed.p1MapCalls * 0.8,
    mapAllocations20: work.finalizedMaps <= (reference.final.kinds.map - initialP1.kinds.map) * 0.8,
    hashCallsNonRegression: observed.candidateCalls <= observed.p1Calls, hashedInputBytesNonRegression: observed.candidateBytes <= observed.p1Bytes,
    lookup125: work.logicalLookups <= (reference.final.lookupVisits - initialP1.lookupVisits) * 1.25,
    median50ms: percentile(times, 0.5) <= 50, p95_150ms: percentile(times, 0.95) <= 150,
    stretchMap65: decrease(expected[1], netMap) >= 65, stretch120MiB: required <= 120 * 1024 * 1024, stretchMapShare50: netMap / required <= 0.5 };
  return { years, variant, operations: commands, periodsPerYear: c.periods, rowsPerOperation: c.changes, noteUnits: c.notes,
    repetitions: 1, comparedVersions, committedRootsCompared: roots.length, original17: true,
    oracleIsolation: 'sequential separate process; expected roots/facts never supplied to writer',
    baselineP1: reference.final, p11aCounterfactualBytes: expected[2], writerPhysicalBytes: physical,
    requiredCurrentBytes: required, allHandlesConservativeBytes: allHandles,
    totalDecreasePercent: decrease(expected[0], required), physicalDecreasePercent: decrease(expected[0], physical),
    allHandlesDecreasePercent: decrease(expected[0], allHandles), netMapBytes: netMap, netMapDecreasePercent: decrease(expected[1], netMap),
    counts: metrics.logicalCounts, frameBytes: metrics.logicalFrameBytes, pages: metrics.pages,
    currentLookupBytes: metrics.liveLookupBytes, cumulativeLookupBytes: metrics.cumulativeLookupBytes,
    cumulativeLookupAllocations: metrics.cumulativeLookupAllocations, liveLookupNodes: metrics.liveLookupNodes,
    work, observedCrypto: observed, p1NonHashSerializationBytes: 'UNKNOWN', nativeIndexBytes: 'UNKNOWN', peakJSHeap: 'UNKNOWN',
    commandMedianMs: percentile(times, 0.5), commandP95Ms: percentile(times, 0.95), commandTotalMs: times.reduce((a, b) => a + b, 0),
    p1MedianMs: percentile(referenceTimes, 0.5), p1P95Ms: percentile(referenceTimes, 0.95),
    elapsedMs: performance.now() - started, auditMs, audit, goals };
}
