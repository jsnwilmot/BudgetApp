import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { getHistoricalReviewState, getHistoricalSourceRevision, snapshotScheduledEntries } from '../src/logic/plannerHistory.js';
import { historicalSourceSignature } from '../src/logic/historicalIntegrity.js';
import { getDataHealthDetails } from '../src/data/migrations.js';
import { savePlannerEntry, replacePlannerEntries, getAllPlannerEntries,
  replaceScheduledItems, replaceAccounts, replaceCategories, replaceSavingsBuckets, saveScheduledItem, deleteScheduledItem } from '../src/data/db.js';
import { createBackupSnapshot, validateBackupFile } from '../src/services/backupService.js';
import { historyFixture } from './fixtures/history-ledger.js';

const key = 'salary__2026-12-30';
async function legacy({ amountMissing = false, lineItems = false } = {}) {
  const fixture = historyFixture();
  fixture.plannerEntries = { [key]: { ...fixture.plannerEntries[key], historicalAmountNeedsReview: true } };
  const entry = fixture.plannerEntries[key];
  delete entry.scheduledItemSnapshot;
  if (amountMissing) delete entry.plannedAmount;
  if (lineItems) {
    entry.useActual = true;
    entry.lineItems = [{ id: 'original-line', description: 'Saved invoice', amount: 1000 }];
  }
  await replaceAccounts(fixture.accounts); await replaceCategories(fixture.categories);
  await replaceSavingsBuckets(fixture.savingsBuckets);
  await replaceScheduledItems(fixture.scheduledItems);
  await replacePlannerEntries(fixture.plannerEntries);
  return fixture;
}
function roundTrip(fixture, entry) {
  const result = validateBackupFile(JSON.parse(JSON.stringify(createBackupSnapshot({
    ...fixture, plannerEntries: { [key]: entry },
  }))));
  assert.equal(result.valid, true);
  return result.data.plannerEntries[key];
}

test('F1 standard and line-item note/marker/validation-only saves cannot clear amount warnings', async () => {
  for (const lineItems of [false, true]) {
    const fixture = await legacy({ lineItems });
    for (const change of [{ notes: 'Note only' }, { validated: false }, { validated: true }]) {
      const current = (await getAllPlannerEntries())[key];
      // A stale or old editor may still submit false; storage must reject implied certification.
      const saved = await savePlannerEntry(key, { ...current, ...change, historicalAmountNeedsReview: false },
        { source: fixture.scheduledItems[0] });
      assert.equal(saved.historicalAmountNeedsReview, true);
      assert.equal(saved.historicalSourceNeedsReview, true);
      assert.deepEqual(saved.lineItems, fixture.plannerEntries[key].lineItems);
      assert.deepEqual(getHistoricalReviewState(roundTrip(fixture, saved)), { amount: true, source: true });
    }
  }
});

test('F1 legacy missing amount stays flagged when a routine save supplies a fallback planned value', async () => {
  const fixture = await legacy({ amountMissing: true });
  const saved = await savePlannerEntry(key, { ...fixture.plannerEntries[key], plannedAmount: 9000, notes: 'Marker-only save' },
    { source: fixture.scheduledItems[0] });
  assert.equal(saved.historicalAmountNeedsReview, true);
  assert.equal(roundTrip(fixture, saved).historicalAmountNeedsReview, true);
});

test('F1/F2 explicit reconciliation requires evidence and resolves only the selected warning', async () => {
  const fixture = await legacy();
  const entry = fixture.plannerEntries[key];
  const before = await getAllPlannerEntries();
  for (const review of [{ amount: true }, { source: true }, { amount: true, source: true, evidence: '  ' }]) {
    await assert.rejects(savePlannerEntry(key, entry, { source: fixture.scheduledItems[0], review }), /reference/);
    assert.deepEqual(await getAllPlannerEntries(), before);
  }
  const amount = await savePlannerEntry(key, entry, { source: fixture.scheduledItems[0],
    review: { amount: true, evidence: 'Synthetic original-statement.csv, salary 2026-12-30 = 1000 CAD' } });
  assert.deepEqual(getHistoricalReviewState(amount), { amount: false, source: true });
  assert.ok(amount.historicalReview.amount.reviewedAt);
  const source = await savePlannerEntry(key, amount, { review: { source: true, expectedRevision: getHistoricalSourceRevision(amount), expectedSource: historicalSourceSignature(amount.scheduledItemSnapshot),
    evidence: 'Synthetic original-backup.json salary account c, income, no category/bucket' } });
  assert.deepEqual(getHistoricalReviewState(source), { amount: false, source: false });
  assert.equal(source.scheduledItemSnapshotProvenance, 'user-reconciled');
  assert.deepEqual(getHistoricalReviewState(roundTrip(fixture, source)), { amount: false, source: false });
});

