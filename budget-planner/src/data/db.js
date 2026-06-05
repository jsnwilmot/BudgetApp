import {
  appSettings as defaultAppSettings,
  categories as defaultCategories,
  getDemoAppState,
  getEmptyAppState,
} from './seedData';
import { normalizeBudgetTarget } from '../logic/budgetLogic';
import { normalizeScheduledItem } from '../logic/scheduledItemLogic';
import { normalizeTransfer } from '../logic/transferLogic';
import {
  APP_DATA_VERSION,
  APP_METADATA_ID,
  getSafeAppData,
  normalizeAccountRecord,
  normalizeAppMetadataRecord,
  normalizeAppSettingsRecord,
  normalizeCategoryRecord,
  normalizeManualAdjustmentRecord,
  normalizePlannerEntriesRecord,
  normalizeSavingsBucketAdjustmentRecord,
  normalizeSavingsBucketRecord,
  sortCategories as sortCategoryRecords,
} from './migrations';

const DB_NAME = 'budget-planner-db';
const DB_VERSION = 9;
const SETTINGS_ID = 'app-settings';

const STORES = {
  appMetadata: 'appMetadata',
  appSettings: 'appSettings',
  budgetTargets: 'budgetTargets',
  categories: 'categories',
  plannerEntries: 'plannerEntries',
  scheduledItems: 'scheduledItems',
  accounts: 'accounts',
  manualAdjustments: 'manualAdjustments',
  savingsBuckets: 'savingsBuckets',
  savingsBucketAdjustments: 'savingsBucketAdjustments',
  transfers: 'transfers',
};

let databasePromise = null;

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        databasePromise = null;
        reject(new Error('Failed to open IndexedDB database.'));
      };

      request.onsuccess = () => {
        const db = request.result;

        db.onversionchange = () => {
          db.close();
          databasePromise = null;
        };

        resolve(db);
      };

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(STORES.plannerEntries)) {
          db.createObjectStore(STORES.plannerEntries, {
            keyPath: 'entryKey',
          });
        }

        if (!db.objectStoreNames.contains(STORES.appMetadata)) {
          db.createObjectStore(STORES.appMetadata, {
            keyPath: 'id',
          });
        }

        if (!db.objectStoreNames.contains(STORES.appSettings)) {
          db.createObjectStore(STORES.appSettings, {
            keyPath: 'id',
          });
        }

        if (!db.objectStoreNames.contains(STORES.categories)) {
          db.createObjectStore(STORES.categories, {
            keyPath: 'id',
          });
        }

        if (!db.objectStoreNames.contains(STORES.budgetTargets)) {
          db.createObjectStore(STORES.budgetTargets, {
            keyPath: 'id',
          });
        }

        if (!db.objectStoreNames.contains(STORES.scheduledItems)) {
          db.createObjectStore(STORES.scheduledItems, {
            keyPath: 'id',
          });
        }

        if (!db.objectStoreNames.contains(STORES.accounts)) {
          db.createObjectStore(STORES.accounts, {
            keyPath: 'id',
          });
        }

        if (!db.objectStoreNames.contains(STORES.manualAdjustments)) {
          db.createObjectStore(STORES.manualAdjustments, {
            keyPath: 'id',
          });
        }

        if (!db.objectStoreNames.contains(STORES.savingsBuckets)) {
          db.createObjectStore(STORES.savingsBuckets, {
            keyPath: 'id',
          });
        }

        if (!db.objectStoreNames.contains(STORES.savingsBucketAdjustments)) {
          db.createObjectStore(STORES.savingsBucketAdjustments, {
            keyPath: 'id',
          });
        }

        if (!db.objectStoreNames.contains(STORES.transfers)) {
          db.createObjectStore(STORES.transfers, {
            keyPath: 'id',
          });
        }
      };
    });
  }

  return databasePromise;
}

