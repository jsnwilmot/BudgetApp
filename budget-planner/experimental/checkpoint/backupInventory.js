import { RAW, SCHEMA, STORES, B1_CAPABILITIES, LIMITS, need, fields, plain, text, own,
  equal, keyEncode, keyCompare, canonical } from './backupFormat.js';

const revision = v => typeof v === 'string' && /^(0|[1-9]\d{0,127})$/.test(v);
const token = v => v === undefined ? 'u' : typeof v === 'number' && Object.is(v, -0) ? 'n:-0' :
  Array.isArray(v) ? `a:[${v.map(token).join(',')}]` : plain(v) ?
    `o:{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${token(v[k])}`).join(',')}}` : `${typeof v}:${JSON.stringify(v)}`;
export const nativeEqual = (a, b) => token(a) === token(b);
export const nativeToken = token;

export function validateRows(store, rows) {
  need(Array.isArray(rows), 'INVALID_FORMAT'); const seen = new Set();
  for (const row of rows) {
    fields(row, ['key', 'value']); need(plain(row.value), 'INVALID_KEY');
    const k = SCHEMA[store];
    const actual = Array.isArray(k) ? k.map(p => own(row.value, p) ? row.value[p] : undefined) : own(row.value, k) ? row.value[k] : undefined;
    const encoded = keyEncode(row.key);
    need(equal(encoded, keyEncode(actual)) && (typeof row.key !== 'string' || text(row.key)), 'INVALID_KEY');
    const identity = canonical(encoded); need(!seen.has(identity), 'INVALID_IDENTITY'); seen.add(identity);
  }
}
function inactiveDraft(d) {
  fields(d, ['id', 'revision', 'status', 'payload']);
  need(d.status === 'inactive' && d.payload?.synthetic === true, 'ACTIVE_STATE');
  need(d.payload.active !== true && d.payload.checkpointActive !== true && d.payload.status !== 'active', 'ACTIVE_STATE');
  need(text(d.id) && revision(d.revision), 'INVALID_HISTORY');
}
export function noActiveCheckpoint(value) {
  need(value.checkpointActive !== true && value.activeCheckpointId == null && value.activeCheckpoint == null &&
    value.financialCheckpoint?.status !== 'active' && value.checkpoint?.status !== 'active', 'ACTIVE_STATE');
}
function validateState(stores) {
  need(stores.financialControl.length === 1, 'INVALID_HISTORY'); const c = stores.financialControl[0].value;
  fields(c, ['id', 'protocolVersion', 'synthetic', 'mode', 'capabilities', 'generation', 'stateRevision', 'financialRevision']);
  need(c.id === 'financial-control' && c.protocolVersion === 1 && c.synthetic === true, 'INVALID_HISTORY');
  need(c.mode === 'inactive-only', 'ACTIVE_STATE');
  need(equal(c.capabilities, B1_CAPABILITIES), 'UNSUPPORTED_CAPABILITY');
  need(text(c.generation) && revision(c.stateRevision) && revision(c.financialRevision) && BigInt(c.financialRevision) <= BigInt(c.stateRevision), 'INVALID_HISTORY');
  for (const s of ['appMetadata', 'appSettings']) for (const r of stores[s]) noActiveCheckpoint(r.value);
  const live = new Map(RAW.flatMap(s => stores[s].map(r => [canonical([s, r.key]), r.value])));
  const revs = new Map();
  for (const { value: r } of stores.recordRevisions) {
    fields(r, ['collection', 'key', 'generation', 'revision', 'deleted', 'contentToken']);
    need(RAW.includes(r.collection) && text(r.key) && text(r.generation) && revision(r.revision) && typeof r.deleted === 'boolean', 'INVALID_HISTORY');
    const k = canonical([r.collection, r.key]); revs.set(k, r);
    need(BigInt(r.revision) <= BigInt(c.financialRevision), 'INVALID_HISTORY');
    if (r.deleted) need(!live.has(k) && r.contentToken === null, 'INVALID_HISTORY');
    else need(live.has(k) && r.contentToken === token(live.get(k)) && r.generation === c.generation && BigInt(r.revision) <= BigInt(c.financialRevision), 'INVALID_HISTORY');
  }
  need([...live.keys()].every(k => revs.has(k) && !revs.get(k).deleted), 'INVALID_HISTORY');
  const versions = new Map();
  for (const { value: d } of stores.checkpointDrafts) { inactiveDraft(d); noActiveCheckpoint(d.payload); const a = versions.get(d.id) ?? []; a.push(d.revision); versions.set(d.id, a); }
  need(versions.size === stores.checkpointDraftHeads.length, 'INVALID_HISTORY');
  for (const { value: h } of stores.checkpointDraftHeads) {
    fields(h, ['id', 'revision']); need(revision(h.revision) && versions.has(h.id), 'INVALID_HISTORY');
    const a = versions.get(h.id); need(BigInt(h.revision) === BigInt(a.length - 1) && a.every(v => BigInt(v) < BigInt(a.length)), 'INVALID_HISTORY');
  }
  return c;
}
export function validateSnapshot(snapshot) {
  fields(snapshot, ['synthetic', 'protocolVersion', 'databaseName', 'stores']);
  need(snapshot.synthetic === true, 'SYNTHETIC_INPUT_REQUIRED');
  need(snapshot.protocolVersion === 1 && /^finpath-synthetic-b1-[a-z0-9][a-z0-9-]{0,63}$/.test(snapshot.databaseName), 'UNSUPPORTED_VERSION');
  fields(snapshot.stores, STORES); const stores = snapshot.stores;
  need(STORES.reduce((n, s) => n + (stores[s]?.length ?? 0), 0) <= LIMITS.rows, 'RESOURCE_LIMIT');
  for (const s of STORES) validateRows(s, stores[s]);
  const c = validateState(stores);
  const audits = new Map(stores.financialAudit.map(r => [r.key, r.value]));
  const snapshots = new Map(stores.protectedSnapshots.map(r => [r.key, r.value]));
  need(audits.size > 0 && audits.size === snapshots.size && [...audits.keys()].every(k => snapshots.has(k)), 'INVALID_HISTORY');
  const states = new Set();
  for (const [id, a] of audits) {
    fields(a, ['id', 'commandIdentity', 'receipt', 'affected', 'consent']);
    need(typeof a.commandIdentity === 'string' && /^[0-9a-f]{64}$/.test(a.commandIdentity), 'INVALID_HISTORY');
    const r = a.receipt; fields(r, ['operationId', 'kind', 'generation', 'stateRevision', 'financialRevision', 'snapshotId']);
    need(r.operationId === id && r.snapshotId === id && ['initialize', 'financial', 'replace', 'inactive-draft'].includes(r.kind) &&
      text(r.generation) && revision(r.stateRevision) && revision(r.financialRevision), 'INVALID_HISTORY');
    need(!states.has(r.stateRevision) && BigInt(r.stateRevision) <= BigInt(c.stateRevision) &&
      BigInt(r.financialRevision) <= BigInt(r.stateRevision), 'INVALID_HISTORY'); states.add(r.stateRevision);
    fields(a.consent, ['confirmed', 'action']); need(a.consent.confirmed === true && a.consent.action === r.kind, 'INVALID_HISTORY');
    need(Array.isArray(a.affected), 'INVALID_HISTORY'); const affected = new Set();
    for (const ref of a.affected) {
      need(plain(ref) && [ ...RAW, 'checkpointDrafts'].includes(ref.collection) &&
        Object.keys(ref).every(k => ['collection', 'key', 'deleted'].includes(k)), 'INVALID_HISTORY');
      if (own(ref, 'key')) keyEncode(ref.key);
      if (own(ref, 'deleted')) need(typeof ref.deleted === 'boolean', 'INVALID_HISTORY');
      const identity = token([ref.collection, ref.key]); need(!affected.has(identity), 'INVALID_HISTORY'); affected.add(identity);
    }
    if (['initialize', 'replace'].includes(r.kind)) need(nativeEqual(a.affected, RAW.map(collection => ({ collection }))), 'INVALID_HISTORY');
    else if (r.kind === 'inactive-draft') need(a.affected.length === 1 && a.affected[0].collection === 'checkpointDrafts' &&
      Array.isArray(a.affected[0].key) && a.affected[0].key.length === 2, 'INVALID_HISTORY');
    else need(a.affected.length > 0 && a.affected.every(ref => RAW.includes(ref.collection) && text(ref.key) && typeof ref.deleted === 'boolean'), 'INVALID_HISTORY');
    const p = snapshots.get(id); fields(p, ['id', 'before']); fields(p.before, ['stores', 'history']);
    fields(p.before.stores, STORES.filter(s => !['financialAudit', 'protectedSnapshots'].includes(s)));
    for (const s of Object.keys(p.before.stores)) validateRows(s, p.before.stores[s]);
    fields(p.before.history, ['financialAudit', 'protectedSnapshots']);
    for (const s of ['financialAudit', 'protectedSnapshots']) {
      const keys = p.before.history[s];
      need(Array.isArray(keys) && BigInt(keys.length) === BigInt(r.stateRevision) && new Set(keys).size === keys.length && keys.every(k => text(k) && audits.has(k) && snapshots.has(k) &&
        BigInt(audits.get(k).receipt.stateRevision) < BigInt(r.stateRevision)), 'INVALID_HISTORY');
    }
    need(nativeEqual([...p.before.history.financialAudit].sort(), [...p.before.history.protectedSnapshots].sort()), 'INVALID_HISTORY');
    const prior = p.before.stores.financialControl;
    if (r.kind === 'initialize') need(r.stateRevision === '0' && Object.values(p.before.stores).every(rows => rows.length === 0), 'INVALID_HISTORY');
    else {
      const before = validateState(p.before.stores);
      need(prior.length === 1 && BigInt(before.stateRevision) + 1n === BigInt(r.stateRevision) &&
        BigInt(before.financialRevision) + (r.kind === 'inactive-draft' ? 0n : 1n) === BigInt(r.financialRevision) &&
        (r.kind === 'replace' ? before.generation !== r.generation : before.generation === r.generation), 'INVALID_HISTORY');
    }
    if (r.stateRevision === c.stateRevision) need(r.generation === c.generation && r.financialRevision === c.financialRevision, 'INVALID_HISTORY');
  }
  need(states.size === audits.size && BigInt(c.stateRevision) === BigInt(audits.size - 1) &&
    [...states].every(v => BigInt(v) < BigInt(audits.size)), 'INVALID_HISTORY');
  // No financial interpretation: qualify absent source/line metadata; duplicate
  // actual identity claims reject, never delete either original record.
  const occurrences = new Set(); let missingLineIds = 0, missingSources = 0;
  const sources = new Set(stores.scheduledItems.map(r => r.key));
  for (const { value: e } of stores.plannerEntries) {
    if (text(e.scheduledItemId) && text(e.payPeriodDate)) {
      const k = canonical([e.scheduledItemId, e.payPeriodDate]); need(!occurrences.has(k), 'INVALID_IDENTITY'); occurrences.add(k);
      if (!sources.has(e.scheduledItemId)) missingSources++;
    }
    if (e.lineItems !== undefined) {
      need(Array.isArray(e.lineItems), 'INVALID_IDENTITY'); const ids = new Set();
      for (const line of e.lineItems) {
        need(plain(line), 'INVALID_IDENTITY');
        if (!text(line.id)) { missingLineIds++; continue; }
        need(!ids.has(line.id), 'INVALID_IDENTITY'); ids.add(line.id);
      }
    }
  }
  function minorStrings(v) {
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (k.endsWith('Minor')) need(typeof x === 'string' && /^(0|-?[1-9]\d*)$/.test(x), 'UNSAFE_NUMBER');
      minorStrings(x);
    }
  }
  minorStrings(stores);
  return { missingLineIds, missingSources, financialReadiness: 'not-established' };
}
export const orderedRows = rows => [...rows].sort((a, b) => keyCompare(keyEncode(a.key), keyEncode(b.key)));
