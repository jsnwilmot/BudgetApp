import { normalizeBudgetTarget } from '../logic/budgetLogic';
import { normalizeScheduledItem } from '../logic/scheduledItemLogic';
import { normalizeTransfer } from '../logic/transferLogic';
import {
  appSettings as defaultAppSettings,
  categories as defaultCategories,
} from './seedData';

export const APP_DATA_VERSION = 2;
export const APP_VERSION = '2.0.0-phase-2q';
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

export function getDataHealthSummary(data = {}) {
  const safeData = getSafeAppData(data);
  const summary = getBackupSectionSummary(safeData);
  const warnings = getReferenceWarnings(safeData);
  const referenceWarningCounts = getReferenceWarningCounts(safeData);
  const backupStatus = getBackupReminderStatus(
    safeData.appMetadata?.lastBackupAt
  );

  return {
    appVersion: APP_VERSION,
    appDataVersion: APP_DATA_VERSION,
    lastBackupAt: backupStatus.lastBackupAt,
    backupStatus,
    counts: summary,
    warningsCount: warnings.length,
    referenceWarningCounts,
  };
}
