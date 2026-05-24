import {
  BACKUP_APP_NAME,
  EXPORT_APP_NAME,
  getBackupSectionSummary,
  getCurrentAppDataVersion,
  getCurrentAppVersion,
  getReferenceWarningCounts,
  isPlainObject,
  normalizeImportedAppData,
  safeArray,
} from '../data/migrations';

const EXPORT_VERSION = 1;
const BASE_PATH = '/BudgetApp/';
const SOURCE = 'web-pwa';
const LEGACY_SOURCE = 'local';
const SUPPORTED_APP_NAMES = new Set([EXPORT_APP_NAME, BACKUP_APP_NAME]);

function getPortableData(appData = {}) {
  const budgetTargets = safeArray(appData.budgetTargets || appData.budgets);

  return {
    appVersion: getCurrentAppVersion(),
    appDataVersion: getCurrentAppDataVersion(),
    appMetadata: appData.appMetadata || {},
    settings: appData.settings || {},
    accounts: safeArray(appData.accounts),
    categories: safeArray(appData.categories),
    transactions: safeArray(appData.transactions),
    scheduledItems: safeArray(appData.scheduledItems),
    plannerEntries: isPlainObject(appData.plannerEntries)
      ? appData.plannerEntries
      : appData.planner?.entries || {},
    manualAdjustments: safeArray(appData.manualAdjustments),
    savingsBuckets: safeArray(appData.savingsBuckets),
    savingsBucketAdjustments: safeArray(appData.savingsBucketAdjustments),
    transfers: safeArray(appData.transfers),
    budgets: budgetTargets,
    budgetTargets,
    planner: appData.planner || {
      entries: appData.plannerEntries || {},
      payPeriods: [],
      rows: [],
    },
    savings: appData.savings || {
      buckets: safeArray(appData.savingsBuckets),
      transfers: [
        ...safeArray(appData.savingsBucketAdjustments),
        ...safeArray(appData.transfers),
      ],
    },
  };
}

function getEnvelope(backup) {
  if (!isPlainObject(backup)) {
    return null;
  }

  if (isPlainObject(backup.data)) {
    const metadata = isPlainObject(backup.metadata) ? backup.metadata : {};

    return {
      data: backup.data,
      metadata: {
        appName: backup.appName || metadata.appName || '',
        appVersion: backup.appVersion || metadata.appVersion || '',
        exportVersion:
          backup.exportVersion || metadata.exportVersion || metadata.backupVersion || '',
        backupVersion: metadata.backupVersion || '',
        schemaVersion:
          backup.schemaVersion ||
          metadata.schemaVersion ||
          metadata.appDataVersion ||
          backup.data?.appDataVersion ||
          0,
        appDataVersion:
          metadata.appDataVersion ||
          backup.schemaVersion ||
          backup.data?.appDataVersion ||
          0,
        exportedAt: backup.exportedAt || metadata.createdAt || '',
        source: backup.source || metadata.source || '',
        basePath: backup.basePath || metadata.basePath || '',
      },
      wrapped: true,
    };
  }

  if (
    isPlainObject(backup.settings) ||
    Array.isArray(backup.accounts) ||
    Array.isArray(backup.scheduledItems) ||
    isPlainObject(backup.plannerEntries)
  ) {
    return {
      data: backup,
      metadata: {
        appName: BACKUP_APP_NAME,
        appVersion: backup.appVersion || '',
        exportVersion: '',
        backupVersion: '',
        schemaVersion: backup.appDataVersion || 0,
        appDataVersion: backup.appDataVersion || 0,
        exportedAt: backup.exportedAt || backup.createdAt || '',
        source: LEGACY_SOURCE,
        basePath: '',
      },
      wrapped: false,
    };
  }

  return null;
}

function addMissingCollectionWarnings(data, warnings) {
  const optionalCollections = [
    ['transfers', 'Older backup detected. Missing transfers will be imported as an empty list.'],
    [
      'savingsBucketAdjustments',
      'Older backup detected. Missing savings bucket adjustments will be imported as an empty list.',
    ],
    [
      'manualAdjustments',
      'Older backup detected. Missing manual adjustments will be imported as an empty list.',
    ],
    [
      'plannerEntries',
      'Older backup detected. Missing planner entries will be imported as an empty object.',
    ],
    ['budgetTargets', 'Older backup detected. Missing budgets will be imported as an empty list.'],
    ['settings', 'Older backup detected. Missing settings will be merged with defaults.'],
  ];

  optionalCollections.forEach(([key, message]) => {
    const hasBudgetAlias = key === 'budgetTargets' && Array.isArray(data.budgets);
    const hasPlannerAlias = key === 'plannerEntries' && isPlainObject(data.planner?.entries);

    if (data[key] === undefined && !hasBudgetAlias && !hasPlannerAlias) {
      warnings.push(message);
    }
  });
}

