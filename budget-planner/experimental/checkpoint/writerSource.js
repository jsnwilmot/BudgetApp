// Fresh source17 only. Metered equivalent of accepted B2a encoding; no file input.
import { CAPABILITIES, SCHEMA, STORES, DOMAIN } from './backupFormat.js';
import { need, fields, freeze } from './writerFormat.js';
import { graphBuilder } from './writerValue.js';
import { sourceValidator } from './writerSourceRules.js';
import { parseSourceTransport } from './writerSourceParse.js';

export async function source17(input, producerInput, m) {
  const snapshot = m.copy(input), producer = m.copy(producerInput);
  fields(producer, ['appVersion', 'exportedAt']);
  need(typeof producer.appVersion === 'string' && producer.appVersion.trim().length > 0 &&
    typeof producer.exportedAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(producer.exportedAt), 'INVALID_FORMAT');
  need(Number.isFinite(Date.parse(producer.exportedAt)) && new Date(producer.exportedAt).toISOString() === producer.exportedAt, 'INVALID_FORMAT');
  const validator = sourceValidator(m), qualifications = validator.validateSnapshot(snapshot);
  const graph = graphBuilder(m), manifest = [];
  for (const store of STORES) {
    m.tick(); const rows = [];
    for (const r of validator.orderedRows(snapshot.stores[store])) rows.push({ key: m.key(r.key), valueRef: await graph.value(r.value) });
    const keyPath = SCHEMA[store], count = rows.length;
    manifest.push({ store, keyPath, count, rows,
      keysetDigest: await m.hash(DOMAIN.keys, { store, keyPath, keys: rows.map(r => r.key) }),
      collectionDigest: await m.hash(DOMAIN.collection, { store, keyPath, count, rows }) });
    snapshot.stores[store] = validator.orderedRows(snapshot.stores[store]);
  }
  const data = { appDataVersion: 3, format: 'FP-FULL-1', sourceProfile: 'finpath-b1-raw17-v1', requiredCapabilities: [...CAPABILITIES],
    source: { storageSchema: 1, protocolVersion: 1, databaseName: snapshot.databaseName, snapshotDigest: '',
      controlRef: manifest.find(m => m.store === 'financialControl').rows[0].valueRef },
    manifest, nodes: [...graph.nodes].sort(([a], [b]) => a < b ? -1 : 1).map(([id, value]) => ({ id, value })),
    provenance: { sourceEnvelopes: [], qualifications: [] }, derived: {} };
  data.source.snapshotDigest = await m.hash(DOMAIN.snapshot, { sourceProfile: data.sourceProfile,
    storageSchema: 1, protocolVersion: 1, controlRef: data.source.controlRef, manifest });
  const envelope = { appName: 'FinPath', exportVersion: 2, schemaVersion: 3, ...producer,
    metadata: { appName: 'FinPath', ...producer, exportVersion: 2, schemaVersion: 3, appDataVersion: 3,
      source: 'synthetic-harness', synthetic: true, requiredCapabilities: [...CAPABILITIES] }, data,
    integrity: { algorithm: 'SHA-256', canonicalization: 'FP-CJ-1', valueCodec: 'FP-TV-1', graph: 'FP-GRAPH-1' } };
  envelope.integrity.contentDigest = await m.hash(DOMAIN.envelope, envelope);
  const transport = m.canonical(envelope); need(transport.length <= 33554432, 'RESOURCE_LIMIT'); m.reserve(transport.length);
  // Raw transport SHA256 has no domain prefix; charge and hash exact bytes.
  m.tick(transport.length); m.stats.hashCalls++; m.stats.hashedBytes += transport.length;
  need(globalThis.crypto?.subtle, 'DIGEST_UNAVAILABLE');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(transport)); m.tick();
  const transportDigest = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
  // P1 captures decodeSyntheticBackup(bytes).envelope, not the constructed
  // encoder DTO: FP-TV hashes include nested own-property order. Parse the
  // entire canonical transport, leaving source-native FP-TV values untouched.
  const decodedEnvelope = parseSourceTransport(transport, m);
  return freeze({ snapshot, envelope: decodedEnvelope, qualifications, snapshotDigest: data.source.snapshotDigest,
    contentDigest: envelope.integrity.contentDigest, transportDigest });
}
