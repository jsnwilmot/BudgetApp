import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { extname } from 'node:path';
import test from 'node:test';
import { addMonths, formatDateKey, getPlannerPeriods } from '../src/logic/dateLogic.js';

const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier.startsWith('.') && !extname(specifier) ? `${specifier}.js` : specifier, context);
  },
});
const { buildPlannerRows, buildSavingsBucketProjection, getDashboardSummary } =
  await import('../src/logic/projectionLogic.js');
const { getLowBalanceAlerts } = await import('../src/logic/alertLogic.js');
hooks.deregister();

const anchor = '2026-06-03';
const boundaries = ['2026-11-30', '2026-12-01', '2027-01-01'];
const dayMilliseconds = 86_400_000;

function referenceDates(first, last, frequency) {
  const dates = [];
  for (let time = Date.parse(first); time <= Date.parse(last); time += frequency * dayMilliseconds) {
    dates.push(new Date(time).toISOString().slice(0, 10));
  }
  return dates;
}

for (const [months, novemberEnd, januaryEnd] of [
  [3, '2027-02-18', '2027-03-30'],
  [6, '2027-05-18', '2027-06-30'],
  [12, '2027-11-18', '2027-12-30'],
  [18, '2028-05-18', '2028-06-30'],
  [24, '2028-11-18', '2028-12-30'],
]) {
  test(`CP-14–17, CP-24: ${months}-month forecast stays separate at all three boundaries`, () => {
    const outcomes = boundaries.map((today) => getPlannerPeriods(anchor, 14, months, today));
    const whole2027 = referenceDates(anchor, '2027-12-31', 14).filter((date) => date.startsWith('2027-'));
    for (const [index, result] of outcomes.entries()) {
      const forecastEnd = index === 2 ? januaryEnd : novemberEnd;
      const forecastStart = index === 2 ? '2026-12-30' : '2026-11-18';
      const coverEnd = index === 0 || forecastEnd > '2027-12-31' ? forecastEnd : '2027-12-31';
      assert.equal(result.calculationEndDate, coverEnd);
      assert.equal(result.forecastEndDate, forecastEnd);
      assert.equal(result.currentPayPeriod.date, forecastStart);
      assert.deepEqual(result.forecastPayPeriods.map(({ date }) => date),
        referenceDates(forecastStart, forecastEnd, 14));
      const dates = result.payPeriods.map(({ date }) => date);
      assert.deepEqual(dates, referenceDates(anchor, coverEnd, 14));
      assert.equal(new Set(dates).size, dates.length);
      if (index > 0 || months >= 18) {
        assert.deepEqual(dates.filter((date) => date.startsWith('2027-')), whole2027);
      } else {
        assert.ok(dates.filter((date) => date.startsWith('2027-')).length < whole2027.length);
      }
    }
    for (let index = 1; index < outcomes.length; index++) {
      const previous = outcomes[index - 1].payPeriods;
      assert.deepEqual(outcomes[index].payPeriods.slice(0, previous.length), previous);
    }
    const later = getPlannerPeriods(anchor, 14, months, '2027-12-01');
    assert.ok(later.calculationEndDate >= '2028-12-31');
    assert.deepEqual(later.payPeriods.filter(({ date }) => date.startsWith('2028-')).map(({ date }) => date),
      referenceDates(anchor, '2028-12-31', 14).filter((date) => date.startsWith('2028-')));
  });
}

test('calendar month arithmetic clamps local day, including leap years and backward rollover', () => {
  for (const [year, month, day, offset, expected] of [
    [2027, 0, 31, 1, '2027-02-28'],
    [2028, 0, 31, 1, '2028-02-29'],
    [2026, 11, 31, 2, '2027-02-28'],
    [2028, 2, 31, -1, '2028-02-29'],
  ]) {
    const input = new Date(year, month, day, 23, 15);
    const moved = addMonths(input, offset);
    assert.equal(formatDateKey(moved), expected);
    assert.equal(moved.getHours(), 23);
    assert.equal(moved.getMinutes(), 15);
    assert.equal(input.getDate(), day);
  }
});

