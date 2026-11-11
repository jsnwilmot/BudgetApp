import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { encodeSyntheticBackup, decodeSyntheticBackup } from '../experimental/checkpoint/backupCodec.js';
import { inspectSyntheticLegacy } from '../experimental/checkpoint/backupLegacy.js';
import { strictSyntheticText } from '../experimental/checkpoint/backupText.js';
import { canonical, DOMAIN, SCHEMA, STORES, LIMITS, keyEncode, keyCompare, bits, copy, freeze } from '../experimental/checkpoint/backupFormat.js';
import { makeGraph, readGraph } from '../experimental/checkpoint/backupGraph.js';
import { sourceRevision, buildCheckpointPreview } from '../experimental/checkpoint/adapter.js';
import { validateBackupFile } from '../src/services/backupService.js';
import { PRODUCER, sourceFixture } from './fixtures/backupCodec.js';

const fixture = await sourceFixture(), golden = JSON.parse(await readFile(new URL('./fixtures/backupGolden.json', import.meta.url), 'utf8'));
const successful = r => { assert.equal(r.ok, true, JSON.stringify(r.diagnostics)); return r; };
const encoded = successful(await encodeSyntheticBackup(fixture.snapshot, PRODUCER));
const utf8 = s => new TextEncoder().encode(s);
const rejected = (r, code) => { assert.deepEqual(r, { ok: false, diagnostics: [{ code }] }); return r; };
const independentHash = (d, v) => createHash('sha256').update(`${d}\n${canonical(v)}`).digest('hex');
const wire = e => utf8(canonical(e));
function reseal(e, manifests = false) {
  if (manifests) {
    for (const m of e.data.manifest) {
      m.count = m.rows.length;
      m.keysetDigest = independentHash(DOMAIN.keys, { store: m.store, keyPath: m.keyPath, keys: m.rows.map(r => r.key) });
      m.collectionDigest = independentHash(DOMAIN.collection, { store: m.store, keyPath: m.keyPath, count: m.count, rows: m.rows });
    }
    const d = e.data; d.source.snapshotDigest = independentHash(DOMAIN.snapshot, {
      sourceProfile: d.sourceProfile, storageSchema: 1, protocolVersion: 1, controlRef: d.source.controlRef, manifest: d.manifest });
  }
  delete e.integrity.contentDigest; e.integrity.contentDigest = independentHash(DOMAIN.envelope, e); return e;
}
function rawChange(mutator) {
  const s = structuredClone(fixture.snapshot); mutator(s);
  for (const r of s.stores.recordRevisions) if (!r.value.deleted) {
    const row = s.stores[r.value.collection].find(v => v.key === r.value.key);
    if (row) r.value.contentToken = sourceRevision(row.value);
  }
  return s;
}

test('F01/F04/C1: full17 snapshot roundtrip independently equals native IDB keys, keyPaths and original values/history', async () => {
  const d = successful(await decodeSyntheticBackup(encoded.bytes));
  assert.deepEqual(d.snapshot, fixture.snapshot);
  assert.deepEqual(Object.keys(d.snapshot.stores).sort(), STORES);
  for (const s of STORES) {
    assert.deepEqual(SCHEMA[s], fixture.native[s].keyPath);
    assert.deepEqual(d.snapshot.stores[s].map(r => r.key), fixture.native[s].keys);
    assert.deepEqual(d.snapshot.stores[s].map(r => r.value), fixture.native[s].values);
  }
  assert.equal(d.snapshot.stores.checkpointDrafts.length, 2);
  assert.ok(d.snapshot.stores.recordRevisions.some(r => r.value.deleted));
  assert.equal(d.snapshot.stores.financialAudit.length, 4);
  assert.ok(Object.isFrozen(d.snapshot.stores.protectedSnapshots[0].value.before));
  assert.throws(() => d.snapshot.stores.accounts.pop(), TypeError);
  assert.deepEqual(successful(await encodeSyntheticBackup(d.snapshot, PRODUCER)).bytes, encoded.bytes);
  const c = successful(buildCheckpointPreview(fixture.financial)).calculation;
  assert.equal(c.validated.aggregate.cash, '600000'); assert.equal(c.validated.buckets.tax, '70000');
  assert.deepEqual(d.snapshot.stores.appMetadata, fixture.snapshot.stores.appMetadata);
});

