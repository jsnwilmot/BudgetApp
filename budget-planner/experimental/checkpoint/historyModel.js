// P1 synthetic model only. No native stores, transaction or restore operations.
import { decodeSyntheticBackup } from './backupCodec.js';
import { RAW, SCHEMA, STORES, budget } from './backupFormat.js';
import { builder, emptyStats, limits, copy, freeze, need, fields, plain, text, canonical, bad, P1, keyEncode, modelState, registerModel, typedFingerprint } from './historyCore.js';
import { emptyMap, mapFind, mapPut, mapRows } from './historyMap.js';

function minorStrings(v) {
  if (!v || typeof v !== 'object') return;
  for (const [k, value] of Object.entries(v)) {
    if (k.endsWith('Minor')) need(typeof value === 'string' && /^(0|-?[1-9]\d*)$/.test(value), 'UNSAFE_NUMBER');
    minorStrings(value);
  }
}
function handle(s) {
  const model = freeze({ synthetic: true, format: 'P1-MODEL-1', instanceId: s.instanceId, generation: s.generation,
    revision: s.revision, root: s.root, dataRoot: s.dataRoot, indexRoot: s.pool.digest }); return registerModel(model, s);
}
async function completed(s, b, operationId, requestDigest, dataRoot, operationsRoot, details) {
  const revision = String(BigInt(s.revision) + 1n); need(BigInt(revision) <= BigInt(s.limits.operations), 'RESOURCE_LIMIT');
  const journal = await b.intern('journal', { previous: s.journal, beforeModelRoot: s.root,
    afterDataRoot: dataRoot, operationId, requestDigest, revision, kind: 'MODEL_ONLY' });
  const event = await b.intern('event', { operationId, requestDigest, journal, afterDataRoot: dataRoot,
    revision, status: 'MODEL_ONLY', ...details });
  operationsRoot = await mapPut(b, operationsRoot, operationId, { valueRef: event, versionRef: event });
  const root = await b.intern('model-root', { instanceId: s.instanceId, generation: s.generation,
    revision, dataRoot, operationsRoot, journal });
  const eventBody = b.get(event).body;
  const model = handle({ ...s, ...b.done(), revision, root, dataRoot, operationsRoot, journal });
  return freeze({ ok: true, model, event: eventBody, replayed: false, ...details });
}
async function prepare(model, request, kind) {
  const s = modelState(model), r = copy(request);
  const shapes = {
    'capture-origin': ['synthetic', 'operationId', 'expectedRoot', 'sourceContentDigest', 'sourceTransportDigest'],
    'create-dataset': ['synthetic', 'operationId', 'datasetId', 'originId', 'expectedRoot'],
    'change-history': ['synthetic', 'operationId', 'datasetId', 'expectedRevision', 'expectedRoot', 'changes'],
  };
  fields(r, shapes[kind]); // Before replay too: caller fields cannot shadow trusted context.
  need(r.synthetic === true, 'SYNTHETIC_INPUT_REQUIRED'); need(text(r.operationId), 'INVALID_IDENTITY');
  const b = builder(s), digestRequest = { kind, instanceId: s.instanceId, generation: s.generation, ...r };
  // Byte inputs are handled by capture's copied digest DTO, never generic copy.
  const requestDigest = await b.hash(P1 + 'request/1', { typedRequest: await typedFingerprint(digestRequest) });
  const old = await mapFind(b, s.operationsRoot, r.operationId);
  if (old) {
    const event = b.get(old.valueRef).body; need(event.requestDigest === requestDigest, 'OPERATION_CONFLICT');
    return { replay: freeze({ ok: true, model, event, replayed: true }), s, r, b };
  }
  need(r.expectedRoot === s.root, 'STALE_REVISION');
  return { s, r, b, requestDigest };
}
export async function createHistoryModel(input) {
  try {
    const r = copy(input); need(r.synthetic === true, 'SYNTHETIC_INPUT_REQUIRED');
    need(Object.keys(r).every(k => ['synthetic', 'instanceId', 'generation', 'limits'].includes(k)) && text(r.instanceId) && text(r.generation), 'INVALID_FIELDS');
    const s = { instanceId: r.instanceId, generation: r.generation, limits: limits(r.limits),
      revision: '0', journal: null, pool: null, stats: emptyStats() }, b = builder(s);
    const empty = await emptyMap(b), dataRoot = await b.intern('data-root', { originsRoot: empty, datasetsRoot: empty });
    const root = await b.intern('model-root', { instanceId: s.instanceId, generation: s.generation,
      revision: '0', dataRoot, operationsRoot: empty, journal: null });
    return freeze({ ok: true, model: handle({ ...s, ...b.done(), root, dataRoot, operationsRoot: empty }) });
  } catch (e) { return bad(e); }
}
export async function captureHistoryOrigin(model, input) {
  try {
    modelState(model);
    // Inspect descriptors without executing byte/operation getters.
    need(plain(input) && Object.getOwnPropertySymbols(input).length === 0, 'UNSUPPORTED_TYPE');
    const d = Object.getOwnPropertyDescriptors(input);
    need(Object.keys(d).length === 4 && ['synthetic', 'operationId', 'bytes', 'expectedRoot'].every(k => d[k] && 'value' in d[k]), 'UNSUPPORTED_TYPE');
    need(d.synthetic.value === true, 'SYNTHETIC_INPUT_REQUIRED');
    const bytes = d.bytes.value; need(bytes instanceof Uint8Array, 'INVALID_INPUT');
    const received = new Uint8Array(bytes), decoded = await decodeSyntheticBackup(received);
    need(decoded.ok, decoded.diagnostics?.[0]?.code ?? 'INVALID_ORIGIN');
    const p = await prepare(model, { synthetic: d.synthetic.value, operationId: d.operationId.value,
      expectedRoot: d.expectedRoot.value, sourceContentDigest: decoded.contentDigest, sourceTransportDigest: decoded.transportDigest }, 'capture-origin');
    if (p.replay) return p.replay;
    const { s, r, b, requestDigest } = p;
    const originId = await b.hash(P1 + 'origin-identity/1', { snapshotDigest: decoded.snapshotDigest,
      contentDigest: decoded.contentDigest, transportDigest: decoded.transportDigest });
    const current = b.get(s.dataRoot).body, existing = await mapFind(b, current.originsRoot, originId);
    let originRef = existing?.valueRef;
    if (!originRef) {
      const envelopeRef = await b.value(decoded.envelope), inventory = [];
      for (const store of STORES) {
        let root = await emptyMap(b);
        for (const row of decoded.snapshot.stores[store]) {
          const keyRef = await b.value(keyEncode(row.key)), valueRef = await b.value(row.value);
          const versionRef = await b.intern('version', { datasetId: null, originId, store, keyRef, valueRef,
            deleted: false, previous: null, sourceVersionRef: null, localRevision: null });
          root = await mapPut(b, root, row.key, { valueRef, versionRef });
        }
        inventory.push({ store, keyPath: SCHEMA[store], root, count: decoded.snapshot.stores[store].length });
      }
      originRef = await b.intern('origin', { originId, sourceProfile: decoded.envelope.data.sourceProfile,
        databaseName: decoded.snapshot.databaseName, envelopeRef, inventory, snapshotDigest: decoded.snapshotDigest,
        contentDigest: decoded.contentDigest, transportDigest: decoded.transportDigest, transportBytesRetained: false });
    }
    const originsRoot = await mapPut(b, current.originsRoot, originId, { valueRef: originRef, versionRef: originRef });
    const dataRoot = await b.intern('data-root', { ...current, originsRoot });
    return completed(s, b, r.operationId, requestDigest, dataRoot, s.operationsRoot, { originId, originRef });
  } catch (e) { return bad(e); }
}
export async function createHistoryDataset(model, request) {
  try {
    const p = await prepare(model, request, 'create-dataset'); if (p.replay) return p.replay;
    const { s, r, b, requestDigest } = p; fields(r, ['synthetic', 'operationId', 'datasetId', 'originId', 'expectedRoot']);
    need(text(r.datasetId) && text(r.originId), 'INVALID_DATASET'); const current = b.get(s.dataRoot).body;
    need(!await mapFind(b, current.datasetsRoot, r.datasetId), 'INVALID_DATASET');
    const origin = await mapFind(b, current.originsRoot, r.originId); need(origin, 'INVALID_ORIGIN');
    const source = b.get(origin.valueRef).body, collections = [];
    for (const store of [...RAW, 'checkpointDrafts', 'checkpointDraftHeads']) {
      let root = await emptyMap(b);
      for (const row of await mapRows(b, source.inventory.find(i => i.store === store).root)) {
        const versionRef = await b.intern('version', { datasetId: r.datasetId, store, keyRef: row.keyRef,
          valueRef: row.valueRef, deleted: false, previous: null, sourceVersionRef: row.versionRef, localRevision: String(BigInt(s.revision) + 1n) });
        root = await mapPut(b, root, row.key, { valueRef: row.valueRef, versionRef });
      }
      collections.push({ store, root });
    }
    const datasetRef = await b.intern('dataset', { datasetId: r.datasetId, originId: r.originId,
      originRef: origin.valueRef, collections });
    const datasetsRoot = await mapPut(b, current.datasetsRoot, r.datasetId, { valueRef: datasetRef, versionRef: datasetRef });
    const dataRoot = await b.intern('data-root', { ...current, datasetsRoot });
    return completed(s, b, r.operationId, requestDigest, dataRoot, s.operationsRoot, { datasetId: r.datasetId });
  } catch (e) { return bad(e); }
}
export async function changeHistory(model, request) {
  try {
    const p = await prepare(model, request, 'change-history'); if (p.replay) return p.replay;
    const { s, r, b, requestDigest } = p;
    fields(r, ['synthetic', 'operationId', 'datasetId', 'expectedRevision', 'expectedRoot', 'changes']);
    need(r.expectedRevision === s.revision, 'STALE_REVISION');
    need(Array.isArray(r.changes) && r.changes.length > 0 && r.changes.length <= s.limits.changes, 'RESOURCE_LIMIT');
    const current = b.get(s.dataRoot).body, found = await mapFind(b, current.datasetsRoot, r.datasetId); need(found, 'INVALID_DATASET');
    const dataset = b.get(found.valueRef).body, collections = dataset.collections.map(c => ({ ...c })), seen = new Set();
    for (const change of r.changes) {
      need(change && Object.keys(change).every(k => ['store', 'key', 'value', 'deleted'].includes(k)), 'INVALID_FIELDS');
      need(RAW.includes(change.store), 'INVALID_FIELDS'); const c = collections.find(c => c.store === change.store);
      need(text(change.key), 'INVALID_KEY'); // B1 raw collections use string keys, not protocol tuples.
      const id = canonical([change.store, keyEncode(change.key)]); need(!seen.has(id), 'INVALID_IDENTITY'); seen.add(id);
      const previous = await mapFind(b, c.root, change.key), keyRef = await b.value(keyEncode(change.key)); let valueRef = null;
      if (change.deleted === true) need(!Object.hasOwn(change, 'value'), 'INVALID_FIELDS');
      else {
        need(change.deleted === undefined && change.value && typeof change.value === 'object' && !Array.isArray(change.value), 'INVALID_FIELDS');
        need(canonical(keyEncode(change.value[SCHEMA[change.store]])) === canonical(keyEncode(change.key)), 'INVALID_KEY');
        let identityValueRef = previous?.valueRef;
        if (previous && !identityValueRef) {
          let cursor = previous.versionRef, hops = 0;
          while (cursor) {
            need(++hops <= s.limits.operations, 'RESOURCE_LIMIT'); const version = b.get(cursor);
            need(version.kind === 'version', 'INVALID_GRAPH');
            if (version.body.valueRef) { identityValueRef = version.body.valueRef; break; }
            cursor = version.body.previous;
          }
        }
        if (identityValueRef) {
          const old = await b.decode(identityValueRef);
          for (const field of ['id', 'entryKey', 'scheduledItemId', 'payPeriodDate']) {
            if (old[field] !== undefined) need(Object.is(old[field], change.value[field]), 'INVALID_IDENTITY');
          }
        }
        minorStrings(change.value); valueRef = await b.value(change.value);
      }
      const versionRef = await b.intern('version', { datasetId: r.datasetId, store: change.store, keyRef, valueRef,
        deleted: change.deleted === true, previous: previous?.versionRef ?? null, sourceVersionRef: null, localRevision: String(BigInt(s.revision) + 1n) });
      c.root = await mapPut(b, c.root, change.key, { valueRef, versionRef, deleted: change.deleted === true });
    }
    const ref = await b.intern('dataset', { ...dataset, collections });
    const datasetsRoot = await mapPut(b, current.datasetsRoot, r.datasetId, { valueRef: ref, versionRef: ref });
    const dataRoot = await b.intern('data-root', { ...current, datasetsRoot });
    return completed(s, b, r.operationId, requestDigest, dataRoot, s.operationsRoot, { datasetId: r.datasetId });
  } catch (e) { return bad(e); }
}
export async function readHistory(model, input) {
  try {
    const s = modelState(model), r = copy(input); need(Object.keys(r).every(k => ['datasetId', 'store', 'includeDeleted', 'atRoot'].includes(k)), 'INVALID_FIELDS');
    need(r.includeDeleted === undefined || typeof r.includeDeleted === 'boolean', 'INVALID_FIELDS');
    const b = builder(s), selected = b.get(r.atRoot ?? s.root);
    need(selected.kind === 'model-root' && selected.body.instanceId === s.instanceId && selected.body.generation === s.generation, 'INVALID_GRAPH');
    const current = b.get(selected.body.dataRoot).body, found = await mapFind(b, current.datasetsRoot, r.datasetId); need(found, 'INVALID_DATASET');
    const c = b.get(found.valueRef).body.collections.find(c => c.store === r.store); need(c, 'INVALID_FIELDS');
    const rows = [], work = budget();
    for (const e of await mapRows(b, c.root, r.includeDeleted === true)) rows.push(copy({ key: e.key,
      value: e.valueRef ? await b.decode(e.valueRef) : undefined, deleted: e.deleted, versionRef: e.versionRef }, work));
    return freeze({ ok: true, rows });
  } catch (e) { return bad(e); }
}
export async function reconstructHistoryOrigin(model, originId) {
  try {
    const s = modelState(model), b = builder(s), found = await mapFind(b, b.get(s.dataRoot).body.originsRoot, originId); need(found, 'INVALID_ORIGIN');
    const origin = b.get(found.valueRef).body, stores = {}, work = budget();
    for (const inv of origin.inventory) {
      const rows = [];
      for (const e of await mapRows(b, inv.root)) rows.push(copy({ key: e.key, value: await b.decode(e.valueRef) }, work));
      need(rows.length === inv.count, 'INVALID_GRAPH'); stores[inv.store] = { keyPath: inv.keyPath, rows };
    }
    return freeze({ ok: true, stores, envelope: await b.decode(origin.envelopeRef), provenance: origin });
  } catch (e) { return bad(e); }
}
export async function readHistoryVersion(model, versionRef) {
  try {
    const s = modelState(model), b = builder(s), v = b.get(versionRef); need(v.kind === 'version', 'INVALID_GRAPH');
    return freeze({ ok: true, version: v.body, value: v.body.valueRef ? await b.decode(v.body.valueRef) : undefined });
  } catch (e) { return bad(e); }
}
export async function lookupHistoryOperation(model, operationId) {
  try {
    need(text(operationId), 'INVALID_IDENTITY');
    const s = modelState(model), b = builder(s), found = await mapFind(b, s.operationsRoot, operationId);
    return freeze({ ok: true, found: Boolean(found), ...(found ? { event: b.get(found.valueRef).body } : {}) });
  } catch (e) { return bad(e); }
}
export function inspectHistoryModel(model) {
  try {
    const s = modelState(model); return freeze({ ok: true, modelOnly: true, instanceId: s.instanceId, generation: s.generation,
      revision: s.revision, root: s.root, dataRoot: s.dataRoot, indexRoot: s.pool.digest, stats: s.stats,
      conceptualNativeStores: ['control', 'blobs', 'objects', 'origins', 'datasets', 'operations', 'audit', 'recovery', 'verification'] });
  } catch (e) { return bad(e); }
}
