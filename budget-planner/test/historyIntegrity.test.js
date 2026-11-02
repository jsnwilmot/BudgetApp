import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannerRows, buildSavingsBucketProjection, buildValidatedPlannerBucketActivities } from '../src/logic/projectionLogic.js';
import { getCalculationPeriods, snapshotScheduledEntries, assertSafeCadenceChange } from '../src/logic/plannerHistory.js';
import { generatePayPeriods, parseLocalDate } from '../src/logic/dateLogic.js';
import { getPlannerCellMarker, isPlannerLastEntryMarkerValid } from '../src/logic/plannerLastEntryMarker.js';
import { createBackupSnapshot, validateBackupFile } from '../src/services/backupService.js';
import { buildReportRowsFromPlannerData, buildReportTransferSummary } from '../src/logic/reportLogic.js';
import { historyFixture, ledger } from './fixtures/history-ledger.js';

const value = (data, id, date) => data.projectionRows.find((row) => row.id === id).amountsByPeriod[date];
const buckets = (fixture, data, extra = {}) => buildSavingsBucketProjection({ ...fixture, ...data, today: '2028-02-29', ...extra });

test('CP-01/08/09/10: reference ledger reconciles Dec, Jan and leap-day; source data stays identical', () => {
  const fixture = historyFixture();
  const before = JSON.stringify(fixture);
  const data = buildPlannerRows(fixture);
  const bucket = buckets(fixture, data)[0];
  for (const expected of ledger) {
    assert.equal(value(data, 'projected-chequing', expected.date), expected.projected);
    assert.equal(value(data, 'validated-chequing', expected.date), expected.validated);
    assert.equal(value(data, 'projected-savings', expected.date), expected.savings);
    assert.equal(value(data, 'validated-savings', expected.date), expected.savings);
    assert.equal(bucket.balanceByPeriod[expected.date], expected.savings);
    assert.equal(bucket.validatedBalanceByPeriod[expected.date], expected.savings);
  }
  assert.equal(JSON.stringify(fixture), before);
  fixture.plannerEntries['bill__2026-12-30'].lineItems[0].amount = 250;
  const corrected = buildPlannerRows(fixture);
  assert.equal(value(corrected, 'validated-chequing', '2028-02-29'), 2940);
  assert.equal(fixture.plannerEntries['salary__2027-01-13'].plannedAmount, 1000);
});

test('CP-02/03/04/05: confirmed planned, actual and line-item values survive recurrence changes and deletion', () => {
  const fixture = historyFixture();
  for (const item of fixture.scheduledItems) {
    item.amount *= 10; item.active = true; item.endDate = '2026-06-04'; item.name = 'Renamed';
  }
  let data = buildPlannerRows(fixture);
  assert.equal(data.rows.find((row) => row.id === 'salary').amountsByPeriod['2026-12-30'], 1000);
  assert.equal(data.rows.find((row) => row.id === 'bill').amountsByPeriod['2026-12-30'], 230);
  fixture.scheduledItems = [];
  data = buildPlannerRows(fixture);
  assert.equal(value(data, 'validated-chequing', '2028-02-29'), 2960);
  assert.equal(buckets(fixture, data)[0].currentValidatedBalance, 845);
  assert.equal(data.rows.find((row) => row.id === 'tax').item.name, 'Property tax');
});

test('CP-06/07: shortening forecast does not erase entries or off-screen marker', () => {
  const fixture = historyFixture();
  fixture.settings.projectionMonths = 3;
  const before = JSON.stringify(fixture);
  const data = buildPlannerRows(fixture);
  assert.equal(isPlannerLastEntryMarkerValid(fixture.appMetadata.plannerLastEntryMarker,
    { ...data, plannerEntries: fixture.plannerEntries }), true);
  assert.equal(JSON.stringify(fixture), before);
  assert.equal(isPlannerLastEntryMarkerValid(getPlannerCellMarker('missing', '2026-12-30'),
    { ...data, plannerEntries: fixture.plannerEntries }), false);
});

