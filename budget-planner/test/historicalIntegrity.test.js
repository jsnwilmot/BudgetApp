import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';

// Resolve the app's Vite-style relative imports in this Node test.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !extname(specifier)) {
      return nextResolve(`${specifier}.js`, context);
    }
    return nextResolve(specifier, context);
  },
});
const {
  buildExportPlannerRows, buildPlannerRows, buildSavingsBucketProjection,
  buildValidatedPlannerBucketActivities, getDashboardSummary, getPlannerPeriodSource,
} = await import('../src/logic/projectionLogic.js');
const { buildReportRowsFromPlannerData, buildReportTransferSummary } =
  await import('../src/logic/reportLogic.js');
const { buildTransactionsFromAppData } = await import('../src/logic/transactionLogic.js');
const { capturePlannerSource, getSavedPlannerEntriesBeforeAnchor, preserveLegacyPlannerSource } =
  await import('../src/logic/plannerHistory.js');
const { normalizePlannerEntriesRecord } = await import('../src/data/migrations.js');
hooks.deregister();

const first = '2026-06-03';
const second = '2026-06-17';
const rent = {
  id: 'rent', name: 'Synthetic rent', type: 'expense', accountId: 'cash', categoryId: 'housing',
  amount: 1200, active: true, frequency: 'biweekly', startDate: first,
};
const accounts = [
  { id: 'cash', type: 'chequing', startingBalance: 1265 },
  { id: 'bank', type: 'savings', startingBalance: 75 },
];
const settings = {
  payPeriodAnchorDate: first, payFrequencyDays: 14, projectionMonths: 12,
};
const defaults = { settings, accounts, manualAdjustments: [], today: first };

function entry(item, details = {}) {
  return {
    entryKey: `${item.id}__${first}`, scheduledItemId: item.id, payPeriodDate: first,
    plannedAmount: item.amount, useActual: false, validated: true,
    scheduledItemSnapshot: capturePlannerSource(item),
    scheduledItemSnapshotProvenance: 'captured-at-entry-save', ...details,
  };
}

function withEntries(...entries) {
  return Object.fromEntries(entries.map((record) => [record.entryKey, record]));
}

function balance(planner, id, date = first) {
  return planner.projectionRows.find((row) => row.id === id).amountsByPeriod[date];
}

test('CP-03 and CP-05: rent stays at 1200 and validated chequing stays at 65', () => {
  const confirmedRent = entry(rent);
  const draft = {
    ...confirmedRent, entryKey: 'rent__2026-07-15', payPeriodDate: '2026-07-15',
    validated: false, useActual: true, actualAmount: 1700, notes: 'Saved draft',
  };
  const plannerEntries = withEntries(confirmedRent, draft);
  for (const [changes, expectedNext] of [
    [{ amount: 1700 }, 1700],
    [{ amount: 1700, active: false }, 0],
    [{ amount: 1700, endDate: second }, 1700],
    [{ amount: 1700, frequency: 'yearly', startDate: '2026-09-01' }, 0],
  ]) {
    const saved = structuredClone(plannerEntries);
    const data = buildPlannerRows({ ...defaults, scheduledItems: [{ ...rent, ...changes }], plannerEntries });
    assert.equal(data.rows[0].amountsByPeriod[first], 1200);
    assert.equal(balance(data, 'projected-chequing'), 65);
    assert.equal(balance(data, 'validated-chequing'), 65);
    assert.equal(balance(data, 'validated-chequing', second), 65);
    assert.equal(data.rows[0].amountsByPeriod[second], expectedNext);
    if (changes.endDate || changes.active === false) {
      assert.equal(data.rows[0].amountsByPeriod['2026-07-15'], 0);
    }
    assert.deepEqual(plannerEntries, saved);
  }
});

test('CP-02 and CP-04: actual and line-item amounts, dates and annotations survive schedule changes', () => {
  const power = { ...rent, id: 'power', amount: 70 };
  const rentActual = entry(rent, { useActual: true, actualAmount: 1150 });
  const powerActual = entry(power, {
    useActual: true, actualAmount: 99, notes: 'Breakdown',
    lineItems: [{ id: 'electricity', amount: 31.25 }, { id: 'delivery', amount: 13.50 }],
  });
  const plannerEntries = withEntries(rentActual, powerActual);
  const schedules = [
    { ...rent, amount: 1700 },
    { ...power, amount: 100, active: false, allowLineItems: false },
  ];
  const data = buildPlannerRows({ ...defaults, scheduledItems: schedules, plannerEntries });
  assert.deepEqual(data.rows.map((row) => row.amountsByPeriod[first]), [1150, 44.75]);
  assert.equal(balance(data, 'validated-chequing'), 70.25);
  assert.deepEqual(plannerEntries, withEntries(rentActual, powerActual));
});

