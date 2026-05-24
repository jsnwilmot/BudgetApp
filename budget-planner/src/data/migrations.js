import { normalizeBudgetTarget } from '../logic/budgetLogic';
import { normalizeScheduledItem } from '../logic/scheduledItemLogic';
import { normalizeTransfer } from '../logic/transferLogic';
import {
  appSettings as defaultAppSettings,
  categories as defaultCategories,
} from './seedData';

export const APP_DATA_VERSION = 2;
export const APP_VERSION = '2.0.0-phase-2v';
export const BACKUP_APP_NAME = 'BudgetApp';
export const EXPORT_APP_NAME = 'FinPath';
export const BACKUP_REMINDER_DAYS = 30;
export const APP_METADATA_ID = 'app-metadata';

const CATEGORY_TYPES = [
  'income',
  'expense',
  'transfer',
  'savings',
  'debt',
  'general',
];

const ACCOUNT_TYPES = ['chequing', 'savings', 'credit', 'cash', 'other'];

export function getCurrentAppVersion() {
  return APP_VERSION;
}

export function getCurrentAppDataVersion() {
  return APP_DATA_VERSION;
}

export function isPlainObject(value) {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function safeString(value, fallback = '') {
  if (value === null || value === undefined) {
    return fallback;
  }

  const stringValue = String(value).trim();
  return stringValue || fallback;
}

export function safeNumber(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) {
    return fallback;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

export function safeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function createTimestamp() {
  return new Date().toISOString();
}

export function safeTimestampString(value, fallback = '') {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

export function safeDateString(value, fallback = '') {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return fallback;
  }

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : fallback;
}

function normalizeSettingRule(rule) {
  if (
    rule === 'same-pay-period' ||
    rule === 'same_pay_period' ||
    rule === 'same_pay_period_as_due_date'
  ) {
    return 'same-pay-period';
  }

  return 'previous-pay-period';
}

function normalizeCurrency(currency) {
  return ['CAD', 'USD'].includes(currency) ? currency : defaultAppSettings.currency;
}

function normalizeCategoryType(type) {
  return CATEGORY_TYPES.includes(type) ? type : 'general';
}

function normalizeAccountType(type) {
  return ACCOUNT_TYPES.includes(type) ? type : 'other';
}

function normalizeId(value, prefix) {
  return safeString(value, `${prefix}-${crypto.randomUUID()}`);
}

export function normalizeAppSettingsRecord(settings = {}) {
  const safeSettings = isPlainObject(settings) ? settings : {};

  return {
    ...defaultAppSettings,
    ...safeSettings,
    id: safeSettings.id || 'app-settings',
    currency: normalizeCurrency(safeSettings.currency),
    payPeriodAnchorDate: safeDateString(
      safeSettings.payPeriodAnchorDate,
      defaultAppSettings.payPeriodAnchorDate
    ),
    payFrequencyDays: [7, 14, 28, 30].includes(
      Number(safeSettings.payFrequencyDays)
    )
      ? Number(safeSettings.payFrequencyDays)
      : defaultAppSettings.payFrequencyDays,
    projectionMonths: [3, 6, 12, 18, 24].includes(
      Number(safeSettings.projectionMonths)
    )
      ? Number(safeSettings.projectionMonths)
      : defaultAppSettings.projectionMonths,
    monthlyBillAssignmentRule: normalizeSettingRule(
      safeSettings.monthlyBillAssignmentRule
    ),
  };
}

function isValidDateString(value) {
  return safeDateString(value, '') === value;
}

function isValidTimestampString(value) {
  return safeTimestampString(value, '') !== '';
}

function hasFiniteNumber(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

export function normalizeAppMetadataRecord(metadata = {}) {
  const timestamp = createTimestamp();
  const safeMetadata = isPlainObject(metadata) ? metadata : {};

  return {
    ...safeMetadata,
    id: safeString(safeMetadata.id, APP_METADATA_ID),
    lastBackupAt: safeTimestampString(safeMetadata.lastBackupAt, ''),
    onboardingCompletedAt: safeTimestampString(
      safeMetadata.onboardingCompletedAt,
      ''
    ),
    createdAt: safeTimestampString(safeMetadata.createdAt, timestamp),
    updatedAt: safeTimestampString(safeMetadata.updatedAt, ''),
  };
}

export function getBackupReminderStatus(lastBackupAt, currentDate = new Date()) {
  const safeLastBackupAt = safeTimestampString(lastBackupAt, '');

  if (!safeLastBackupAt) {
    return {
      status: 'none',
      label: 'No backup yet',
      lastBackupAt: '',
      ageDays: null,
      isReminderDue: true,
      severity: 'info',
    };
  }

  const ageMs = currentDate.getTime() - new Date(safeLastBackupAt).getTime();
  const ageDays = Math.max(0, Math.floor(ageMs / (24 * 60 * 60 * 1000)));

  if (ageDays > BACKUP_REMINDER_DAYS) {
    return {
      status: 'recommended',
      label: 'Backup recommended',
      lastBackupAt: safeLastBackupAt,
      ageDays,
      isReminderDue: true,
      severity: 'warning',
    };
  }

  return {
    status: 'current',
    label: 'Backup current',
    lastBackupAt: safeLastBackupAt,
    ageDays,
    isReminderDue: false,
    severity: 'info',
  };
}

export function normalizeCategoryRecord(category = {}, fallbackSortOrder = 0) {
  const timestamp = createTimestamp();
  const safeCategory = isPlainObject(category) ? category : {};
  const type = normalizeCategoryType(safeCategory.type);

  return {
    ...safeCategory,
    id: normalizeId(safeCategory.id, `cat-${type}`),
    name: safeString(safeCategory.name, 'Uncategorized'),
    type,
    color: safeString(safeCategory.color, '#64748b'),
    icon: safeString(safeCategory.icon, 'tag'),
    active: safeBoolean(safeCategory.active, true),
    sortOrder: safeNumber(safeCategory.sortOrder, fallbackSortOrder),
    createdAt: safeString(safeCategory.createdAt, timestamp),
    updatedAt: safeString(safeCategory.updatedAt, timestamp),
  };
}

export function normalizeAccountRecord(account = {}) {
  const timestamp = createTimestamp();
  const safeAccount = isPlainObject(account) ? account : {};

  return {
    ...safeAccount,
    id: normalizeId(safeAccount.id, 'acct'),
    name: safeString(safeAccount.name, 'Account'),
    type: normalizeAccountType(safeAccount.type),
    startingBalance: safeNumber(safeAccount.startingBalance, 0),
    active: safeBoolean(safeAccount.active, true),
    createdAt: safeString(safeAccount.createdAt, timestamp),
    updatedAt: safeString(safeAccount.updatedAt, timestamp),
  };
}

export function normalizeManualAdjustmentRecord(adjustment = {}) {
  const timestamp = createTimestamp();
  const safeAdjustment = isPlainObject(adjustment) ? adjustment : {};
  const id = normalizeId(safeAdjustment.id, 'manual-adjustment');

  return {
    ...safeAdjustment,
    id,
    amount: safeNumber(safeAdjustment.amount, 0),
    date: safeDateString(safeAdjustment.date, ''),
    payPeriodDate: safeDateString(
      safeAdjustment.payPeriodDate,
      ''
    ),
    accountId: safeAdjustment.accountId || null,
    categoryId: safeAdjustment.categoryId || null,
    notes: safeString(safeAdjustment.notes, ''),
    createdAt: safeString(safeAdjustment.createdAt, timestamp),
    updatedAt: safeString(safeAdjustment.updatedAt, timestamp),
  };
}

export function normalizeSavingsBucketRecord(bucket = {}) {
  const timestamp = createTimestamp();
  const safeBucket = isPlainObject(bucket) ? bucket : {};

  return {
    ...safeBucket,
    id: normalizeId(safeBucket.id || safeBucket.bucketId, 'bucket'),
    name: safeString(safeBucket.name || safeBucket.bucketName, 'Savings bucket'),
    linkedAccountId: safeBucket.linkedAccountId || safeBucket.accountId || null,
    startingAmount: safeNumber(
      safeBucket.startingAmount ?? safeBucket.balance ?? safeBucket.amount,
      0
    ),
    active: safeBoolean(safeBucket.active, !safeBucket.deletedAt),
    deletedAt: safeBucket.deletedAt || null,
    createdAt: safeString(safeBucket.createdAt, timestamp),
    updatedAt: safeString(safeBucket.updatedAt, timestamp),
  };
}

export function normalizeSavingsBucketAdjustmentRecord(adjustment = {}) {
  const timestamp = createTimestamp();
  const safeAdjustment = isPlainObject(adjustment) ? adjustment : {};
  const bucketId =
    safeAdjustment.bucketId ||
    safeAdjustment.savingsBucketId ||
    safeAdjustment.toBucketId ||
    safeAdjustment.fromBucketId ||
    null;

  return {
    ...safeAdjustment,
    id: normalizeId(safeAdjustment.id, 'savings-adjustment'),
    bucketId,
    savingsBucketId: safeAdjustment.savingsBucketId || bucketId,
    amount: safeNumber(safeAdjustment.amount, 0),
    date: safeDateString(safeAdjustment.date, ''),
    payPeriodDate: safeDateString(
      safeAdjustment.payPeriodDate,
      ''
    ),
    notes: safeString(safeAdjustment.notes, ''),
    createdAt: safeString(safeAdjustment.createdAt, timestamp),
    updatedAt: safeString(safeAdjustment.updatedAt, timestamp),
  };
}

export function normalizePlannerEntriesRecord(entries = {}) {
  const entryRecords = Array.isArray(entries)
    ? entries
    : Object.entries(isPlainObject(entries) ? entries : {}).map(
        ([entryKey, entry]) => ({
          ...(isPlainObject(entry) ? entry : {}),
          entryKey,
        })
      );

  return entryRecords.reduce((result, entry) => {
    if (!isPlainObject(entry)) return result;

    const entryKey = safeString(entry.entryKey);

    if (!entryKey) return result;

    result[entryKey] = {
      ...entry,
      entryKey,
      actualAmount:
        entry.actualAmount === '' || entry.actualAmount === undefined
          ? entry.actualAmount
          : safeNumber(entry.actualAmount, 0),
      lineItems: safeArray(entry.lineItems).map((lineItem) => ({
        ...(isPlainObject(lineItem) ? lineItem : {}),
        id: lineItem?.id || `line-item-${crypto.randomUUID()}`,
        amount: safeNumber(lineItem?.amount, 0),
      })),
      useActual: safeBoolean(entry.useActual, false),
      validated: safeBoolean(entry.validated, false),
      notes: safeString(entry.notes, ''),
    };

    return result;
  }, {});
}

function normalizeBudgetTargetRecord(target = {}) {
  return normalizeBudgetTarget(isPlainObject(target) ? target : {});
}

function normalizeScheduledItemRecord(item = {}) {
  return normalizeScheduledItem(isPlainObject(item) ? item : {});
}

export function sortCategories(categories = []) {
  return [...categories].sort((left, right) => {
    const typeCompare = left.type.localeCompare(right.type);

    if (typeCompare !== 0) return typeCompare;

    return (
      safeNumber(left.sortOrder, 0) - safeNumber(right.sortOrder, 0) ||
      left.name.localeCompare(right.name)
    );
  });
}

function normalizeRecords(records, normalizer, fallbackRecords = []) {
  const sourceRecords = safeArray(records);
  const seenIds = new Set();

  if (sourceRecords.length === 0 && fallbackRecords.length > 0) {
    return fallbackRecords.map((record, index) => normalizer(record, index + 1));
  }

  return sourceRecords.map((record, index) => {
    const normalizedRecord = normalizer(record, index + 1);

    if (!normalizedRecord.id) {
      return normalizedRecord;
    }

    if (seenIds.has(normalizedRecord.id)) {
      const uniqueRecord = {
        ...normalizedRecord,
        id: `${normalizedRecord.id}-${crypto.randomUUID()}`,
      };
      seenIds.add(uniqueRecord.id);
      return uniqueRecord;
    }

    seenIds.add(normalizedRecord.id);
    return normalizedRecord;
  });
}

export function migrateFromVersion0(data = {}) {
  const safeData = isPlainObject(data) ? data : {};

  return {
    ...safeData,
    appMetadata: safeData.appMetadata || {},
    settings: safeData.settings || safeData.appSettings || defaultAppSettings,
    budgetTargets: safeArray(safeData.budgetTargets).length
      ? safeData.budgetTargets
      : safeArray(safeData.budgets),
    categories: safeArray(safeData.categories).length
      ? safeData.categories
      : defaultCategories,
    plannerEntries: safeData.plannerEntries || safeData.planner?.entries || {},
    scheduledItems: safeArray(safeData.scheduledItems),
    accounts: safeArray(safeData.accounts),
    manualAdjustments: safeArray(safeData.manualAdjustments),
    savingsBuckets: safeArray(safeData.savingsBuckets).length
      ? safeData.savingsBuckets
      : safeArray(safeData.savings?.buckets),
    savingsBucketAdjustments: safeArray(safeData.savingsBucketAdjustments).length
      ? safeData.savingsBucketAdjustments
      : safeArray(safeData.savings?.transfers),
    transfers: safeArray(safeData.transfers),
    transactions: safeArray(safeData.transactions),
  };
}

export function migrateAppData(data = {}, fromVersion = 0) {
  if (fromVersion > APP_DATA_VERSION) {
    throw new Error(
      'This backup is from a newer app version and cannot be imported.'
    );
  }

  if (fromVersion <= 0) {
    return migrateFromVersion0(data);
  }

  return isPlainObject(data) ? data : {};
}

export function getSafeAppData(data = {}) {
  const migratedData = migrateAppData(data, Number(data?.appDataVersion || 0));
  const normalizedCategories = sortCategories(
    normalizeRecords(
      migratedData.categories,
      normalizeCategoryRecord,
      defaultCategories
    )
  );
  const normalizedScheduledItems = normalizeRecords(
    migratedData.scheduledItems,
    normalizeScheduledItemRecord
  );
  const normalizedAccounts = normalizeRecords(
    migratedData.accounts,
    normalizeAccountRecord
  );
  const normalizedSavingsBuckets = normalizeRecords(
    migratedData.savingsBuckets,
    normalizeSavingsBucketRecord
  );

  return {
    ...migratedData,
    appDataVersion: APP_DATA_VERSION,
    appMetadata: normalizeAppMetadataRecord(migratedData.appMetadata),
    settings: normalizeAppSettingsRecord(migratedData.settings),
    budgetTargets: normalizeRecords(
      migratedData.budgetTargets,
      normalizeBudgetTargetRecord
    ),
    categories: normalizedCategories,
    plannerEntries: normalizePlannerEntriesRecord(migratedData.plannerEntries),
    scheduledItems: normalizedScheduledItems,
    accounts: normalizedAccounts,
    manualAdjustments: normalizeRecords(
      migratedData.manualAdjustments,
      normalizeManualAdjustmentRecord
    ),
    savingsBuckets: normalizedSavingsBuckets,
    savingsBucketAdjustments: normalizeRecords(
      migratedData.savingsBucketAdjustments,
      normalizeSavingsBucketAdjustmentRecord
    ),
    transfers: normalizeRecords(migratedData.transfers, normalizeTransfer),
    transactions: safeArray(migratedData.transactions),
  };
}

export function normalizeImportedAppData(data = {}, metadata = {}) {
  const appDataVersion = Number(
    metadata.appDataVersion ?? data?.appDataVersion ?? 0
  );
  const migratedData = migrateAppData(data, appDataVersion);
  return getSafeAppData({
    ...migratedData,
    appDataVersion: APP_DATA_VERSION,
  });
}

export function getBackupSectionSummary(data = {}) {
  const safeData = isPlainObject(data) ? data : {};
  const plannerEntries = normalizePlannerEntriesRecord(
    safeData.plannerEntries || safeData.planner?.entries || {}
  );

  return {
    settings: isPlainObject(safeData.settings) ? 1 : 0,
    accounts: safeArray(safeData.accounts).length,
    transactions: safeArray(safeData.transactions).length,
    scheduledItems: safeArray(safeData.scheduledItems).length,
    savingsBuckets: safeArray(
      safeData.savingsBuckets || safeData.savings?.buckets
    ).length,
    categories: safeArray(safeData.categories).length,
    budgetTargets: safeArray(safeData.budgetTargets).length,
    manualAdjustments: safeArray(safeData.manualAdjustments).length,
    savingsAdjustments: safeArray(
      safeData.savingsBucketAdjustments || safeData.savings?.transfers
    ).length,
    transfers: safeArray(safeData.transfers).length,
    plannerEntries: Object.keys(plannerEntries).length,
  };
}

export function getReferenceWarningCounts(data = {}) {
  const safeData = getSafeAppData(data);
  const categoryIds = new Set(safeData.categories.map((category) => category.id));
  const accountIds = new Set(safeData.accounts.map((account) => account.id));
  const bucketIds = new Set(safeData.savingsBuckets.map((bucket) => bucket.id));

  return {
    missingCategoryReferences:
      safeData.scheduledItems.filter((item) => item.categoryId && !categoryIds.has(item.categoryId)).length +
      safeData.manualAdjustments.filter((adjustment) => adjustment.categoryId && !categoryIds.has(adjustment.categoryId)).length +
      safeData.budgetTargets.filter((target) => target.categoryId && !categoryIds.has(target.categoryId)).length,
    missingAccountReferences:
      safeData.scheduledItems.filter((item) => item.accountId && !accountIds.has(item.accountId)).length +
      safeData.manualAdjustments.filter((adjustment) => adjustment.accountId && !accountIds.has(adjustment.accountId)).length,
    missingTransferAccountReferences: safeData.transfers.filter(
      (transfer) =>
        (transfer.fromAccountId && !accountIds.has(transfer.fromAccountId)) ||
        (transfer.toAccountId && !accountIds.has(transfer.toAccountId))
    ).length,
    missingTransferBucketReferences: safeData.transfers.filter(
      (transfer) => transfer.bucketId && !bucketIds.has(transfer.bucketId)
    ).length,
    missingSavingsBucketReferences:
      safeData.scheduledItems.filter((item) => {
        const bucketId = item.savingsBucketId || item.bucketId;
        return bucketId && !bucketIds.has(bucketId);
      }).length +
      safeData.savingsBucketAdjustments.filter((adjustment) => {
        const bucketId = adjustment.bucketId || adjustment.savingsBucketId;
        return bucketId && !bucketIds.has(bucketId);
      }).length,
    scheduledTransfersWithoutBucketLinks: safeData.scheduledItems.filter(
      (item) =>
        (item.type === 'transfer' || item.type === 'savings') &&
        !item.savingsBucketId &&
        !item.bucketId
    ).length,
  };
}

export function getReferenceWarnings(data = {}) {
  const safeData = getSafeAppData(data);
  const warnings = [];
  const categoryIds = new Set(safeData.categories.map((category) => category.id));
  const accountIds = new Set(safeData.accounts.map((account) => account.id));
  const bucketIds = new Set(safeData.savingsBuckets.map((bucket) => bucket.id));

  safeData.scheduledItems.forEach((item) => {
    if (item.categoryId && !categoryIds.has(item.categoryId)) {
      warnings.push(`${item.name || 'Scheduled item'} references a missing category.`);
    }

    if (item.accountId && !accountIds.has(item.accountId)) {
      warnings.push(`${item.name || 'Scheduled item'} references a missing account.`);
    }

    const bucketId = item.savingsBucketId || item.bucketId;

    if (bucketId && !bucketIds.has(bucketId)) {
      warnings.push(`${item.name || 'Scheduled item'} references a missing savings bucket.`);
    }
  });

  safeData.manualAdjustments.forEach((adjustment) => {
    if (adjustment.categoryId && !categoryIds.has(adjustment.categoryId)) {
      warnings.push('A manual adjustment references a missing category.');
    }

    if (adjustment.accountId && !accountIds.has(adjustment.accountId)) {
      warnings.push('A manual adjustment references a missing account.');
    }
  });

  safeData.budgetTargets.forEach((target) => {
    if (target.categoryId && !categoryIds.has(target.categoryId)) {
      warnings.push(`${target.name || 'Budget target'} references a missing category.`);
    }
  });

  safeData.savingsBucketAdjustments.forEach((adjustment) => {
    const bucketId = adjustment.bucketId || adjustment.savingsBucketId;

    if (bucketId && !bucketIds.has(bucketId)) {
      warnings.push('A savings bucket adjustment references a missing savings bucket.');
    }
  });

  safeData.transfers.forEach((transfer) => {
    if (transfer.fromAccountId && !accountIds.has(transfer.fromAccountId)) {
      warnings.push('A transfer references a missing from account.');
    }

    if (transfer.toAccountId && !accountIds.has(transfer.toAccountId)) {
      warnings.push('A transfer references a missing to account.');
    }

    if (transfer.bucketId && !bucketIds.has(transfer.bucketId)) {
      warnings.push('A transfer references a missing savings bucket.');
    }
  });

  return warnings;
}

function getHealthSourceData(data = {}) {
  const safeData = isPlainObject(data) ? data : {};
  const appDataVersion = Number(safeData.appDataVersion || 0);

  return migrateAppData(safeData, appDataVersion);
}

function addHealthIssue(issues, severity, title, message, guidance) {
  issues.push({
    id: `${severity}-${issues.length + 1}`,
    severity,
    title,
    message,
    guidance,
  });
}

function getHealthCollectionRows(data = {}) {
  return [
    ['accounts', 'Accounts', safeArray(data.accounts)],
    ['categories', 'Categories', safeArray(data.categories)],
    ['scheduledItems', 'Scheduled items', safeArray(data.scheduledItems)],
    ['manualAdjustments', 'Manual adjustments', safeArray(data.manualAdjustments)],
    ['savingsBuckets', 'Savings buckets', safeArray(data.savingsBuckets)],
    [
      'savingsBucketAdjustments',
      'Savings bucket adjustments',
      safeArray(data.savingsBucketAdjustments),
    ],
    ['transfers', 'Transfers', safeArray(data.transfers)],
    ['budgetTargets', 'Budget targets', safeArray(data.budgetTargets || data.budgets)],
  ];
}

function checkRequiredIds(collections, issues) {
  collections.forEach(([, label, records]) => {
    const seenIds = new Set();
    let missingIds = 0;
    const duplicateIds = new Set();

    records.forEach((record) => {
      if (!isPlainObject(record) || !record.id) {
        missingIds += 1;
        return;
      }

      if (seenIds.has(record.id)) {
        duplicateIds.add(record.id);
        return;
      }

      seenIds.add(record.id);
    });

    if (missingIds > 0) {
      addHealthIssue(
        issues,
        'error',
        `${label} missing IDs`,
        `${missingIds} ${label.toLowerCase()} records are missing stable IDs.`,
        'Export a backup before making manual corrections. Missing IDs should be fixed before future desktop migration.'
      );
    }

    if (duplicateIds.size > 0) {
      addHealthIssue(
        issues,
        'error',
        `${label} duplicate IDs`,
        `${duplicateIds.size} duplicate ${label.toLowerCase()} IDs were detected.`,
        'Do not merge or delete records automatically. Review the affected records before relying on exports or reports.'
      );
    }
  });
}

function checkDateFields(data, issues) {
  const dateChecks = [
    ['Scheduled items', safeArray(data.scheduledItems), ['startDate', 'endDate']],
    ['Manual adjustments', safeArray(data.manualAdjustments), ['date', 'payPeriodDate']],
    [
      'Savings bucket adjustments',
      safeArray(data.savingsBucketAdjustments),
      ['date', 'payPeriodDate'],
    ],
    ['Transfers', safeArray(data.transfers), ['date', 'payPeriodDate']],
  ];
  const timestampChecks = [
    ...getHealthCollectionRows(data).map(([, label, records]) => [
      label,
      records,
      ['createdAt', 'updatedAt'],
    ]),
  ];
  let invalidDates = 0;
  let invalidTimestamps = 0;

  dateChecks.forEach(([, records, fields]) => {
    records.forEach((record) => {
      fields.forEach((field) => {
        if (record?.[field] && !isValidDateString(record[field])) {
          invalidDates += 1;
        }
      });
    });
  });

  timestampChecks.forEach(([, records, fields]) => {
    records.forEach((record) => {
      fields.forEach((field) => {
        if (record?.[field] && !isValidTimestampString(record[field])) {
          invalidTimestamps += 1;
        }
      });
    });
  });

  const plannerEntries = isPlainObject(data.plannerEntries)
    ? data.plannerEntries
    : data.planner?.entries || {};
  Object.keys(isPlainObject(plannerEntries) ? plannerEntries : {}).forEach((entryKey) => {
    const [, payPeriodDate] = String(entryKey).split('__');

    if (payPeriodDate && !isValidDateString(payPeriodDate)) {
      invalidDates += 1;
    }
  });

  if (invalidDates > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Invalid dates detected',
      `${invalidDates} date fields are invalid or not in YYYY-MM-DD format.`,
      'Review dated records before relying on reports, pay-period filters, or future desktop import.'
    );
  }

  if (invalidTimestamps > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Invalid timestamps detected',
      `${invalidTimestamps} created/updated timestamp fields are invalid.`,
      'Timestamps do not usually affect totals, but cleaning them up can improve migration readiness.'
    );
  }
}

function checkAmountFields(data, issues) {
  const amountChecks = [
    ['Scheduled items', safeArray(data.scheduledItems), 'amount', false],
    ['Manual adjustments', safeArray(data.manualAdjustments), 'amount', true],
    [
      'Savings bucket adjustments',
      safeArray(data.savingsBucketAdjustments),
      'amount',
      true,
    ],
    ['Transfers', safeArray(data.transfers), 'amount', false],
    ['Budget targets', safeArray(data.budgetTargets || data.budgets), 'amount', false],
  ];
  let invalidAmounts = 0;
  let invalidNegativeAmounts = 0;

  amountChecks.forEach(([, records, field, allowsNegative]) => {
    records.forEach((record) => {
      if (!hasFiniteNumber(record?.[field])) {
        invalidAmounts += 1;
        return;
      }

      if (!allowsNegative && Number(record[field]) < 0) {
        invalidNegativeAmounts += 1;
      }
    });
  });

  safeArray(data.accounts).forEach((account) => {
    if (!hasFiniteNumber(account.startingBalance)) {
      invalidAmounts += 1;
    }
  });

  safeArray(data.savingsBuckets).forEach((bucket) => {
    if (!hasFiniteNumber(bucket.startingAmount ?? bucket.balance ?? bucket.amount)) {
      invalidAmounts += 1;
    }
  });

  if (invalidAmounts > 0) {
    addHealthIssue(
      issues,
      'error',
      'Invalid amounts detected',
      `${invalidAmounts} amount fields are missing or not valid numbers.`,
      'Review affected records before relying on totals, reports, backups, or future desktop import.'
    );
  }

  if (invalidNegativeAmounts > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Unexpected negative amounts',
      `${invalidNegativeAmounts} records have negative amounts where the current form expects zero or positive values.`,
      'Negative manual and savings adjustments can be valid. Other negative values should be reviewed.'
    );
  }
}

