export function legacyIntegrityFixture() {
  const stamp = { createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' };
  const source = (id, extra = {}) => ({ ...stamp, id, name: 'Same source label', type: 'income', accountId: 'A',
    amount: 100, frequency: 'once', startDate: '2025-01-03', active: true, ...extra });
  const salary = source('salary__stable', { accountId: 'B' });
  const other = source('other');
  const row = (item, date, patch = {}) => ({ ...stamp, entryKey: `${item.id}__${date}`, scheduledItemId: item.id,
    payPeriodDate: date, plannedAmount: 100, validated: true, useActual: false, notes: 'Original note', lineItems: [],
    scheduledItemSnapshot: { ...item }, scheduledItemSnapshotProvenance: 'captured-at-entry-save', ...patch });
  const entries = [
    row(salary, '2025-01-03', { scheduledItemSnapshot: { ...salary, accountId: 'A' }, scheduledItemSnapshotProvenance: undefined }),
    row(salary, '2026-01-02', { scheduledItemSnapshot: undefined, scheduledItemSnapshotProvenance: undefined,
      actualAmount: 90, useActual: true, lineItems: [{ id: 'line-one', amount: 50 }, { id: 'line-two', amount: 40 }] }),
    row(other, '2026-01-02', { scheduledItemSnapshot: { ...other, accountId: 'missing-account' },
      scheduledItemSnapshotProvenance: 'user-reconciled', historicalReview: { source: { evidence: 'Synthetic original reference' } },
      historicalSourceCorrections: [{ previousSource: { accountId: 'A' }, correctedSource: { accountId: 'missing-account' }, evidence: 'Synthetic earlier correction' }] }),
    row(other, '2026-01-09', { scheduledItemSnapshot: { ...other, categoryId: 'missing-category' } }),
    row(other, '2026-01-16', { scheduledItemSnapshot: { ...other, type: 'transfer', accountId: null, bucketId: 'missing-bucket' } }),
    row(other, '2026-01-23', { scheduledItemSnapshot: { ...other, type: 'expense', accountId: null } }),
    row(source('deleted-safe'), '2025-01-03'),
    row(source('orphan'), '2025-01-03', { scheduledItemSnapshot: undefined, scheduledItemSnapshotProvenance: undefined }),
    row(other, '2026-02-06', { scheduledItemSnapshot: { ...other, categoryId: 'archived-category', bucketId: 'tax' } }),
    row(other, '2026-02-13', { plannedAmount: undefined }),
    row(other, '2026-02-20', { payPeriodDate: '2026-02-21' }),
  ];
  return {
    settings: { payPeriodAnchorDate: '2025-01-03', payFrequencyDays: 7, projectionMonths: 24 },
    accounts: [{ ...stamp, id: 'A', name: 'Historical account A', type: 'chequing', startingBalance: 1000, active: false },
      { ...stamp, id: 'B', name: 'Current account B', type: 'savings', startingBalance: 500 }],
    categories: [{ ...stamp, id: 'archived-category', name: 'Archived category', type: 'income', active: false }],
    savingsBuckets: [{ ...stamp, id: 'tax', name: 'Tax', startingAmount: 100, linkedAccountId: 'B', active: false }],
    scheduledItems: [salary, other], plannerEntries: Object.fromEntries(entries.map((entry) => [entry.entryKey, entry])),
    manualAdjustments: [], savingsBucketAdjustments: [], transfers: [],
    appMetadata: { plannerLastEntryMarker: { plannerItemId: salary.id, occurrenceId: '2026-01-02', cellKey: `${salary.id}__2026-01-02` } },
  };
}