function isValidDateString(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validateAppSettings(settings = {}) {
  const safeSettings =
    settings && typeof settings === 'object' ? settings : {};
  const errors = [];

  if (!['CAD', 'USD'].includes(safeSettings.currency)) {
    errors.push('Currency must be CAD or USD.');
  }

  if (!isValidDateString(safeSettings.payPeriodAnchorDate)) {
    errors.push('Pay period anchor date must be a valid date.');
  }

  if (![7, 14, 28, 30].includes(Number(safeSettings.payFrequencyDays))) {
    errors.push('Pay frequency must be 7, 14, 28, or 30 days.');
  }

  if (![3, 6, 12, 18, 24].includes(Number(safeSettings.projectionMonths))) {
    errors.push('Projection range must be 3, 6, 12, 18, or 24 months.');
  }

  if (
    !['previous-pay-period', 'same-pay-period'].includes(
      safeSettings.monthlyBillAssignmentRule
    )
  ) {
    errors.push('Monthly bill assignment rule is not supported.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeAppSettings(settings = {}) {
  return normalizeAppSettingsRecord(settings);
}

export function normalizeAppMetadata(metadata = {}) {
  return normalizeAppMetadataRecord(metadata);
}

function rejectTransaction(reject, message) {
  return () => {
    reject(new Error(message));
  };
}

function resolveOnTransactionComplete({
  transaction,
  resolve,
  reject,
  value,
  errorMessage,
}) {
  transaction.onerror = rejectTransaction(reject, errorMessage);
  transaction.onabort = rejectTransaction(reject, errorMessage);
  transaction.oncomplete = () => {
    resolve(typeof value === 'function' ? value() : value);
  };
}

async function replaceStoreRecords(storeName, records = []) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const clearRequest = store.clear();

    clearRequest.onerror = () => {
      reject(new Error(`Failed to clear ${storeName}.`));
    };

    clearRequest.onsuccess = () => {
      records.forEach((record) => {
        const req = store.put(record);

        req.onerror = () => {
          reject(new Error(`Failed to write record to ${storeName}.`));
        };
      });
    };

    transaction.onerror = () => {
      reject(new Error(`Failed to replace ${storeName}.`));
    };

    transaction.oncomplete = () => {
      resolve(records);
    };
  });
}

export async function getAppSettings() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.appSettings, 'readonly');
    const store = transaction.objectStore(STORES.appSettings);
    const request = store.get(SETTINGS_ID);

    request.onerror = () => {
      reject(new Error('Failed to load app settings.'));
    };

    request.onsuccess = () => {
      resolve(normalizeAppSettings(request.result || defaultAppSettings));
    };
  });
}

export async function saveAppSettings(settings) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.appSettings, 'readwrite');
    const store = transaction.objectStore(STORES.appSettings);
    const record = {
      ...normalizeAppSettings(settings),
      id: SETTINGS_ID,
      updatedAt: new Date().toISOString(),
    };
    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save app settings.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save app settings.',
    });
  });
}

export async function resetAppSettings() {
  return saveAppSettings(defaultAppSettings);
}

export async function getAppMetadata() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.appMetadata, 'readonly');
    const store = transaction.objectStore(STORES.appMetadata);
    const request = store.get(APP_METADATA_ID);

    request.onerror = () => {
      reject(new Error('Failed to load app metadata.'));
    };

    request.onsuccess = () => {
      resolve(normalizeAppMetadata(request.result || {}));
    };
  });
}

export async function saveAppMetadata(metadata = {}) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.appMetadata, 'readwrite');
    const store = transaction.objectStore(STORES.appMetadata);
    const record = normalizeAppMetadata({
      ...metadata,
      id: APP_METADATA_ID,
      updatedAt: new Date().toISOString(),
    });
    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save app metadata.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save app metadata.',
    });
  });
}

export async function saveLastBackupAt(lastBackupAt = new Date().toISOString()) {
  const currentMetadata = await getAppMetadata();

  return saveAppMetadata({
    ...currentMetadata,
    lastBackupAt,
  });
}

export async function replacePlannerEntries(entries = {}) {
  const normalizedEntries = normalizePlannerEntriesRecord(entries);
  const records = Object.entries(normalizedEntries).map(([entryKey, entry]) => ({
    ...entry,
    entryKey,
  }));

  return replaceStoreRecords(STORES.plannerEntries, records);
}

