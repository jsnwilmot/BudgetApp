// Fully invented, read-only DTO fixtures. Model history via the accepted B1
// repository in tests; never read a profile/file or discard retained history.
import { IDBFactory } from 'fake-indexeddb';
import { openSyntheticRepository, prepareSyntheticCommand, RAW_STORES } from '../../experimental/checkpoint/storageRepository.js';
import { draftRequest } from './syntheticStorage.js';

export async function growthFixture(years, periods = 26, drafts = 6) {
  const name = `finpath-synthetic-b1-size-${years}-${periods}-${drafts}`;
  const opened = await openSyntheticRepository({ factory: new IDBFactory(), name, synthetic: true });
  if (!opened.ok) throw Error('synthetic size fixture'); const repo = opened.repository;
  const records = Object.fromEntries(RAW_STORES.map(s => [s, []]));
  records.accounts = [{ key: 'C', value: { id: 'C', startingBalance: 1000, type: 'chequing' } },
    { key: 'S', value: { id: 'S', startingBalance: 500, type: 'savings' } }];
  records.savingsBuckets = [{ key: 'tax', value: { id: 'tax', linkedAccountId: 'S', startingAmount: 500 } }];
  records.appMetadata = [{ key: 'app-metadata', value: { id: 'app-metadata', plannerLastEntryMarker: { cellKey: 'cell-0-0' } } }];
  for (let row = 0; row < 12; row++) records.scheduledItems.push({ key: `source-${row}`, value: { id: `source-${row}`, active: false, amount: 100 } });
  for (let p = 0; p < periods * years; p++) {
    // ISO arithmetic deliberately crosses calendar years, original cadence 14d.
    const payPeriodDate = new Date(Date.UTC(2026, 0, 2) + p * 14 * 86400000).toISOString().slice(0, 10);
    for (let row = 0; row < 12; row++) {
      const entryKey = `cell-${p}-${row}`;
      records.plannerEntries.push({ key: entryKey, value: { entryKey, scheduledItemId: `source-${row}`, payPeriodDate,
        plannedAmount: '100.00', actualAmount: '100.00', useActual: true, validated: p % 3 !== 0,
        lineItems: [0, 1, 2].map(i => ({ id: `line-${p}-${row}-${i}`, amount: ['25.00', '25.00', '50.00'][i] })),
        notes: 'Synthetic retained financial history' } });
    }
    for (let i = 0; i < 2; i++) { const id = `manual-${p}-${i}`; records.transfers.push({ key: id, value: { id,
      fromAccountId: 'C', toAccountId: 'S', bucketId: 'tax', amount: '10.00', date: payPeriodDate } }); }
  }
  const init = await repo.initialize({ synthetic: true, operationId: 'size-init', generation: 'size-generation', records,
    consent: { confirmed: true, action: 'initialize' } });
  if (!init.ok) throw Error('synthetic size seed');
  for (let i = 0; i < drafts; i++) {
    const s = (await repo.snapshot()).snapshot, prepared = prepareSyntheticCommand(s, draftRequest(`size-draft-${i}`, String(i)));
    if (!prepared.ok || !(await repo.execute(prepared.command)).ok) throw Error('synthetic size draft');
  }
  const snapshot = (await repo.snapshot()).snapshot; repo.close();
  return { snapshot, assumptions: { years, periodsPerYear: periods, cells: years * periods * 12,
    lines: years * periods * 36, manualTransfers: years * periods * 2, retainedDraftVersions: drafts,
    operations: 1 + drafts, history: 'complete B1 before-states for every fixture operation, low-write history' } };
}

export function denseGrowthModel(years) {
  const base = 48 * 1024, annual = 1059264, operations = 370 * years;
  return { years, operations, currentBytes: base + annual * years,
    literalBytes: base + annual * years + operations * base + annual / 370 * operations * (operations - 1) / 2 +
      70 * operations * (operations - 1) / 2 + 768 * operations };
}