test('CP-18: weekly, biweekly, 28- and 30-day starts keep the anchored cadence across years', () => {
  for (const frequency of [7, 14, 28, 30]) {
    const result = getPlannerPeriods(anchor, frequency, 3, '2028-01-01');
    assert.deepEqual(result.payPeriods.map(({ date }) => date),
      referenceDates(anchor, result.calculationEndDate, frequency));
  }
});

const settings = { payPeriodAnchorDate: anchor, payFrequencyDays: 14, projectionMonths: 3 };
const chequing = { id: 'cash', type: 'chequing', startingBalance: 1265 };
const savings = { id: 'bank', type: 'savings', startingBalance: 75 };
const bucket = { id: 'bucket', startingAmount: 20 };

function schedule(id, type, amount, startDate, rest = {}) {
  return { id, name: id, type, amount, startDate, frequency: 'once', accountId: 'cash', ...rest };
}

function balance(data, id, date) {
  return data.projectionRows.find((row) => row.id === id).amountsByPeriod[date];
}

test('CP-19 and CP-20: month-end and yearly assignments respect cadence and the tail cutoff', () => {
  const leapSettings = { ...settings, payPeriodAnchorDate: '2028-01-04' };
  const monthly = schedule('monthly', 'expense', 17, '2028-01-31',
    { frequency: 'monthly', dueDay: 31, endDate: '2028-02-29' });
  const yearly = schedule('yearly', 'expense', 22, '2028-02-29',
    { frequency: 'yearly', dueDay: 29, dueMonth: 2, endDate: '2028-02-29' });
  const tail = schedule('tail', 'expense', 6, '2029-02-18');
  const inputs = { accounts: [chequing], manualAdjustments: [], scheduledItems: [monthly, yearly, tail] };
  // February 29 is a pay start. Previous pays it on February 15; same uses February 29.
  for (const [rule, placement] of [
    ['previous-pay-period', '2028-02-15'], ['same-pay-period', '2028-02-29'],
  ]) {
    const config = { ...leapSettings, monthlyBillAssignmentRule: rule };
    const before = buildPlannerRows({ ...inputs, settings: config, today: '2028-11-30' });
    const after = buildPlannerRows({ ...inputs, settings: config, today: '2028-12-01' });
    assert.equal(before.rows[0].plannedByPeriod[placement], 17);
    assert.equal(before.rows[1].plannedByPeriod['2028-02-15'], 22);
    assert.equal(Object.values(after.rows[0].plannedByPeriod).filter(Boolean).length, 2);
    assert.equal(Object.values(after.rows[1].plannedByPeriod).filter(Boolean).length, 1);
    const last = before.payPeriods.at(-1).date;
    assert.equal(before.rows[2].plannedByPeriod[last], 6);
    for (const row of before.projectionRows) {
      assert.equal(balance(after, row.id, last), balance(before, row.id, last));
    }
  }
});