function checkReferenceHealth(data, issues) {
  const categoryIds = new Set(safeArray(data.categories).map((category) => category.id));
  const accountIds = new Set(safeArray(data.accounts).map((account) => account.id));
  const bucketIds = new Set(safeArray(data.savingsBuckets).map((bucket) => bucket.id));
  let missingAccounts = 0;
  let missingCategories = 0;
  let missingBuckets = 0;
  let transferAccountIssues = 0;
  let sameAccountTransfers = 0;
  let scheduledTransfersWithoutBuckets = 0;

  safeArray(data.scheduledItems).forEach((item) => {
    if (item.accountId && !accountIds.has(item.accountId)) missingAccounts += 1;
    if (item.categoryId && !categoryIds.has(item.categoryId)) missingCategories += 1;

    const bucketId = item.savingsBucketId || item.bucketId;
    if (bucketId && !bucketIds.has(bucketId)) missingBuckets += 1;
    if (
      (item.type === 'transfer' || item.type === 'savings') &&
      !bucketId
    ) {
      scheduledTransfersWithoutBuckets += 1;
    }
  });

  safeArray(data.manualAdjustments).forEach((adjustment) => {
    if (adjustment.accountId && !accountIds.has(adjustment.accountId)) missingAccounts += 1;
    if (adjustment.categoryId && !categoryIds.has(adjustment.categoryId)) missingCategories += 1;
  });

  safeArray(data.budgetTargets || data.budgets).forEach((target) => {
    if (target.categoryId && !categoryIds.has(target.categoryId)) missingCategories += 1;
  });

  safeArray(data.savingsBucketAdjustments).forEach((adjustment) => {
    const bucketId = adjustment.bucketId || adjustment.savingsBucketId;
    if (bucketId && !bucketIds.has(bucketId)) missingBuckets += 1;
  });

  safeArray(data.transfers).forEach((transfer) => {
    if (!transfer.fromAccountId || !transfer.toAccountId) {
      transferAccountIssues += 1;
    }

    if (transfer.fromAccountId && !accountIds.has(transfer.fromAccountId)) {
      missingAccounts += 1;
      transferAccountIssues += 1;
    }

    if (transfer.toAccountId && !accountIds.has(transfer.toAccountId)) {
      missingAccounts += 1;
      transferAccountIssues += 1;
    }

    if (
      transfer.fromAccountId &&
      transfer.toAccountId &&
      transfer.fromAccountId === transfer.toAccountId
    ) {
      sameAccountTransfers += 1;
    }

    const bucketId = transfer.bucketId || transfer.savingsBucketId;
    if (bucketId && !bucketIds.has(bucketId)) missingBuckets += 1;
  });

  if (missingAccounts > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Missing account references',
      `${missingAccounts} records reference missing accounts.`,
      'Review account-linked scheduled items, adjustments, and transfers before relying on account totals.'
    );
  }

  if (missingCategories > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Missing category references',
      `${missingCategories} records reference missing categories.`,
      'Review categories used by scheduled items, manual adjustments, and budget targets.'
    );
  }

  if (missingBuckets > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Missing savings bucket references',
      `${missingBuckets} records reference missing savings buckets.`,
      'Review savings transfers, bucket adjustments, and linked scheduled items.'
    );
  }

  if (transferAccountIssues > 0) {
    addHealthIssue(
      issues,
      'error',
      'Transfer account issues',
      `${transferAccountIssues} transfers are missing source/destination accounts or point to accounts that do not exist.`,
      'Review the affected transfer and choose valid accounts before relying on reports or future desktop import.'
    );
  }

  if (sameAccountTransfers > 0) {
    addHealthIssue(
      issues,
      'error',
      'Transfers use the same account',
      `${sameAccountTransfers} transfers have the same source and destination account.`,
      'Edit the transfer so money moves between two different accounts.'
    );
  }

  if (scheduledTransfersWithoutBuckets > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Scheduled transfers without bucket links',
      `${scheduledTransfersWithoutBuckets} scheduled transfers are not linked to savings buckets.`,
      'This can be okay for account-only transfers. Link a bucket when the transfer should affect savings bucket reporting.'
    );
  }
}