export async function replaceScheduledItems(items = []) {
  return replaceStoreRecords(
    STORES.scheduledItems,
    items.map((item) => normalizeScheduledItem(item))
  );
}

export async function replaceCategories(categories = []) {
  const records = categories.map((category, index) =>
    normalizeCategoryRecord(category, index + 1)
  );

  return replaceStoreRecords(STORES.categories, records);
}

export async function replaceBudgetTargets(targets = []) {
  return replaceStoreRecords(
    STORES.budgetTargets,
    targets.map((target) => normalizeBudgetTarget(target))
  );
}

export async function replaceAccounts(accounts = []) {
  return replaceStoreRecords(
    STORES.accounts,
    accounts.map((account) => normalizeAccountRecord(account))
  );
}

export async function replaceManualAdjustments(adjustments = []) {
  return replaceStoreRecords(
    STORES.manualAdjustments,
    adjustments.map((adjustment) => normalizeManualAdjustmentRecord(adjustment))
  );
}

export async function replaceSavingsBuckets(buckets = []) {
  return replaceStoreRecords(
    STORES.savingsBuckets,
    buckets.map((bucket) => normalizeSavingsBucketRecord(bucket))
  );
}

export async function replaceSavingsBucketAdjustments(adjustments = []) {
  return replaceStoreRecords(
    STORES.savingsBucketAdjustments,
    adjustments.map((adjustment) =>
      normalizeSavingsBucketAdjustmentRecord(adjustment)
    )
  );
}

export async function replaceTransfers(transfers = []) {
  return replaceStoreRecords(
    STORES.transfers,
    transfers.map((transfer) => normalizeTransfer(transfer))
  );
}

async function replaceCompleteAppData(appData = {}) {
  const safeData = getSafeAppData({
    appDataVersion: APP_DATA_VERSION,
    ...appData,
  });

  const [
    savedAppMetadata,
    savedSettings,
    savedBudgetTargets,
    savedCategories,
    savedPlannerEntries,
    savedScheduledItems,
    savedAccounts,
    savedManualAdjustments,
    savedSavingsBuckets,
    savedSavingsBucketAdjustments,
    savedTransfers,
  ] = await Promise.all([
    saveAppMetadata(safeData.appMetadata),
    saveAppSettings(safeData.settings),
    replaceBudgetTargets(safeData.budgetTargets),
    replaceCategories(safeData.categories),
    replacePlannerEntries(safeData.plannerEntries),
    replaceScheduledItems(safeData.scheduledItems),
    replaceAccounts(safeData.accounts),
    replaceManualAdjustments(safeData.manualAdjustments),
    replaceSavingsBuckets(safeData.savingsBuckets),
    replaceSavingsBucketAdjustments(safeData.savingsBucketAdjustments),
    replaceTransfers(safeData.transfers),
  ]);

  return {
    ...safeData,
    appMetadata: savedAppMetadata,
    settings: savedSettings,
    budgetTargets: savedBudgetTargets,
    categories: savedCategories,
    plannerEntries: normalizePlannerEntriesRecord(savedPlannerEntries),
    scheduledItems: savedScheduledItems,
    accounts: savedAccounts,
    manualAdjustments: savedManualAdjustments,
    savingsBuckets: savedSavingsBuckets,
    savingsBucketAdjustments: savedSavingsBucketAdjustments,
    transfers: savedTransfers,
  };
}

export function getDemoState() {
  return getSafeAppData(getDemoAppState());
}

export function getEmptyState() {
  return getSafeAppData(getEmptyAppState());
}

async function getResetStateWithPreservedMetadata(resetState) {
  const currentMetadata = await getAppMetadata();

  return {
    ...resetState,
    appMetadata: {
      ...resetState.appMetadata,
      lastBackupAt: currentMetadata.lastBackupAt || '',
      onboardingCompletedAt: currentMetadata.onboardingCompletedAt || '',
    },
  };
}

export async function resetAppToDemoData() {
  return replaceCompleteAppData(
    await getResetStateWithPreservedMetadata(getDemoAppState())
  );
}

