import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { saveScheduledItem, deleteScheduledItem, getAllScheduledItems, replacePlannerEntries,
  getAllPlannerEntries, savePlannerEntry, deletePlannerEntry, saveAppMetadata, getAppMetadata, replaceScheduledItems } from '../src/data/db.js';
import { snapshotScheduledEntries } from '../src/logic/plannerHistory.js';
import { historyFixture } from './fixtures/history-ledger.js';
import { buildPlannerRows } from '../src/logic/projectionLogic.js';
import { createBackupSnapshot, validateBackupFile } from '../src/services/backupService.js';

test('IndexedDB edit/delete/reload retains snapshots, entry IDs, marker and backup portability', async () => {
  const fixture = historyFixture();
  for (const entry of Object.values(fixture.plannerEntries)) delete entry.scheduledItemSnapshot;
  await replaceScheduledItems(fixture.scheduledItems);
  await replacePlannerEntries(fixture.plannerEntries);
  await saveAppMetadata(fixture.appMetadata);
  const originalKeys = Object.keys(await getAllPlannerEntries()).sort();
  const originalItem = fixture.scheduledItems[0];
  const snapshots = snapshotScheduledEntries(originalItem, await getAllPlannerEntries());
  await saveScheduledItem({ ...originalItem, amount: 9000, name: 'New salary' }, snapshots);
  let entries = await getAllPlannerEntries();
  assert.equal(entries['salary__2026-12-30'].scheduledItemSnapshot.name, 'Salary');
  assert.equal(entries['salary__2026-12-30'].plannedAmount, 1000);
  await deleteScheduledItem(originalItem.id, snapshotScheduledEntries(originalItem, entries));
  entries = await getAllPlannerEntries();
  assert.deepEqual(Object.keys(entries).sort(), originalKeys);
  assert.deepEqual((await getAppMetadata()).plannerLastEntryMarker, fixture.appMetadata.plannerLastEntryMarker);
  const data = { ...fixture, scheduledItems: await getAllScheduledItems(), plannerEntries: entries };
  const backup = validateBackupFile(createBackupSnapshot(data));
  assert.equal(backup.valid, true);
  await replacePlannerEntries(backup.data.plannerEntries);
  assert.deepEqual(await getAllPlannerEntries(), entries);
  const planner = buildPlannerRows({ ...data, plannerEntries: await getAllPlannerEntries() });
  assert.equal(planner.rows.find((row) => row.id === 'salary').amountsByPeriod['2026-12-30'], 1000);
});

test('failed source write rolls back all history snapshots', async () => {
  const fixture = historyFixture();
  await replaceScheduledItems(fixture.scheduledItems);
  await replacePlannerEntries(fixture.plannerEntries);
  const before = await getAllPlannerEntries();
  const item = fixture.scheduledItems[0];
  const snapshots = snapshotScheduledEntries(item, before);
  snapshots['salary__2026-12-30'].notes = 'Must roll back';
  await assert.rejects(saveScheduledItem({ ...item, uncloneable: () => {} }, snapshots));
  assert.deepEqual(await getAllPlannerEntries(), before);
  assert.equal((await getAllScheduledItems()).find((row) => row.id === item.id).name, item.name);
});

test('source snapshots never overwrite a later correction or resurrect a cleared entry', async () => {
  const fixture = historyFixture();
  for (const entry of Object.values(fixture.plannerEntries)) delete entry.scheduledItemSnapshot;
  await replaceScheduledItems(fixture.scheduledItems);
  await replacePlannerEntries(fixture.plannerEntries);
  const item = fixture.scheduledItems[0];
  const snapshots = snapshotScheduledEntries(item, fixture.plannerEntries);
  await savePlannerEntry('salary__2026-12-30', { ...fixture.plannerEntries['salary__2026-12-30'],
    notes: 'Newer correction', plannedAmount: 1100 });
  await deletePlannerEntry('salary__2027-01-13');
  await saveScheduledItem({ ...item, amount: 9000 }, snapshots);
  const after = await getAllPlannerEntries();
  assert.equal(after['salary__2026-12-30'].notes, 'Newer correction');
  assert.equal(after['salary__2026-12-30'].plannedAmount, 1100);
  assert.equal(after['salary__2026-12-30'].scheduledItemSnapshot.amount, 1000);
  assert.equal(after['salary__2027-01-13'], undefined);
});
