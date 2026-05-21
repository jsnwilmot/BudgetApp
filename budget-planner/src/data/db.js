import { appSettings as defaultAppSettings } from './seedData';

const DB_NAME = 'budget-planner-db';
const DB_VERSION = 5;
const SETTINGS_ID = 'app-settings';

const STORES = {
  appSettings: 'appSettings',
  plannerEntries: 'plannerEntries',
  scheduledItems: 'scheduledItems',
  accounts: 'accounts',
  manualAdjustments: 'manualAdjustments',
  savingsBuckets: 'savingsBuckets',
  savingsBucketAdjustments: 'savingsBucketAdjustments',
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(new Error('Failed to open IndexedDB database.'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORES.plannerEntries)) {
        db.createObjectStore(STORES.plannerEntries, {
          keyPath: 'entryKey',
        });
      }

      if (!db.objectStoreNames.contains(STORES.appSettings)) {
        db.createObjectStore(STORES.appSettings, {
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
    };
  });
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
    ![
      'previous-pay-period',
      'previous_pay_period_before_due_date',
      'same-pay-period',
      'same_pay_period',
      'same_pay_period_as_due_date',
    ].includes(safeSettings.monthlyBillAssignmentRule)
  ) {
    errors.push('Monthly bill assignment rule is not supported.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function normalizeAppSettings(settings = {}) {
  const safeSettings =
    settings && typeof settings === 'object' ? settings : {};
  const currency = ['CAD', 'USD'].includes(safeSettings.currency)
    ? safeSettings.currency
    : defaultAppSettings.currency;
  const payFrequencyDays = [7, 14, 28, 30].includes(
    Number(safeSettings.payFrequencyDays)
  )
    ? Number(safeSettings.payFrequencyDays)
    : defaultAppSettings.payFrequencyDays;
  const projectionMonths = [3, 6, 12, 18, 24].includes(
    Number(safeSettings.projectionMonths)
  )
    ? Number(safeSettings.projectionMonths)
    : defaultAppSettings.projectionMonths;
  const payPeriodAnchorDate =
    isValidDateString(safeSettings.payPeriodAnchorDate)
      ? safeSettings.payPeriodAnchorDate
      : defaultAppSettings.payPeriodAnchorDate;

  return {
    ...defaultAppSettings,
    ...safeSettings,
    currency,
    payPeriodAnchorDate,
    payFrequencyDays,
    projectionMonths,
    monthlyBillAssignmentRule: normalizeSettingRule(
      safeSettings.monthlyBillAssignmentRule
    ),
  };
}

async function clearStore(storeName) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();

    request.onerror = () => {
      reject(new Error(`Failed to clear ${storeName}.`));
    };

    request.onsuccess = () => {
      resolve();
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
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
        store.put(record);
      });
    };

    transaction.onerror = () => {
      reject(new Error(`Failed to replace ${storeName}.`));
    };

    transaction.oncomplete = () => {
      db.close();
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

    transaction.oncomplete = () => {
      db.close();
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

    request.onsuccess = () => {
      resolve(record);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

export async function resetAppSettings() {
  return saveAppSettings(defaultAppSettings);
}

export async function replacePlannerEntries(entries = {}) {
  const records = Array.isArray(entries)
    ? entries
    : Object.entries(entries).map(([entryKey, entry]) => ({
        ...entry,
        entryKey,
      }));

  return replaceStoreRecords(STORES.plannerEntries, records);
}

export async function replaceScheduledItems(items = []) {
  return replaceStoreRecords(STORES.scheduledItems, items);
}

export async function replaceAccounts(accounts = []) {
  return replaceStoreRecords(STORES.accounts, accounts);
}

export async function replaceManualAdjustments(adjustments = []) {
  return replaceStoreRecords(STORES.manualAdjustments, adjustments);
}

export async function replaceSavingsBuckets(buckets = []) {
  return replaceStoreRecords(STORES.savingsBuckets, buckets);
}

export async function replaceSavingsBucketAdjustments(adjustments = []) {
  return replaceStoreRecords(STORES.savingsBucketAdjustments, adjustments);
}

export async function clearAllSavedData() {
  await Promise.all([
    clearStore(STORES.plannerEntries),
    clearStore(STORES.scheduledItems),
    clearStore(STORES.accounts),
    clearStore(STORES.manualAdjustments),
    clearStore(STORES.savingsBuckets),
    clearStore(STORES.savingsBucketAdjustments),
  ]);

  return resetAppSettings();
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

      resolve(entries);
    };

    transaction.oncomplete = () => {
      db.close();
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

    request.onsuccess = () => {
      resolve(record);
    };

    transaction.oncomplete = () => {
      db.close();
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

    request.onsuccess = () => {
      resolve();
    };

    transaction.oncomplete = () => {
      db.close();
    };
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
      resolve(request.result || []);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

export async function saveScheduledItem(item) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.scheduledItems, 'readwrite');
    const store = transaction.objectStore(STORES.scheduledItems);

    const record = {
      ...item,
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save scheduled item.'));
    };

    request.onsuccess = () => {
      resolve(record);
    };

    transaction.oncomplete = () => {
      db.close();
    };
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
      resolve(request.result || []);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

export async function saveAccount(account) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.accounts, 'readwrite');
    const store = transaction.objectStore(STORES.accounts);

    const record = {
      ...account,
      startingBalance: Number(account.startingBalance) || 0,
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save account.'));
    };

    request.onsuccess = () => {
      resolve(record);
    };

    transaction.oncomplete = () => {
      db.close();
    };
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
      resolve(request.result || []);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

export async function saveManualAdjustment(adjustment) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.manualAdjustments, 'readwrite');
    const store = transaction.objectStore(STORES.manualAdjustments);

    const record = {
      ...adjustment,
      amount: Number(adjustment.amount) || 0,
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save manual adjustment.'));
    };

    request.onsuccess = () => {
      resolve(record);
    };

    transaction.oncomplete = () => {
      db.close();
    };
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

    request.onsuccess = () => {
      resolve();
    };

    transaction.oncomplete = () => {
      db.close();
    };
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
      resolve(request.result || []);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

export async function saveSavingsBucket(bucket) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.savingsBuckets, 'readwrite');
    const store = transaction.objectStore(STORES.savingsBuckets);

    const record = {
      ...bucket,
      startingAmount: Number(bucket.startingAmount) || 0,
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save savings bucket.'));
    };

    request.onsuccess = () => {
      resolve(record);
    };

    transaction.oncomplete = () => {
      db.close();
    };
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
      resolve(request.result || []);
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}

export async function saveSavingsBucketAdjustment(adjustment) {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.savingsBucketAdjustments, 'readwrite');
    const store = transaction.objectStore(STORES.savingsBucketAdjustments);

    const record = {
      ...adjustment,
      amount: Number(adjustment.amount) || 0,
      updatedAt: new Date().toISOString(),
    };

    const request = store.put(record);

    request.onerror = () => {
      reject(new Error('Failed to save savings bucket adjustment.'));
    };

    request.onsuccess = () => {
      resolve(record);
    };

    transaction.oncomplete = () => {
      db.close();
    };
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

    request.onsuccess = () => {
      resolve();
    };

    transaction.oncomplete = () => {
      db.close();
    };
  });
}
