// Independent frozen vectors and hostile wire inputs. No financial fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { limits, LIMITS, meter, CAPS, D, P } from '../experimental/checkpoint/writerFormat.js';
import { encodePage, decodePage, checkLogical, valueShape, refs } from '../experimental/checkpoint/writerWire.js';
import { parseCanonical } from '../experimental/checkpoint/writerCanonical.js';
import { graphBuilder } from '../experimental/checkpoint/writerValue.js';
import { mapEditor } from '../experimental/checkpoint/writerMap.js';
import { logicalBuilder } from '../experimental/checkpoint/writerCore.js';
import { canonical } from '../experimental/checkpoint/backupFormat.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/writerGolden.json', import.meta.url)));
const maps = JSON.parse(readFileSync(new URL('./fixtures/historyGolden.json', import.meta.url)));
const rt = () => ({ now: () => 0, cancelled: () => false });
const met = extra => meter(limits(extra), rt());
const sha = (domain, input) => createHash('sha256').update(domain + '\n').update(input).digest('hex');
const bytes = hex => new Uint8Array(Buffer.from(hex, 'hex'));

test('W01/W09: frozen independent Python page, metadata, capabilities and physical-context vectors', async () => {
  assert.deepEqual(CAPS, golden.capabilities);
  const page = await encodePage(golden.records, 1, met());
  assert.equal(Buffer.from(page.bytes).toString('hex'), golden.pageHex); assert.equal(page.id, golden.pageHash);
  const decoded = await decodePage(bytes(golden.pageHex), golden.pageHash, met()), seen = new Map();
  for (const r of decoded) { await checkLogical(r, id => seen.get(id), met()); seen.set(r.id, r); }
  for (const [k, domain] of [['delta', 'inventory-delta'], ['seal', 'command-seal'], ['state', 'state'], ['pin', 'pins'], ['physicalRequest', 'physical-request']]) {
    assert.equal(await met().hash(D + domain + '/1', golden[k].body), golden[k].hash);
  }
  assert.equal(await met().hash(D + 'capabilities/1', CAPS), golden.guard.capabilityDigest);
  // Frozen newline chunk is an independent raw-byte framing example, NOT an
  // admissible canonical logical chunk. Preserve it and prove strict refusal.
  assert.equal(sha(D + 'page/1', bytes(golden.chunk.pageHex)), golden.chunk.hash);
  await assert.rejects(decodePage(bytes(golden.chunk.pageHex), golden.chunk.hash, met()), { code: 'INVALID_PAGE' });
  assert.equal(sha(P + 'chunk/1', golden.chunk.record.body.data), golden.chunk.record.id);
});

test('W09/W11: unknown tags, flags, unsafe sequences, endian, truncation, trailing bytes and corruption refuse', async () => {
  const raw = bytes(golden.pageHex);
  for (const mutate of [b => { b[0] = 0; }, b => { b[4] = 2; }, b => { b[5] = 1; }, b => { b[7] = 23; },
    b => { b[18] = 1; }, b => { b[24] = 255; }, b => { b[25] = 2; },
    b => { new DataView(b.buffer).setBigUint64(8, 9007199254740992n); }, b => { new DataView(b.buffer).setBigUint64(8, 0n); },
    b => { new DataView(b.buffer).setUint16(16, 129); }, b => { new DataView(b.buffer).setUint32(58, 0xffffffff); }]) {
    const bad = new Uint8Array(raw); mutate(bad); await assert.rejects(decodePage(bad, sha(D + 'page/1', bad), met()));
  }
  for (const bad of [raw.slice(0, -1), new Uint8Array([...raw, 32])]) await assert.rejects(decodePage(bad, sha(D + 'page/1', bad), met()));
  const bad = new Uint8Array(raw); bad[bad.length - 1] ^= 1;
  await assert.rejects(decodePage(bad, golden.pageHash, met()), { code: 'INTEGRITY_MISMATCH' });
});