function checkPlannerEntries(data, issues) {
  const plannerEntries = isPlainObject(data.plannerEntries)
    ? data.plannerEntries
    : data.planner?.entries || {};

  if (!isPlainObject(plannerEntries)) {
    addHealthIssue(
      issues,
      'error',
      'Planner entries structure issue',
      'Planner entries are not stored as an object.',
      'Export a backup before attempting repair. Planner entry keys should not be rewritten manually.'
    );
    return;
  }

  const scheduledIds = new Set(safeArray(data.scheduledItems).map((item) => item.id));
  let emptyKeys = 0;
  let missingScheduledReferences = 0;
  let invalidEntryShapes = 0;

  Object.entries(plannerEntries).forEach(([entryKey, entry]) => {
    if (!entryKey) emptyKeys += 1;
    if (!isPlainObject(entry)) {
      invalidEntryShapes += 1;
      return;
    }

    const [scheduledItemId] = String(entryKey).split('__');
    if (scheduledItemId && !scheduledIds.has(scheduledItemId)) {
      missingScheduledReferences += 1;
    }

    if (
      entry.actualAmount !== undefined &&
      entry.actualAmount !== '' &&
      !Number.isFinite(Number(entry.actualAmount))
    ) {
      invalidEntryShapes += 1;
    }

    safeArray(entry.lineItems).forEach((lineItem) => {
      if (!hasFiniteNumber(lineItem?.amount)) {
        invalidEntryShapes += 1;
      }
    });
  });

  if (emptyKeys > 0 || invalidEntryShapes > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Planner entry issues',
      `${emptyKeys + invalidEntryShapes} planner entries have empty keys, invalid values, or invalid line item amounts.`,
      'Review planner edits before relying on pay-period totals.'
    );
  }

  if (missingScheduledReferences > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Planner entries reference missing scheduled items',
      `${missingScheduledReferences} planner entries reference scheduled items that are not currently saved.`,
      'This can happen after old imports or deleted scheduled items. Do not rewrite keys unless you are intentionally cleaning data.'
    );
  }
}