test('C01/C02: independent Python full-envelope canonical bytes and fixed hashes', async () => {
  const e = successful(await encodeSyntheticBackup(freeze(golden.snapshot), golden.producer));
  assert.equal(new TextDecoder().decode(e.bytes), golden.canonicalEnvelope);
  assert.equal(e.snapshotDigest, golden.snapshotDigest); assert.equal(e.contentDigest, golden.contentDigest);
  const d = successful(await decodeSyntheticBackup(utf8(golden.canonicalEnvelope)));
  assert.deepEqual(d.snapshot, golden.snapshot);
  assert.equal(canonical(golden.canonicalObject.value), golden.canonicalObject.canonical);
  assert.equal(independentHash(DOMAIN.keys, golden.keyset.payload), golden.keyset.hash);
});

test('C01/C03/C04: independent tag/string/Unicode/f64 vectors', async () => {
  for (const v of golden.nodes) {
    assert.equal(canonical(v.value), v.canonical); assert.equal(independentHash(DOMAIN.node, v.value), v.hash);
    const d = await readGraph([{ id: v.hash, value: v.value }], [v.hash]);
    const g = await makeGraph(d.values); assert.equal(g.roots[0], v.hash);
  }
  assert.equal(bits(-0), '8000000000000000'); assert.equal(bits(Number.MIN_VALUE), '0000000000000001');
  assert.notEqual(golden.nodes.find(v => v.value[1] === 'é').hash, golden.nodes.find(v => v.value[1] === 'e\u0301').hash);
});

test('C05: independent canonical chunk roots at 0/64/65/4096/4097', async () => {
  for (const v of golden.chunks) {
    const g = await makeGraph([Array(v.length).fill(null)]);
    assert.equal(g.roots[0], v.root); assert.equal(g.nodes.length, v.uniqueNodes);
    assert.deepEqual((await readGraph(g.nodes, g.roots)).values[0], Array(v.length).fill(null));
  }
});

test('C02/C06: safe own prototype names, missing/undefined/null/order, stored null-prototype caveat', async () => {
  const value = Object.create(null);
  for (const [k, v] of [['__proto__', { safe: true }], ['constructor', 'literal'], ['prototype', undefined], ['z', -0], ['nil', null]]) {
    Object.defineProperty(value, k, { value: v, enumerable: true });
  }
  const g = await makeGraph([copy(value)]), d = (await readGraph(g.nodes, g.roots)).values[0];
  assert.deepEqual(Object.keys(d), Object.keys(value)); assert.equal(Object.getPrototypeOf(d), Object.prototype);
  assert.equal(Object.hasOwn(d, '__proto__'), true); assert.deepEqual(d.__proto__, { safe: true });
  assert.equal(Object.hasOwn(d, 'prototype'), true); assert.equal(Object.hasOwn(d, 'absent'), false);
  assert.equal(d.prototype, undefined); assert.equal(d.nil, null); assert.equal(Object.is(d.z, -0), true);
  assert.equal({}.safe, undefined);
});

test('C06: getters/symbols/cycles/exotic types/sparse arrays reject without executing getters', async () => {
  let executed = 0; const getter = {}; Object.defineProperty(getter, 'amount', { enumerable: true, get() { executed++; return 1; } });
  const cycle = {}; cycle.self = cycle;
  for (const v of [getter, { [Symbol('x')]: 1 }, cycle, new Date(0), new Map(), new Set(), new Uint8Array(2), 1n, () => 0, Array(2), Object.assign([1], { extra: true })]) {
    const s = structuredClone(fixture.snapshot); s.stores.appMetadata[0].value.opaque = v;
    rejected(await encodeSyntheticBackup(s, PRODUCER), 'UNSUPPORTED_TYPE');
  }
  assert.equal(executed, 0);
});