test('W11/W12: strict canonical duplicate-key/escape/number/depth and typed-value/reference rejection', async () => {
  for (const text of ['{"a":1,"a":2}', '{"b":1,"a":2}', '{"a": 1}', '01', '-0', '1.0', '1e1', '9007199254740992',
    '"\\u0061"', '"\\n"', '"\\uD800"', '[]x', '{"x":}', '[1,]', '"é"']) assert.throws(() => parseCanonical(text, met()));
  assert.deepEqual(parseCanonical('{"__proto__":0,"a":"\\ud800"}', met()), JSON.parse('{"__proto__":0,"a":"\\ud800"}'));
  for (const node of [['f64', '7ff0000000000000'], ['obj', ['x', 'x'], []], ['obj', ['2', '1'], [['1', 'a'.repeat(64)], ['2', 'a'.repeat(64)]]],
    ['arr-branch', 65, ['a'.repeat(64)]], ['arr-leaf', Array(65).fill('a'.repeat(64))], ['unknown']]) assert.throws(() => valueShape(node, null, met()));
  const bad = { kind: 'map', id: 'a'.repeat(64), body: { tag: 'leaf', entries: [], total: 1, live: 0 } };
  assert.throws(() => refs(bad, met()));
  const wrong = { ...golden.records[1], body: { originsRoot: 'a'.repeat(64), datasetsRoot: 'a'.repeat(64) } };
  await assert.rejects(checkLogical(wrong, () => ({ kind: 'chunk', body: { data: 'x' } }), met()), { code: 'INVALID_GRAPH' });
});

// This harness uses the candidate transient editor and FP value encoder, but
// expected roots/topologies are the UNCHANGED independent Python reference.
function mapHarness() {
  const records = new Map(), native = new Map(); let m, graph, editor;
  const b = { get: id => records.get(id), decode: id => native.get(id),
    async value(v) { const id = await graph.value(v); native.set(id, v); return id; },
    async intern(kind, body) { const id = sha(P + kind + '/1', canonical(body)); records.set(id, { kind, body }); return id; } };
  function reset() { m = met(); graph = graphBuilder(m); editor = mapEditor(b, m); }
  reset();
  return { reset, get editor() { return editor; }, async entry(k) {
    const keyRef = await b.value(typeof k === 'string' ? ['s', k] : ['k', k]), valueRef = await b.value({ id: k, amount: '1.25' });
    const versionRef = await b.intern('version', { datasetId: 'vector', store: 'accounts', keyRef, valueRef,
      deleted: false, previous: null, sourceVersionRef: null, localRevision: '1' }); return { valueRef, versionRef }; },
    shape(root) { const n = records.get(root).body; return n.tag === 'leaf' ? n.entries.length : n.children.map(c => this.shape(c.ref)); } };
}
test('W01/W02: 0/1/32/64/65/4096/4097 exact Python roots and 32/33 topology with bounded command-local maps', async () => {
  const h = mapHarness(); let root = await h.editor.finish(h.editor.empty()), count = 0;
  for (const vector of maps.maps) {
    while (count < vector.count) {
      h.reset(); let working = root;
      for (let end = Math.min(count + 128, vector.count); count < end; count++) {
        const k = 'k' + String(count).padStart(5, '0'); working = await h.editor.put(working, k, await h.entry(k));
      }
      root = await h.editor.finish(working);
    }
    assert.equal(root, vector.root); assert.deepEqual(h.shape(root), vector.shape);
  }
});
test('W02: original mixed Unicode/compound UTF16 order, no-op reuse and alternate insertion orders', async () => {
  const h = mapHarness(); let root = h.editor.empty();
  for (const k of maps.mixed.input) root = await h.editor.put(root, k, await h.entry(k));
  root = await h.editor.finish(root); assert.equal(root, maps.mixed.root);
  assert.deepEqual(h.editor.rows(root).map(e => e.key), maps.mixed.ordered);
  const unchanged = await h.editor.put(root, maps.mixed.input[0], await h.entry(maps.mixed.input[0]));
  assert.equal(await h.editor.finish(unchanged), root);
  for (const order of [Array.from({ length: 65 }, (_, i) => 64 - i), Array.from({ length: 65 }, (_, i) => (i * 32) % 65)]) {
    const x = mapHarness(); let n = x.editor.empty(); for (const i of order) { const k = 'k' + String(i).padStart(5, '0'); n = await x.editor.put(n, k, await x.entry(k)); }
    // Order changes topology; independently compare exact content/order here.
    const finalized = await x.editor.finish(n);
    assert.equal(finalized, maps.maps.find(v => v.count === 65).root);
    assert.deepEqual(x.editor.rows(finalized).map(e => e.key), Array.from({ length: 65 }, (_, i) => 'k' + String(i).padStart(5, '0')));
  }
});

