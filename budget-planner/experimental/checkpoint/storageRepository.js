// Synthetic Stage 2B1 only. No production database imports/defaults or migrations.
import { sourceRevision } from './adapter.js';

export const SYNTHETIC_DB_PREFIX = 'finpath-synthetic-b1-';
export const STORAGE_CAPABILITIES = Object.freeze(['synthetic-repository-v1', 'raw-snapshot-v1', 'atomic-command-v1', 'inactive-draft-v1']);
export const RAW_STORES = Object.freeze(['appMetadata', 'appSettings', 'budgetTargets', 'categories', 'plannerEntries',
  'scheduledItems', 'accounts', 'manualAdjustments', 'savingsBuckets', 'savingsBucketAdjustments', 'transfers']);
const schema = Object.freeze(Object.fromEntries([
  ...RAW_STORES.map(name => [name, name === 'plannerEntries' ? 'entryKey' : 'id']),
  ['financialControl', 'id'], ['recordRevisions', ['collection', 'key']],
  ['checkpointDrafts', ['id', 'revision']], ['checkpointDraftHeads', 'id'],
  ['financialAudit', 'id'], ['protectedSnapshots', 'id'],
]));
const stores = Object.freeze(Object.keys(schema));
const historyStores = ['financialAudit', 'protectedSnapshots'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fail = code => { throw { code }; };
const need = (condition, code) => { if (!condition) fail(code); };
const codes = new Set(['INVALID_DTO', 'INVALID_OPTIONS', 'SYNTHETIC_DATABASE_REQUIRED', 'FACTORY_REQUIRED', 'DATABASE_ERROR',
  'UPGRADE_BLOCKED', 'SCHEMA_MISMATCH', 'CLOSED', 'INVALID_SEED', 'ALREADY_INITIALIZED', 'INVALID_SNAPSHOT',
  'INVALID_COMMAND', 'INVALID_KEYS', 'INVALID_RECORD', 'INVALID_CONSENT', 'INVALID_DRAFT', 'DATABASE_CONTEXT_MISMATCH',
  'NOT_INITIALIZED', 'STALE_GENERATION', 'STALE_REVISION', 'STALE_CONTENT', 'UNSUPPORTED_CAPABILITY',
  'OPERATION_CONFLICT', 'REPLAY_CONTEXT_CONFLICT', 'IMMUTABLE_RECORD_CONFLICT', 'IDENTITY_CONFLICT', 'DATA_CLONE_FAILED',
  'STORAGE_QUOTA', 'TRANSACTION_ABORTED', 'CANCELLED', 'DIGEST_UNAVAILABLE']);
function diagnostic(error) {
  const names = { DataCloneError: 'DATA_CLONE_FAILED', QuotaExceededError: 'STORAGE_QUOTA',
    ConstraintError: 'IMMUTABLE_RECORD_CONFLICT', AbortError: 'TRANSACTION_ABORTED', TransactionInactiveError: 'TRANSACTION_ABORTED', VersionError: 'SCHEMA_MISMATCH' };
  return { ok: false, diagnostics: [{ code: codes.has(error?.code) ? error.code : names[error?.name] ?? 'DATABASE_ERROR' }] };
}
function clone(value, seen = new Set()) {
  if (value === undefined || value === null || ['string', 'boolean'].includes(typeof value)) return value;
  if (typeof value === 'number') { need(Number.isFinite(value), 'INVALID_DTO'); return value; }
  need((plain(value) || (Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype)) && !seen.has(value), 'INVALID_DTO');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  need(Object.getOwnPropertySymbols(value).length === 0 && Object.values(descriptors).every(d => 'value' in d), 'INVALID_DTO');
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    need(Object.keys(value).length === value.length && Object.keys(descriptors).length === value.length + 1 &&
      Object.entries(descriptors).every(([key, d]) => key === 'length' || d.enumerable), 'INVALID_DTO');
    result = value.map(v => clone(v, seen));
  } else {
    need(Object.values(descriptors).every(d => d.enumerable), 'INVALID_DTO');
    result = Object.fromEntries(Object.entries(descriptors).map(([key, d]) => [key, clone(d.value, seen)]));
  }
  seen.delete(value); return result;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value;
}
const same = (a, b) => sourceRevision(a) === sourceRevision(b);
const fields = (value, keys) => need(plain(value) && Object.keys(value).every(k => keys.includes(k)), 'INVALID_COMMAND');
function optionsCheck(options) {
  need(plain(options) && Object.keys(options).every(k => ['factory', 'name', 'synthetic'].includes(k)), 'INVALID_OPTIONS');
  need(options.synthetic === true && typeof options.name === 'string' &&
    /^finpath-synthetic-b1-[a-z0-9][a-z0-9-]{0,63}$/.test(options.name), 'SYNTHETIC_DATABASE_REQUIRED');
  need(options.factory && typeof options.factory.open === 'function' && typeof options.factory.deleteDatabase === 'function', 'FACTORY_REQUIRED');
}
function rowsCheck(collection, rows) {
  need(Array.isArray(rows), 'INVALID_RECORD'); const keys = new Set();
  for (const row of rows) {
    fields(row, ['key', 'value']);
    need(text(row.key) && plain(row.value) && row.value[schema[collection]] === row.key && !keys.has(row.key), 'INVALID_RECORD');
    keys.add(row.key);
  }
}
function snapshotCheck(snapshot) {
  need(plain(snapshot) && snapshot.synthetic === true && snapshot.protocolVersion === 1 && plain(snapshot.stores) &&
    same(Object.keys(snapshot.stores).sort(), [...stores].sort()) && stores.every(s => Array.isArray(snapshot.stores[s])), 'INVALID_SNAPSHOT');
}
function controlOf(snapshot) { return snapshot.stores.financialControl.find(row => row.key === 'financial-control')?.value; }
function controlCheck(control) {
  need(control, 'NOT_INITIALIZED');
  need(control.protocolVersion === 1 && control.synthetic === true && control.mode === 'inactive-only' &&
    same(control.capabilities, STORAGE_CAPABILITIES), 'UNSUPPORTED_CAPABILITY');
  need(text(control.generation) && text(control.stateRevision) && /^(0|[1-9]\d*)$/.test(control.stateRevision) &&
    text(control.financialRevision) && /^(0|[1-9]\d*)$/.test(control.financialRevision), 'SCHEMA_MISMATCH');
}
function dependencies(snapshot) {
  return Object.fromEntries(stores.map(s => [s, sourceRevision(snapshot.stores[s])]));
}
function requestCheck(request) {
  fields(request, ['synthetic', 'operationId', 'kind', 'requiredCapabilities', 'consent', 'changes', 'replacement', 'generation', 'draft']);
  need(request.synthetic === true && text(request.operationId) && ['financial', 'replace', 'inactive-draft'].includes(request.kind), 'INVALID_COMMAND');
  need(Array.isArray(request.requiredCapabilities) && request.requiredCapabilities.every(text) &&
    new Set(request.requiredCapabilities).size === request.requiredCapabilities.length, 'INVALID_COMMAND');
  fields(request.consent, ['confirmed', 'action']);
  need(request.consent.confirmed === true && request.consent.action === request.kind, 'INVALID_CONSENT');
  if (request.kind === 'financial') {
    need(request.replacement === undefined && request.generation === undefined && request.draft === undefined && Array.isArray(request.changes) && request.changes.length > 0, 'INVALID_COMMAND');
    const keys = new Set();
    for (const change of request.changes) {
      fields(change, ['store', 'key', 'value', 'delete']);
      const id = sourceRevision([change.store, change.key]);
      need(RAW_STORES.includes(change.store) && text(change.key) && !keys.has(id) &&
        (change.delete === true ? change.value === undefined : change.delete === undefined), 'INVALID_COMMAND');
      if (change.delete !== true) rowsCheck(change.store, [{ key: change.key, value: change.value }]);
      keys.add(id);
    }
  } else if (request.kind === 'replace') {
    need(request.changes === undefined && request.draft === undefined && text(request.generation) && plain(request.replacement) &&
      same(Object.keys(request.replacement).sort(), [...RAW_STORES].sort()), 'INVALID_COMMAND');
    RAW_STORES.forEach(s => rowsCheck(s, request.replacement[s]));
  } else {
    need(request.changes === undefined && request.replacement === undefined && request.generation === undefined, 'INVALID_COMMAND');
    fields(request.draft, ['id', 'revision', 'status', 'payload']);
    need(text(request.draft.id) && text(request.draft.revision) && /^(0|[1-9]\d*)$/.test(request.draft.revision) && request.draft.status === 'inactive' &&
      plain(request.draft.payload) && request.draft.payload.synthetic === true, 'INVALID_DRAFT');
  }
}