test('F12/C04: finite stored raw money is bit-exact, new minor-unit strings are exact and never rounded', async () => {
  const s = rawChange(s => {
    const a = s.stores.accounts[0].value;
    a.startingBalance = 0.1 + 0.2; a.negativeZero = -0; a.subnormal = Number.MIN_VALUE;
    a.openingMinor = '-123456789012345678901234567890'; a.explicit = undefined;
  });
  const e = successful(await encodeSyntheticBackup(s, PRODUCER)), d = successful(await decodeSyntheticBackup(e.bytes));
  assert.deepEqual(d.snapshot, s); assert.equal(Object.is(d.snapshot.stores.accounts[0].value.negativeZero, -0), true);
  for (const bad of [12, 1.2, '-0', '+1', '01', '', '1e2']) {
    const changed = rawChange(s => { s.stores.accounts[0].value.openingMinor = bad; });
    rejected(await encodeSyntheticBackup(changed, PRODUCER), 'UNSAFE_NUMBER');
  }
  for (const bad of [NaN, Infinity, -Infinity]) {
    const changed = structuredClone(fixture.snapshot); changed.stores.accounts[0].value.startingBalance = bad;
    rejected(await encodeSyntheticBackup(changed, PRODUCER), 'UNSAFE_NUMBER');
  }
});

test('C02: deterministic output, source roots independent of export time, content binds metadata and transport', async () => {
  const later = successful(await encodeSyntheticBackup(fixture.snapshot, { ...PRODUCER, exportedAt: '2027-01-01T00:00:00.000Z' }));
  assert.equal(later.snapshotDigest, encoded.snapshotDigest); assert.notEqual(later.contentDigest, encoded.contentDigest);
  const formatted = utf8(JSON.stringify(encoded.envelope, null, 2)), d = successful(await decodeSyntheticBackup(formatted));
  assert.equal(d.contentDigest, encoded.contentDigest);
  assert.equal(d.transportDigest, createHash('sha256').update(formatted).digest('hex'));
  assert.notEqual(d.transportDigest, successful(await decodeSyntheticBackup(encoded.bytes)).transportDigest);
  const e = structuredClone(encoded.envelope); e.appVersion = 'tampered-private-note'; e.metadata.appVersion = e.appVersion;
  rejected(await decodeSyntheticBackup(wire(e)), 'INTEGRITY_MISMATCH');
});

test('F05/C07: duplicate decoded keys including escaped aliases reject before document JSON.parse', () => {
  for (const s of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"metadata":{"schemaVersion":3,"schema\\u0056ersion":2}}', '{"__proto__":0,"\\u005f_proto__":1}']) {
    rejected(strictSyntheticText(utf8(s)), 'DUPLICATE_JSON_KEY');
  }
  successful(strictSyntheticText(utf8('{"a":1,"nested":{"a":2}}')));
});

test('C07: fatal UTF8, BOM, grammar, escapes, trailing content and unsafe structural numbers', () => {
  for (const bytes of [new Uint8Array([0xc0, 0xaf]), new Uint8Array([0xed, 0xa0, 0x80]), new Uint8Array([0xf4, 0x90, 0x80, 0x80]), new Uint8Array([0xe2, 0x82])]) {
    rejected(strictSyntheticText(bytes), 'INVALID_UTF8');
  }
  for (const s of ['\ufeff{}', '{}{}', '[1,]', '{"a":}', '"\\x00"', '"\n"', '01', '', 'true false', '/*x*/{}', '[']) rejected(strictSyntheticText(utf8(s)), 'INVALID_JSON');
  for (const s of ['-0', '-1', '0.1', '1e2', '9007199254740992', '1e999']) rejected(strictSyntheticText(utf8(s)), 'UNSAFE_NUMBER');
  successful(strictSyntheticText(utf8(' { "a": [0,9007199254740991,true,null,"\\ud800"] } ')));
});