function validateSectionTypes(data, errors) {
  const arraySections = [
    ['accounts', 'Accounts'],
    ['categories', 'Categories'],
    ['transactions', 'Transactions'],
    ['scheduledItems', 'Scheduled items'],
    ['manualAdjustments', 'Manual adjustments'],
    ['savingsBuckets', 'Savings buckets'],
    ['savingsBucketAdjustments', 'Savings bucket adjustments'],
    ['transfers', 'Transfers'],
  ];

  arraySections.forEach(([key, label]) => {
    if (data[key] !== undefined && !Array.isArray(data[key])) {
      errors.push(`${label} must be an array.`);
    }
  });

  if (
    data.budgetTargets !== undefined &&
    !Array.isArray(data.budgetTargets) &&
    !Array.isArray(data.budgets)
  ) {
    errors.push('Budgets must be an array.');
  }

  if (
    data.plannerEntries !== undefined &&
    !isPlainObject(data.plannerEntries) &&
    !Array.isArray(data.plannerEntries)
  ) {
    errors.push('Planner entries must be an object.');
  }

  if (data.settings !== undefined && !isPlainObject(data.settings)) {
    errors.push('Settings must be an object.');
  }
}

function validateIds(records, sectionName, errors) {
  const seenIds = new Set();

  safeArray(records).forEach((record, index) => {
    if (!isPlainObject(record)) {
      errors.push(`${sectionName} record ${index + 1} must be an object.`);
      return;
    }

    if (!record.id) {
      errors.push(`${sectionName} record ${index + 1} is missing an id.`);
      return;
    }

    if (seenIds.has(record.id)) {
      errors.push(`${sectionName} contains duplicate id ${record.id}.`);
      return;
    }

    seenIds.add(record.id);
  });
}

function addReferenceWarnings(data, warnings) {
  const accountIds = new Set(safeArray(data.accounts).map((account) => account.id));
  const categoryIds = new Set(safeArray(data.categories).map((category) => category.id));
  const bucketIds = new Set(safeArray(data.savingsBuckets).map((bucket) => bucket.id));
  const counts = {
    scheduledMissingCategories: 0,
    scheduledMissingBuckets: 0,
    manualMissingCategories: 0,
    budgetMissingCategories: 0,
    bucketAdjustmentMissingBuckets: 0,
    transferMissingAccounts: 0,
    transferMissingBuckets: 0,
  };

  safeArray(data.scheduledItems).forEach((item) => {
    if (item.categoryId && !categoryIds.has(item.categoryId)) {
      counts.scheduledMissingCategories += 1;
    }

    const bucketId = item.savingsBucketId || item.bucketId;

    if (bucketId && !bucketIds.has(bucketId)) {
      counts.scheduledMissingBuckets += 1;
    }
  });

  safeArray(data.manualAdjustments).forEach((adjustment) => {
    if (adjustment.categoryId && !categoryIds.has(adjustment.categoryId)) {
      counts.manualMissingCategories += 1;
    }
  });

  safeArray(data.budgetTargets || data.budgets).forEach((target) => {
    if (target.categoryId && !categoryIds.has(target.categoryId)) {
      counts.budgetMissingCategories += 1;
    }
  });

  safeArray(data.savingsBucketAdjustments).forEach((adjustment) => {
    const bucketId = adjustment.bucketId || adjustment.savingsBucketId;

    if (bucketId && !bucketIds.has(bucketId)) {
      counts.bucketAdjustmentMissingBuckets += 1;
    }
  });

  safeArray(data.transfers).forEach((transfer) => {
    if (
      (transfer.fromAccountId && !accountIds.has(transfer.fromAccountId)) ||
      (transfer.toAccountId && !accountIds.has(transfer.toAccountId))
    ) {
      counts.transferMissingAccounts += 1;
    }

    if (transfer.bucketId && !bucketIds.has(transfer.bucketId)) {
      counts.transferMissingBuckets += 1;
    }
  });

  if (counts.scheduledMissingCategories > 0) {
    warnings.push(
      `${counts.scheduledMissingCategories} scheduled items reference missing categories.`
    );
  }

  if (counts.scheduledMissingBuckets > 0) {
    warnings.push(
      `${counts.scheduledMissingBuckets} scheduled items reference missing savings buckets.`
    );
  }

  if (counts.manualMissingCategories > 0) {
    warnings.push(
      `${counts.manualMissingCategories} manual adjustments reference missing categories.`
    );
  }

  if (counts.budgetMissingCategories > 0) {
    warnings.push(
      `${counts.budgetMissingCategories} budgets reference missing categories.`
    );
  }

  if (counts.bucketAdjustmentMissingBuckets > 0) {
    warnings.push(
      `${counts.bucketAdjustmentMissingBuckets} savings bucket adjustments reference missing buckets.`
    );
  }

  if (counts.transferMissingAccounts > 0) {
    warnings.push(
      `${counts.transferMissingAccounts} transfers reference missing accounts.`
    );
  }

  if (counts.transferMissingBuckets > 0) {
    warnings.push(
      `${counts.transferMissingBuckets} transfers reference missing savings buckets.`
    );
  }
}

