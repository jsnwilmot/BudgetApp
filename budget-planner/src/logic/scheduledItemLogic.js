import {
  addDays,
  formatDateKey,
  getMonthDate,
  parseLocalDate,
} from './dateLogic';

export const scheduledItemTypes = [
  'income',
  'expense',
  'transfer',
  'savings',
  'debt',
  'general',
];

export const scheduledItemFrequencies = [
  'once',
  'weekly',
  'biweekly',
  'monthly',
  'yearly',
];

export function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsedDate = parseLocalDate(value);
  return (
    !Number.isNaN(parsedDate.getTime()) &&
    formatDateKey(parsedDate) === value
  );
}

function normalizeFrequency(frequency) {
  if (frequency === 'annual') return 'yearly';

  return scheduledItemFrequencies.includes(frequency) ? frequency : 'monthly';
}

function normalizeType(type) {
  return scheduledItemTypes.includes(type) ? type : 'expense';
}

function normalizeOptionalNumber(value, min, max) {
  const numberValue = Number(value);

  if (
    Number.isInteger(numberValue) &&
    numberValue >= min &&
    numberValue <= max
  ) {
    return numberValue;
  }

  return null;
}

export function normalizeScheduledItem(item = {}) {
  const timestamp = new Date().toISOString();
  const amount = Number(item.amount);
  const startDate = isValidDateString(item.startDate) ? item.startDate : '';
  const startDateValue = startDate ? parseLocalDate(startDate) : null;
  const fallbackDueDay = startDateValue ? startDateValue.getDate() : null;
  const fallbackDueMonth = startDateValue ? startDateValue.getMonth() + 1 : null;
  const dueDay =
    normalizeOptionalNumber(item.dueDay, 1, 31) ?? fallbackDueDay ?? null;
  const dueMonth =
    normalizeOptionalNumber(item.dueMonth, 1, 12) ?? fallbackDueMonth ?? null;
  const savingsBucketId =
    item.savingsBucketId || item.bucketId || item.toBucketId || null;

  return {
    ...item,
    id: item.id || `scheduled-${crypto.randomUUID()}`,
    name: String(item.name || '').trim(),
    type: normalizeType(item.type),
    amount: Number.isFinite(amount) ? amount : 0,
    frequency: normalizeFrequency(item.frequency),
    startDate,
    endDate: isValidDateString(item.endDate) ? item.endDate : null,
    dueDay,
    dueMonth,
    categoryId: item.categoryId || null,
    accountId: item.accountId || null,
    savingsBucketId,
    bucketId: item.bucketId || savingsBucketId || null,
    active: item.active !== false,
    allowLineItems: Boolean(item.allowLineItems),
    notes: String(item.notes || ''),
    createdAt: item.createdAt || timestamp,
    updatedAt: item.updatedAt || timestamp,
  };
}

export function getProjectionType(type) {
  if (type === 'income') return 'income';
  if (type === 'transfer' || type === 'savings') return 'transfer';
  return 'expense';
}

export function getCategoryTypesForScheduledType(type) {
  if (type === 'income') return ['income', 'general'];
  if (type === 'transfer' || type === 'savings') {
    return ['savings', 'transfer', 'general'];
  }
  if (type === 'expense' || type === 'debt') {
    return ['expense', 'debt', 'general'];
  }
  return ['general', 'expense'];
}

function dateIsInRange(date, rangeStart, rangeEnd, endDate) {
  return date >= rangeStart && date <= rangeEnd && (!endDate || date <= endDate);
}

function getMonthlyOccurrence(item, year, monthIndex) {
  return getMonthDate(year, monthIndex, item.dueDay || 1);
}

function getYearlyOccurrence(item, year) {
  return getMonthDate(year, (item.dueMonth || 1) - 1, item.dueDay || 1);
}

export function getScheduledItemOccurrences(
  item,
  rangeStartDate,
  rangeEndDate
) {
  const scheduledItem = normalizeScheduledItem(item);
  const startDate = parseLocalDate(scheduledItem.startDate);
  const rangeStart = new Date(rangeStartDate);
  const rangeEnd = new Date(rangeEndDate);
  const endDate = scheduledItem.endDate
    ? parseLocalDate(scheduledItem.endDate)
    : null;
  const occurrences = [];

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(rangeStart.getTime()) ||
    Number.isNaN(rangeEnd.getTime()) ||
    (endDate && Number.isNaN(endDate.getTime()))
  ) {
    return occurrences;
  }

  if (endDate && endDate < startDate) {
    return occurrences;
  }

  if (scheduledItem.frequency === 'once') {
    if (dateIsInRange(startDate, rangeStart, rangeEnd, endDate)) {
      occurrences.push(formatDateKey(startDate));
    }

    return occurrences;
  }

  if (
    scheduledItem.frequency === 'weekly' ||
    scheduledItem.frequency === 'biweekly'
  ) {
    const incrementDays = scheduledItem.frequency === 'weekly' ? 7 : 14;
    let occurrenceDate = new Date(startDate);

    while (occurrenceDate < rangeStart) {
      occurrenceDate = addDays(occurrenceDate, incrementDays);
    }

    while (occurrenceDate <= rangeEnd) {
      if (dateIsInRange(occurrenceDate, rangeStart, rangeEnd, endDate)) {
        occurrences.push(formatDateKey(occurrenceDate));
      }

      occurrenceDate = addDays(occurrenceDate, incrementDays);
    }

    return occurrences;
  }

  if (scheduledItem.frequency === 'monthly') {
    for (
      let year = rangeStart.getFullYear();
      year <= rangeEnd.getFullYear();
      year += 1
    ) {
      for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
        const occurrenceDate = getMonthlyOccurrence(
          scheduledItem,
          year,
          monthIndex
        );

        if (
          occurrenceDate >= startDate &&
          dateIsInRange(occurrenceDate, rangeStart, rangeEnd, endDate)
        ) {
          occurrences.push(formatDateKey(occurrenceDate));
        }
      }
    }

    return occurrences.sort();
  }

  if (scheduledItem.frequency === 'yearly') {
    for (
      let year = rangeStart.getFullYear();
      year <= rangeEnd.getFullYear();
      year += 1
    ) {
      const occurrenceDate = getYearlyOccurrence(scheduledItem, year);

      if (
        occurrenceDate >= startDate &&
        dateIsInRange(occurrenceDate, rangeStart, rangeEnd, endDate)
      ) {
        occurrences.push(formatDateKey(occurrenceDate));
      }
    }
  }

  return occurrences.sort();
}

export function getMonthlyEquivalentAmount(item) {
  const scheduledItem = normalizeScheduledItem(item);

  if (scheduledItem.frequency === 'weekly') {
    return (scheduledItem.amount * 52) / 12;
  }

  if (scheduledItem.frequency === 'biweekly') {
    return (scheduledItem.amount * 26) / 12;
  }

  if (scheduledItem.frequency === 'yearly') {
    return scheduledItem.amount / 12;
  }

  if (scheduledItem.frequency === 'monthly') {
    return scheduledItem.amount;
  }

  return 0;
}
