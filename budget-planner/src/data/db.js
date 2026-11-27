import {
  appSettings as defaultAppSettings,
  categories as defaultCategories,
  getDemoAppState,
  getEmptyAppState,
} from './seedData';
import { normalizeBudgetTarget } from '../logic/budgetLogic';
import {
  isValidDateString,
  normalizeScheduledItem,
  scheduledItemTypes,
} from '../logic/scheduledItemLogic';
import {
  capturePlannerSource,
  getPlannerEntryIdentity,
  preserveLegacyPlannerSource,
} from '../logic/plannerHistory';
import { normalizeTransfer } from '../logic/transferLogic';
import {
  APP_DATA_VERSION,
  APP_METADATA_ID,
  getSafeAppData,
  isPlainObject,
  normalizeAccountRecord,
  normalizeAppMetadataRecord,
  normalizeAppSettingsRecord,
  normalizeCategoryRecord,
  normalizeManualAdjustmentRecord,
  normalizePlannerEntriesRecord,
  normalizeSavingsBucketAdjustmentRecord,
  normalizeSavingsBucketRecord,
  safeBoolean,
  sortCategories as sortCategoryRecords,
} from './migrations';

import { DB_VERSION, STORES, STORE_NAMES, getStoreKeyPath } from './databaseSchema';
import { matchesBackupRecord, validateFullBackup } from '../services/fullBackup';

const DB_NAME = 'budget-planner-db';
const SETTINGS_ID = 'app-settings';

let freshlyCreated = false;
let databasePromise = null;

function openDatabase() {
  if (!databasePromise) {
    freshlyCreated = false;
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

      request.onupgradeneeded = (event) => {
        const db = request.result;
        freshlyCreated = event.oldVersion === 0;

        // Keep creation checks compatible with every older database version.
        if (event.oldVersion >= DB_VERSION) {
          return;
        }

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

export function wasDatabaseCreatedOnOpen() {
  return freshlyCreated;
}

function assertBackupSchema(db, transaction) {
  if (db.version !== DB_VERSION || db.objectStoreNames.length !== STORE_NAMES.length) {
    throw new Error('Database schema is incompatible with complete backups.');
  }
  for (const name of STORE_NAMES) {
    const store = transaction.objectStore(name);
    if (store.keyPath !== getStoreKeyPath(name) || store.autoIncrement || store.indexNames.length) {
      throw new Error('Database store schema is incompatible with complete backups.');
    }
  }
}

export async function readBackupSnapshot() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES, 'readonly');
    assertBackupSchema(db, transaction);
    const stores = STORE_NAMES.map((name) => ({
      name, keyPath: getStoreKeyPath(name), records: [],
    }));
    transaction.onabort = () => reject(transaction.error ?? new Error('Backup read aborted.'));
    transaction.oncomplete = () => resolve({ databaseVersion: db.version, stores });
    for (const store of stores) {
      const request = transaction.objectStore(store.name).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          store.records.push([cursor.primaryKey, cursor.value]);
          cursor.continue();
        }
      };
    }
  });
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
    let settled = false;

    function fail(message, abortTransaction = false) {
      if (settled) {
        return;
      }

      settled = true;

      if (abortTransaction) {
        try {
          transaction.abort();
        } catch (error) {
          if (error?.name !== 'InvalidStateError') {
            console.error(error);
          }
        }
      }

      reject(new Error(message));
    }

    clearRequest.onerror = () => {
      fail(`Failed to clear ${storeName}.`, true);
    };

    clearRequest.onsuccess = () => {
      records.forEach((record) => {
        const req = store.put(record);

        req.onerror = () => {
          fail(`Failed to write record to ${storeName}.`, true);
        };
      });
    };

    transaction.onerror = () => {
      fail(`Failed to replace ${storeName}.`);
    };

    transaction.onabort = () => {
      fail(`Failed to replace ${storeName}.`);
    };

    transaction.oncomplete = () => {
      if (settled) {
        return;
      }

      settled = true;
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
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.appMetadata, 'readwrite');
    const store = transaction.objectStore(STORES.appMetadata);
    const request = store.get(APP_METADATA_ID);
    let savedMetadata;
    transaction.onabort = () => reject(transaction.error ?? new Error('Backup reminder update aborted.'));
    transaction.oncomplete = () => resolve(savedMetadata);
    request.onsuccess = () => {
      // Update only the reminder fields. Keep the raw historical metadata intact.
      savedMetadata = {
        ...request.result,
        id: APP_METADATA_ID,
        lastBackupAt,
        updatedAt: new Date().toISOString(),
      };
      store.put(savedMetadata);
    };
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

export class PreRestoreDataChangedError extends Error {
  constructor() {
    super('Current data changed after the safety backup. Prepare and save a new safety backup before importing.');
  }
}

export async function importBackupData(importedData, safetyBackup) {
  if (!safetyBackup) throw new Error('A saved pre-restore safety backup is required.');
  return replaceNormalizedAppData(importedData, safetyBackup);
}

