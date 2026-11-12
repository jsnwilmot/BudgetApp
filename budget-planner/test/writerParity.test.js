import test from 'node:test';
import assert from 'node:assert/strict';
import { historicalSource, goodModel } from './fixtures/historyModel.js';
import { proveBootstrap, exactOwn, ORIGINAL_ENVELOPE, BAD_ENVELOPE, runtime, writerOptions } from './fixtures/writerParity.js';
import { sourceRevision } from '../experimental/checkpoint/adapter.js';
import { decodeSyntheticBackup, encodeSyntheticBackup } from '../experimental/checkpoint/backupCodec.js';
import { typedFingerprint } from '../experimental/checkpoint/historyCore.js';
import { canonical } from '../experimental/checkpoint/backupFormat.js';
import { parseSourceTransport } from '../experimental/checkpoint/writerSourceParse.js';
import { meter, limits } from '../experimental/checkpoint/writerFormat.js';
import { createWriter, createWriterSource, currentSnapshot } from '../experimental/checkpoint/writer.js';

let original;
const originalProof = () => original ??= proveBootstrap(historicalSource(), true);
const parse = text => parseSourceTransport(text, meter(limits(), { now: () => 0, cancelled: () => false }, true));

test('Issue34/D3: exact unchanged source17, envelope closure and P1 roots 0/1/2', async t => {
  const proof = await originalProof();
  t.diagnostic(JSON.stringify({ stores: 17, rows: proof.rows, envelopeNodes: proof.envelopeNodes, originalFacts: proof.originalFacts, committed: proof.committed }));
});

test('Issue34/D3: native own-order, f64 bits, minor strings, undefined and protected histories remain exact', async t => {
  const source = historicalSource();
  function addTypes(stores) {
    if (!stores.appMetadata.length) return;
    const value = stores.appMetadata[0].value;
    value.syntheticTypes = { z: 'first', a: 'second', negativeZero: -0, subnormal: Number.MIN_VALUE,
      amountMinor: '123456789012345678901234567890', negativeMinor: '-1', ownUndefined: undefined,
      composed: 'é', decomposed: 'e\u0301', surrogate: '\ud800' };
    Object.defineProperty(value.syntheticTypes, '__proto__', { enumerable: true, value: { original: true } });
    value.syntheticTypes.constructor = 'own';
    stores.recordRevisions.find(r => r.key[0] === 'appMetadata' && r.key[1] === value.id).value.contentToken = sourceRevision(value);
  }
  addTypes(source.stores);
  for (const row of source.stores.protectedSnapshots) addTypes(row.value.before.stores);
  const before = structuredClone(source), proof = await proveBootstrap(source);
  exactOwn(before, source, 'unchangedInput');
  const value = proof.after.value(proof.after.rows(proof.currentOrigin.body.inventory.find(i => i.store === 'appMetadata').root)[0].valueRef).syntheticTypes;
  assert.ok(Object.is(value.negativeZero, -0)); assert.equal(value.subnormal, Number.MIN_VALUE);
  assert.ok(Object.hasOwn(value, 'ownUndefined')); assert.ok(!Object.hasOwn(value, 'absent'));
  assert.equal(value.amountMinor, '123456789012345678901234567890'); assert.equal({}.original, undefined);
  t.diagnostic(JSON.stringify({ stores: 17, rows: proof.rows, envelopeNodes: proof.envelopeNodes, originalFacts: proof.originalFacts, committed: proof.committed }));
});

test('Issue34/D2–D3: whole transport parse matches independent codec; original bad own-order remains negative evidence', async () => {
  const proof = await originalProof(), decoded = goodModel(await decodeSyntheticBackup(proof.original.bytes));
  const text = new TextDecoder().decode(proof.original.bytes), parsed = parse(text);
  exactOwn(decoded.envelope, parsed, 'canonicalTransport');
  assert.equal(await typedFingerprint(parsed), ORIGINAL_ENVELOPE);
  const encoded = goodModel(await encodeSyntheticBackup(historicalSource(), { appVersion: 'synthetic-p1-fixture', exportedAt: '2026-12-31T00:00:00.000Z' }));
  assert.equal(await typedFingerprint(encoded.envelope), BAD_ENVELOPE);
  assert.notDeepEqual(Object.keys(encoded.envelope.metadata), Object.keys(parsed.metadata));
  assert.equal(canonical(encoded.envelope), text); // Equal content is NOT equal FP-TV own order.
  const invalid = [text + ' ', '\ufeff' + text, '{"a":1,"\\u0061":1}', '{"a":1,"a":2}', '{"x":9007199254740992}',
    '{"x":-0}', '{"x":0.1}', '{"x":"\\x20"}', '{"x":1,}', text.slice(0, -1)];
  for (const bad of invalid) assert.throws(() => parse(bad));
  for (const alter of [e => e.exportVersion++, e => e.data.source.storageSchema++, e => e.metadata.synthetic = false,
    e => e.integrity.valueCodec = 'unsupported', e => e.data.requiredCapabilities.push('unknown')]) {
    const unsupported = structuredClone(parsed); alter(unsupported); assert.throws(() => parse(canonical(unsupported)));
  }
  assert.throws(() => parseSourceTransport(text, meter(limits({ stageBytes: 128 }), { now: () => 0, cancelled: () => false }, true)), e => e.code === 'RESOURCE_LIMIT');
});

