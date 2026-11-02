import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectHistoricalEntry, summarizeHistoricalEntries, historicalSourceSignature } from '../src/logic/historicalIntegrity.js';
import { getHistoricalSourceRevision } from '../src/logic/plannerHistory.js';
import { getDataHealthDetails } from '../src/data/migrations.js';
import { replaceAccounts, replaceCategories, replaceSavingsBuckets, replaceScheduledItems, replacePlannerEntries,
  getAllPlannerEntries, getAllScheduledItems, savePlannerEntry, saveScheduledItem, correctHistoricalSource } from '../src/data/db.js';
import { createBackupSnapshot, validateBackupFile } from '../src/services/backupService.js';
import { buildPlannerRows } from '../src/logic/projectionLogic.js';
import { legacyIntegrityFixture } from './fixtures/legacy-integrity.js';

async function seed(fixture) {
  await replaceAccounts(fixture.accounts); await replaceCategories(fixture.categories);
  await replaceSavingsBuckets(fixture.savingsBuckets); await replaceScheduledItems(fixture.scheduledItems);
  await replacePlannerEntries(fixture.plannerEntries);
}
const inspect = (fixture, key) => inspectHistoricalEntry(key, fixture.plannerEntries[key], fixture);
const consent = (entry, source) => ({ source: true, evidence: 'Synthetic source evidence',
  expectedRevision: getHistoricalSourceRevision(entry), expectedSource: historicalSourceSignature(entry.scheduledItemSnapshot || source) });

test('Increment A: prior provenance never masks missing historical account/category/bucket or required account', () => {
  const fixture = legacyIntegrityFixture();
  for (const [date, code] of [['01-02', 'account_missing'], ['01-09', 'category_missing'], ['01-16', 'bucket_missing'], ['01-23', 'account_required']]) {
    const state = inspect(fixture, `other__2026-${date}`);
    assert.equal(state.sourceAcknowledged, true);
    assert.equal(state.sourceVerified, false);
    assert.ok(state.integrityIssues.some((issue) => issue.code === code));
  }
  const health = getDataHealthDetails(fixture);
  assert.ok(health.errors.some((issue) => issue.title === 'Historical reference or identity issues'));
  assert.ok(health.info.some((issue) => issue.title === 'Historical source details need review'));
  assert.equal(health.warnings.some((issue) => issue.title === 'Historical source details need review'), false);
});

test('Increment A: archived IDs, optional null links and removed source with usable snapshot remain legitimate', () => {
  const fixture = legacyIntegrityFixture();
  const archived = inspect(fixture, 'other__2026-02-06');
  assert.equal(archived.integrityIssues.length, 0); assert.equal(archived.sourceVerified, true);
  const deleted = inspect(fixture, 'deleted-safe__2025-01-03');
  assert.equal(deleted.sourceRemoved, true); assert.equal(deleted.orphan, false); assert.equal(deleted.integrityIssues.length, 0);
  const key = 'other__2026-01-16';
  fixture.plannerEntries[key].scheduledItemSnapshot = { ...fixture.scheduledItems[1], type: 'transfer', accountId: null, categoryId: null, bucketId: null };
  assert.equal(inspect(fixture, key).integrityIssues.length, 0);
});

test('Increment A: stable IDs containing delimiters, date/key/source consistency and raw orphan coverage', () => {
  const fixture = legacyIntegrityFixture();
  assert.equal(inspect(fixture, 'salary__stable__2025-01-03').sourceId, 'salary__stable');
  assert.equal(inspect(fixture, 'salary__stable__2025-01-03').integrityIssues.length, 0);
  assert.equal(inspect(fixture, 'orphan__2025-01-03').orphan, true);
  assert.ok(inspect(fixture, 'other__2026-02-20').integrityIssues.some((issue) => issue.code === 'date_conflict'));
  const key = 'other__2026-02-06';
  for (const patch of [{ scheduledItemId: 'different' }, { entryKey: 'wrong' }, { scheduledItemSnapshot: { id: 'different', type: 'income' } }]) {
    const entry = { ...fixture.plannerEntries[key], ...patch };
    assert.ok(inspectHistoricalEntry(key, entry, fixture).integrityIssues.length);
  }
  assert.ok(inspectHistoricalEntry('other__2026-02-30', {}, fixture).integrityIssues.some((issue) => issue.code === 'key_invalid'));
});

test('Increment A: summaries split observed historical classifications without mutating data, calculations or audits', () => {
  const fixture = legacyIntegrityFixture(); const before = JSON.stringify(fixture);
  const financialBefore = buildPlannerRows(fixture).projectionRows;
  const summary = summarizeHistoricalEntries(fixture);
  assert.equal(summary.total, Object.keys(fixture.plannerEntries).length);
  assert.equal(summary.orphanCount, 1);
  assert.equal(summary.validated, summary.total);
  assert.equal(summary.groups.filter((group) => group.sourceId === 'salary__stable').length, 2);
  assert.equal(summary.rows.find((row) => row.entryKey === 'other__2026-01-02').correctionCount, 1);
  assert.equal(JSON.stringify(fixture), before);
  assert.deepEqual(buildPlannerRows(fixture).projectionRows, financialBefore);
});