test('CP-09/10: slicing visible dates retains carry-forward without reapplying starting balances', () => {
  const fixture = historyFixture();
  const data = buildPlannerRows(fixture);
  const window = { ...data, payPeriods: data.payPeriods.filter((period) => period.date >= '2027-01-01') };
  const bucket = buckets(fixture, window)[0];
  assert.equal(bucket.balanceByPeriod['2027-01-13'], 745);
  assert.equal(bucket.currentValidatedBalance, 845);
  const before = buckets(fixture, data, { today: '2026-12-29' })[0];
  assert.equal(before.currentValidatedBalance, 500);
  assert.equal(buckets(fixture, data, { today: '2026-12-30' })[0].currentValidatedBalance, 645);
});

test('CP-11: same-type account transfers net to zero and planner activity is derived only', () => {
  const fixture = historyFixture();
  fixture.accounts.push({ id: 'c2', type: 'chequing', startingBalance: 200 }, { id: 's2', type: 'savings', startingBalance: 50 });
  for (const [from, to] of [['c', 'c2'], ['s', 's2']]) fixture.transfers.push({
    id: `internal-${from}`, fromAccountId: from, toAccountId: to, amount: 70,
    transferType: 'account_transfer', payPeriodDate: '2026-12-30', date: '2026-12-30', validated: true,
  });
  const before = JSON.stringify(fixture);
  const data = buildPlannerRows(fixture);
  assert.equal(value(data, 'projected-chequing', '2026-12-30'), 1820);
  assert.equal(value(data, 'validated-chequing', '2026-12-30'), 1820);
  assert.equal(value(data, 'projected-savings', '2026-12-30'), 695);
  const activity = buildValidatedPlannerBucketActivities({ ...data, plannerEntries: fixture.plannerEntries });
  assert.equal(activity.length, 3);
  assert.ok(activity.every((row) => row.readOnly && row.source === 'planner'));
  assert.equal(JSON.stringify(fixture), before);
});

test('CP-12: cadence changes rejected with dated data; horizon changes and empty setup allowed', () => {
  const fixture = historyFixture();
  const previous = fixture.settings;
  for (const next of [{ ...previous, payPeriodAnchorDate: '2027-01-01' }, { ...previous, payFrequencyDays: 7 }]) {
    assert.throws(() => assertSafeCadenceChange(previous, next, fixture), /locked/);
    assert.doesNotThrow(() => assertSafeCadenceChange(previous, next, {}));
  }
  assert.doesNotThrow(() => assertSafeCadenceChange(previous, { ...previous, projectionMonths: 3 }, fixture));
});

test('CP-04/13: current and legacy backups preserve IDs, keys, financial values and marker on round trip', () => {
  const fixture = historyFixture();
  for (const legacy of [false, true]) {
    const original = structuredClone(fixture);
    if (legacy) for (const entry of Object.values(original.plannerEntries)) delete entry.scheduledItemSnapshot;
    const backup = legacy ? original : createBackupSnapshot(original);
    const restored = validateBackupFile(JSON.parse(JSON.stringify(backup)));
    assert.equal(restored.valid, true);
    assert.deepEqual(Object.keys(restored.data.plannerEntries).sort(), Object.keys(original.plannerEntries).sort());
    for (const [key, entry] of Object.entries(original.plannerEntries)) {
      const actual = restored.data.plannerEntries[key];
      for (const field of ['plannedAmount', 'notes', 'validated', 'lineItems', 'scheduledItemId', 'payPeriodDate']) assert.deepEqual(actual[field], entry[field]);
    }
    assert.deepEqual(restored.data.appMetadata.plannerLastEntryMarker, original.appMetadata.plannerLastEntryMarker);
    const again = validateBackupFile(createBackupSnapshot(restored.data));
    assert.equal(again.valid, true);
    assert.deepEqual(again.data.plannerEntries, restored.data.plannerEntries);
    assert.deepEqual(again.data.accounts, restored.data.accounts);
    assert.equal(value(buildPlannerRows(again.data), 'validated-chequing', '2028-02-29'), 2960);
  }
});

