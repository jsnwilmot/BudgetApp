// B2a only: in-memory synthetic export/validation. Deliberately no restore API.
import { CAPABILITIES, LIMITS, SCHEMA, STORES, need, fields, text, copy, freeze, failure, equal,
  canonical, keyEncode, keyDecode, keyCompare, hash, sha, DOMAIN } from './backupFormat.js';
import { makeGraph, readGraph } from './backupGraph.js';
import { parseText } from './backupText.js';
import { validateSnapshot, orderedRows } from './backupInventory.js';

const profile = 'finpath-b1-raw17-v1';
const snapshotPayload = d => ({ sourceProfile: d.sourceProfile, storageSchema: d.source.storageSchema,
  protocolVersion: d.source.protocolVersion, controlRef: d.source.controlRef, manifest: d.manifest });
const contentPayload = e => ({ ...e, integrity: Object.fromEntries(Object.entries(e.integrity).filter(([k]) => k !== 'contentDigest')) });
function producerCheck(p) {
  fields(p, ['appVersion', 'exportedAt']);
  need(text(p.appVersion) && typeof p.exportedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(p.exportedAt), 'INVALID_FORMAT');
  need(Number.isFinite(Date.parse(p.exportedAt)) && new Date(p.exportedAt).toISOString() === p.exportedAt, 'INVALID_FORMAT');
}
async function collection(store, rows) {
  const keyPath = SCHEMA[store], count = rows.length;
  return { store, keyPath, count, rows,
    keysetDigest: await hash(DOMAIN.keys, { store, keyPath, keys: rows.map(r => r.key) }),
    collectionDigest: await hash(DOMAIN.collection, { store, keyPath, count, rows }) };
}
export async function encodeSyntheticBackup(snapshotInput, producerInput) {
  try {
    const snapshot = copy(snapshotInput), producer = copy(producerInput); producerCheck(producer);
    const qualifications = validateSnapshot(snapshot);
    const inventories = STORES.map(s => orderedRows(snapshot.stores[s]));
    const graph = await makeGraph(inventories.flatMap(rows => rows.map(r => r.value)));
    let offset = 0; const manifest = [];
    for (let i = 0; i < STORES.length; i++) {
      const rows = inventories[i].map(r => ({ key: keyEncode(r.key), valueRef: graph.roots[offset++] }));
      manifest.push(await collection(STORES[i], rows));
    }
    // Cost validation also checks encoder output against the independent reader
    // contract. Test vectors do not derive expected hashes from this writer.
    const checked = await readGraph(graph.nodes, graph.roots);
    const data = { appDataVersion: 3, format: 'FP-FULL-1', sourceProfile: profile, requiredCapabilities: [...CAPABILITIES],
      source: { storageSchema: 1, protocolVersion: 1, databaseName: snapshot.databaseName,
        snapshotDigest: '', controlRef: manifest.find(m => m.store === 'financialControl').rows[0].valueRef },
      manifest, nodes: graph.nodes, provenance: { sourceEnvelopes: [], qualifications: [] }, derived: {} };
    data.source.snapshotDigest = await hash(DOMAIN.snapshot, snapshotPayload(data));
    const envelope = { appName: 'FinPath', exportVersion: 2, schemaVersion: 3, ...producer,
      metadata: { appName: 'FinPath', ...producer, exportVersion: 2, schemaVersion: 3, appDataVersion: 3,
        source: 'synthetic-harness', synthetic: true, requiredCapabilities: [...CAPABILITIES] }, data,
      integrity: { algorithm: 'SHA-256', canonicalization: 'FP-CJ-1', valueCodec: 'FP-TV-1', graph: 'FP-GRAPH-1' } };
    envelope.integrity.contentDigest = await hash(DOMAIN.envelope, envelope);
    const output = canonical(envelope);
    need(output.length <= LIMITS.bytes, 'RESOURCE_LIMIT'); // Canonical output is ASCII.
    const bytes = new TextEncoder().encode(output);
    return { ...freeze({ ok: true, envelope, qualifications, stats: { ...checked.stats, bytes: bytes.length,
      rows: offset }, snapshotDigest: data.source.snapshotDigest, contentDigest: envelope.integrity.contentDigest }), bytes };
  } catch (e) { return failure(e); }
}
export async function decodeSyntheticBackup(bytes) {
  try {
    const parsed = parseText(bytes), e = parsed.value;
    fields(e, ['appName', 'exportVersion', 'schemaVersion', 'appVersion', 'exportedAt', 'metadata', 'data', 'integrity']);
    producerCheck({ appVersion: e.appVersion, exportedAt: e.exportedAt });
    need(e.appName === 'FinPath' && e.exportVersion === 2 && e.schemaVersion === 3, 'UNSUPPORTED_VERSION');
    fields(e.metadata, ['appName', 'appVersion', 'exportVersion', 'schemaVersion', 'appDataVersion', 'exportedAt', 'source', 'synthetic', 'requiredCapabilities']);
    for (const k of ['appName', 'appVersion', 'exportVersion', 'schemaVersion', 'exportedAt']) need(e[k] === e.metadata[k], 'UNSUPPORTED_VERSION');
    need(e.metadata.appDataVersion === 3 && e.metadata.source === 'synthetic-harness' && e.metadata.synthetic === true, 'SYNTHETIC_INPUT_REQUIRED');
    const d = e.data;
    fields(d, ['appDataVersion', 'format', 'sourceProfile', 'requiredCapabilities', 'source', 'manifest', 'nodes', 'provenance', 'derived']);
    need(d.appDataVersion === 3 && d.format === 'FP-FULL-1' && d.sourceProfile === profile, 'UNSUPPORTED_VERSION');
    need(equal(d.requiredCapabilities, CAPABILITIES) && equal(e.metadata.requiredCapabilities, CAPABILITIES), 'UNSUPPORTED_CAPABILITY');
    fields(d.source, ['storageSchema', 'protocolVersion', 'databaseName', 'snapshotDigest', 'controlRef']);
    need(d.source.storageSchema === 1 && d.source.protocolVersion === 1, 'UNSUPPORTED_VERSION');
    fields(d.provenance, ['sourceEnvelopes', 'qualifications']);
    need(equal(d.provenance.sourceEnvelopes, []) && equal(d.provenance.qualifications, []) && equal(d.derived, {}), 'INVALID_FIELDS');
    fields(e.integrity, ['algorithm', 'canonicalization', 'valueCodec', 'graph', 'contentDigest']);
    need(e.integrity.algorithm === 'SHA-256' && e.integrity.canonicalization === 'FP-CJ-1' && e.integrity.valueCodec === 'FP-TV-1' && e.integrity.graph === 'FP-GRAPH-1', 'UNSUPPORTED_VERSION');
    need(await hash(DOMAIN.envelope, contentPayload(e)) === e.integrity.contentDigest, 'INTEGRITY_MISMATCH');
    need(Array.isArray(d.manifest) && d.manifest.length === STORES.length, 'INVALID_FORMAT');
    const roots = []; let rows = 0;
    for (let i = 0; i < STORES.length; i++) {
      const m = d.manifest[i]; fields(m, ['store', 'keyPath', 'count', 'rows', 'keysetDigest', 'collectionDigest']);
      need(m.store === STORES[i] && equal(m.keyPath, SCHEMA[m.store]) && Array.isArray(m.rows) && m.count === m.rows.length, 'INVALID_KEY');
      rows += m.rows.length; need(rows <= LIMITS.rows, 'RESOURCE_LIMIT');
      for (let j = 0; j < m.rows.length; j++) {
        const r = m.rows[j]; fields(r, ['key', 'valueRef']); keyDecode(r.key);
        need(j === 0 || keyCompare(m.rows[j - 1].key, r.key) < 0, 'INVALID_IDENTITY'); roots.push(r.valueRef);
      }
      need(equal(await collection(m.store, m.rows), m), 'INTEGRITY_MISMATCH');
    }
    need(d.manifest.find(m => m.store === 'financialControl').rows.length === 1 &&
      d.source.controlRef === d.manifest.find(m => m.store === 'financialControl').rows[0].valueRef, 'INVALID_HISTORY');
    need(await hash(DOMAIN.snapshot, snapshotPayload(d)) === d.source.snapshotDigest, 'INTEGRITY_MISMATCH');
    const checked = await readGraph(d.nodes, roots); let offset = 0;
    const snapshot = { synthetic: true, protocolVersion: 1, databaseName: d.source.databaseName,
      stores: Object.fromEntries(d.manifest.map(m => [m.store, m.rows.map(r => ({ key: keyDecode(r.key), value: checked.values[offset++] }))])) };
    // Apply the writer's full DTO budget/depth too (including key/wrapper
    // framing), so a successful decode cannot exceed its re-encoding domain.
    // Exponential typed-value expansion was already rejected before allocation.
    copy(snapshot);
    const qualifications = validateSnapshot(snapshot);
    return freeze({ ok: true, snapshot, envelope: e, qualifications, stats: { ...checked.stats, rows, bytes: parsed.input.length },
      snapshotDigest: d.source.snapshotDigest, contentDigest: e.integrity.contentDigest, transportDigest: await sha(parsed.input) });
  } catch (e) { return failure(e); }
}
