import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSavingsAccounts, soleAccountId, defaultScheduledAccountId, bucketAccountStatus, bucketRevision } from '../src/logic/accountConfiguration.js';
import { replaceAccounts, replaceSavingsBuckets, replaceScheduledItems, replacePlannerEntries, saveSavingsBucket, saveScheduledItem,
  getAllSavingsBuckets, getAllPlannerEntries, getAllScheduledItems } from '../src/data/db.js';
import { buildReportRowsFromPlannerData } from '../src/logic/reportLogic.js';
import { historyFixture } from './fixtures/history-ledger.js';
import { buildPlannerRows, buildSavingsBucketProjection } from '../src/logic/projectionLogic.js';
import { createBackupSnapshot, validateBackupFile } from '../src/services/backupService.js';
const accounts = [{ id: 'custom-saving', name: 'My Reserve', type: 'savings', active: true },
  { id: 'custom-chequing', name: 'Everyday', type: 'chequing', active: true },
  { id: 'archived', name: 'Old', type: 'savings', active: false }];
const bucket = (id, linkedAccountId = 'custom-saving') => ({ id, name: 'Reserve', linkedAccountId, startingAmount: 0, active: true });
test('Issue 11: actual custom savings choices handle zero, one, multiple and inactive accounts', () => {
  assert.equal(soleAccountId(activeSavingsAccounts([])), '');
  assert.equal(soleAccountId(activeSavingsAccounts(accounts)), 'custom-saving');
  assert.equal(soleAccountId(activeSavingsAccounts([...accounts, { id: 'second', type: 'savings' }])), '');
  assert.equal(soleAccountId(activeSavingsAccounts([accounts[2]])), '');
  assert.equal(defaultScheduledAccountId(accounts), 'custom-chequing');
  assert.equal(defaultScheduledAccountId([{ id: 'misleading', name: 'Main Chequing', type: 'savings' }]), '');
  assert.equal(defaultScheduledAccountId([...accounts, { id: 'another', type: 'chequing' }]), '');
});
test('Issue 11: new bucket validates against current active savings references and rolls back invalid writes', async () => {
  await replaceSavingsBuckets([]); await replaceAccounts(accounts);
  for (const id of ['', 'acct-savings', 'archived', 'custom-chequing']) {
    await assert.rejects(saveSavingsBucket(bucket('bad', id), { expectedRevision: null }), /active savings account/);
    assert.deepEqual(await getAllSavingsBuckets(), []);
  }
  const saved = await saveSavingsBucket(bucket('new'), { expectedRevision: null });
  assert.equal(saved.linkedAccountId, 'custom-saving');
  await replaceAccounts([]);
  await assert.rejects(saveSavingsBucket(bucket('deleted-after-open'), { expectedRevision: null }), /active savings account/);
  assert.equal((await getAllSavingsBuckets()).length, 1);
});
test('Issue 11: existing missing, inactive and wrong-type associations remain readable and never remapped', async () => {
  await replaceAccounts(accounts);
  await replaceSavingsBuckets([bucket('legacy', 'acct-savings'), bucket('inactive', 'archived'), bucket('wrong', 'custom-chequing')]);
  const records = await getAllSavingsBuckets();
  assert.match(bucketAccountStatus(records[0], accounts), /inactive|Missing|not a savings/);
  for (const prior of records) {
    assert.match(bucketAccountStatus(prior, accounts), /inactive|Missing|not a savings/);
    await saveSavingsBucket({ ...prior, notes: 'Explicit ordinary edit' }, { expectedRevision: bucketRevision(prior) });
    await assert.rejects(saveSavingsBucket({ ...prior, linkedAccountId: 'custom-saving' }), /separately reviewed repair/);
  }
  const saved = await getAllSavingsBuckets();
  for (const prior of records) assert.equal(saved.find((value) => value.id === prior.id).linkedAccountId, prior.linkedAccountId);
});
test('Issue 11: concurrent bucket edit, deleted bucket and duplicate new submission reject stale writes', async () => {
  await replaceAccounts(accounts); await replaceSavingsBuckets([bucket('stale')]);
  const prior = (await getAllSavingsBuckets())[0]; const expectedRevision = bucketRevision(prior);
  await saveSavingsBucket({ ...prior, notes: 'Other tab' }, { expectedRevision });
  const latest = await getAllSavingsBuckets();
  await assert.rejects(saveSavingsBucket({ ...prior, startingAmount: 999 }, { expectedRevision }), /changed since/);
  assert.deepEqual(await getAllSavingsBuckets(), latest);
  await replaceSavingsBuckets([]);
  await assert.rejects(saveSavingsBucket(prior, { expectedRevision }), /changed since/);
  await saveSavingsBucket(bucket('new'), { expectedRevision: null });
  await assert.rejects(saveSavingsBucket(bucket('new'), { expectedRevision: null }), /changed since/);
});
test('Issue 11: scheduled creation and explicit reference changes validate current accounts; unrelated legacy edits retain old IDs', async () => {
  await replaceAccounts(accounts); await replaceScheduledItems([]);
  const item = { id: 'source', name: 'Bill', type: 'expense', accountId: 'missing', amount: 10 };
  await assert.rejects(saveScheduledItem(item), /active account/);
  await assert.rejects(saveScheduledItem({ ...item, accountId: 'archived' }), /active account/);
  await saveScheduledItem({ ...item, accountId: 'custom-chequing' });
  await replaceScheduledItems([item]);
  await saveScheduledItem({ ...item, name: 'Ordinary edit' });
  assert.equal((await getAllScheduledItems())[0].accountId, 'missing');
  await assert.rejects(saveScheduledItem({ ...item, accountId: 'other-missing' }), /active account/);
  await replaceAccounts([]);
  await assert.rejects(saveScheduledItem({ ...item, id: 'new', accountId: 'custom-chequing' }), /active account/);
});
test('Issue 11: preventative new zero bucket and diagnostics preserve historical values, totals, markers, audits and JSON compatibility', async () => {
  const fixture = historyFixture();
  const key = 'salary__2026-12-30';
  fixture.plannerEntries[key].historicalSourceCorrections = [{ evidence: 'Synthetic original statement', previousSource: { accountId: 'old' } }];
  await replaceAccounts(fixture.accounts); await replaceSavingsBuckets(fixture.savingsBuckets);
  await replaceScheduledItems(fixture.scheduledItems); await replacePlannerEntries(fixture.plannerEntries);
  const entries = await getAllPlannerEntries(); const schedules = await getAllScheduledItems();
  const before = buildPlannerRows(fixture); const source = structuredClone(fixture);
  fixture.savingsBuckets.forEach((value) => bucketAccountStatus(value, fixture.accounts));
  assert.deepEqual(fixture, source);
  const saved = await saveSavingsBucket(bucket('new-zero', 's'), { expectedRevision: null });
  const afterData = { ...fixture, savingsBuckets: [...fixture.savingsBuckets, saved] };
  assert.deepEqual(buildPlannerRows(afterData), before);
  const project = (data) => buildSavingsBucketProjection({ ...data, ...buildPlannerRows(data), today: '2026-12-30' });
  assert.equal(project(afterData).find((value) => value.bucket.id === 'tax-bucket').currentValidatedBalance,
    project(fixture).find((value) => value.bucket.id === 'tax-bucket').currentValidatedBalance);
  assert.deepEqual(await getAllPlannerEntries(), entries); assert.deepEqual(await getAllScheduledItems(), schedules);
  const restored = validateBackupFile(JSON.parse(JSON.stringify(createBackupSnapshot(afterData))));
  assert.equal(restored.valid, true);
  assert.deepEqual(restored.data.plannerEntries[key].historicalSourceCorrections, fixture.plannerEntries[key].historicalSourceCorrections);
  assert.deepEqual(restored.data.appMetadata.plannerLastEntryMarker, fixture.appMetadata.plannerLastEntryMarker);
  for (const [entryKey, entry] of Object.entries(fixture.plannerEntries)) {
    for (const field of ['entryKey', 'scheduledItemId', 'payPeriodDate', 'plannedAmount', 'actualAmount', 'validated', 'lineItems']) {
      assert.deepEqual(restored.data.plannerEntries[entryKey][field], entry[field]);
    }
  }
});

