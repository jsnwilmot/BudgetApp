// Issue #34 independent synthetic-only reference reader and first-difference proof.
// No candidate wire/map/value helpers and no generated/replaced original vectors.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { inventory, referenceReader } from './retention.js';
import { SOURCE_KEYPATHS, modelFixture, goodModel } from './historyModel.js';
import { createWriter, createWriterSource } from '../../experimental/checkpoint/writer.js';
import { decodeSyntheticBackup } from '../../experimental/checkpoint/backupCodec.js';
import { canonical, bits } from '../../experimental/checkpoint/backupFormat.js';

export const ORIGINAL_ROOTS = Object.freeze([
  '822d9bbf21a3a40599cccec3dfd7007e09f964ea80fe853b11fdcf30c9ae8e53',
  '84f6fc93573b68105eff700c3006978a5fd39eb90c8af773a11d358b10c6da0c',
  '9085de88d28f5087deed6695c4bd89e79360212e0ac8feb21b9fc35588d575e6',
]);
export const BAD_ROOTS = Object.freeze([
  ORIGINAL_ROOTS[0], 'b20270f81f9d2ec015945d758d3753ca1d43336e53355bbb0d800aea42854514',
  '957e4b8a0b460da59de5cfb81fc6a7b68fcc22310281b576ade06dcb89675b5a',
]);
export const ORIGINAL_ENVELOPE = 'a4551453a5a167012f7b3065a31fe391fe0ab7ffa965faf73f846d39bea30e30';
export const BAD_ENVELOPE = '1d7b9c98ef5b1fceb5c58f4e372486527313550b0e5646fe6c444a407c4c2e28';
export const runtime = () => ({ now: () => performance.now(), cancelled: () => false });
export const writerOptions = source => ({ synthetic: true, source,
  producer: { appVersion: 'synthetic-p1-fixture', exportedAt: '2026-12-31T00:00:00.000Z' },
  instanceId: 'p1-instance', generation: 'local-generation', physicalInstance: 'writer-vector', physicalGeneration: 'local-generation',
  originOperationId: 'foreign-init', datasetOperationId: 'project-A', datasetId: 'A' });