test('CP-21: December to January carries each balance and movement once', () => {
  const december = '2026-12-30';
  const january = '2027-01-13';
  const originalRent = schedule('rent', 'expense', 1200, anchor);
  const income = schedule('salary', 'income', 500, december);
  const contribution = schedule('contribution', 'transfer', 100, december, { bucketId: bucket.id });
  const nextIncome = schedule('new-salary', 'income', 125, january);
  const nextExpense = schedule('new-bill', 'expense', 20, january);
  const scheduledItems = [
    { ...originalRent, active: false, amount: 1700 }, income,
    { ...contribution, endDate: december }, nextIncome, nextExpense,
  ];
  const plannerEntries = Object.fromEntries(
    [originalRent, income, contribution, nextIncome, nextExpense].map((item) => [
      `${item.id}__${item.startDate}`,
      { scheduledItemId: item.id, payPeriodDate: item.startDate,
        plannedAmount: item.amount, validated: true,
        scheduledItemSnapshot: { ...item }, scheduledItemSnapshotProvenance: 'captured-at-entry-save' },
    ])
  );
  const transfers = [
    { id: 'in', fromAccountId: 'cash', toAccountId: 'bank', bucketId: bucket.id,
      payPeriodDate: december, transferType: 'to_savings_bucket', amount: 40, validated: true },
    { id: 'out', fromAccountId: 'bank', toAccountId: 'cash', bucketId: bucket.id,
      payPeriodDate: january, transferType: 'from_savings_bucket', amount: 15, validated: true },
  ];
  const inputs = {
    scheduledItems, plannerEntries, settings, accounts: [chequing, savings], transfers,
    savingsBuckets: [bucket],
    manualAdjustments: [{ accountId: 'cash', payPeriodDate: december, amount: -10 }],
    savingsBucketAdjustments: [{ bucketId: bucket.id, payPeriodDate: december, amount: 3 }],
  };
  const original = structuredClone(inputs);
  for (const today of boundaries) {
    const data = buildPlannerRows({ ...inputs, today });
    for (const id of ['projected-chequing', 'validated-chequing']) {
      assert.equal(balance(data, id, anchor), 65);
      assert.equal(balance(data, id, december), 415);
      assert.equal(balance(data, id, january), 535);
    }
    assert.equal(balance(data, 'projected-savings', december), 218);
    assert.equal(balance(data, 'projected-savings', january), 203);
    const [projection] = buildSavingsBucketProjection({ ...inputs, ...data });
    assert.equal(projection.validatedBalanceByPeriod[december], 163);
    assert.equal(projection.validatedBalanceByPeriod[january], 148);
    assert.equal(data.rows[0].amountsByPeriod[january], 0);
    assert.equal(data.rows[2].amountsByPeriod[january], 0);
    assert.deepEqual(inputs, original);
  }
});

test('CP-24 and CP-25: dashboard bounds its alerts and handles a future anchor', () => {
  const inputs = { settings, accounts: [chequing], scheduledItems: [], manualAdjustments: [] };
  const empty = buildPlannerRows({ ...inputs, accounts: [], today: '2026-06-01' });
  assert.equal(empty.currentPayPeriod, null);
  assert.equal(getDashboardSummary(empty).nextPayDate, anchor);
  const december = buildPlannerRows({
    ...inputs, today: '2026-12-01',
    scheduledItems: [schedule('future-bill', 'expense', 3000, '2027-07-14')],
  });
  assert.equal(getDashboardSummary(december).nextPayDate, '2026-12-02');
  assert.equal(getDashboardSummary(december).lowestChequing, 1265);
  assert.equal(balance(december, 'projected-chequing', '2027-07-14'), -1735);
  assert.deepEqual(getLowBalanceAlerts({ plannerData: december, settings }), []);
});

test('CP-26: compute a synthetic ten-year history without adding saved records', (context) => {
  const start = '2016-01-06';
  const dates = referenceDates(start, '2026-12-01', 14);
  const scheduledItems = Array.from({ length: 16 }, (_, index) =>
    schedule(`synthetic-${index}`, 'income', 10, start, { frequency: 'biweekly' }));
  const entries = Object.fromEntries(scheduledItems.flatMap((item) => dates.map((date) =>
    [`${item.id}__${date}`, { plannedAmount: 5, validated: true }] )));
  const startTime = performance.now();
  const data = buildPlannerRows({
    settings: { ...settings, payPeriodAnchorDate: start },
    accounts: [chequing], scheduledItems, manualAdjustments: [], plannerEntries: entries,
    today: '2026-12-01',
  });
  const duration = performance.now() - startTime;
  assert.ok(data.payPeriods.length > 260);
  assert.equal(Object.keys(entries).length, dates.length * 16);
  assert.equal(balance(data, 'validated-chequing', dates.at(-1)), 1265 + dates.length * 16 * 5);
  context.diagnostic(`${data.payPeriods.length} periods and ${Object.keys(entries).length} saved entries in ${duration.toFixed(1)} ms`);
});