test('D-F1: pre-anchor records are discoverable without altering anchored financial calculations', () => {
  const original = entry(rent);
  const saved = entry(rent, {
    entryKey: 'rent__2025-11-05', payPeriodDate: '2025-11-05',
    plannedAmount: 1300, actualAmount: 82.75, useActual: true,
    notes: 'Synthetic receipt', lineItems: [{ id: 'charge', amount: 82.75 }],
  });
  const legacy = { entryKey: 'retired__2023-10-25', plannedAmount: 40, validated: true };
  const sameYear = { ...saved, entryKey: 'rent__2026-01-14', payPeriodDate: '2026-01-14' };
  const inconsistent = { ...saved, entryKey: 'wrong-source__2025-11-05' };
  const invalid = { ...legacy, entryKey: 'retired__2025-02-29' };
  const plannerEntries = withEntries(original, saved, sameYear, legacy, inconsistent, invalid);
  const before = structuredClone(plannerEntries);
  assert.deepEqual(getSavedPlannerEntriesBeforeAnchor(plannerEntries, first), [
    { id: 'retired', date: '2023-10-25', key: legacy.entryKey, entry: legacy },
    { id: 'rent', date: '2025-11-05', key: saved.entryKey, entry: saved },
    { id: 'rent', date: '2026-01-14', key: sameYear.entryKey, entry: sameYear },
  ]);
  assert.deepEqual(getSavedPlannerEntriesBeforeAnchor(plannerEntries, 'invalid-anchor'), []);
  assert.deepEqual(getSavedPlannerEntriesBeforeAnchor(withEntries(original), first), []);

  const inputs = { ...defaults, scheduledItems: [rent], throughYear: 2025 };
  const current = buildPlannerRows({ ...inputs, plannerEntries: withEntries(original) });
  const withHistory = buildPlannerRows({ ...inputs, plannerEntries });
  assert.deepEqual(withHistory, current);
  assert.deepEqual(getDashboardSummary(withHistory), getDashboardSummary(current));
  assert.equal(balance(withHistory, 'validated-chequing'), 65);
  assert.deepEqual(plannerEntries, before);
});

test('the existing cadence carries confirmed December and January amounts across the year boundary', () => {
  const anchor = '2026-12-23';
  const january = '2027-01-06';
  const original = { ...rent, amount: 100, startDate: anchor };
  const plannerEntries = withEntries(...[anchor, january].map((date) =>
    entry(original, { entryKey: `rent__${date}`, payPeriodDate: date })));
  const data = buildPlannerRows({
    ...defaults,
    settings: { ...settings, payPeriodAnchorDate: anchor },
    scheduledItems: [{ ...original, amount: 200, endDate: anchor }],
    plannerEntries,
  });
  assert.deepEqual(data.payPeriods.slice(0, 3).map(({ date }) => date),
    [anchor, january, '2027-01-20']);
  assert.equal(balance(data, 'validated-chequing', anchor), 1165);
  assert.equal(balance(data, 'validated-chequing', january), 1065);
  assert.equal(data.rows[0].amountsByPeriod['2027-01-20'], 0);
});