test('F2 saved 2026 amount with reassigned current account warns before/after inferred snapshot and restore', async () => {
  const fixture = await legacy();
  delete fixture.plannerEntries[key].historicalAmountNeedsReview;
  const reassigned = { ...fixture.scheduledItems[0], accountId: 's', categoryId: 'changed-category' };
  fixture.scheduledItems[0] = reassigned;
  await replacePlannerEntries(fixture.plannerEntries);
  const warning = (entry) => getDataHealthDetails({ ...fixture, plannerEntries: { [key]: entry } }).allIssues
    .some((issue) => issue.title === 'Historical source details need review');
  assert.equal(warning(fixture.plannerEntries[key]), true);
  const snapshots = snapshotScheduledEntries(reassigned, fixture.plannerEntries);
  await saveScheduledItem({ ...reassigned, name: 'Renamed again' }, snapshots);
  let entry = (await getAllPlannerEntries())[key];
  assert.equal(entry.plannedAmount, 1000);
  assert.equal(entry.scheduledItemSnapshot.accountId, 's');
  assert.equal(entry.scheduledItemSnapshotProvenance, 'unverified-current-source');
  assert.equal(warning(entry), true);
  entry = await savePlannerEntry(key, { ...entry, notes: 'Reviewed screen, no original evidence', historicalSourceNeedsReview: false });
  assert.equal(warning(roundTrip(fixture, entry)), true);
  await deleteScheduledItem(reassigned.id, snapshotScheduledEntries(reassigned, { [key]: entry }));
  assert.equal(warning((await getAllPlannerEntries())[key]), true);
});

test('F2 snapshots from older builds without provenance remain uncertain even if review flag is false', async () => {
  const fixture = historyFixture();
  const entry = { ...fixture.plannerEntries[key], historicalSourceNeedsReview: false };
  assert.equal(getHistoricalReviewState(entry).source, true);
  await replacePlannerEntries({ [key]: entry });
  const saved = await savePlannerEntry(key, { ...entry, notes: 'Routine save' });
  assert.equal(saved.historicalSourceNeedsReview, true);
  assert.equal(getHistoricalReviewState(roundTrip(fixture, saved)).source, true);
});

test('new cell source is captured at entry save; later routine edits do not replace original details', async () => {
  await replacePlannerEntries({});
  const source = historyFixture().scheduledItems[0];
  const entry = { scheduledItemId: source.id, payPeriodDate: '2026-12-30', plannedAmount: 1000, validated: true, useActual: false };
  const saved = await savePlannerEntry(key, entry, { source });
  assert.equal(saved.scheduledItemSnapshotProvenance, 'captured-at-entry-save');
  assert.deepEqual(getHistoricalReviewState(saved), { amount: false, source: false });
  const edited = await savePlannerEntry(key, { ...saved, notes: 'Later note' }, { source: { ...source, accountId: 's' } });
  assert.equal(edited.scheduledItemSnapshot.accountId, 'c');
});

test('imported snapshot presence or submitted provenance/audit does not certify an existing legacy cell', async () => {
  const fixture = await legacy();
  const source = fixture.scheduledItems[0];
  const submitted = { ...fixture.plannerEntries[key], historicalSourceNeedsReview: false,
    scheduledItemSnapshot: source, scheduledItemSnapshotProvenance: 'user-reconciled',
    historicalReview: { source: { evidence: 'Text without explicit acknowledgement' } } };
  const saved = await savePlannerEntry(key, submitted, { source });
  assert.equal(getHistoricalReviewState(saved).source, true);
  assert.equal(saved.scheduledItemSnapshotProvenance, 'unverified-current-source');
  assert.equal(saved.historicalReview.source, undefined);
});

test('legacy or malformed reconciliation metadata never establishes source provenance', () => {
  const fixture = historyFixture();
  for (const evidence of [undefined, null, {}, 123, '   ']) {
    const entry = { ...fixture.plannerEntries[key], scheduledItemSnapshotProvenance: 'user-reconciled',
      historicalSourceNeedsReview: false, historicalReview: { source: { evidence } } };
    assert.equal(getHistoricalReviewState(entry).source, true);
    assert.ok(getDataHealthDetails({ ...fixture, plannerEntries: { [key]: entry } }).allIssues
      .some((issue) => issue.title === 'Historical source details need review'));
  }
});