test('Issue34/D2–D3: invalid synthetic sources still refuse identically to the independent reference', async () => {
  for (const [alter, code] of [
    [s => s.synthetic = false, 'SYNTHETIC_INPUT_REQUIRED'],
    [s => s.stores.appMetadata[0].value.checkpointActive = true, 'ACTIVE_STATE'],
    [s => s.stores.accounts[0].key = 'wrong-synthetic-id', 'INVALID_KEY'],
    [s => s.stores.appMetadata[0].value.invalidNumber = NaN, 'UNSAFE_NUMBER'],
  ]) {
    const source = historicalSource(); alter(source); const before = structuredClone(source), options = writerOptions(source);
    const old = await encodeSyntheticBackup(source, options.producer), next = await createWriter(options, runtime());
    assert.equal(old.ok, false); assert.equal(next.ok, false);
    assert.equal(old.diagnostics[0].code, code); assert.equal(next.diagnostics[0].code, code);
    assert.equal(next.snapshot, undefined); assert.equal(next.controller, undefined); exactOwn(before, source, 'unchangedRejectedInput');
  }
  let getterCalls = 0; const source = historicalSource();
  Object.defineProperty(source.stores.appMetadata[0].value, 'trap', { enumerable: true, get() { getterCalls++; throw Error('synthetic-private'); } });
  const old = await encodeSyntheticBackup(source, writerOptions(source).producer), next = await createWriter(writerOptions(source), runtime());
  assert.equal(old.diagnostics[0].code, 'UNSUPPORTED_TYPE'); assert.equal(next.diagnostics[0].code, 'UNSUPPORTED_TYPE');
  assert.equal(getterCalls, 0); assert.ok(!JSON.stringify(next).includes('synthetic-private'));
});

test('Issue34/D4: full source reads release transferred copies; buffers cannot mutate the pinned source', async t => {
  const proof = await originalProof(), source = goodModel(createWriterSource(proof.candidate.snapshot, runtime())).source;
  let read = 0, physical = null;
  const index = source.beginIndex(); let done = false;
  while (!done) {
    const page = goodModel(source.readIndex(index)); assert.ok(page.rows.length <= 128);
    for (const row of page.rows) {
      if (row.type === 'logical') {
        const actual = goodModel(source.readLogical(row.id)).record, expected = proof.actual.get(row.id);
        assert.ok(canonical(actual).length <= 262144);
        assert.equal(actual.kind, expected.kind); assert.equal(canonical(actual.body), canonical(expected.body));
        assert.ok(Object.isFrozen(actual) && Object.isFrozen(actual.body)); read++;
      } else if (row.type === 'page') physical ??= row.id;
      else { const actual = goodModel(source.readMetadata(row.id)).record; assert.equal(actual.id, row.id); assert.ok(Object.isFrozen(actual.body)); assert.ok(canonical(actual).length <= 262144); }
    }
    done = page.exhausted;
  }
  assert.equal(read, proof.actual.size);
  // Repeated output larger than the 8MiB staging cap must not be mistaken for
  // simultaneously retained source-owned copies. Consumer holds one at a time.
  const largest = [...proof.actual.values()].filter(r => r.kind === 'chunk').sort((a, b) => b.body.data.length - a.body.data.length)[0];
  const repeat = goodModel(createWriterSource(proof.candidate.snapshot, runtime())).source;
  let transferred = 0, calls = 0;
  while (transferred <= 9 * 1024 * 1024) {
    const record = goodModel(repeat.readLogical(largest.id)).record;
    assert.equal(record.body.data, largest.body.data); transferred += canonical(record).length; assert.ok(++calls < 5000);
  }
  const before = goodModel(source.readPage(physical)).bytes, pristine = new Uint8Array(before); before.fill(0);
  assert.deepEqual(goodModel(source.readPage(physical)).bytes, pristine);
  assert.equal(goodModel(currentSnapshot(proof.candidate.controller)).snapshot, proof.candidate.snapshot);
  t.diagnostic(JSON.stringify({ completeLogicalReads: read, cumulativeReturnedBytes: transferred, repeatedReads: calls, limitsRaised: false }));
});

test('Issue34/D4: the same session still refuses expired/cancelled reads safely without partial output', async () => {
  const proof = await originalProof(), id = proof.candidate.bootstrapRoots[0];
  let clock = 0, cancelled = false;
  const source = goodModel(createWriterSource(proof.candidate.snapshot, { now: () => clock, cancelled: () => cancelled })).source;
  assert.equal(goodModel(source.readLogical(id)).record.id, id);
  cancelled = true; const stopped = source.readLogical(id);
  assert.deepEqual(stopped, { ok: false, diagnostics: [{ code: 'CANCELLED' }] });
  cancelled = false; assert.equal(goodModel(source.readLogical(id)).record.id, id);
  clock = 60001; const expired = source.readLogical(id);
  assert.deepEqual(expired, { ok: false, diagnostics: [{ code: 'RESOURCE_LIMIT' }] });
  assert.equal(goodModel(currentSnapshot(proof.candidate.controller)).snapshot, proof.candidate.snapshot);
});