function getBackupMetadata(envelope) {
  return {
    appName: envelope.metadata.appName || 'Older app data',
    appVersion: envelope.metadata.appVersion || 'Unknown',
    exportVersion: envelope.metadata.exportVersion || 'Older backup',
    schemaVersion: Number(envelope.metadata.schemaVersion || 0),
    exportedAt: envelope.metadata.exportedAt || 'Unknown',
    source: envelope.metadata.source || 'Unknown',
    basePath: envelope.metadata.basePath || '',
  };
}

export function createBackupSnapshot(appData) {
  const exportedAt = new Date().toISOString();
  const data = getPortableData({
    ...appData,
    appMetadata: {
      ...(appData?.appMetadata || {}),
      lastBackupAt: exportedAt,
      updatedAt: exportedAt,
    },
  });

  return {
    appName: EXPORT_APP_NAME,
    appVersion: getCurrentAppVersion(),
    exportVersion: EXPORT_VERSION,
    schemaVersion: getCurrentAppDataVersion(),
    exportedAt,
    source: SOURCE,
    basePath: BASE_PATH,
    metadata: {
      appName: EXPORT_APP_NAME,
      legacyAppName: BACKUP_APP_NAME,
      appVersion: getCurrentAppVersion(),
      backupVersion: EXPORT_VERSION,
      exportVersion: EXPORT_VERSION,
      appDataVersion: getCurrentAppDataVersion(),
      schemaVersion: getCurrentAppDataVersion(),
      createdAt: exportedAt,
      exportedAt,
      source: SOURCE,
      basePath: BASE_PATH,
    },
    data,
  };
}

export function validateBackupFile(backup) {
  if (!isPlainObject(backup)) {
    return { valid: false, message: 'Backup file is not valid.' };
  }

  const envelope = getEnvelope(backup);

  if (!envelope) {
    return {
      valid: false,
      message: 'Backup data is missing.',
    };
  }

  if (envelope.wrapped && !envelope.metadata.appName) {
    return { valid: false, message: 'Backup metadata is missing.' };
  }

  if (
    envelope.metadata.appName &&
    !SUPPORTED_APP_NAMES.has(envelope.metadata.appName)
  ) {
    return { valid: false, message: 'This is not a FinPath backup file.' };
  }

  const appDataVersion = Number(envelope.metadata.appDataVersion || 0);

  if (appDataVersion > getCurrentAppDataVersion()) {
    return {
      valid: false,
      message: 'This backup is from a newer app version and cannot be imported.',
    };
  }

  if (!isPlainObject(envelope.data)) {
    return { valid: false, message: 'Backup data is missing.' };
  }

  const errors = [];
  const warnings = [];

  if (!envelope.metadata.exportVersion) {
    warnings.push('Older backup detected. Export version is missing.');
  }

  addMissingCollectionWarnings(envelope.data, warnings);
  validateSectionTypes(envelope.data, errors);
  validateIds(envelope.data.accounts, 'Accounts', errors);
  validateIds(envelope.data.categories, 'Categories', errors);
  validateIds(envelope.data.scheduledItems, 'Scheduled items', errors);
  validateIds(envelope.data.manualAdjustments, 'Manual adjustments', errors);
  validateIds(envelope.data.savingsBuckets, 'Savings buckets', errors);
  validateIds(
    envelope.data.savingsBucketAdjustments,
    'Savings bucket adjustments',
    errors
  );
  validateIds(envelope.data.transfers, 'Transfers', errors);
  validateIds(
    envelope.data.budgetTargets || envelope.data.budgets,
    'Budgets',
    errors
  );

  if (errors.length > 0) {
    return {
      valid: false,
      message: errors[0],
      errors,
      warnings,
    };
  }

  try {
    const normalizedData = normalizeImportedAppData(
      {
        ...envelope.data,
        appDataVersion,
        budgetTargets: envelope.data.budgetTargets || envelope.data.budgets,
      },
      {
        appDataVersion,
      }
    );

    addReferenceWarnings(normalizedData, warnings);

    return {
      valid: true,
      message: 'Backup file is valid.',
      data: normalizedData,
      summary: getBackupSectionSummary(normalizedData),
      metadata: getBackupMetadata(envelope),
      warnings,
      referenceWarningCounts: getReferenceWarningCounts(normalizedData),
    };
  } catch (error) {
    return {
      valid: false,
      message: error.message || 'Backup data could not be normalized.',
      warnings,
    };
  }
}

export function getBackupFileName() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = `${String(now.getHours()).padStart(2, '0')}${String(
    now.getMinutes()
  ).padStart(2, '0')}`;

  return `finpath-backup-${date}-${time}.json`;
}