// Exact in-memory tokens are not a proposed portable backup canonicalization.
export function prepareSyntheticCommand(snapshotInput, requestInput) {
  try {
    const snapshot = clone(snapshotInput), request = clone(requestInput);
    snapshotCheck(snapshot); controlCheck(controlOf(snapshot)); requestCheck(request);
    return freeze({ ok: true, command: { synthetic: true, protocolVersion: 1, databaseName: snapshot.databaseName,
      request, expected: clone(controlOf(snapshot)), dependencies: dependencies(snapshot) } });
  } catch (error) { return freeze(diagnostic(error)); }
}
async function identity(value) {
  need(globalThis.crypto?.subtle && globalThis.TextEncoder, 'DIGEST_UNAVAILABLE');
  const bytes = new TextEncoder().encode(sourceRevision(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}
function beforeState(snapshot) {
  return { stores: Object.fromEntries(stores.filter(s => !historyStores.includes(s)).map(s => [s, snapshot.stores[s]])),
    history: Object.fromEntries(historyStores.map(s => [s, snapshot.stores[s].map(row => row.key)])) };
}

// Request callbacks only below this point: no async/await inside live transactions.
function readStores(tx, databaseName, ready, abort) {
  const result = { synthetic: true, protocolVersion: 1, databaseName, stores: {} }; let remaining = stores.length * 2;
  for (const s of stores) {
    let keys, values;
    const finish = () => {
      if (keys && values) result.stores[s] = keys.map((key, i) => ({ key, value: values[i] }));
      if (--remaining === 0) {
        try { ready(result); } catch (error) { abort(error); }
      }
    };
    const keyRequest = tx.objectStore(s).getAllKeys(), valueRequest = tx.objectStore(s).getAll();
    keyRequest.onerror = () => abort(keyRequest.error); valueRequest.onerror = () => abort(valueRequest.error);
    keyRequest.onsuccess = () => { keys = keyRequest.result; finish(); };
    valueRequest.onsuccess = () => { values = valueRequest.result; finish(); };
  }
}
function repository(db, name) {
  let closed = false;
  db.onversionchange = () => { closed = true; db.close(); };
  const transact = (mode, action, signal) => new Promise(resolve => {
    if (closed) { resolve(diagnostic({ code: 'CLOSED' })); return; }
    if (signal?.aborted) { resolve(diagnostic({ code: 'CANCELLED' })); return; }
    let tx, result, error, abortRequested = false;
    const abort = reason => {
      error ??= reason;
      if (abortRequested) return;
      abortRequested = true;
      try { tx?.abort(); } catch { /* A completed transaction remains committed. */ }
    };
    const cancel = () => abort({ code: 'CANCELLED' });
    const cleanup = () => signal?.removeEventListener('abort', cancel);
    try {
      tx = db.transaction(stores, mode);
      tx.oncomplete = () => { cleanup(); resolve(freeze({ ok: true, ...result })); };
      tx.onabort = () => { cleanup(); resolve(freeze(diagnostic(error ?? tx.error ?? { code: 'TRANSACTION_ABORTED' }))); };
      // We own abort explicitly. Cancel only the duplicate default abort, never
      // the transaction failure: no request error can be treated as success.
      tx.onerror = event => { event.preventDefault(); abort(event.target?.error ?? tx.error); };
      signal?.addEventListener('abort', cancel, { once: true });
      readStores(tx, name, snapshot => { result = action(tx, snapshot); }, abort);
    } catch (reason) {
      if (tx) abort(reason); else { cleanup(); resolve(freeze(diagnostic(reason))); }
    }
  });
  const write = (tx, store, method, value) => tx.objectStore(store)[method](value);
  const recordRevision = (tx, collection, key, value, control, deleted = false) => write(tx, 'recordRevisions', 'put', {
    collection, key, generation: control.generation, revision: control.financialRevision,
    deleted, contentToken: deleted ? null : sourceRevision(value),
  });
  const commit = (tx, snapshot, control, operationId, commandIdentity, kind, body) => {
    const receipt = { operationId, kind, generation: control.generation, stateRevision: control.stateRevision,
      financialRevision: control.financialRevision, snapshotId: operationId };
    write(tx, 'protectedSnapshots', 'add', { id: operationId, before: beforeState(snapshot) });
    const affected = kind === 'financial' ? body.changes.map(c => ({ collection: c.store, key: c.key, deleted: c.delete === true })) :
      kind === 'inactive-draft' ? [{ collection: 'checkpointDrafts', key: [body.draft.id, body.draft.revision] }] :
        RAW_STORES.map(collection => ({ collection }));
    write(tx, 'financialAudit', 'add', { id: operationId, commandIdentity, receipt, affected, consent: body.consent });
    write(tx, 'financialControl', 'put', control);
    return { receipt, replayed: false };
  };
  return Object.freeze({
    snapshot: () => transact('readonly', (_tx, snapshot) => ({ snapshot })),
    lookupOperation: operationId => {
      if (!text(operationId)) return Promise.resolve(diagnostic({ code: 'INVALID_COMMAND' }));
      return transact('readonly', (_tx, snapshot) => {
        const entry = snapshot.stores.financialAudit.find(row => row.key === operationId);
        return { found: Boolean(entry), ...(entry ? { receipt: entry.value.receipt } : {}) };
      });
    },
    initialize: async seedInput => {
      let seed, commandIdentity;
      try {
        seed = clone(seedInput);
        fields(seed, ['synthetic', 'operationId', 'generation', 'records', 'consent']);
        need(seed.synthetic === true && text(seed.operationId) && text(seed.generation) && plain(seed.records) &&
          same(Object.keys(seed.records).sort(), [...RAW_STORES].sort()), 'INVALID_SEED');
        fields(seed.consent, ['confirmed', 'action']);
        need(seed.consent.confirmed === true && seed.consent.action === 'initialize', 'INVALID_CONSENT');
        RAW_STORES.forEach(s => rowsCheck(s, seed.records[s]));
        commandIdentity = await identity({ databaseName: name, seed });
      } catch (error) { return freeze(diagnostic(error)); }
      return transact('readwrite', (tx, snapshot) => {
        need(stores.every(s => snapshot.stores[s].length === 0), 'ALREADY_INITIALIZED');
        const control = { id: 'financial-control', protocolVersion: 1, synthetic: true, mode: 'inactive-only',
          capabilities: [...STORAGE_CAPABILITIES], generation: seed.generation, stateRevision: '0', financialRevision: '0' };
        for (const s of RAW_STORES) for (const row of seed.records[s]) {
          write(tx, s, 'add', row.value); recordRevision(tx, s, row.key, row.value, control);
        }
        return commit(tx, snapshot, control, seed.operationId, commandIdentity, 'initialize', seed);
      });
    },
    execute: async (commandInput, { signal } = {}) => {
      let command, commandIdentity;
      try {
        command = clone(commandInput);
        fields(command, ['synthetic', 'protocolVersion', 'databaseName', 'request', 'expected', 'dependencies']);
        need(command.synthetic === true && command.protocolVersion === 1 && command.databaseName === name, 'DATABASE_CONTEXT_MISMATCH');
        requestCheck(command.request); controlCheck(command.expected);
        need(plain(command.dependencies) && same(Object.keys(command.dependencies).sort(), [...stores].sort()) &&
          Object.values(command.dependencies).every(text), 'INVALID_COMMAND');
        commandIdentity = await identity(command); // Before tx creation, never while IDB is active.
      } catch (error) { return freeze(diagnostic(error)); }
      return transact('readwrite', (tx, snapshot) => {
        const control = controlOf(snapshot), request = command.request;
        controlCheck(control);
        need(same([...request.requiredCapabilities].sort(), [...STORAGE_CAPABILITIES].sort()), 'UNSUPPORTED_CAPABILITY');
        const prior = snapshot.stores.financialAudit.find(row => row.key === request.operationId)?.value;
        if (prior) {
          need(prior.commandIdentity === commandIdentity, 'OPERATION_CONFLICT');
          need(prior.receipt.generation === control.generation, 'REPLAY_CONTEXT_CONFLICT');
          return { receipt: prior.receipt, replayed: true };
        }
        need(control.generation === command.expected.generation, 'STALE_GENERATION');
        need(control.stateRevision === command.expected.stateRevision && control.financialRevision === command.expected.financialRevision, 'STALE_REVISION');
        need(same(control, command.expected) && same(dependencies(snapshot), command.dependencies), 'STALE_CONTENT');
        const next = { ...control, stateRevision: String(BigInt(control.stateRevision) + 1n),
          financialRevision: request.kind === 'inactive-draft' ? control.financialRevision : String(BigInt(control.financialRevision) + 1n) };
        if (request.kind === 'financial') for (const change of request.changes) {
          const existing = snapshot.stores[change.store].find(row => row.key === change.key)?.value;
          if (existing && !change.delete) for (const field of ['id', 'entryKey', 'scheduledItemId', 'payPeriodDate']) {
            need(existing[field] === undefined || same(existing[field], change.value[field]), 'IDENTITY_CONFLICT');
          }
          write(tx, change.store, change.delete ? 'delete' : 'put', change.delete ? change.key : change.value);
          recordRevision(tx, change.store, change.key, change.value, next, change.delete === true);
        }
        if (request.kind === 'replace') {
          need(request.generation !== control.generation, 'INVALID_COMMAND'); next.generation = request.generation;
          for (const s of RAW_STORES) {
            const incoming = new Map(request.replacement[s].map(row => [row.key, row]));
            write(tx, s, 'clear', undefined);
            for (const old of snapshot.stores[s]) if (!incoming.has(old.key)) recordRevision(tx, s, old.key, undefined, next, true);
            for (const row of request.replacement[s]) { write(tx, s, 'put', row.value); recordRevision(tx, s, row.key, row.value, next); }
          }
        }
        if (request.kind === 'inactive-draft') {
          const draft = request.draft, head = snapshot.stores.checkpointDraftHeads.find(row => row.key === draft.id)?.value;
          need(draft.revision === (head ? String(BigInt(head.revision) + 1n) : '0'), 'INVALID_DRAFT');
          write(tx, 'checkpointDrafts', 'add', draft);
          write(tx, 'checkpointDraftHeads', 'put', { id: draft.id, revision: draft.revision });
        }
        return commit(tx, snapshot, next, request.operationId, commandIdentity, request.kind, request);
      }, signal);
    },
    close: () => { closed = true; db.close(); },
  });
}

export function openSyntheticRepository(options) {
  try { optionsCheck(options); } catch (error) { return Promise.resolve(freeze(diagnostic(error))); }
  // Capture validated primitives/factory so caller mutation cannot redirect a pending request.
  const { factory, name } = options;
  return new Promise(resolve => {
    let request, settled = false;
    const finish = result => { if (!settled) { settled = true; resolve(result); } };
    try {
      request = factory.open(name, 1); // Test schema 1, never the production DB/version.
      request.onupgradeneeded = event => {
        if (settled || event.oldVersion !== 0) { request.transaction.abort(); return; }
        try { for (const [store, keyPath] of Object.entries(schema)) request.result.createObjectStore(store, { keyPath }); }
        catch { request.transaction.abort(); }
      };
      request.onblocked = () => finish(freeze(diagnostic({ code: 'UPGRADE_BLOCKED' })));
      request.onerror = () => finish(freeze(diagnostic(request.error)));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        try {
          if (!same([...db.objectStoreNames].sort(), [...stores].sort())) fail('SCHEMA_MISMATCH');
          const tx = db.transaction(stores, 'readonly');
          const valid = stores.every(s => { const store = tx.objectStore(s);
            return same(store.keyPath, schema[s]) && store.autoIncrement === false && store.indexNames.length === 0; });
          tx.oncomplete = () => {
            if (!valid) { db.close(); finish(freeze(diagnostic({ code: 'SCHEMA_MISMATCH' }))); }
            else finish({ ok: true, repository: repository(db, name) });
          };
          tx.onabort = () => { db.close(); finish(freeze(diagnostic(tx.error))); };
        } catch (error) { db.close(); finish(freeze(diagnostic(error))); }
      };
    } catch (error) { finish(freeze(diagnostic(error))); }
  });
}
export function deleteSyntheticDatabase(options) {
  try { optionsCheck(options); } catch (error) { return Promise.resolve(freeze(diagnostic(error))); }
  const { factory, name } = options;
  return new Promise(resolve => {
    try {
      const request = factory.deleteDatabase(name);
      request.onsuccess = () => resolve(Object.freeze({ ok: true }));
      request.onerror = () => resolve(freeze(diagnostic(request.error)));
      request.onblocked = () => resolve(freeze(diagnostic({ code: 'UPGRADE_BLOCKED' })));
    } catch (error) { resolve(freeze(diagnostic(error))); }
  });
}