test('F06: missing store/keyPath/key mismatches and duplicate native record keys reject', async () => {
  const s = structuredClone(fixture.snapshot); delete s.stores.transfers;
  rejected(await encodeSyntheticBackup(s, PRODUCER), 'INVALID_FIELDS');
  const mismatch = rawChange(s => { s.stores.accounts[0].key = 'wrong-key'; });
  rejected(await encodeSyntheticBackup(mismatch, PRODUCER), 'INVALID_KEY');
  const dup = structuredClone(fixture.snapshot); dup.stores.accounts.push(dup.stores.accounts[0]);
  rejected(await encodeSyntheticBackup(dup, PRODUCER), 'INVALID_IDENTITY');
  for (const mutate of [e => { e.data.manifest[0].keyPath = 'other'; }, e => { e.data.manifest.pop(); }]) {
    const e = structuredClone(encoded.envelope); mutate(e); reseal(e, true);
    const r = await decodeSyntheticBackup(wire(e)); assert.equal(r.ok, false);
  }
  const e = structuredClone(encoded.envelope), m = e.data.manifest.find(m => m.store === 'accounts');
  m.rows.at(-1).key = ['s', 'zz-wrong']; reseal(e, true);
  rejected(await decodeSyntheticBackup(wire(e)), 'INVALID_KEY');
});

test('F06: strict duplicate occurrence/line identities; missing source and line IDs remain qualified', async () => {
  const entries = fixture.snapshot.stores.plannerEntries;
  const dup = rawChange(s => { const row = structuredClone(entries[0]); row.key = 'different'; row.value.entryKey = 'different'; s.stores.plannerEntries.push(row); });
  // Add matching raw revision solely to reach occurrence validation.
  dup.stores.recordRevisions.push({ key: ['plannerEntries', 'different'], value: { collection: 'plannerEntries', key: 'different',
    generation: dup.stores.financialControl[0].value.generation, revision: '0', deleted: false, contentToken: sourceRevision(dup.stores.plannerEntries.at(-1).value) } });
  rejected(await encodeSyntheticBackup(dup, PRODUCER), 'INVALID_IDENTITY');
  const lines = rawChange(s => { s.stores.plannerEntries[0].value.lineItems = [{ id: 'same', amount: '1' }, { id: 'same', amount: '2' }]; });
  rejected(await encodeSyntheticBackup(lines, PRODUCER), 'INVALID_IDENTITY');
  const missing = rawChange(s => { s.stores.plannerEntries[0].value.scheduledItemId = 'orphan'; s.stores.plannerEntries[0].value.lineItems = [{ amount: '1' }]; });
  const e = successful(await encodeSyntheticBackup(missing, PRODUCER)), d = successful(await decodeSyntheticBackup(e.bytes));
  assert.ok(d.qualifications.missingSources > 0); assert.ok(d.qualifications.missingLineIds > 0); assert.deepEqual(d.snapshot, missing);
});

test('F08/F09/F10/F11: versions, aliases, required capabilities, unknown fields and partial/full claims reject', async () => {
  const cases = [
    [e => { e.schemaVersion = 4; }, 'UNSUPPORTED_VERSION'], [e => { e.metadata.appDataVersion = 2; }, 'SYNTHETIC_INPUT_REQUIRED'],
    [e => { e.data.source.storageSchema = 10; }, 'UNSUPPORTED_VERSION'], [e => { e.data.format = 'partial'; }, 'UNSUPPORTED_VERSION'],
    [e => { e.data.requiredCapabilities.push('active-checkpoint'); }, 'UNSUPPORTED_CAPABILITY'],
    [e => { e.data.requiredCapabilities.pop(); }, 'UNSUPPORTED_CAPABILITY'],
    [e => { e.metadata.requiredCapabilities.push(e.metadata.requiredCapabilities[0]); }, 'UNSUPPORTED_CAPABILITY'],
    [e => { e.data.extraFinancial = []; }, 'INVALID_FIELDS'], [e => { e.data.derived = { unknown: [] }; }, 'INVALID_FIELDS'],
    [e => { e.data.provenance.qualifications = ['pretend-full']; }, 'INVALID_FIELDS'],
    [e => { e.data.manifest = null; }, 'INVALID_FORMAT'], [e => { e.integrity.graph = 'unknown'; }, 'UNSUPPORTED_VERSION'],
    [e => { Object.defineProperty(e.metadata, '__proto__', { value: {}, enumerable: true }); }, 'INVALID_FIELDS'],
  ];
  for (const [mutate, code] of cases) { const e = structuredClone(encoded.envelope); mutate(e); reseal(e); rejected(await decodeSyntheticBackup(wire(e)), code); }
});