export async function resetAppToEmptyState() {
  return replaceCompleteAppData(
    await getResetStateWithPreservedMetadata(getEmptyAppState())
  );
}

export async function getAllCategories() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.categories, 'readonly');
    const store = transaction.objectStore(STORES.categories);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to load categories.'));
    };

    request.onsuccess = () => {
      const records = request.result || [];

      if (records.length === 0) {
        resolve(null);
        return;
      }

      resolve(
        sortCategoryRecords(
          records.map((category) => normalizeCategoryRecord(category))
        )
      );
    };
  }).then(async (records) => {
    if (records) {
      return records;
    }

    return resetCategoriesToDefaults();
  });
}

export async function saveCategory(category) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.categories, 'readwrite');
    const store = transaction.objectStore(STORES.categories);
    const record = normalizeCategoryRecord({
      ...category,
      updatedAt: new Date().toISOString(),
    });
    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save category.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save category.',
    });
  });
}

export async function archiveCategory(categoryId) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.categories, 'readwrite');
    const store = transaction.objectStore(STORES.categories);
    const request = store.get(categoryId);
    let archivedRecord = null;

    request.onerror = () => {
      reject(new Error('Failed to load category.'));
    };

    request.onsuccess = () => {
      const category = request.result;

      if (!category) {
        reject(new Error('Category was not found.'));
        return;
      }

      archivedRecord = normalizeCategoryRecord({
        ...category,
        active: false,
        updatedAt: new Date().toISOString(),
      });
      const saveRequest = store.put(archivedRecord);

      saveRequest.onerror = () => {
        reject(new Error('Failed to archive category.'));
      };
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: () => archivedRecord,
      errorMessage: 'Failed to archive category.',
    });
  });
}

export async function resetCategoriesToDefaults() {
  return replaceCategories(defaultCategories);
}

export async function getAllBudgetTargets() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.budgetTargets, 'readonly');
    const store = transaction.objectStore(STORES.budgetTargets);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to load budget targets.'));
    };

    request.onsuccess = () => {
      resolve(
        (request.result || []).map((target) => normalizeBudgetTarget(target))
      );
    };
  });
}

export async function saveBudgetTarget(target) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.budgetTargets, 'readwrite');
    const store = transaction.objectStore(STORES.budgetTargets);
    const record = normalizeBudgetTarget({
      ...target,
      updatedAt: new Date().toISOString(),
    });
    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save budget target.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save budget target.',
    });
  });
}

export async function archiveBudgetTarget(budgetTargetId) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.budgetTargets, 'readwrite');
    const store = transaction.objectStore(STORES.budgetTargets);
    const request = store.get(budgetTargetId);
    let archivedRecord = null;

    request.onerror = () => {
      reject(new Error('Failed to load budget target.'));
    };

    request.onsuccess = () => {
      const target = request.result;

      if (!target) {
        reject(new Error('Budget target was not found.'));
        return;
      }

      archivedRecord = normalizeBudgetTarget({
        ...target,
        active: false,
        updatedAt: new Date().toISOString(),
      });
      const saveRequest = store.put(archivedRecord);

      saveRequest.onerror = () => {
        reject(new Error('Failed to archive budget target.'));
      };
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: () => archivedRecord,
      errorMessage: 'Failed to archive budget target.',
    });
  });
}

export async function resetBudgetTargets() {
  return replaceBudgetTargets([]);
}

export async function getAllPlannerEntries() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.plannerEntries, 'readonly');
    const store = transaction.objectStore(STORES.plannerEntries);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to load planner entries.'));
    };

    request.onsuccess = () => {
      const entries = {};

      request.result.forEach((entry) => {
        entries[entry.entryKey] = entry;
      });

      resolve(normalizePlannerEntriesRecord(entries));
    };
  });
}

export async function savePlannerEntry(entryKey, entry) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.plannerEntries, 'readwrite');
    const store = transaction.objectStore(STORES.plannerEntries);

    const record = {
      ...entry,
      entryKey,
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save planner entry.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save planner entry.',
    });
  });
}

