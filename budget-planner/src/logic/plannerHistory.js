import { isValidDateString, scheduledItemTypes } from './scheduledItemLogic';

export function getPlannerEntryIdentity(key, entry) {
  if (typeof key !== 'string' || !entry || typeof entry !== 'object') return null;
  const split = key.lastIndexOf('__');
  if (split < 1) return null;
  const id = key.slice(0, split);
  const date = key.slice(split + 2);
  if (!isValidDateString(date) ||
      (entry.scheduledItemId != null && String(entry.scheduledItemId) !== id) ||
      (entry.payPeriodDate != null && entry.payPeriodDate !== date)) return null;
  return { id, date };
}

export function getSavedAmount(value) {
  if (typeof value !== 'number' &&
      (typeof value !== 'string' || !value.trim())) return undefined;
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : undefined;
}

export function getConfirmedAmount(entry) {
  if (entry.historicalAmountNeedsReview ||
      (entry.lineItems != null && !Array.isArray(entry.lineItems))) return undefined;
  if (entry.lineItems?.length) {
    const amounts = entry.lineItems.map((line) => getSavedAmount(line?.amount));
    if (amounts.includes(undefined)) return undefined;
    return getSavedAmount(amounts.reduce((total, amount) => total + amount, 0));
  }
  return getSavedAmount(entry.useActual ? entry.actualAmount : entry.plannedAmount);
}

export function getSavedPlannerSource(entry, sourceId) {
  const source = entry?.scheduledItemSnapshot;
  if (source?.id == null || String(source.id) !== String(sourceId) ||
      !scheduledItemTypes.includes(source.type)) return null;
  if (source.bucketId != null && source.savingsBucketId != null &&
      source.bucketId !== source.savingsBucketId) return null;
  return source;
}

export function isConfirmedPlannerSource(entry) {
  return entry.scheduledItemSnapshotProvenance === 'captured-at-entry-save' ||
    (entry.scheduledItemSnapshotProvenance === 'user-reconciled' &&
      Boolean(entry.historicalReview?.source?.evidence?.trim?.()));
}

export function capturePlannerSource(item) {
  return {
    id: item.id,
    name: item.name,
    type: item.type,
    accountId: item.accountId ?? null,
    categoryId: item.categoryId ?? null,
    bucketId: item.bucketId ?? item.savingsBucketId ?? null,
    toAccountId: item.toAccountId ?? null,
    allowLineItems: Boolean(item.allowLineItems),
  };
}

export function preserveLegacyPlannerSource(entry, previousSchedule) {
  if (entry.scheduledItemSnapshot != null) return entry;
  return {
    ...entry,
    scheduledItemSnapshot: capturePlannerSource(previousSchedule),
    scheduledItemSnapshotProvenance: 'unverified-current-source',
  };
}