test('Planner, Dashboard, Reports and buckets apply the original source and distinct movements once', () => {
  const salary = { ...rent, id: 'salary', type: 'income', amount: 500, categoryId: 'salary' };
  const saving = { ...rent, id: 'saving', type: 'transfer', bucketId: 'old-bucket', amount: 100 };
  const plannerEntries = withEntries(entry(salary), entry(saving), entry(rent));
  const scheduledItems = [
    { ...salary, accountId: 'bank', amount: 600 },
    { ...saving, bucketId: 'new-bucket', amount: 150 },
    { ...rent, accountId: 'bank', categoryId: 'other', type: 'income', amount: 1700 },
  ];
  const savingsBuckets = [{ id: 'old-bucket', startingAmount: 20 }, { id: 'new-bucket', startingAmount: 5 }];
  const transfers = [{
    id: 'manual-transfer', transferType: 'to_savings_bucket', bucketId: 'old-bucket',
    fromAccountId: 'cash', toAccountId: 'bank', payPeriodDate: first, date: first,
    amount: 40, validated: true,
  }];
  const savingsBucketAdjustments = [{ id: 'allocation', bucketId: 'old-bucket', amount: 3, payPeriodDate: first }];
  const manualAdjustments = [{ id: 'fee', accountId: 'cash', payPeriodDate: first, amount: -10 }];
  const inputs = {
    ...defaults, scheduledItems, plannerEntries, savingsBuckets, transfers,
    savingsBucketAdjustments, manualAdjustments,
  };
  const data = buildPlannerRows(inputs);
  assert.equal(balance(data, 'validated-chequing'), 415);
  assert.equal(balance(data, 'projected-chequing'), 415);
  assert.equal(balance(data, 'projected-savings'), 218);
  assert.equal(getDashboardSummary(data).projectedChequingAfterNext, 415);
  assert.equal(getDashboardSummary(data).nextIncome, 500);
  assert.equal(getDashboardSummary(data).nextTransfers, 140);
  assert.equal(getPlannerPeriodSource(data.rows[2], first).categoryId, 'housing');
  assert.equal(getPlannerPeriodSource(data.rows[2], second).categoryId, 'other');
  const exportRow = buildExportPlannerRows(data)[0];
  assert.equal(exportRow.remainingBalance, 415);
  assert.equal(exportRow.fixedExpenses, 1300);
  const report = buildReportRowsFromPlannerData(data)[0];
  assert.deepEqual([report.income, report.expenses, report.transfersIn, report.remainingBalance],
    [500, 1200, 100, 415]);
  const summary = buildReportTransferSummary({
    ...inputs, plannerData: data, selectedView: 'payPeriod', selectedPayPeriod: first,
  });
  assert.deepEqual([summary.validatedPlannerTransfers, summary.transferRecordsIn,
    summary.bucketAdjustments, summary.netSavingsMovement], [100, 40, 3, 143]);
  assert.equal(summary.activityRows.filter((row) => row.source === 'Planner').length, 1);
  const buckets = buildSavingsBucketProjection({ ...inputs, ...data });
  assert.equal(buckets[0].validatedBalanceByPeriod[first], 163);
  assert.equal(buckets[1].validatedBalanceByPeriod[first], 5);
  const activity = buildValidatedPlannerBucketActivities({ ...data, plannerEntries });
  assert.deepEqual(activity.map(({ amount, bucketId, readOnly }) => [amount, bucketId, readOnly]),
    [[100, 'old-bucket', true]]);
  const transactions = buildTransactionsFromAppData({ ...inputs, currentDate: new Date(2026, 5, 17) });
  assert.equal(transactions.filter((record) => record.source === 'transfer').length, 1);
  assert.deepEqual(transactions.filter((record) => record.source === 'scheduled-item')
    .map(({ sourceId, amount }) => [sourceId, amount]), [['salary', 600], ['saving', 150], ['rent', 1700]]);
});

test('legacy evidence stays unverified and an unavailable amount never becomes confirmed', () => {
  const legacy = {
    entryKey: 'rent__2026-06-03', validated: true, useActual: false, plannedAmount: 1200,
  };
  const captured = preserveLegacyPlannerSource(legacy, rent);
  assert.deepEqual(captured, {
    ...legacy, scheduledItemSnapshot: capturePlannerSource(rent),
    scheduledItemSnapshotProvenance: 'unverified-current-source',
  });
  assert.equal(preserveLegacyPlannerSource(captured, { ...rent, accountId: 'bank' }), captured);
  const project = (record) => buildPlannerRows({
    ...defaults, scheduledItems: [{ ...rent, accountId: 'bank', amount: 1700 }],
    plannerEntries: normalizePlannerEntriesRecord([record]),
  });
  const known = project(captured);
  assert.equal(balance(known, 'validated-chequing'), 65);
  assert.equal(known.rows[0].historyWarningsByPeriod[first].source, 'Source unverified');
  for (const unknown of [
    { ...legacy, plannedAmount: undefined },
    { ...captured, useActual: true, actualAmount: 'unknown' },
    { ...captured, lineItems: [{ id: 'line', amount: false }] },
    { ...captured, historicalAmountNeedsReview: true },
  ]) {
    const data = project(unknown);
    assert.equal(balance(data, 'validated-chequing'), 1265);
    assert.equal(data.rows[0].historyWarningsByPeriod[first].amount, 'Amount needs review');
  }
  const conflict = project({ ...captured, scheduledItemId: 'another-schedule' });
  assert.equal(balance(conflict, 'validated-chequing'), 1265);
  assert.equal(conflict.rows[0].historyWarningsByPeriod[first].source, 'Source conflict');
});