// Legacy backup previews and reset fixtures use normalized logical data.
// Prepare the records for both storage and React before beginning the write.
async function replaceNormalizedAppData(importedData, safetyBackup) {
  if (importedData?.appDataVersion !== APP_DATA_VERSION ||
      !isPlainObject(importedData.appMetadata) || !isPlainObject(importedData.settings) ||
      !isPlainObject(importedData.plannerEntries)) {
    throw new Error('Invalid prepared backup data.');
  }

  const plannerRecords = Object.entries(importedData.plannerEntries).map(
    ([entryKey, entry]) => {
      if (entry?.entryKey !== entryKey) {
        throw new Error('Invalid planner entry key in backup.');
      }
      return entry;
    }
  );
  const recordsByStore = {
    [STORES.budgetTargets]: importedData.budgetTargets,
    [STORES.categories]: importedData.categories,
    [STORES.plannerEntries]: plannerRecords,
    [STORES.scheduledItems]: importedData.scheduledItems,
    [STORES.accounts]: importedData.accounts,
    [STORES.manualAdjustments]: importedData.manualAdjustments,
    [STORES.savingsBuckets]: importedData.savingsBuckets,
    [STORES.savingsBucketAdjustments]: importedData.savingsBucketAdjustments,
    [STORES.transfers]: importedData.transfers,
  };

  for (const [storeName, records] of Object.entries(recordsByStore)) {
    if (!Array.isArray(records)) {
      throw new Error('Missing prepared backup records.');
    }
    const keyPath = storeName === STORES.plannerEntries ? 'entryKey' : 'id';
    const keys = new Set();
    for (const record of records) {
      const key = record?.[keyPath];
      const validKey = (typeof key === 'string' && key.trim()) ||
        (keyPath === 'id' && Number.isFinite(key));
      if (!validKey || keys.has(key)) {
        throw new Error('Invalid or duplicate prepared backup record key.');
      }
      keys.add(key);
    }
  }

  const updatedAt = new Date().toISOString();
  const hasRecords = Object.entries(recordsByStore).some(
    ([storeName, records]) => storeName !== STORES.categories && records.length > 0
  );
  const appMetadata = normalizeAppMetadata({
    ...importedData.appMetadata,
    id: APP_METADATA_ID,
    dataMode: importedData.appMetadata.dataMode || (hasRecords ? 'custom' : 'empty'),
    updatedAt,
  });
  const settings = {
    ...normalizeAppSettings(importedData.settings),
    id: SETTINGS_ID,
    updatedAt,
  };
  recordsByStore[STORES.appMetadata] = [appMetadata];
  recordsByStore[STORES.appSettings] = [settings];
  const savedData = { ...importedData, appMetadata, settings };

  await replaceBackupStores(recordsByStore, safetyBackup);
  return savedData;
}

export async function restoreFullBackup(backup, safetyBackup) {
  if (!safetyBackup) throw new Error('A saved pre-restore safety backup is required.');
  const { recordsByStore } = await validateFullBackup(backup);
  const prepared = Object.fromEntries(STORE_NAMES.map((name) => [
    name, recordsByStore[name].map(([, record]) => record),
  ]));
  await replaceBackupStores(prepared, safetyBackup);
}

async function replaceBackupStores(recordsByStore, safetyBackup) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAMES, 'readwrite');
    let queueError;
    transaction.onabort = () => {
      reject(queueError ?? transaction.error ?? new Error('Backup import was aborted.'));
    };
    transaction.oncomplete = () => resolve();

    function abort(error) {
      queueError = error;
      transaction.abort();
    }

    function queueReplacement() {
      for (const [storeName, records] of Object.entries(recordsByStore)) {
        const store = transaction.objectStore(storeName);
        store.clear();
        for (const record of records) {
          store.put(record);
        }
      }
      // Unhandled IndexedDB request errors abort the entire transaction by default.
    }

    try {
      assertBackupSchema(db, transaction);
      if (!safetyBackup) {
        queueReplacement();
        return;
      }

      // Another tab may have written since the download. Check the exact saved
      // inventory under the same write lock before clearing any store.
      let remaining = STORE_NAMES.length;
      for (const [storeIndex, name] of STORE_NAMES.entries()) {
        const { name: archiveStore, records } = safetyBackup.stores[storeIndex];
        if (archiveStore !== name) throw new PreRestoreDataChangedError();
        let index = 0;
        const request = transaction.objectStore(name).openCursor();
        request.onsuccess = () => {
          try {
            const cursor = request.result;
            if (cursor) {
              let matches = false;
              try {
                matches = matchesBackupRecord(records[index], cursor.primaryKey, cursor.value);
              } catch {
                // A value that the backup codec cannot encode is a change too.
              }
              if (!matches) throw new PreRestoreDataChangedError();
              index++;
              cursor.continue();
              return;
            }
            if (index !== records.length) throw new PreRestoreDataChangedError();
            if (--remaining === 0) queueReplacement();
          } catch (error) {
            abort(error);
          }
        };
      }
    } catch (error) {
      // A synchronous request error can occur after earlier writes were queued.
      abort(error);
    }
  });
}