test('Issue 11 proposal: synthetic isolated impact calculation distinguishes bucket link and historical account repair', () => {
  const original = historyFixture(); const key = 'salary__2026-12-30';
  original.savingsBuckets[0].linkedAccountId = 'missing-savings';
  original.plannerEntries[key].scheduledItemSnapshot.accountId = 'missing-chequing';
  const untouched = structuredClone(original);
  const metrics = (data) => {
    const planner = buildPlannerRows(data); const at = (id) => planner.projectionRows.find((row) => row.id === id).amountsByPeriod['2026-12-30'];
    const report = buildReportRowsFromPlannerData(planner).find((row) => row.payPeriodDate === '2026-12-30');
    return { chequing: at('validated-chequing'), savings: at('validated-savings'),
      bucket: buildSavingsBucketProjection({ ...data, ...planner, today: '2026-12-30' })[0].currentValidatedBalance,
      income: report.income, expenses: report.expenses, reportBalance: report.remainingBalance };
  };
  const bucketOnly = structuredClone(original); bucketOnly.savingsBuckets[0].linkedAccountId = 's';
  const historical = structuredClone(bucketOnly); historical.plannerEntries[key].scheduledItemSnapshot.accountId = 's';
  assert.deepEqual(metrics(original), { chequing: 1620, savings: 645, bucket: 645, income: 1000, expenses: 230, reportBalance: 1620 });
  assert.deepEqual(metrics(bucketOnly), metrics(original));
  assert.deepEqual(metrics(historical), { chequing: 620, savings: 1645, bucket: 645, income: 1000, expenses: 230, reportBalance: 620 });
  assert.deepEqual(original, untouched); // No storage command or real-data repair.
});