export async function deletePlannerEntry(entryKey) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.plannerEntries, 'readwrite');
    const store = transaction.objectStore(STORES.plannerEntries);
    const request = store.delete(entryKey);

    request.onerror = () => {
      reject(new Error('Failed to delete planner entry.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      errorMessage: 'Failed to delete planner entry.',
    });
  });
}

export async function getAllScheduledItems() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scheduledItems, 'readonly');
    const store = transaction.objectStore(STORES.scheduledItems);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to load scheduled items.'));
    };

    request.onsuccess = () => {
      resolve(
        (request.result || []).map((item) => normalizeScheduledItem(item))
      );
    };
  });
}

export async function saveScheduledItem(item) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scheduledItems, 'readwrite');
    const store = transaction.objectStore(STORES.scheduledItems);

    const record = {
      ...normalizeScheduledItem(item),
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save scheduled item.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save scheduled item.',
    });
  });
}

export async function getAllAccounts() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.accounts, 'readonly');
    const store = transaction.objectStore(STORES.accounts);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to load accounts.'));
    };

    request.onsuccess = () => {
      resolve((request.result || []).map((account) => normalizeAccountRecord(account)));
    };
  });
}

export async function saveAccount(account) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.accounts, 'readwrite');
    const store = transaction.objectStore(STORES.accounts);

    const record = {
      ...normalizeAccountRecord(account),
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save account.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save account.',
    });
  });
}

export async function getAllManualAdjustments() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.manualAdjustments, 'readonly');
    const store = transaction.objectStore(STORES.manualAdjustments);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to load manual adjustments.'));
    };

    request.onsuccess = () => {
      resolve(
        (request.result || []).map((adjustment) =>
          normalizeManualAdjustmentRecord(adjustment)
        )
      );
    };
  });
}

export async function saveManualAdjustment(adjustment) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.manualAdjustments, 'readwrite');
    const store = transaction.objectStore(STORES.manualAdjustments);

    const record = {
      ...normalizeManualAdjustmentRecord(adjustment),
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save manual adjustment.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save manual adjustment.',
    });
  });
}

export async function deleteManualAdjustment(id) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.manualAdjustments, 'readwrite');
    const store = transaction.objectStore(STORES.manualAdjustments);
    const request = store.delete(id);

    request.onerror = () => {
      reject(new Error('Failed to delete manual adjustment.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      errorMessage: 'Failed to delete manual adjustment.',
    });
  });
}

export async function getAllSavingsBuckets() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.savingsBuckets, 'readonly');
    const store = transaction.objectStore(STORES.savingsBuckets);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to load savings buckets.'));
    };

    request.onsuccess = () => {
      resolve((request.result || []).map((bucket) => normalizeSavingsBucketRecord(bucket)));
    };
  });
}

export async function saveSavingsBucket(bucket) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.savingsBuckets, 'readwrite');
    const store = transaction.objectStore(STORES.savingsBuckets);

    const record = {
      ...normalizeSavingsBucketRecord(bucket),
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save savings bucket.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save savings bucket.',
    });
  });
}

export async function getAllSavingsBucketAdjustments() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.savingsBucketAdjustments, 'readonly');
    const store = transaction.objectStore(STORES.savingsBucketAdjustments);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to load savings bucket adjustments.'));
    };

    request.onsuccess = () => {
      resolve(
        (request.result || []).map((adjustment) =>
          normalizeSavingsBucketAdjustmentRecord(adjustment)
        )
      );
    };
  });
}

export async function saveSavingsBucketAdjustment(adjustment) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.savingsBucketAdjustments, 'readwrite');
    const store = transaction.objectStore(STORES.savingsBucketAdjustments);

    const record = {
      ...normalizeSavingsBucketAdjustmentRecord(adjustment),
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save savings bucket adjustment.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save savings bucket adjustment.',
    });
  });
}

export async function deleteSavingsBucketAdjustment(id) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.savingsBucketAdjustments, 'readwrite');
    const store = transaction.objectStore(STORES.savingsBucketAdjustments);
    const request = store.delete(id);

    request.onerror = () => {
      reject(new Error('Failed to delete savings bucket adjustment.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      errorMessage: 'Failed to delete savings bucket adjustment.',
    });
  });
}

