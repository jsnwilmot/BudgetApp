// Entirely synthetic. Sentinels must never reach CLI output.
export function reconciliationFixture() {
  const date = (i) => new Date(Date.UTC(2026,0,2+i*7)).toISOString().slice(0,10);
  const current = { id: 'PRIVATE_CURRENT_SENTINEL', name: 'PRIVATE_NAME_SENTINEL', type: 'transfer', accountId: 'PRIVATE_MISSING_ACCOUNT', bucketId: 'PRIVATE_BUCKET', amount: 8765432.19, active: true, frequency: 'once', startDate: '2025-01-01' };
  const bill = { id: 'PRIVATE_BILL', type: 'expense', accountId: 'c', amount: 100, active: false, frequency: 'once', startDate: '2025-01-01' };
  const entries = {};
  function add(id, i, planned, actual, snapshot) {
    const key = `${id}__${date(i)}`;
    entries[key] = { entryKey: key, scheduledItemId: id, payPeriodDate: date(i), plannedAmount: planned, actualAmount: actual, useActual: true, validated: true, notes: 'PRIVATE_NOTES_SENTINEL', lineItems: [], ...(snapshot ? { scheduledItemSnapshot: snapshot } : {}) };
  }
  for (let i=0;i<25;i++) add('PRIVATE_OLD_SENTINEL',i,80,100);
  for (let i=0;i<22;i++) add(current.id,i,120,100);
  add(bill.id,0,100,100,bill); add(bill.id,20,100,100,bill);
  return { exportVersion: 1, schemaVersion: 2, data: { settings: { currency: 'CAD', payPeriodAnchorDate: date(0), payFrequencyDays: 7, projectionMonths: 6 },
    accounts: [{ id:'c',name:'PRIVATE_CHEQUING',type:'chequing',startingBalance:10000 },{ id:'s',name:'PRIVATE_SAVINGS',type:'savings',startingBalance:0 }],
    categories: [], scheduledItems: [current], plannerEntries: entries, savingsBuckets: [{id:'PRIVATE_BUCKET',linkedAccountId:'PRIVATE_BAD_BUCKET_ACCOUNT',startingAmount:0}], transfers: [], savingsBucketAdjustments: [], manualAdjustments: [],
    appMetadata: { plannerLastEntryMarker: { cellKey: Object.keys(entries)[0] } } } };
}
export const selection = { orphanSource:'PRIVATE_OLD_SENTINEL', currentSource:'PRIVATE_CURRENT_SENTINEL' };