function checkBudgetTargets(data, issues) {
  const activeCategoryTargets = new Set();
  let duplicateActiveTargets = 0;
  let invalidBudgetAmounts = 0;

  safeArray(data.budgetTargets || data.budgets).forEach((target) => {
    if (!hasFiniteNumber(target.amount) || Number(target.amount) < 0) {
      invalidBudgetAmounts += 1;
    }

    if (target.active === false || !target.categoryId) {
      return;
    }

    if (activeCategoryTargets.has(target.categoryId)) {
      duplicateActiveTargets += 1;
      return;
    }

    activeCategoryTargets.add(target.categoryId);
  });

  if (duplicateActiveTargets > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Duplicate active budget targets',
      `${duplicateActiveTargets} categories have more than one active budget target.`,
      'Budgets should normally have one active monthly target per category.'
    );
  }

  if (invalidBudgetAmounts > 0) {
    addHealthIssue(
      issues,
      'error',
      'Invalid budget amounts',
      `${invalidBudgetAmounts} budget targets have invalid or negative amounts.`,
      'Review budget targets before relying on budget reports.'
    );
  }
}

function getMovementKey(record = {}) {
  const date = record.date || record.payPeriodDate || '';
  const bucketId =
    record.bucketId ||
    record.savingsBucketId ||
    record.toBucketId ||
    record.fromBucketId ||
    '';
  const amount = Number(record.amount) || 0;
  const direction =
    record.transferType === 'from_savings_bucket' ||
    record.adjustmentType === 'transfer_out' ||
    amount < 0
      ? 'out'
      : 'in';

  return `${date}|${bucketId}|${direction}|${Math.abs(amount).toFixed(2)}`;
}

