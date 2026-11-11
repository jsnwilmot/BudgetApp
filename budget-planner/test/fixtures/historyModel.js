// Hand-authored B1-shaped source, no native database / factory / owner files.
import { SCHEMA, STORES, RAW, B1_CAPABILITIES, keyEncode, keyCompare } from '../../experimental/checkpoint/backupFormat.js';
import { sourceRevision } from '../../experimental/checkpoint/adapter.js';
import { encodeSyntheticBackup } from '../../experimental/checkpoint/backupCodec.js';
import { createHistoryModel, captureHistoryOrigin, createHistoryDataset } from '../../experimental/checkpoint/historyModel.js';

export const goodModel = r => { if (!r.ok) throw Error('synthetic fixture: ' + JSON.stringify(r.diagnostics)); return r; };
// Independent source-native schema oracle, not generated from the model's DTO.
export const SOURCE_KEYPATHS = Object.freeze({ appMetadata: 'id', appSettings: 'id', budgetTargets: 'id', categories: 'id',
  plannerEntries: 'entryKey', scheduledItems: 'id', accounts: 'id', manualAdjustments: 'id', savingsBuckets: 'id',
  savingsBucketAdjustments: 'id', transfers: 'id', financialControl: 'id', recordRevisions: ['collection', 'key'],
  checkpointDrafts: ['id', 'revision'], checkpointDraftHeads: 'id', financialAudit: 'id', protectedSnapshots: 'id' });
export function historicalSource() {
  const stores = Object.fromEntries(STORES.map(s => [s, []]));
  const add = (store, value) => stores[store].push({ key: value[SCHEMA[store]], value });
  add('accounts', { id: 'C', type: 'chequing', startingBalance: 1000, active: true });
  add('accounts', { id: 'S', type: 'savings', startingBalance: 500, active: false });
  add('savingsBuckets', { id: 'tax', linkedAccountId: 'S', startingAmount: 500, deletedAt: '2025-01-01' });
  add('appMetadata', { id: 'app-metadata', verified: true, plannerLastEntryMarker: { cellKey: 'orphan-0__2026-12-16' },
    originalAudit: [{ id: 'source-correction', evidence: 'synthetic-reference' }],
    candidateEdges: Array.from({ length: 11 }, (_, i) => [i, i + 25]) });
  for (let i = 0; i < 49; i++) {
    const source = i < 25 ? `orphan-${i}` : i < 47 ? `newer-${i}` : `real-tax-bill-${i - 47}`;
    add('plannerEntries', { entryKey: `${source}__2026-12-16`, scheduledItemId: source, payPeriodDate: '2026-12-16',
      validated: i >= 14, useActual: true, actualAmount: '100.00', plannedAmount: '100.00',
      lineItems: [{ id: `line-${i}-A`, amount: '25.00' }, { id: `line-${i}-B`, amount: '75.00' }],
      scheduledItemSnapshot: { id: source, type: i < 47 ? 'transfer' : 'expense',
        accountId: i >= 25 && i < 47 ? 'missing-original' : 'C', bucketId: i < 47 ? 'tax' : null },
      historicalSourceCorrections: [{ id: `audit-${i}`, evidence: 'synthetic-original' }], notes: 'Unchanged original' });
  }
  const control = { id: 'financial-control', protocolVersion: 1, synthetic: true, mode: 'inactive-only',
    capabilities: [...B1_CAPABILITIES], generation: 'foreign-generation', stateRevision: '0', financialRevision: '0' };
  add('financialControl', control);
  for (const store of RAW) for (const row of stores[store]) stores.recordRevisions.push({ key: [store, row.key],
    value: { collection: store, key: row.key, generation: control.generation, revision: '0', deleted: false, contentToken: sourceRevision(row.value) } });
  stores.recordRevisions.push({ key: ['categories', 'deleted-source'], value: { collection: 'categories', key: 'deleted-source',
    generation: 'old-source-generation', revision: '0', deleted: true, contentToken: null } });
  const beforeSeed = { stores: Object.fromEntries(STORES.filter(s => !['financialAudit', 'protectedSnapshots'].includes(s)).map(s => [s, []])),
    history: { financialAudit: [], protectedSnapshots: [] } };
  function journal(id, revision, kind, before, affected) {
    add('financialAudit', { id, commandIdentity: 'a'.repeat(64), receipt: { operationId: id, kind, generation: control.generation,
      stateRevision: revision, financialRevision: '0', snapshotId: id }, affected, consent: { confirmed: true, action: kind } });
    add('protectedSnapshots', { id, before });
  }
  journal('foreign-init', '0', 'initialize', beforeSeed, RAW.map(collection => ({ collection })));
  const beforeDraft = { stores: structuredClone(Object.fromEntries(STORES.filter(s => !['financialAudit', 'protectedSnapshots'].includes(s)).map(s => [s, stores[s]]))),
    history: { financialAudit: ['foreign-init'], protectedSnapshots: ['foreign-init'] } };
  control.stateRevision = '1';
  stores.checkpointDrafts.push({ key: ['draft-shared', '0'], value: { id: 'draft-shared', revision: '0', status: 'inactive',
    payload: { synthetic: true, openingMinor: '700000', evidenceRef: 'synthetic-draft' } } });
  add('checkpointDraftHeads', { id: 'draft-shared', revision: '0' });
  journal('foreign-draft', '1', 'inactive-draft', beforeDraft, [{ collection: 'checkpointDrafts', key: ['draft-shared', '0'] }]);
  for (const s of STORES) stores[s].sort((a, b) => keyCompare(keyEncode(a.key), keyEncode(b.key)));
  return { synthetic: true, protocolVersion: 1, databaseName: 'finpath-synthetic-b1-hand-reference', stores };
}
export async function modelFixture(inputSnapshot = historicalSource()) {
  const bytes = goodModel(await encodeSyntheticBackup(inputSnapshot, { appVersion: 'synthetic-p1-fixture', exportedAt: '2026-12-31T00:00:00.000Z' })).bytes;
  let model = goodModel(await createHistoryModel({ synthetic: true, instanceId: 'p1-instance', generation: 'local-generation' })).model;
  const captured = goodModel(await captureHistoryOrigin(model, { synthetic: true, operationId: 'foreign-init', bytes, expectedRoot: model.root })); model = captured.model;
  model = goodModel(await createHistoryDataset(model, { synthetic: true, operationId: 'project-A', datasetId: 'A', originId: captured.originId, expectedRoot: model.root })).model;
  return { model, originId: captured.originId, bytes, source: inputSnapshot };
}