test('Increment A: amount problems are independent of source metadata and validation stays untouched', () => {
  const fixture = legacyIntegrityFixture(); const original = fixture.plannerEntries['other__2026-02-06'];
  for (const patch of [{ plannedAmount: '' }, { plannedAmount: null }, { useActual: true, actualAmount: undefined },
    { lineItems: [{ id: 'saved-id', amount: 'invalid' }] }, { historicalAmountNeedsReview: true }]) {
    const row = inspectHistoricalEntry(original.entryKey, { ...original, ...patch }, fixture);
    assert.ok(row.amountIssues.length); assert.equal(row.validated, true); assert.equal(row.sourceNeedsReview, false);
  }
  const projected = inspectHistoricalEntry(original.entryKey, { ...original, validated: false, plannedAmount: undefined, scheduledItemSnapshotProvenance: undefined }, fixture);
  assert.equal(projected.amountIssues.length, 0); assert.equal(projected.sourceNeedsReview, true);
});

test('Increment A: bad previously attested reference blocks new single-entry confirmation atomically; F4 repair remains available', async () => {
  const fixture = legacyIntegrityFixture(); await seed(fixture);
  for (const key of ['other__2026-01-02', 'other__2026-01-09', 'other__2026-01-16', 'other__2026-01-23', 'other__2026-02-20']) {
    const before = await getAllPlannerEntries(); const current = before[key];
    await assert.rejects(savePlannerEntry(key, { ...current, notes: 'Must not persist' },
      { review: consent(current, fixture.scheduledItems[1]) }), /cannot be confirmed/);
    assert.deepEqual(await getAllPlannerEntries(), before);
  }
  const key = 'other__2026-01-02'; const before = (await getAllPlannerEntries())[key];
  const fixed = await correctHistoricalSource(key, { type: 'income', accountId: 'A', categoryId: null, bucketId: null },
    { confirmed: true, evidence: 'Synthetic original account A', expectedRevision: getHistoricalSourceRevision(before) });
  assert.equal(inspectHistoricalEntry(key, fixed, fixture).sourceVerified, true);
  assert.equal(fixed.plannedAmount, before.plannedAmount); assert.equal(fixed.validated, true);
  assert.deepEqual(fixed.historicalSourceCorrections[0], before.historicalSourceCorrections[0]);
});

test('Increment A: removed reference and changed fallback source reject stale tab confirmation without financial writes', async () => {
  const fixture = legacyIntegrityFixture(); await seed(fixture);
  const key = 'other__2026-02-06'; let before = await getAllPlannerEntries(); let current = before[key];
  const review = consent(current);
  await replaceAccounts(fixture.accounts.filter((account) => account.id !== 'A'));
  await assert.rejects(savePlannerEntry(key, current, { review }), /cannot be confirmed/);
  assert.deepEqual(await getAllPlannerEntries(), before);
  await seed(fixture);
  const salaryKey = 'salary__stable__2026-01-02'; before = await getAllPlannerEntries(); current = before[salaryKey];
  const oldReview = consent(current, fixture.scheduledItems[0]);
  await replaceAccounts(fixture.accounts.map((account) => ({ ...account, active: true })));
  await saveScheduledItem({ ...fixture.scheduledItems[0], accountId: 'A' });
  await assert.rejects(savePlannerEntry(salaryKey, current, { review: oldReview }), /changed since/);
  assert.deepEqual(await getAllPlannerEntries(), before);
});

test('Increment A: valid reference acknowledgement and backup round trip retain IDs, markers and F4 history', async () => {
  const fixture = legacyIntegrityFixture(); await seed(fixture);
  const key = 'salary__stable__2026-01-02'; const current = (await getAllPlannerEntries())[key];
  const saved = await savePlannerEntry(key, current, { review: consent(current, fixture.scheduledItems[0]) });
  assert.equal(saved.historicalSourceNeedsReview, false); assert.equal(saved.validated, true);
  const entries = await getAllPlannerEntries(); const schedules = await getAllScheduledItems();
  const backup = createBackupSnapshot({ ...fixture, plannerEntries: entries, scheduledItems: schedules });
  const restored = validateBackupFile(JSON.parse(JSON.stringify(backup)));
  assert.equal(restored.valid, true); assert.equal(backup.exportVersion, 1); assert.equal(backup.schemaVersion, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.data.plannerEntries)), JSON.parse(JSON.stringify(entries)));
  assert.deepEqual(restored.data.appMetadata.plannerLastEntryMarker, fixture.appMetadata.plannerLastEntryMarker);
  assert.equal(summarizeHistoricalEntries(restored.data).total, Object.keys(entries).length);
});