function checkSavingsMovementRisks(data, issues) {
  const adjustmentKeys = new Set(
    safeArray(data.savingsBucketAdjustments).map((adjustment) =>
      getMovementKey(adjustment)
    )
  );
  const duplicateMovementRisks = safeArray(data.transfers).filter(
    (transfer) =>
      transfer.bucketId &&
      (transfer.transferType === 'to_savings_bucket' ||
        transfer.transferType === 'from_savings_bucket') &&
      adjustmentKeys.has(getMovementKey(transfer))
  ).length;

  if (duplicateMovementRisks > 0) {
    addHealthIssue(
      issues,
      'warning',
      'Possible duplicate savings movement',
      `${duplicateMovementRisks} bucket-linked transfers match savings bucket adjustments by date, bucket, direction, and amount.`,
      'Reports try to avoid double counting matching movements, but review these records if savings totals look unexpected.'
    );
  }
}

export function getDataHealthDetails(data = {}) {
  const sourceData = getHealthSourceData(data);
  const issues = [];
  const collections = getHealthCollectionRows(sourceData);

  checkRequiredIds(collections, issues);
  checkDateFields(sourceData, issues);
  checkAmountFields(sourceData, issues);
  checkReferenceHealth(sourceData, issues);
  checkPlannerEntries(sourceData, issues);
  checkBudgetTargets(sourceData, issues);
  checkSavingsMovementRisks(sourceData, issues);

  const errors = issues.filter((issue) => issue.severity === 'error');
  const warnings = issues.filter((issue) => issue.severity === 'warning');

  return {
    errors,
    warnings,
    info: [
      {
        id: 'info-backup-first',
        severity: 'info',
        title: 'Backup before major cleanup',
        message:
          'Export a backup before making manual corrections or clearing browser data.',
        guidance:
          'Data Health does not delete records or rewrite IDs. It only reports issues.',
      },
    ],
    allIssues: issues,
  };
}

export function getDataHealthSummary(data = {}) {
  const safeData = getSafeAppData(data);
  const summary = getBackupSectionSummary(safeData);
  const warnings = getReferenceWarnings(safeData);
  const referenceWarningCounts = getReferenceWarningCounts(safeData);
  const healthDetails = getDataHealthDetails(data);
  const backupStatus = getBackupReminderStatus(
    safeData.appMetadata?.lastBackupAt
  );

  return {
    appVersion: APP_VERSION,
    appDataVersion: APP_DATA_VERSION,
    lastBackupAt: backupStatus.lastBackupAt,
    backupStatus,
    counts: summary,
    warningsCount: Math.max(warnings.length, healthDetails.warnings.length),
    errorsCount: healthDetails.errors.length,
    referenceWarningCounts,
    healthDetails,
  };
}