test('F09: protocol active modes/unknown capabilities/draft activation refuse without changing inputs', async () => {
  for (const [mutate, code] of [
    [s => { s.stores.financialControl[0].value.mode = 'active'; }, 'ACTIVE_STATE'],
    [s => { s.stores.financialControl[0].value.capabilities.push('new'); }, 'UNSUPPORTED_CAPABILITY'],
    [s => { s.stores.checkpointDrafts[0].value.status = 'active'; }, 'ACTIVE_STATE'],
    [s => { s.stores.checkpointDrafts[0].value.payload.active = true; }, 'ACTIVE_STATE'],
    [s => { s.stores.appMetadata[0].value.activeCheckpointId = 'unsupported'; }, 'ACTIVE_STATE'],
  ]) {
    const s = structuredClone(fixture.snapshot); mutate(s); const before = structuredClone(s);
    rejected(await encodeSyntheticBackup(s, PRODUCER), code); assert.deepEqual(s, before);
  }
});

test('C08/F16: audit/snapshot/revision/tombstone/history graphs reject missing, conflicting and self references', async () => {
  for (const mutate of [
    s => { s.stores.financialAudit.pop(); }, s => { s.stores.protectedSnapshots[1].value.before.history.financialAudit = []; },
    s => { s.stores.protectedSnapshots[1].value.before.history.protectedSnapshots.push('missing'); },
    s => { s.stores.financialAudit[0].value.receipt.snapshotId = 'missing'; },
    s => { s.stores.recordRevisions[0].value.contentToken = 'corrupt'; },
    s => { s.stores.checkpointDraftHeads[0].value.revision = '999'; },
    s => { s.stores.financialAudit[0].value.affected.push(s.stores.financialAudit[0].value.affected[0]); },
    s => { s.stores.protectedSnapshots[1].value.before.stores.accounts[0].value.startingBalance = 999; },
  ]) { const s = structuredClone(fixture.snapshot); mutate(s); rejected(await encodeSyntheticBackup(s, PRODUCER), 'INVALID_HISTORY'); }
});

test('C08: graph duplicate/collision, missing child, orphan, cycle, noncanonical chunk and changed hashes', async () => {
  const graphError = async (table, roots, code) => assert.rejects(readGraph(table, roots), e => e.code === code);
  const n = golden.nodes[0], one = { id: n.hash, value: n.value };
  await graphError([one, one], [one.id], 'INVALID_GRAPH');
  await graphError([one, { id: one.id, value: ['u'] }], [one.id], 'NODE_HASH_COLLISION');
  await graphError([{ id: one.id, value: ['obj', ['x'], [['x', 'f'.repeat(64)]]] }], [one.id], 'INVALID_GRAPH');
  const u = { id: golden.nodes[1].hash, value: golden.nodes[1].value };
  await graphError([one, u].sort((a, b) => a.id.localeCompare(b.id)), [one.id], 'INVALID_GRAPH');
  await graphError([{ id: one.id, value: ['arr-leaf', [one.id]] }], [one.id], 'INVALID_GRAPH');
  const g = await makeGraph([Array(65).fill(null)]), branch = g.nodes.find(n => n.value[0] === 'arr-branch'); branch.value[1] = 66;
  await graphError(g.nodes, g.roots, 'INVALID_GRAPH');
  await graphError([{ id: one.id, value: ['b', true] }], [one.id], 'INTEGRITY_MISMATCH');
  for (const v of ['7ff0000000000000', '7ff8000000000001']) await graphError([{ id: one.id, value: ['f64', v] }], [one.id], 'UNSAFE_NUMBER');
});