test('Increment A: malformed historical references/audits and bucket-linked account are exceptions, never normalization repairs', () => {
  const fixture = legacyIntegrityFixture(); const key = 'other__2026-02-06'; const original = fixture.plannerEntries[key];
  for (const patch of [{ scheduledItemSnapshot: { ...original.scheduledItemSnapshot, bucketId: false } },
    { historicalSourceCorrections: {} }, { scheduledItemSnapshot: { ...original.scheduledItemSnapshot, bucketId: 'tax', savingsBucketId: 'different' } }]) {
    assert.ok(inspectHistoricalEntry(key, { ...original, ...patch }, fixture).integrityIssues.length);
  }
  fixture.savingsBuckets[0].linkedAccountId = 'missing';
  assert.ok(inspect(fixture, key).integrityIssues.some((issue) => issue.code === 'bucket_account_missing'));
});

test('Increment A: decade summaries include all retained keys and treat pure legacy metadata as informational', () => {
  const fixture = legacyIntegrityFixture();
  const base = fixture.plannerEntries['salary__stable__2025-01-03'];
  fixture.plannerEntries = {};
  for (let year = 2016; year <= 2025; year++) for (let month = 1; month <= 12; month++) {
    const date = `${year}-${String(month).padStart(2, '0')}-02`; const key = `salary__stable__${date}`;
    fixture.plannerEntries[key] = { ...base, entryKey: key, payPeriodDate: date };
  }
  const before = structuredClone(fixture);
  const summary = summarizeHistoricalEntries(fixture);
  assert.equal(summary.total, 120); assert.equal(summary.integrityCount, 0); assert.equal(summary.amountCount, 0);
  assert.equal(summary.sourcePendingCount, 120); assert.equal(summary.groups.length, 1);
  assert.equal(summary.groups[0].fromDate, '2016-01-02'); assert.equal(summary.groups[0].toDate, '2025-12-02');
  const health = getDataHealthDetails(fixture);
  assert.equal(health.errors.length, 0);
  assert.equal(health.allIssues.some((issue) => issue.title === 'Invalid dates detected'), false);
  assert.equal(health.warnings.some((issue) => issue.title === 'Historical source details need review'), false);
  assert.deepEqual(fixture, before);
});

test('Increment A: absent optional audit metadata is legacy uncertainty, not corruption', () => {
  const fixture = legacyIntegrityFixture(); const key = 'other__2026-02-06';
  const entry = { ...fixture.plannerEntries[key], historicalReview: null,
    historicalSourceCorrections: null, scheduledItemSnapshotProvenance: undefined };
  const state = inspectHistoricalEntry(key, entry, fixture);
  assert.equal(state.integrityIssues.length, 0); assert.equal(state.sourceNeedsReview, true);
});

test('Increment A: acknowledgement cannot normalize identity conflicts or overwrite malformed prior audit', async () => {
  const fixture = legacyIntegrityFixture(); await seed(fixture);
  let before = await getAllPlannerEntries(); const key = 'other__2026-02-20';
  const entry = before[key];
  await assert.rejects(savePlannerEntry(key, { ...entry, payPeriodDate: '2026-02-20' }, { review: consent(entry) }), /cannot be rewritten/);
  assert.deepEqual(await getAllPlannerEntries(), before);
  const bad = { ...before['other__2026-02-06'], historicalReview: { source: 'Unstructured original evidence must survive' } };
  await replacePlannerEntries({ [bad.entryKey]: bad }); before = await getAllPlannerEntries();
  await assert.rejects(savePlannerEntry(bad.entryKey, bad, { review: consent(bad) }), /cannot be confirmed/);
  await assert.rejects(correctHistoricalSource(bad.entryKey, { type: 'income', accountId: 'A', categoryId: null, bucketId: null },
    { confirmed: true, evidence: 'New source evidence', expectedRevision: getHistoricalSourceRevision(bad) }), /audit needs review/);
  assert.deepEqual(await getAllPlannerEntries(), before);
});

test('Increment A: source-only correction never rewrites a conflicting historical snapshot ID', async () => {
  const fixture = legacyIntegrityFixture(); const key = 'other__2026-02-06';
  fixture.plannerEntries[key].scheduledItemSnapshot.id = 'different-source';
  await seed(fixture); const before = await getAllPlannerEntries(); const current = before[key];
  await assert.rejects(correctHistoricalSource(key, { type: 'income', accountId: 'A', categoryId: null, bucketId: null },
    { confirmed: true, evidence: 'Synthetic classification evidence', expectedRevision: getHistoricalSourceRevision(current) }), /No IDs were rewritten/);
  assert.deepEqual(await getAllPlannerEntries(), before);
});