async function resetAppData(resetState) {
  const currentMetadata = await getAppMetadata();
  const safeData = getSafeAppData({
    ...resetState,
    appDataVersion: APP_DATA_VERSION,
    appMetadata: {
      ...resetState.appMetadata,
      lastBackupAt: currentMetadata.lastBackupAt || '',
      onboardingCompletedAt: currentMetadata.onboardingCompletedAt || '',
    },
  });

  return replaceNormalizedAppData(safeData);
}

export async function resetAppToDemoData() {
  return resetAppData(getDemoAppState());
}

export async function resetAppToEmptyState() {
  return resetAppData(getEmptyAppState());
}

export async function getAllCategories({ seedDefaults = true } = {}) {
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
        resolve(seedDefaults ? null : []);
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

export async function savePlannerEntry(entryKey, entry, displayedSource) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.scheduledItems, STORES.plannerEntries], 'readwrite');
    const store = transaction.objectStore(STORES.plannerEntries);
    let record;
    let error;
    transaction.oncomplete = () => resolve(record);
    transaction.onabort = () => reject(error ?? transaction.error ?? new Error('Failed to save planner entry.'));

    // Serialize confirmation with schedule deletion and preserve the source the
    // user saw in the editor, even if the current schedule has since changed.
    const source = transaction.objectStore(STORES.scheduledItems).get(entry.scheduledItemId);
    const existing = store.get(entryKey);
    existing.onsuccess = () => {
      try {
        const previous = existing.result;
        if (!source.result) throw new Error('This scheduled item was removed. Reopen the Planner.');
        if (!getPlannerEntryIdentity(entryKey, previous ?? entry)) {
          throw new Error('The saved Planner entry has conflicting identity information.');
        }
        record = { ...previous, ...entry, entryKey, updatedAt: new Date().toISOString() };
        const previouslyValidated = safeBoolean(previous?.validated);
        if (previouslyValidated) {
          // An ordinary save must not turn a missing legacy planned amount
          // into a confirmed zero or refresh a known amount from the schedule.
          if (Object.hasOwn(previous, 'plannedAmount')) record.plannedAmount = previous.plannedAmount;
          else delete record.plannedAmount;
        }
        if (record.validated && record.scheduledItemSnapshot == null) {
          if (displayedSource?.id !== entry.scheduledItemId ||
              !scheduledItemTypes.includes(displayedSource?.type)) {
            throw new Error('This Planner cell has no reliable scheduled source. Reopen the Planner.');
          }
          record.scheduledItemSnapshot = capturePlannerSource(displayedSource);
          record.scheduledItemSnapshotProvenance = previouslyValidated
            ? 'unverified-current-source' : 'captured-at-entry-save';
        }
        store.put(record);
      } catch (cause) {
        error = cause;
        transaction.abort();
      }
    };
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

async function writeScheduleWithHistory(id, mutate) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.scheduledItems, STORES.plannerEntries], 'readwrite');
    const schedules = transaction.objectStore(STORES.scheduledItems);
    const planner = transaction.objectStore(STORES.plannerEntries);
    let result;
    let error;
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(error ?? transaction.error ?? new Error('Scheduled item update failed.'));

    const current = schedules.get(id);
    const prefix = `${id}__`;
    const history = planner.getAll(IDBKeyRange.bound(prefix, `${prefix}\uffff`));
    history.onsuccess = () => {
      try {
        const confirmed = history.result.filter((entry) =>
          safeBoolean(entry.validated) &&
          entry.entryKey.slice(0, entry.entryKey.lastIndexOf('__')) === String(id));
        result = mutate(current.result, confirmed, schedules, planner);
      } catch (cause) {
        error = cause;
        transaction.abort();
      }
    };
  });
}

export async function saveScheduledItem(item) {
  const record = { ...normalizeScheduledItem(item), updatedAt: new Date().toISOString() };
  return writeScheduleWithHistory(record.id, (current, entries, schedules, planner) => {
    const historicalEntries = [];
    if (current && scheduledItemTypes.includes(current.type)) {
      const previous = normalizeScheduledItem(current);
      const historyFields = [
        'amount', 'type', 'name', 'active', 'frequency', 'startDate', 'endDate', 'dueDay',
        'dueMonth', 'accountId', 'categoryId', 'bucketId', 'toAccountId', 'allowLineItems',
      ];
      if (historyFields.some((field) => previous[field] !== record[field])) {
        for (const entry of entries) {
          if (!getPlannerEntryIdentity(entry.entryKey, entry)) continue;
          const snapshot = preserveLegacyPlannerSource(entry, previous);
          if (snapshot !== entry) {
            planner.put(snapshot);
            historicalEntries.push(snapshot);
          }
        }
      }
    }
    schedules.put(record);
    return { item: record, historicalEntries };
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
  return writeScheduleWithHistory(id, (_current, entries, schedules) => {
    if (entries.length) {
      throw new Error('This scheduled item has validated Planner history. Deactivate it or set an end date to keep that history.');
    }
    schedules.delete(id);
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
