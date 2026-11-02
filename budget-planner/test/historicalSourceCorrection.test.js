import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBObjectStore } from 'fake-indexeddb';
import { correctHistoricalSource, replacePlannerEntries, replaceAccounts, replaceCategories,
  replaceSavingsBuckets, replaceScheduledItems, getAllPlannerEntries, getAllScheduledItems,
  savePlannerEntry, deletePlannerEntry } from '../src/data/db.js';
import { getHistoricalSourceRevision, getHistoricalReviewState, snapshotScheduledEntries } from '../src/logic/plannerHistory.js';
import { buildPlannerRows, buildSavingsBucketProjection } from '../src/logic/projectionLogic.js';
import { createBackupSnapshot, validateBackupFile } from '../src/services/backupService.js';
import { historyFixture } from './fixtures/history-ledger.js';

const key = 'salary__2026-12-30';
async function setup() {
  const fixture = historyFixture();
  fixture.categories = [{ id: 'original-income', name: 'Original income', type: 'income', active: false }];
  fixture.scheduledItems[0].accountId = 's';
  for (const [id, entry] of Object.entries(fixture.plannerEntries)) {
    if (!id.startsWith('salary__')) continue;
    entry.scheduledItemSnapshot.accountId = 's';
    entry.scheduledItemSnapshotProvenance = 'captured-at-entry-save';
  }
  fixture.plannerEntries[key].scheduledItemSnapshotProvenance = 'unverified-current-source';
  fixture.plannerEntries[key].historicalSourceNeedsReview = true;
  fixture.plannerEntries[key].historicalAmountNeedsReview = true;
  await replaceAccounts(fixture.accounts); await replaceCategories(fixture.categories);
  await replaceSavingsBuckets(fixture.savingsBuckets); await replaceScheduledItems(fixture.scheduledItems);
  await replacePlannerEntries(fixture.plannerEntries);
  return fixture;
}
const changes = { type: 'income', accountId: 'c', categoryId: 'original-income', bucketId: null };
function approval(entry, extra = {}) {
  return { confirmed: true, evidence: 'Synthetic original backup salary__2026-12-30: income to c',
    expectedRevision: getHistoricalSourceRevision(entry), ...extra };
}
const amount = (data, id, date) => data.projectionRows.find((row) => row.id === id).amountsByPeriod[date];

test('F4 A -> B recurrence, provisional B -> per-entry A: amounts, later B entries and schedule remain intact', async () => {
  const fixture = await setup();
  const entries = await getAllPlannerEntries(); const schedules = await getAllScheduledItems();
  const before = buildPlannerRows({ ...fixture, plannerEntries: entries, scheduledItems: schedules });
  assert.equal(amount(before, 'validated-chequing', '2026-12-30'), 620);
  assert.equal(amount(before, 'projected-savings', '2026-12-30'), 1645);
  const saved = await correctHistoricalSource(key, changes, approval(entries[key]));
  for (const field of ['entryKey', 'scheduledItemId', 'payPeriodDate', 'plannedAmount', 'actualAmount',
    'useActual', 'validated', 'notes', 'lineItems', 'createdAt']) assert.deepEqual(saved[field], entries[key][field]);
  assert.equal(saved.scheduledItemSnapshot.id, 'salary');
  assert.equal(saved.scheduledItemSnapshot.accountId, 'c');
  assert.equal(saved.scheduledItemSnapshot.categoryId, 'original-income');
  assert.deepEqual(getHistoricalReviewState(saved), { amount: true, source: false });
  const afterEntries = await getAllPlannerEntries();
  for (const id of Object.keys(entries).filter((id) => id !== key)) assert.deepEqual(afterEntries[id], entries[id]);
  assert.deepEqual(await getAllScheduledItems(), schedules);
  const after = buildPlannerRows({ ...fixture, plannerEntries: afterEntries, scheduledItems: schedules });
  assert.equal(amount(after, 'validated-chequing', '2026-12-30'), 1620);
  assert.equal(amount(after, 'projected-savings', '2026-12-30'), 645);
  for (const date of ['2027-01-13', '2028-02-29']) {
    assert.equal(amount(after, 'validated-chequing', date) - amount(before, 'validated-chequing', date), 1000);
    assert.equal(amount(after, 'projected-savings', date) - amount(before, 'projected-savings', date), -1000);
  }
  assert.equal(saved.historicalSourceCorrections[0].previousSource.accountId, 's');
  assert.equal(saved.historicalSourceCorrections[0].correctedSource.accountId, 'c');
  assert.ok(saved.historicalSourceCorrections[0].evidence);
  const portable = validateBackupFile(JSON.parse(JSON.stringify(createBackupSnapshot({ ...fixture, plannerEntries: afterEntries }))));
  assert.equal(portable.valid, true);
  await replacePlannerEntries(portable.data.plannerEntries);
  assert.deepEqual((await getAllPlannerEntries())[key], saved);
});

test('F4 confirmation, evidence, reference IDs, account and payload restrictions fail without any writes', async () => {
  await setup(); const before = await getAllPlannerEntries(); const schedules = await getAllScheduledItems();
  for (const [patch, consent] of [
    [changes, { confirmed: false }], [changes, { evidence: '  ' }],
    [{ ...changes, accountId: 'missing' }, {}], [{ ...changes, categoryId: 'missing' }, {}],
    [{ ...changes, bucketId: 'missing' }, {}], [{ ...changes, accountId: null }, {}],
    [{ ...changes, type: 'unknown' }, {}], [{ ...changes, actualAmount: 9 }, {}],
    [{ ...changes, scheduledItemId: 'replacement' }, {}],
  ]) {
    await assert.rejects(correctHistoricalSource(key, patch, approval(before[key], consent)));
    assert.deepEqual(await getAllPlannerEntries(), before);
    assert.deepEqual(await getAllScheduledItems(), schedules);
  }
});

