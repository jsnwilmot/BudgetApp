import { formatShortDate, parseLocalDate } from './dateLogic';
import { getProjectionType } from './scheduledItemLogic';

// Calculation chronology includes retained activity before a view, never a second baseline.
// It does not generate recurrence or write forecast cells to storage.
export function getCalculationPeriods(payPeriods = [], rows = [], records = []) {
  const end = payPeriods.at(-1)?.date;
  if (!end) return [];
  const dates = new Set(payPeriods.map((period) => period.date));
  const retainedDates = [
    ...rows.flatMap((row) => Object.keys(row.amountsByPeriod || {})),
    ...records.map((record) => record.payPeriodDate),
  ];
  retainedDates.forEach((date) => {
    if (date <= end && !Number.isNaN(parseLocalDate(date).getTime())) dates.add(date);
  });
  return [...dates].sort().map((date) => ({ date, label: formatShortDate(date) }));
}

export function getHistoricalItems(scheduledItems = [], plannerEntries = {}) {
  const items = new Map(scheduledItems.map((item) => [item.id, item]));
  Object.values(plannerEntries).forEach((entry) => {
    const snapshot = entry.scheduledItemSnapshot;
    if (snapshot?.id && !items.has(snapshot.id)) {
      items.set(snapshot.id, { ...snapshot, active: false });
    }
  });
  return [...items.values()];
}

export function getPeriodRow(row, periodDate) {
  const item = row.itemsByPeriod?.[periodDate];
  if (!item) return row;
  return {
    ...row, item, name: item.name, type: getProjectionType(item.type),
    scheduledItemType: item.type, accountId: item.accountId, categoryId: item.categoryId,
  };
}

// Only explicit source mutations enrich existing saved cells. Viewing is read-only.
export function snapshotScheduledEntries(item, entries = {}, plannerRow) {
  const snapshots = {};
  Object.entries(entries).forEach(([key, entry]) => {
    if (!key.startsWith(`${item.id}__`)) return;
    const date = entry.payPeriodDate || key.slice(key.lastIndexOf('__') + 2);
    snapshots[key] = {
      ...entry,
      plannedAmount: entry.plannedAmount ?? plannerRow?.plannedByPeriod?.[date] ?? item.amount,
      ...(entry.validated && !entry.useActual && !entry.lineItems?.length && entry.plannedAmount == null
        ? { historicalAmountNeedsReview: true } : {}),
      scheduledItemSnapshot: entry.scheduledItemSnapshot || { ...item },
    };
  });
  return snapshots;
}

export function assertSafeCadenceChange(previous, next, data = {}) {
  const changed = previous.payPeriodAnchorDate !== next.payPeriodAnchorDate ||
    Number(previous.payFrequencyDays) !== Number(next.payFrequencyDays);
  const hasDatedData = Object.keys(data.plannerEntries || {}).length > 0 ||
    ['scheduledItems', 'manualAdjustments', 'savingsBucketAdjustments', 'transfers']
      .some((key) => data[key]?.length > 0);
  if (changed && hasDatedData) {
    throw new Error('Anchor and pay frequency are locked while dated records exist. Export a backup before setting up a different cadence in an empty planner.');
  }
}