test('F15/C08/S03: file, depth, string, graph amplification and row resource limits refuse safely', async () => {
  rejected(await decodeSyntheticBackup(new Uint8Array(LIMITS.bytes + 1)), 'RESOURCE_LIMIT');
  rejected(strictSyntheticText(utf8('['.repeat(66) + '0' + ']'.repeat(66))), 'RESOURCE_LIMIT');
  rejected(strictSyntheticText(utf8('"' + 'a'.repeat(LIMITS.string + 1) + '"')), 'RESOURCE_LIMIT');
  const s = structuredClone(fixture.snapshot); s.stores.accounts = Array(LIMITS.rows + 1).fill(s.stores.accounts[0]);
  rejected(await encodeSyntheticBackup(s, PRODUCER), 'RESOURCE_LIMIT');
  // Small transport DAG would allocate exponentially many elements if eagerly decoded.
  const nodes = []; let id = '0'.repeat(64); nodes.push({ id, value: ['n'] });
  for (let i = 1; i <= 24; i++) { const next = i.toString(16).padStart(64, '0'); nodes.push({ id: next, value: ['arr-leaf', [id, id]] }); id = next; }
  await assert.rejects(readGraph(nodes, [id]), e => e.code === 'RESOURCE_LIMIT');
  assert.deepEqual(fixture.snapshot, (await sourceFixture()).snapshot);
});

test('C02: restricted native key ordering matches fixed vectors, no revision/date coercion', () => {
  const keys = [['A', '2'], ['A', '10'], ['😀', '0']].map(keyEncode).sort(keyCompare);
  assert.deepEqual(keys, golden.keyset.payload.keys); assert.deepEqual(keyEncode('1'), ['s', '1']);
  assert.throws(() => keyEncode(['A', 1]), e => e.code === 'INVALID_KEY');
});

test('F13: unchanged actual accepted data2 validator refuses genuine generated data3/export2 file', () => {
  const r = validateBackupFile(JSON.parse(new TextDecoder().decode(encoded.bytes)));
  assert.deepEqual(r, { valid: false, message: 'This backup is from a newer app version and cannot be imported.' });
});

const legacyBytes = await readFile(new URL('./fixtures/legacy-backup.json', import.meta.url));
const wrappedBytes = await readFile(new URL('./fixtures/current-backup.json', import.meta.url));
test('F02/F03/F04: legacy bare/wrapped inspection retains original bytes/envelope/lexemes without full-history claim', async () => {
  for (const b of [legacyBytes, wrappedBytes]) {
    const r = successful(await inspectSyntheticLegacy(b, { synthetic: true }));
    assert.deepEqual(r.originalBytes, [...b]); assert.deepEqual(r.original, JSON.parse(b.toString()));
    assert.equal(r.fullSnapshot, false); assert.equal(r.restoreImplemented, false);
    assert.ok(r.qualifications.includes('FINANCIAL_READINESS_NOT_ESTABLISHED')); assert.ok(r.lexemes.length > 0);
    assert.ok(Object.isFrozen(r.original));
  }
});

test('F07: legacy source aliases exact by membership; conflicts, duplicates, unknown financial fields reject', async () => {
  const source = JSON.parse(wrappedBytes.toString());
  for (const mutate of [
    e => { e.data.planner.entries = {}; }, e => { e.data.savings.buckets[0].startingAmount += 1; },
    e => { e.data.budgets = [{ id: 'new', amount: 1 }]; }, e => { e.data.accounts.push(e.data.accounts[0]); },
    e => { e.data.savings.transfers.push({ id: 'extra', amount: 1 }); },
  ]) {
    const e = structuredClone(source); mutate(e); assert.equal((await inspectSyntheticLegacy(utf8(JSON.stringify(e)), { synthetic: true })).ok, false);
  }
  const e = structuredClone(source); e.data.accounts.reverse();
  successful(await inspectSyntheticLegacy(utf8(JSON.stringify(e)), { synthetic: true }));
  e.data.unknownFinancial = []; rejected(await inspectSyntheticLegacy(utf8(JSON.stringify(e)), { synthetic: true }), 'UNSUPPORTED_LEGACY');
});

test('F08/F09/F10/F11: legacy unknown/contradictory versions, capabilities and missing mandatory sections block', async () => {
  for (const mutate of [e => { e.metadata.appDataVersion = 3; }, e => { e.exportVersion = 2; }, e => { e.metadata.requiredCapabilities = ['active']; },
    e => { delete e.data.accounts; }, e => { e.data.planner = null; }, e => { e.data.appMetadata.activeCheckpointId = 'future'; }]) {
    const e = JSON.parse(wrappedBytes.toString()); mutate(e); assert.equal((await inspectSyntheticLegacy(utf8(JSON.stringify(e)), { synthetic: true })).ok, false);
  }
});

