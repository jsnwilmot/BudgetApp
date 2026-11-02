// Synthetic only. Three dated ledger checkpoints calculated independently of recurrence.
export function historyFixture() {
  const timestamp = '2026-06-03T12:00:00.000Z';
  const record = (value) => ({ createdAt: timestamp, updatedAt: timestamp, ...value });
  const scheduledItems = [
    { id: 'salary', name: 'Salary', type: 'income', amount: 1000, accountId: 'c' },
    { id: 'tax', name: 'Property tax', type: 'transfer', amount: 100, bucketId: 'tax-bucket' },
    { id: 'bill', name: 'Monthly bill', type: 'expense', amount: 200, accountId: 'c' },
  ].map((item) => record({ ...item, active: false, frequency: 'biweekly', startDate: '2026-06-03' }));
  const plannerEntries = {};
  const add = (id, date, extra = {}) => {
    const item = scheduledItems.find((item) => item.id === id);
    const key = `${id}__${date}`;
    plannerEntries[key] = record({ entryKey: key, scheduledItemId: id, payPeriodDate: date,
      plannedAmount: item.amount, useActual: false, validated: true, notes: 'Retained note',
      lineItems: [], scheduledItemSnapshot: structuredClone(item), ...extra });
  };
  for (const date of ['2026-12-30', '2027-01-13', '2028-02-29']) {
    add('salary', date);
    add('tax', date);
    add('bill', date, { useActual: true, actualAmount: 230,
      lineItems: [{ id: `line-${date}`, description: 'Invoice', amount: 230 }] });
  }
  add('salary', '2027-01-27', { validated: false, useActual: true, actualAmount: 50 });
  return {
    settings: { currency: 'CAD', payPeriodAnchorDate: '2026-06-03', payFrequencyDays: 14,
      projectionMonths: 24, monthlyBillAssignmentRule: 'previous-pay-period' },
    accounts: [record({ id: 'c', name: 'Chequing', type: 'chequing', startingBalance: 1000 }),
      record({ id: 's', name: 'Savings', type: 'savings', startingBalance: 500 })],
    savingsBuckets: [record({ id: 'tax-bucket', name: 'Tax', linkedAccountId: 's', startingAmount: 500 })],
    scheduledItems, plannerEntries,
    manualAdjustments: [record({ id: 'fee', accountId: 'c', date: '2026-12-30', payPeriodDate: '2026-12-30', amount: -10 })],
    savingsBucketAdjustments: [record({ id: 'interest', bucketId: 'tax-bucket', date: '2026-12-30', payPeriodDate: '2026-12-30', amount: 5 })],
    transfers: [record({ id: 'manual', fromAccountId: 'c', toAccountId: 's', bucketId: 'tax-bucket',
      transferType: 'to_savings_bucket', date: '2026-12-30', payPeriodDate: '2026-12-30', amount: 40, validated: true })],
    categories: [], budgetTargets: [],
    appMetadata: { plannerLastEntryMarker: { plannerItemId: 'tax', occurrenceId: '2026-12-30', cellKey: 'tax__2026-12-30' } },
  };
}

// c: opening 1000 + (1000 - 230 - 100) * n - 10 - 40 (+ 50 projected only after Jan 27)
// s/bucket: opening 500 + 100 * n + 5 + 40
export const ledger = [
  { date: '2026-12-30', projected: 1620, validated: 1620, savings: 645 },
  { date: '2027-01-13', projected: 2290, validated: 2290, savings: 745 },
  { date: '2028-02-29', projected: 3010, validated: 2960, savings: 845 },
];
