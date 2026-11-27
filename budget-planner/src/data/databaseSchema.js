export const DB_VERSION = 9;

export const STORES = {
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

export const STORE_NAMES = Object.values(STORES);

export function getStoreKeyPath(name) {
  return name === STORES.plannerEntries ? 'entryKey' : 'id';
}