test('F12/C03: hostile legacy financial tokens reject before Number conversion; exact decimals and -0 preserved', async () => {
  const base = '{"settings":{},"accounts":[{"id":"C","startingBalance":TOKEN}],"scheduledItems":[]}';
  for (const token of ['1e2', '1.001', '90071992547409.92', '90071992547409.91', '0.30000000000000004', '1e999', 'null', '""', '"1e2"']) {
    rejected(await inspectSyntheticLegacy(utf8(base.replace('TOKEN', token)), { synthetic: true }), 'UNSAFE_NUMBER');
  }
  for (const token of ['0', '-0', '0.10', '12.30', '-10.25', '900719925474.12']) {
    const b = utf8(base.replace('TOKEN', token)), r = successful(await inspectSyntheticLegacy(b, { synthetic: true }));
    assert.equal(r.lexemes[0].token, token); assert.deepEqual(r.originalBytes, [...b]);
  }
});

test('C5: pure module boundary and safe errors, no filesystem/network/storage/clock/random dependency', async () => {
  for (const name of ['backupCodec.js', 'backupFormat.js', 'backupText.js', 'backupGraph.js', 'backupInventory.js', 'backupLegacy.js']) {
    const source = await readFile(new URL(`../experimental/checkpoint/${name}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from\s+['"](?:node:|.*\/src\/)|\b(?:fetch|indexedDB|localStorage|XMLHttpRequest|Date\.now|Math\.random)\s*\(/);
  }
  const errors = [await encodeSyntheticBackup({ privateNote: 'DO-NOT-LEAK-123.45' }, PRODUCER), await decodeSyntheticBackup(utf8('{"privateNote":"DO-NOT-LEAK-123.45"}'))];
  for (const r of errors) { assert.equal(r.ok, false); assert.doesNotMatch(JSON.stringify(r), /DO-NOT|123|stack|Error:/); }
  rejected(await inspectSyntheticLegacy(legacyBytes, { synthetic: false }), 'SYNTHETIC_INPUT_REQUIRED');
  assert.deepEqual(Object.keys(await import('../experimental/checkpoint/backupCodec.js')).sort(), ['decodeSyntheticBackup', 'encodeSyntheticBackup']);
});

test('F16: synthetic 25 orphan/22 newer contributions and two tax bills stay separate, archived values untouched', async () => {
  const f = await sourceFixture('codec-legacy-history', seed => {
    for (let i = 0; i < 49; i++) {
      const source = i < 25 ? `orphan-${i}` : i < 47 ? `newer-${i}` : `bill-${i}`, entryKey = `${source}__2026-12-16`;
      seed.records.plannerEntries.push({ key: entryKey, value: { entryKey, scheduledItemId: source,
        payPeriodDate: '2026-12-16', plannedAmount: '100', validated: i >= 14, useActual: false,
        historicalSourceNeedsReview: true, scheduledItemSnapshot: { id: source, type: i < 47 ? 'transfer' : 'expense',
          accountId: i >= 25 && i < 47 ? 'missing-legacy-account' : 'C', bucketId: i < 47 ? 'tax' : null },
        audit: [{ id: `audit-${i}`, evidence: 'synthetic-original' }] } });
    }
    seed.records.savingsBuckets[0].value.deletedAt = '2026-01-01T00:00:00.000Z';
    seed.records.appMetadata[0].value.candidateEdges = Array.from({ length: 11 }, (_, i) => [i, i + 25]);
  });
  const r = successful(await encodeSyntheticBackup(f.snapshot, PRODUCER)), decoded = successful(await decodeSyntheticBackup(r.bytes));
  assert.deepEqual(decoded.snapshot, f.snapshot);
  const rows = decoded.snapshot.stores.plannerEntries.filter(r => r.value.payPeriodDate === '2026-12-16');
  assert.equal(rows.length, 49); assert.equal(rows.filter(r => !r.value.validated).length, 14);
  assert.equal(rows.filter(r => r.value.scheduledItemSnapshot.type === 'expense').length, 2);
  assert.equal(rows.filter(r => r.value.scheduledItemId.startsWith('orphan-')).length, 25);
  assert.equal(rows.filter(r => r.value.scheduledItemId.startsWith('newer-')).length, 22);
  const archived = f.snapshot.stores.savingsBuckets.find(r => r.value.deletedAt);
  assert.equal(decoded.snapshot.stores.savingsBuckets.find(r => r.key === archived.key).value.deletedAt, archived.value.deletedAt);
  assert.equal(decoded.qualifications.financialReadiness, 'not-established');
});

test('C5: runtime storage/network tripwires and input/byte ownership survive async encode/decode', async () => {
  const names = ['indexedDB', 'localStorage', 'fetch', 'XMLHttpRequest'], old = names.map(k => Object.getOwnPropertyDescriptor(globalThis, k));
  let touched = 0;
  try {
    for (const k of names) Object.defineProperty(globalThis, k, { configurable: true, get() { touched++; throw Error('forbidden effect'); } });
    const snapshot = structuredClone(fixture.snapshot), before = structuredClone(snapshot), p = { ...PRODUCER };
    const pending = encodeSyntheticBackup(snapshot, p); p.appVersion = 'mutated';
    snapshot.stores.accounts[0].value.startingBalance = 999999;
    const e = successful(await pending); assert.equal(e.envelope.appVersion, PRODUCER.appVersion);
    const bytes = new Uint8Array(e.bytes), decoding = decodeSyntheticBackup(bytes); bytes.fill(0);
    const d = successful(await decoding); assert.deepEqual(d.snapshot, before);
    assert.equal(touched, 0);
  } finally {
    names.forEach((k, i) => { if (old[i]) Object.defineProperty(globalThis, k, old[i]); else delete globalThis[k]; });
  }
});

test('C1: actual B1 snapshot/native IDB keeps safe literal own keys, not unknown pre-storage prototypes', async () => {
  const f = await sourceFixture('codec-prototype', seed => {
    const value = Object.create(null);
    for (const [key, child] of [['__proto__', { literal: true }], ['constructor', 'own'], ['prototype', undefined]]) {
      Object.defineProperty(value, key, { enumerable: true, value: child });
    }
    seed.records.accounts[0].value.literalKeys = value;
  });
  const e = successful(await encodeSyntheticBackup(f.snapshot, PRODUCER)), d = successful(await decodeSyntheticBackup(e.bytes));
  assert.deepEqual(d.snapshot, f.snapshot); assert.deepEqual(d.snapshot.stores.accounts.map(r => r.value), f.native.accounts.values);
  const value = d.snapshot.stores.accounts.find(r => Object.hasOwn(r.value, 'literalKeys')).value.literalKeys;
  assert.equal(Object.getPrototypeOf(value), Object.prototype); assert.equal(Object.hasOwn(value, '__proto__'), true);
  assert.equal(Object.hasOwn(value, 'prototype'), true); assert.equal({}.literal, undefined);
});

test('C07/C03: bad grammar/duplicates/legacy money reject before whole-document JSON.parse', async () => {
  const originalParse = JSON.parse; let documents = 0;
  JSON.parse = (s, ...rest) => { if (s.trimStart().startsWith('{') || s.trimStart().startsWith('[')) documents++; return originalParse(s, ...rest); };
  try {
    rejected(strictSyntheticText(utf8('{"a":1,"\\u0061":2}')), 'DUPLICATE_JSON_KEY');
    rejected(strictSyntheticText(utf8('{"a":[1,]}')), 'INVALID_JSON');
    rejected(await inspectSyntheticLegacy(utf8('{"settings":{},"accounts":[{"id":"C","startingBalance":1.001}],"scheduledItems":[]}'), { synthetic: true }), 'UNSAFE_NUMBER');
    assert.equal(documents, 0);
    successful(strictSyntheticText(utf8('{"a":1}'))); assert.equal(documents, 1);
  } finally { JSON.parse = originalParse; }
});
