const DB_NAME = 'budget-planner-db';
const DB_VERSION = 3;

const STORES = {
  plannerEntries: 'plannerEntries',
  scheduledItems: 'scheduledItems',
  accounts: 'accounts',
  manualAdjustments: 'manualAdjustments',
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
    };
  });
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

export async function clearPlannerEntries() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORES.plannerEntries, 'readwrite');
    const store = transaction.objectStore(STORES.plannerEntries);
    const request = store.clear();

    request.onerror = () => {
      reject(new Error('Failed to clear planner entries.'));
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