test('snapshot preparation enriches existing entries only, retaining metadata and stable keys', () => {
  const fixture = historyFixture();
  const entries = structuredClone(fixture.plannerEntries);
  delete entries['salary__2026-12-30'].scheduledItemSnapshot;
  const before = JSON.stringify(entries);
  const snapshots = snapshotScheduledEntries(fixture.scheduledItems[0], entries);
  assert.equal(Object.keys(snapshots).length, 4);
  assert.equal(snapshots['salary__2026-12-30'].scheduledItemSnapshot.id, 'salary');
  assert.equal(snapshots['salary__2026-12-30'].plannedAmount, 1000);
  assert.equal(JSON.stringify(entries), before);
});

test('empty state and retained pre-anchor adjustments use one baseline', () => {
  const empty = buildPlannerRows({ settings: historyFixture().settings });
  assert.ok(empty.projectionRows.every((row) => Object.values(row.amountsByPeriod).every((amount) => amount === 0)));
  const fixture = historyFixture();
  fixture.manualAdjustments.push({ id: 'old', accountId: 'c', payPeriodDate: '2026-01-01', amount: 25 });
  assert.equal(value(buildPlannerRows(fixture), 'validated-chequing', '2026-12-30'), 1645);
});

test('cadence IDs remain unchanged across Jan and leap year for 7/14/28/30 day schedules', () => {
  for (const days of [7, 14, 28, 30]) {
    const periods = generatePayPeriods('2027-12-15', days, 6);
    const dates = periods.map((period) => period.date);
    assert.equal(new Set(dates).size, dates.length);
    for (let index = 1; index < dates.length; index++) {
      const left = parseLocalDate(dates[index - 1]); const right = parseLocalDate(dates[index]);
      assert.equal(Math.round((right - left) / 86400000), days);
    }
  }
  assert.deepEqual(getCalculationPeriods([], [], [{ payPeriodDate: '2026-01-01' }]), []);
});

test('Reports use the same retained classification and amounts as account/bucket projections', () => {
  const fixture = historyFixture();
  fixture.scheduledItems[1].type = 'expense'; fixture.scheduledItems[1].bucketId = null;
  const data = buildPlannerRows(fixture);
  const reports = buildReportRowsFromPlannerData(data);
  const december = reports.find((row) => row.payPeriodDate === '2026-12-30');
  assert.equal(december.income, 1000); assert.equal(december.expenses, 230); assert.equal(december.transfersIn, 100);
  const movement = buildReportTransferSummary({ ...fixture, plannerData: data,
    selectedView: 'payPeriod', selectedPayPeriod: '2026-12-30' });
  assert.equal(movement.plannedToSavings, 100);
  assert.equal(movement.validatedPlannerTransfers, 100);
  assert.equal(movement.transferRecordsIn, 40);
});

test('Reports preserve distinct equal-value manual transfers and dedupe repeated source IDs only', async () => {
  const { dedupeSavingsMovements } = await import('../src/logic/reportLogic.js');
  const transfer = { id: 'one', transferType: 'to_savings_bucket', payPeriodDate: '2026-12-30', bucketId: 'tax-bucket', amount: 40 };
  const another = { ...transfer, id: 'two' };
  const adjustment = { id: 'one', payPeriodDate: '2026-12-30', bucketId: 'tax-bucket', amount: 40 };
  assert.deepEqual(dedupeSavingsMovements([transfer, another, transfer, adjustment]), [transfer, another, adjustment]);
});

test('frozen versioned current and legacy JSON backups survive normalized round trips', async () => {
  const { readFileSync } = await import('node:fs');
  for (const name of ['current-backup', 'legacy-backup']) {
    const json = JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
    const imported = validateBackupFile(json);
    assert.equal(imported.valid, true);
    const exported = createBackupSnapshot(imported.data);
    assert.equal(exported.exportVersion, 1); assert.equal(exported.schemaVersion, 2);
    const restored = validateBackupFile(JSON.parse(JSON.stringify(exported)));
    assert.deepEqual(restored.data.plannerEntries, imported.data.plannerEntries);
    assert.deepEqual(restored.data.accounts, imported.data.accounts);
    assert.deepEqual(restored.data.appMetadata.plannerLastEntryMarker, imported.data.appMetadata.plannerLastEntryMarker);
  }
});

