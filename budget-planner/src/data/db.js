const DB_NAME = 'budget-planner-db';
const DB_VERSION = 1;

const STORES = {
  plannerEntries: 'plannerEntries',
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