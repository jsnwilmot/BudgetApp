import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlannerRows } from '../src/logic/projectionLogic.js';
import { getPlannerCellMarker, isPlannerLastEntryMarkerValid } from '../src/logic/plannerLastEntryMarker.js';

function fixture() {
  return {
    settings: { payPeriodAnchorDate: '2026-12-30', payFrequencyDays: 14, projectionMonths: 3 },
    accounts: [{ id: 'c', type: 'chequing', startingBalance: 1000 }],
    scheduledItems: [{ id: 'pay', name: 'Pay', type: 'income', amount: 2000,
      startDate: '2026-12-30', frequency: 'biweekly', accountId: 'c', active: true }],
    plannerEntries: { 'pay__2026-12-30': { scheduledItemId: 'pay', payPeriodDate: '2026-12-30',
      plannedAmount: 1000, validated: true, useActual: false } },
    manualAdjustments: [],
  };
}

test('regression: saved planned confirmation stays 1000 after recurrence changes to 2000', () => {
  const data = buildPlannerRows(fixture());
  assert.equal(data.rows[0].amountsByPeriod['2026-12-30'], 1000);
  assert.equal(data.rows[0].amountsByPeriod['2027-01-13'], 2000);
});

test('regression: inactive saved confirmation still contributes to balances', () => {
  const source = fixture(); source.scheduledItems[0].active = false;
  const data = buildPlannerRows(source);
  const balance = data.projectionRows.find((row) => row.id === 'validated-chequing');
  assert.equal(balance.amountsByPeriod['2026-12-30'], 2000);
});

test('regression: transfer between chequing accounts conserves aggregate funds', () => {
  const source = fixture(); source.scheduledItems = []; source.plannerEntries = {};
  source.accounts.push({ id: 'c2', type: 'chequing', startingBalance: 200 });
  source.transfers = [{ id: 'move', fromAccountId: 'c', toAccountId: 'c2', amount: 70,
    payPeriodDate: '2026-12-30', transferType: 'account_transfer', validated: true }];
  const data = buildPlannerRows(source);
  assert.equal(data.projectionRows.find((row) => row.id === 'projected-chequing').amountsByPeriod['2026-12-30'], 1200);
});

test('regression: off-screen saved cell keeps Last Entry marker eligible', () => {
  const data = buildPlannerRows(fixture());
  const marker = getPlannerCellMarker('pay', '2028-01-01');
  const entries = { [marker.cellKey]: { plannedAmount: 1000, validated: true } };
  assert.equal(isPlannerLastEntryMarkerValid(marker, { ...data, plannerEntries: entries }), true);
});
