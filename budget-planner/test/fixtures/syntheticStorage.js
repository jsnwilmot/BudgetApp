import { RAW_STORES, STORAGE_CAPABILITIES } from '../../experimental/checkpoint/storageRepository.js';
import { independentLedger, refresh } from './checkpointAdapter.js';

// Invented fixtures only; no application db, backup reader or real profile.
export function storageFixture() {
  const financial = independentLedger();
  financial.data.budgetTargets = [];
  financial.data.meta.plannerLastEntryMarker = { plannerItemId: 'tax-save', occurrenceId: '2026-12-30', cellKey: 'tax-save__2026-12-30' };
  financial.data.plannerEntries['salary__2026-12-30'].lineItems = [
    { id: 'original-line-A', amount: '600.00' }, { id: 'original-line-B', amount: '400.00' },
  ];
  refresh(financial);
  const records = Object.fromEntries(RAW_STORES.map(store => [store, []]));
  for (const s of RAW_STORES) {
    if (s === 'appMetadata') records[s] = [{ key: 'app-metadata', value: { id: 'app-metadata', ...financial.data.meta } }];
    else if (s === 'appSettings') records[s] = [{ key: 'app-settings', value: { id: 'app-settings', ...financial.data.settings } }];
    else if (s === 'plannerEntries') records[s] = Object.entries(financial.data.plannerEntries).map(([key, value]) => ({ key, value }));
    else records[s] = financial.data[s].map(value => ({ key: value.id, value }));
  }
  return { financial, seed: { synthetic: true, operationId: 'bootstrap', generation: 'synthetic-generation-1',
    records, consent: { confirmed: true, action: 'initialize' } } };
}
export function request(operationId, changes) {
  return { synthetic: true, operationId, kind: 'financial', requiredCapabilities: [...STORAGE_CAPABILITIES],
    consent: { confirmed: true, action: 'financial' }, changes };
}
export function draftRequest(operationId, revision = '0') {
  return { synthetic: true, operationId, kind: 'inactive-draft', requiredCapabilities: [...STORAGE_CAPABILITIES],
    consent: { confirmed: true, action: 'inactive-draft' },
    draft: { id: 'synthetic-draft', revision, status: 'inactive', payload: { synthetic: true, openingMinor: '700000', evidenceRef: 'synthetic-reference' } } };
}
