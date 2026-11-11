import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeSyntheticBackup, decodeSyntheticBackup } from '../experimental/checkpoint/backupCodec.js';
import { growthFixture, denseGrowthModel } from './fixtures/backupSizing.js';
import { PRODUCER } from './fixtures/backupCodec.js';
import { LIMITS } from '../experimental/checkpoint/backupFormat.js';

for (const years of [1, 3, 5]) test(`S01/S02: ${years}-year low-write full17 retained-history size and round-trip`, async t => {
  const f = await growthFixture(years), r = await encodeSyntheticBackup(f.snapshot, PRODUCER);
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  assert.ok(r.bytes.length < LIMITS.bytes && r.stats.expanded < LIMITS.expanded);
  const decoded = await decodeSyntheticBackup(r.bytes);
  assert.equal(decoded.ok, true, JSON.stringify(decoded.diagnostics)); assert.deepEqual(decoded.snapshot, f.snapshot);
  assert.equal(decoded.snapshot.stores.protectedSnapshots.length, f.assumptions.operations);
  t.diagnostic(JSON.stringify({ ...f.assumptions, ...r.stats }));
});

test('S02/S04: 27 periods/year high-edit variant preserves every retained version and refuses without dropping history', async t => {
  const f = await growthFixture(1, 27, 12), r = await encodeSyntheticBackup(f.snapshot, PRODUCER);
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  assert.equal((await decodeSyntheticBackup(r.bytes)).ok, true);
  t.diagnostic(JSON.stringify({ ...f.assumptions, ...r.stats }));
  // Huge retained token strings can remain few unique nodes yet expand past
  // the budget. No allocation of multi-gigabyte physical history is necessary.
  const s = structuredClone(f.snapshot), note = 'x'.repeat(LIMITS.string);
  s.stores.appMetadata[0].value.syntheticAmplification = Array(70).fill(note);
  const before = s.stores.protectedSnapshots.length, denied = await encodeSyntheticBackup(s, PRODUCER);
  assert.deepEqual(denied, { ok: false, diagnostics: [{ code: 'RESOURCE_LIMIT' }] });
  assert.equal(s.stores.protectedSnapshots.length, before); assert.equal(denied.bytes, undefined);
});

test('S01/S04: independently fixed dense physical-history model remains a future blocker, not a transport benchmark', () => {
  const measured = [1, 3, 5].map(denseGrowthModel);
  assert.deepEqual(measured.map(v => (v.currentBytes / 1048576).toFixed(2)), ['1.06', '3.08', '5.10']);
  assert.deepEqual(measured.map(v => (v.literalBytes / 1048576).toFixed(2)), ['209.61', '1777.47', '4876.96']);
  for (const v of measured) assert.ok(v.literalBytes > LIMITS.expanded);
});