export async function getAllTransfers() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.transfers, 'readonly');
    const store = transaction.objectStore(STORES.transfers);
    const request = store.getAll();

    request.onerror = () => {
      reject(new Error('Failed to load transfers.'));
    };

    request.onsuccess = () => {
      resolve((request.result || []).map((transfer) => normalizeTransfer(transfer)));
    };
  });
}

export async function saveTransfer(transfer) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.transfers, 'readwrite');
    const store = transaction.objectStore(STORES.transfers);
    const record = normalizeTransfer({
      ...transfer,
      updatedAt: new Date().toISOString(),
    });
    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save transfer.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      value: record,
      errorMessage: 'Failed to save transfer.',
    });
  });
}

export async function deleteTransfer(id) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.transfers, 'readwrite');
    const store = transaction.objectStore(STORES.transfers);
    const request = store.delete(id);

    request.onerror = () => {
      reject(new Error('Failed to delete transfer.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      errorMessage: 'Failed to delete transfer.',
    });
  });
}

export async function deleteScheduledItem(id) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scheduledItems, 'readwrite');
    const store = transaction.objectStore(STORES.scheduledItems);
    const request = store.delete(id);

    request.onerror = () => {
      reject(new Error('Failed to delete scheduled item.'));
    };

    resolveOnTransactionComplete({
      transaction,
      resolve,
      reject,
      errorMessage: 'Failed to delete scheduled item.',
    });
  });
}

export async function repairLocalData() {
  const [
    settings,
    budgetTargets,
    categories,
    plannerEntries,
    scheduledItems,
    accounts,
    manualAdjustments,
    savingsBuckets,
    savingsBucketAdjustments,
    transfers,
    appMetadata,
  ] = await Promise.all([
    getAppSettings(),
    getAllBudgetTargets(),
    getAllCategories(),
    getAllPlannerEntries(),
    getAllScheduledItems(),
    getAllAccounts(),
    getAllManualAdjustments(),
    getAllSavingsBuckets(),
    getAllSavingsBucketAdjustments(),
    getAllTransfers(),
    getAppMetadata(),
  ]);

  const repairedData = getSafeAppData({
    appDataVersion: APP_DATA_VERSION,
    settings,
    budgetTargets,
    categories,
    plannerEntries,
    scheduledItems,
    accounts,
    manualAdjustments,
    savingsBuckets,
    savingsBucketAdjustments,
    transfers,
    appMetadata,
  });

  const [
    savedSettings,
    savedBudgetTargets,
    savedCategories,
    savedPlannerEntries,
    savedScheduledItems,
    savedAccounts,
    savedManualAdjustments,
    savedSavingsBuckets,
    savedSavingsBucketAdjustments,
    savedTransfers,
    savedAppMetadata,
  ] = await Promise.all([
    saveAppSettings(repairedData.settings),
    replaceBudgetTargets(repairedData.budgetTargets),
    replaceCategories(repairedData.categories),
    replacePlannerEntries(repairedData.plannerEntries),
    replaceScheduledItems(repairedData.scheduledItems),
    replaceAccounts(repairedData.accounts),
    replaceManualAdjustments(repairedData.manualAdjustments),
    replaceSavingsBuckets(repairedData.savingsBuckets),
    replaceSavingsBucketAdjustments(repairedData.savingsBucketAdjustments),
    replaceTransfers(repairedData.transfers),
    saveAppMetadata(repairedData.appMetadata),
  ]);

  return {
    ...repairedData,
    settings: savedSettings,
    budgetTargets: savedBudgetTargets,
    categories: savedCategories,
    plannerEntries: normalizePlannerEntriesRecord(savedPlannerEntries),
    scheduledItems: savedScheduledItems,
    accounts: savedAccounts,
    manualAdjustments: savedManualAdjustments,
    savingsBuckets: savedSavingsBuckets,
    savingsBucketAdjustments: savedSavingsBucketAdjustments,
    transfers: savedTransfers,
    appMetadata: savedAppMetadata,
  };
}