test('W12: every fixed numeric cap rejects raising; deep helper exact/over limits remain enforced', async () => {
  for (const [k, v] of Object.entries(LIMITS)) {
    assert.equal(limits({ [k]: v })[k], v); assert.throws(() => limits({ [k]: v + 1 }), { code: 'RESOURCE_LIMIT' });
    assert.throws(() => limits({ [k]: 0 }), { code: 'RESOURCE_LIMIT' });
  }
  const m = met({ stageBytes: 32 }); m.reserve(32); assert.throws(() => m.reserve(1), { code: 'RESOURCE_LIMIT' }); m.release(32);
  const key = met({ keyUnits: 2 }); key.key('ab'); assert.throws(() => key.key('abc'), { code: 'RESOURCE_LIMIT' });
  const compare = met({ comparedUnits: 2 }); compare.compare(['s', 'ab'], ['s', 'ab']); assert.throws(() => compare.compare(['s', 'a'], ['s', 'a']), { code: 'RESOURCE_LIMIT' });
  const work = met({ workBytes: 2 }); work.tick(2, 0); assert.throws(() => work.tick(1, 0), { code: 'RESOURCE_LIMIT' });
  const visits = met({ visits: 2 }); visits.tick(); assert.throws(() => visits.tick(), { code: 'RESOURCE_LIMIT' });
  assert.throws(() => met().key(['x'.repeat(32768), 'x']), { code: 'RESOURCE_LIMIT' });
  assert.throws(() => met().copy(new Array(1000001)), { code: 'RESOURCE_LIMIT' });
  assert.throws(() => met().copy({ x: Infinity }), { code: 'UNSAFE_NUMBER' });
  const chunk = { kind: 'chunk', id: 'a'.repeat(64), body: { data: 'x'.repeat(61440) } };
  assert.ok((await encodePage([chunk], 1, met())).bytes.length <= 65504);
  assert.throws(() => refs({ ...chunk, body: { data: 'x'.repeat(61441) } }, met()), { code: 'INVALID_GRAPH' });
  await assert.rejects(encodePage(Array(129).fill(chunk), 1, met()), { code: 'INVALID_PAGE' });
});

test('W12: logical-record, dirty-map, reference, old-lookup and value-expansion limits refuse in deep helpers', async () => {
  const graph = graphBuilder(met({ stagedRecords: 1 })); await graph.value('first');
  await assert.rejects(graph.value('second'), { code: 'RESOURCE_LIMIT' });
  const h = met({ dirtyMaps: 1 }), editor = mapEditor({}, h); editor.empty(); assert.throws(() => editor.empty(), { code: 'RESOURCE_LIMIT' });
  const b = logicalBuilder({ pool: null }, met({ oldLookups: 1 })); assert.equal(b.maybe('a'.repeat(64)), null);
  assert.throws(() => b.maybe('b'.repeat(64)), { code: 'RESOURCE_LIMIT' });
  const record = { kind: 'value', body: { logicalBytes: 1, chunks: ['a'.repeat(64)], children: Array(767).fill('b'.repeat(64)) } };
  assert.equal(refs(record, met()).length, 768);
  assert.throws(() => refs({ ...record, body: { ...record.body, children: Array(768).fill('b'.repeat(64)) } }, met()), { code: 'INVALID_GRAPH' });
  const object = {}; let cursor = object; for (let i = 0; i < 65; i++) { cursor.child = {}; cursor = cursor.child; }
  assert.throws(() => met().copy(object), { code: 'RESOURCE_LIMIT' });
  const info = { expanded: 134217728, visits: 1, height: 1 };
  assert.throws(() => valueShape(['arr-leaf', ['a'.repeat(64)]], () => info, met()), { code: 'RESOURCE_LIMIT' });
  assert.throws(() => valueShape(['arr-leaf', ['a'.repeat(64)]], () => ({ expanded: 1, visits: 2000000, height: 1 }), met()), { code: 'RESOURCE_LIMIT' });
  assert.throws(() => valueShape(['arr-leaf', ['a'.repeat(64)]], () => ({ expanded: 1, visits: 1, height: 64 }), met()), { code: 'RESOURCE_LIMIT' });
  const small = golden.records[0]; assert.equal((await encodePage(Array(128).fill(small), 1, met())).bytes.length, 24 + 128 * (38 + canonical(small.body).length));
  await assert.rejects(encodePage([small], 1, met({ pageBytes: 24 + 38 + canonical(small.body).length - 1 })), { code: 'RESOURCE_LIMIT' });
});