export function equalHash(kind, ref, location, expected, actual) {
  assert.equal(actual, expected, JSON.stringify({ kind, ref, location, expectedHash: expected, actualHash: actual }));
}
const sha = value => createHash('sha256').update(value).digest('hex');
function fingerprint(value) {
  // Independent own-order/typed diagnostic token; only a digest is emitted.
  const encode = v => v === undefined ? ['undefined'] : typeof v === 'number' ? ['f64', bits(v)] :
    v && typeof v === 'object' ? [Array.isArray(v) ? 'array' : 'object', Object.keys(v).map(k => [k, encode(v[k])])] : [typeof v, v];
  return sha(JSON.stringify(encode(value)));
}
export function exactOwn(expected, actual, location) {
  function first(a, b, path) {
    if (Object.is(a, b)) return null;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return path;
    const ak = Object.keys(a), bk = Object.keys(b); if (JSON.stringify(ak) !== JSON.stringify(bk)) return path + '.ownKeys';
    for (const k of ak) { const f = first(a[k], b[k], path + '.' + k); if (f) return f; } return null;
  }
  const difference = first(expected, actual, location);
  assert.equal(difference, null, JSON.stringify({ kind: 'typed-value', ref: location, location: difference,
    expectedHash: fingerprint(expected), actualHash: fingerprint(actual) }));
}
export function readPhysicalPages(source) {
  const kinds = ['chunk', 'value', 'map', 'version', 'origin', 'dataset', 'data-root', 'journal', 'event', 'model-root'];
  const records = new Map(), pageIds = new Set(), reader = source.beginIndex(); let done = false;
  while (!done) {
    const page = goodModel(source.readIndex(reader)); assert.ok(page.rows.length <= 128);
    for (const row of page.rows) if (row.type === 'page') {
      assert.ok(!pageIds.has(row.id)); pageIds.add(row.id); const raw = goodModel(source.readPage(row.id)).bytes;
      assert.ok(raw.length + 32 <= 65536); const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
      assert.deepEqual([...raw.subarray(0, 8)], [70, 80, 87, 49, 1, 0, 0, 24]);
      assert.equal(view.getUint16(18), 0); assert.equal(view.getUint32(20), raw.length - 24);
      equalHash('physical-page', row.id, 'header/body', row.id, createHash('sha256').update('FinPath/P1.1b/page/1\n').update(raw).digest('hex'));
      const count = view.getUint16(16), first = view.getBigUint64(8); assert.ok(count > 0 && count <= 128 && first > 0n);
      assert.ok(first + BigInt(count - 1) <= BigInt(Number.MAX_SAFE_INTEGER)); let at = 24;
      for (let i = 0; i < count; i++) {
        assert.ok(at + 38 <= raw.length); const code = raw[at], codec = raw[at + 1], n = view.getUint32(at + 34);
        assert.ok(code >= 1 && code <= 10 && at + 38 + n <= raw.length); assert.equal(codec, code === 1 ? 2 : 1);
        const id = Buffer.from(raw.subarray(at + 2, at + 34)).toString('hex'), text = new TextDecoder().decode(raw.subarray(at + 38, at + 38 + n));
        assert.ok(!records.has(id)); assert.match(text, /^[\x20-\x7e]*$/);
        const body = codec === 2 ? { data: text } : JSON.parse(text); if (codec === 1) assert.equal(canonical(body), text);
        records.set(id, { id, kind: kinds[code - 1], body, sequence: Number(first) + i }); at += 38 + n;
      }
      assert.equal(at, raw.length);
    }
    done = page.exhausted;
  }
  const sequences = [...records.values()].map(r => r.sequence).sort((a, b) => a - b);
  assert.deepEqual(sequences, Array.from({ length: sequences.length }, (_, i) => i + 1));
  return { records, pageIds };
}
export async function proveBootstrap(sourceInput, originalFixture = false) {
  const original = await modelFixture(sourceInput), expected = inventory(original.model), decoded = goodModel(await decodeSyntheticBackup(original.bytes));
  const candidate = goodModel(await createWriter(writerOptions(sourceInput), runtime()));
  const io = goodModel(createWriterSource(candidate.snapshot, runtime())), physical = readPhysicalPages(io.source), actual = physical.records;
  const before = referenceReader(expected), after = referenceReader(actual);
  let originalFacts = 0;
  for (const record of expected.values()) if (record.kind !== 'map') {
    const current = actual.get(record.id);
    assert.ok(current, JSON.stringify({ kind: record.kind, ref: record.id, location: 'original-bootstrap-fact', expectedHash: record.id, actualHash: null }));
    assert.equal(current.kind, record.kind);
    equalHash(record.kind, record.id, 'original-bootstrap-body', sha(canonical(record.body)), sha(canonical(current.body))); originalFacts++;
  }
  for (const record of actual.values()) if (record.kind === 'map') {
    assert.ok(expected.has(record.id), JSON.stringify({ kind: 'map', ref: record.id, location: 'unexpected-bootstrap-map' }));
    equalHash('map', record.id, 'independent-FP-MAP-1-hash', record.id, sha('FinPath/P1/map/1\n' + canonical(record.body)));
  }
  const origin = [...expected.values()].find(r => r.kind === 'origin'), currentOrigin = [...actual.values()].find(r => r.kind === 'origin');
  assert.ok(origin && currentOrigin);
  equalHash('origin', currentOrigin.id, 'originId', origin.body.originId, currentOrigin.body.originId);
  for (const k of ['snapshotDigest', 'contentDigest', 'transportDigest']) equalHash('source', currentOrigin.id, k, origin.body[k], currentOrigin.body[k]);
  assert.equal(candidate.sourceDigests.content, decoded.contentDigest); assert.equal(candidate.sourceDigests.transport, decoded.transportDigest);
  assert.equal(origin.body.inventory.length, 17); assert.equal(currentOrigin.body.inventory.length, 17);
  let rows = 0;
  for (const [store, keyPath] of Object.entries(SOURCE_KEYPATHS)) {
    const old = origin.body.inventory.find(i => i.store === store), now = currentOrigin.body.inventory.find(i => i.store === store);
    assert.ok(old && now); equalHash('map', now.root, 'origin.inventory.' + store, old.root, now.root);
    exactOwn(keyPath, now.keyPath, store + '.keyPath'); assert.equal(now.count, old.count);
    const raw = after.rows(now.root).map(r => ({ key: r.key, value: after.value(r.valueRef) }));
    exactOwn(sourceInput.stores[store], raw, store + '.nativeSource'); exactOwn(decoded.snapshot.stores[store], raw, store + '.decodedSource');
    rows += raw.length;
  }
  equalHash('value', currentOrigin.body.envelopeRef, 'origin.envelopeRef', origin.body.envelopeRef, currentOrigin.body.envelopeRef);
  exactOwn(decoded.envelope, after.value(currentOrigin.body.envelopeRef), 'decodedEnvelope');
  assert.equal(canonical(after.value(currentOrigin.body.envelopeRef)), new TextDecoder().decode(original.bytes));
  // Verify every node in the envelope typed closure independently against P1.
  let envelopeNodes = 0; const pending = [origin.body.envelopeRef], checked = new Set();
  while (pending.length) {
    const id = pending.pop(); if (checked.has(id)) continue; checked.add(id); const e = expected.get(id), a = actual.get(id);
    assert.ok(e && a, JSON.stringify({ kind: 'envelope-closure', ref: id, location: 'missing' }));
    assert.equal(a.kind, e.kind); equalHash(e.kind, id, 'body', sha(canonical(e.body)), sha(canonical(a.body))); envelopeNodes++;
    if (e.kind === 'value') pending.push(...e.body.chunks, ...e.body.children);
  }
  equalHash('origin', currentOrigin.id, 'originRef', origin.id, currentOrigin.id);
  equalHash('origin', currentOrigin.id, 'inventory', sha(canonical(origin.body.inventory)), sha(canonical(currentOrigin.body.inventory)));
  const roots = [...expected.values()].filter(r => r.kind === 'model-root').sort((a, b) => Number(a.body.revision) - Number(b.body.revision));
  assert.equal(roots.length, 3); const committed = [];
  for (let i = 0; i < roots.length; i++) {
    const r = roots[i], id = candidate.bootstrapRoots[i], a = actual.get(id); assert.ok(a);
    equalHash('model-root', id, 'revision.' + i, r.id, id);
    if (originalFixture) equalHash('model-root', id, 'unchanged-accepted-literal.' + i, ORIGINAL_ROOTS[i], id);
    for (const k of ['dataRoot', 'operationsRoot', 'journal']) equalHash('model-root', id, k, r.body[k], a.body[k]);
    const eData = expected.get(r.body.dataRoot), aData = actual.get(a.body.dataRoot);
    for (const k of ['originsRoot', 'datasetsRoot']) equalHash('data-root', aData.id, k, eData.body[k], aData.body[k]);
    if (r.body.journal) {
      const journal = expected.get(r.body.journal), now = actual.get(a.body.journal);
      equalHash('journal', now.id, 'body', sha(canonical(journal.body)), sha(canonical(now.body)));
      const event = [...expected.values()].find(e => e.kind === 'event' && e.body.journal === journal.id);
      const actualEvent = after.find(a.body.operationsRoot, event.body.operationId);
      equalHash('event', actualEvent.valueRef, 'operation.event', event.id, actualEvent.valueRef);
      equalHash('request', event.id, 'requestDigest', event.body.requestDigest, actual.get(actualEvent.valueRef).body.requestDigest);
    }
    committed.push({ revision: i, expected: r.id, actual: id });
  }
  const planner = after.rows(currentOrigin.body.inventory.find(i => i.store === 'plannerEntries').root).map(e => after.value(e.valueRef));
  assert.equal(planner.filter(e => e.entryKey.startsWith('orphan-')).length, 25);
  assert.equal(planner.filter(e => e.entryKey.startsWith('newer-')).length, 22);
  assert.equal(planner.filter(e => e.entryKey.startsWith('real-tax-bill-')).length, 2);
  assert.notEqual(candidate.snapshot.inventoryRoot, original.model.indexRoot);
  if (originalFixture) { assert.equal(origin.body.envelopeRef, ORIGINAL_ENVELOPE); assert.notEqual(currentOrigin.body.envelopeRef, BAD_ENVELOPE);
    assert.notEqual(candidate.bootstrapRoots[1], BAD_ROOTS[1]); assert.notEqual(candidate.bootstrapRoots[2], BAD_ROOTS[2]); }
  return { original, candidate, io, expected, actual, origin, currentOrigin, rows, envelopeNodes, originalFacts, committed, after, before };
}