test('retained non-cadence dates reconcile current account and bucket cutoff; pre-anchor current is empty', async () => {
  const { getCurrentPayPeriod } = await import('../src/logic/projectionLogic.js');
  const fixture = historyFixture(); const data = buildPlannerRows(fixture);
  const current = getCurrentPayPeriod(data.calculationPeriods, '2028-02-29');
  assert.equal(value(data, 'projected-savings', current.date), buckets(fixture, data)[0].currentProjectedBalance);
  assert.equal(getCurrentPayPeriod(data.payPeriods, '2026-01-01'), null);
  assert.equal(buckets(fixture, data, { today: '2026-01-01' })[0].currentValidatedBalance, 500);
});

test('monthly due-day 31 and yearly recurrence keep their placement when dated adjustments are inserted', () => {
  const fixture = historyFixture(); fixture.plannerEntries = {};
  fixture.scheduledItems = [
    { id: 'monthly', name: 'Month end', type: 'expense', accountId: 'c', amount: 30, frequency: 'monthly', dueDay: 31, startDate: '2026-06-03', active: true },
    { id: 'annual', name: 'Leap anniversary', type: 'expense', accountId: 'c', amount: 50, frequency: 'yearly', dueMonth: 2, dueDay: 29, startDate: '2026-06-03', active: true },
  ];
  const before = buildPlannerRows(fixture);
  fixture.manualAdjustments.push({ id: 'arbitrary-date', accountId: 'c', payPeriodDate: '2028-02-28', amount: 1 });
  const after = buildPlannerRows(fixture);
  for (const row of before.rows) for (const period of before.payPeriods) {
    assert.equal(after.rows.find((candidate) => candidate.id === row.id).amountsByPeriod[period.date], row.amountsByPeriod[period.date]);
  }
  assert.equal(after.rows.find((row) => row.id === 'monthly').amountsByPeriod['2028-02-23'], 30);
  assert.equal(after.rows.find((row) => row.id === 'annual').amountsByPeriod['2028-02-23'], 50);
});

test('ten years of retained history do not expand the rendered forecast or write records', () => {
  const fixture = historyFixture(); fixture.settings.projectionMonths = 3;
  const item = fixture.scheduledItems[1];
  for (let year = 2016; year < 2026; year++) {
    fixture.plannerEntries[`tax__${year}-12-30`] = { plannedAmount: 10, validated: true, useActual: false,
      scheduledItemId: 'tax', payPeriodDate: `${year}-12-30`, scheduledItemSnapshot: item };
  }
  const before = JSON.stringify(fixture); const data = buildPlannerRows(fixture);
  assert.ok(data.payPeriods.length <= 8);
  assert.equal(value(data, 'projected-savings', data.payPeriods[0].date), 600);
  assert.equal(JSON.stringify(fixture), before);
});

test('legacy confirmed amounts without snapshots are flagged for review; retained deleted sources are legitimate', async () => {
  const { getDataHealthDetails } = await import('../src/data/migrations.js');
  const fixture = historyFixture();
  fixture.scheduledItems = [];
  let health = getDataHealthDetails(fixture);
  assert.equal(health.allIssues.some((issue) => issue.title === 'Planner entries reference missing scheduled items'), false);
  delete fixture.plannerEntries['salary__2026-12-30'].plannedAmount;
  health = getDataHealthDetails(fixture);
  assert.ok(health.allIssues.some((issue) => issue.title === 'Historical confirmed amounts need review'));
  const item = fixture.plannerEntries['salary__2026-12-30'].scheduledItemSnapshot;
  const snapshots = snapshotScheduledEntries(item, fixture.plannerEntries);
  assert.equal(snapshots['salary__2026-12-30'].historicalAmountNeedsReview, true);
});

test('12-month baseline retains December/January ledger values and stable source keys', () => {
  const fixture = historyFixture(); fixture.settings.projectionMonths = 12;
  const before = JSON.stringify(fixture);
  const data = buildPlannerRows(fixture);
  for (const expected of ledger.slice(0, 2)) {
    assert.equal(value(data, 'validated-chequing', expected.date), expected.validated);
    assert.equal(value(data, 'projected-savings', expected.date), expected.savings);
  }
  assert.equal(JSON.stringify(fixture), before);
});