test('F4 stale source correction and deleted entry are rejected; audit survives stale ordinary saves and source enrichment', async () => {
  const fixture = await setup(); const original = (await getAllPlannerEntries())[key];
  const first = await correctHistoricalSource(key, changes, approval(original));
  await assert.rejects(correctHistoricalSource(key, { ...changes, accountId: 's' }, approval(original)), /changed since/);
  const second = await correctHistoricalSource(key, { ...changes, categoryId: null }, approval(first));
  assert.equal(second.historicalSourceCorrections.length, 2);
  const routine = await savePlannerEntry(key, { ...original, notes: 'Later note', historicalSourceCorrections: [] });
  assert.deepEqual(routine.historicalSourceCorrections, second.historicalSourceCorrections);
  assert.equal(routine.scheduledItemSnapshot.accountId, 'c');
  assert.equal(snapshotScheduledEntries(fixture.scheduledItems[0], { [key]: routine })[key].scheduledItemSnapshot.accountId, 'c');
  await deletePlannerEntry(key);
  await assert.rejects(correctHistoricalSource(key, changes, approval(routine)), /no longer exists/);
  assert.equal((await getAllPlannerEntries())[key], undefined);
});

test('F4 correction and audit roll back together when the final IndexedDB write fails', async () => {
  await setup(); const before = await getAllPlannerEntries();
  const originalPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (record, ...args) {
    if (this.name === 'plannerEntries' && record.historicalSourceCorrections) throw new Error('Injected write failure');
    return originalPut.call(this, record, ...args);
  };
  try {
    await assert.rejects(correctHistoricalSource(key, changes, approval(before[key])), /Injected write failure/);
  } finally { IDBObjectStore.prototype.put = originalPut; }
  assert.deepEqual(await getAllPlannerEntries(), before);
});

test('F4 historical type and bucket correction changes only the corrected occurrence classification and cumulative totals', async () => {
  const fixture = await setup(); let entries = await getAllPlannerEntries();
  const original = entries[key];
  const saved = await correctHistoricalSource(key, { ...changes, type: 'expense' }, approval(original));
  assert.equal(saved.plannedAmount, 1000); assert.equal(saved.validated, true);
  const data = buildPlannerRows({ ...fixture, plannerEntries: await getAllPlannerEntries() });
  assert.equal(amount(data, 'validated-chequing', '2026-12-30'), -380);
  fixture.savingsBuckets.push({ id: 'other', name: 'Other', startingAmount: 0 });
  await replaceSavingsBuckets(fixture.savingsBuckets);
  const taxKey = 'tax__2026-12-30'; entries = await getAllPlannerEntries();
  const bucketBefore = buildSavingsBucketProjection({ ...fixture, ...buildPlannerRows({ ...fixture, plannerEntries: entries }), plannerEntries: entries });
  await correctHistoricalSource(taxKey, { type: 'transfer', accountId: null, categoryId: null, bucketId: 'other' }, approval(entries[taxKey]));
  const afterEntries = await getAllPlannerEntries();
  const bucketAfter = buildSavingsBucketProjection({ ...fixture, ...buildPlannerRows({ ...fixture, plannerEntries: afterEntries }), plannerEntries: afterEntries });
  assert.equal(bucketAfter[0].balanceByPeriod['2027-01-13'] - bucketBefore[0].balanceByPeriod['2027-01-13'], -100);
  assert.equal(bucketAfter[1].balanceByPeriod['2027-01-13'], 100);
  assert.deepEqual(afterEntries['tax__2027-01-13'], entries['tax__2027-01-13']);
});

test('F4 direct correction of a legacy entry without snapshot and of saved actual line items preserves financial fields', async () => {
  await setup(); const schedules = await getAllScheduledItems(); let entries = await getAllPlannerEntries();
  delete entries[key].scheduledItemSnapshot;
  delete entries[key].scheduledItemSnapshotProvenance;
  await replacePlannerEntries(entries); entries = await getAllPlannerEntries();
  const corrected = await correctHistoricalSource(key, changes, approval(entries[key]));
  assert.equal(corrected.scheduledItemSnapshot.accountId, 'c');
  assert.equal(corrected.plannedAmount, entries[key].plannedAmount);
  assert.equal(corrected.historicalAmountNeedsReview, true);
  const billKey = 'bill__2026-12-30';
  const before = (await getAllPlannerEntries())[billKey];
  const saved = await correctHistoricalSource(billKey,
    { type: 'expense', accountId: 's', categoryId: null, bucketId: null }, approval(before));
  for (const field of ['entryKey', 'scheduledItemId', 'payPeriodDate', 'plannedAmount', 'actualAmount',
    'lineItems', 'notes', 'validated', 'useActual']) assert.deepEqual(saved[field], before[field]);
  assert.equal(saved.lineItems[0].id, before.lineItems[0].id);
  assert.equal(saved.actualAmount, 230); assert.equal(saved.validated, true);
  assert.deepEqual(await getAllScheduledItems(), schedules);
});
