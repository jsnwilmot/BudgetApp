// Closed physical grammar. Independent from transient map construction.
import { need, fields, plain, isHash, integer, KINDS, D, P, freeze } from './writerFormat.js';
import { STORES, SCHEMA } from './backupFormat.js';
export function refs(record, m) {
  const b = record.body; m.tick(); need(KINDS.includes(record.kind) && plain(b), 'INVALID_GRAPH');
  const shapes = { chunk: ['data'], value: ['logicalBytes', 'chunks', 'children'],
    origin: ['originId', 'sourceProfile', 'databaseName', 'envelopeRef', 'inventory', 'snapshotDigest', 'contentDigest', 'transportDigest', 'transportBytesRetained'],
    dataset: ['datasetId', 'originId', 'originRef', 'collections'], 'data-root': ['originsRoot', 'datasetsRoot'],
    journal: ['previous', 'beforeModelRoot', 'afterDataRoot', 'operationId', 'requestDigest', 'revision', 'kind'],
    'model-root': ['instanceId', 'generation', 'revision', 'dataRoot', 'operationsRoot', 'journal'] };
  if (shapes[record.kind]) fields(b, shapes[record.kind]); let out;
  switch (record.kind) {
    case 'chunk': need(typeof b.data === 'string' && b.data.length <= m.bound.chunkBytes && /^[\x20-\x7e]*$/.test(b.data), 'INVALID_GRAPH'); out = []; break;
    case 'value':
      need(integer(b.logicalBytes) && b.logicalBytes > 0 && b.logicalBytes <= 33554432 && Array.isArray(b.chunks) && b.chunks.length > 0 && Array.isArray(b.children), 'INVALID_GRAPH');
      out = [...b.chunks, ...b.children]; break;
    case 'map': {
      need(['leaf', 'branch'].includes(b.tag), 'INVALID_GRAPH');
      fields(b, b.tag === 'leaf' ? ['tag', 'entries', 'total', 'live'] : ['tag', 'children', 'total', 'live']);
      const list = b.entries ?? b.children;
      need(Array.isArray(list) && list.length <= 64 && (b.tag === 'leaf' || list.length >= 2) && integer(b.total) && integer(b.live) && b.live <= b.total, 'INVALID_GRAPH');
      out = [];
      for (const row of list) {
        m.tick(); fields(row, b.tag === 'leaf' ? ['keyRef', 'valueRef', 'versionRef', 'deleted'] : ['ref', 'firstKeyRef', 'total', 'live']);
        if (b.tag === 'leaf') { need(typeof row.deleted === 'boolean' && (row.valueRef === null || isHash(row.valueRef)), 'INVALID_GRAPH'); out.push(row.keyRef); if (row.valueRef) out.push(row.valueRef); out.push(row.versionRef); }
        else { need(integer(row.total) && integer(row.live) && row.live <= row.total, 'INVALID_GRAPH'); out.push(row.ref, row.firstKeyRef); }
      } break;
    }
    case 'version': fields(b, ['datasetId', 'store', 'keyRef', 'valueRef', 'deleted', 'previous', 'sourceVersionRef', 'localRevision', ...(Object.hasOwn(b, 'originId') ? ['originId'] : [])]);
      need(typeof b.deleted === 'boolean' && STORES.includes(b.store), 'INVALID_GRAPH');
      out = [b.keyRef, b.valueRef, b.previous, b.sourceVersionRef].filter(Boolean); break;
    case 'origin':
      need(Array.isArray(b.inventory) && b.inventory.length === 17 && b.transportBytesRetained === false, 'INVALID_GRAPH');
      for (let i = 0; i < b.inventory.length; i++) { const row = b.inventory[i]; fields(row, ['store', 'keyPath', 'root', 'count']);
        need(row.store === STORES[i] && m.canonical(row.keyPath) === m.canonical(SCHEMA[row.store]) && integer(row.count), 'INVALID_GRAPH'); }
      out = [b.envelopeRef, ...b.inventory.map(i => i.root)]; break;
    case 'dataset':
      need(Array.isArray(b.collections) && b.collections.length === 13, 'INVALID_GRAPH'); for (const row of b.collections) fields(row, ['store', 'root']);
      out = [b.originRef, ...b.collections.map(i => i.root)]; break;
    case 'data-root': out = [b.originsRoot, b.datasetsRoot]; break;
    case 'journal': need(b.kind === 'MODEL_ONLY', 'INVALID_GRAPH'); out = [b.previous, b.beforeModelRoot, b.afterDataRoot].filter(Boolean); break;
    case 'event':
      need(Object.keys(b).every(k => ['operationId', 'requestDigest', 'journal', 'afterDataRoot', 'revision', 'status', 'originId', 'originRef', 'datasetId'].includes(k)) &&
        ['operationId', 'requestDigest', 'journal', 'afterDataRoot', 'revision', 'status'].every(k => Object.hasOwn(b, k)) && b.status === 'MODEL_ONLY', 'INVALID_GRAPH');
      out = [b.journal, b.afterDataRoot, b.originRef].filter(Boolean); break;
    case 'model-root': out = [b.dataRoot, b.operationsRoot, b.journal].filter(Boolean); break;
  }
  need(out.length <= m.bound.refs && out.every(isHash), 'INVALID_GRAPH'); m.tick(out.length * 32, out.length); return out;
}
export async function checkLogical(record, get, m) {
  const edges = refs(record, m), { kind, id, body } = record; need(isHash(id), 'INVALID_GRAPH');
  for (const ref of edges) need(get(ref), 'MISSING_OBJECT');
  if (kind === 'chunk') need(await m.digest(P + 'chunk/1', body.data) === id, 'INTEGRITY_MISMATCH');
  else if (kind === 'value') {
    let n = 0; const parts = []; for (const c of body.chunks) { const r = get(c); need(r.kind === 'chunk', 'INVALID_GRAPH'); n += r.body.data.length; need(n <= 33554432, 'RESOURCE_LIMIT'); parts.push(r.body.data); }
    need(n === body.logicalBytes, 'INVALID_GRAPH'); m.tick(n); const encoded = parts.join(''), node = JSON.parse(encoded);
    need(m.canonical(node) === encoded && await m.digest('FinPath/FP-TV-1/node', encoded) === id, 'INTEGRITY_MISMATCH');
    const actual = node[0] === 'obj' ? node[2].map(p => p[1]) : node[0] === 'arr-leaf' ? node[1] : node[0] === 'arr-branch' ? node[2] : [];
    need(actual.length === body.children.length, 'INVALID_GRAPH');
    for (let i = 0; i < actual.length; i++) { m.tick(); need(actual[i] === body.children[i], 'INVALID_GRAPH'); }
  } else need(await m.hash(P + kind + '/1', body) === id, 'INTEGRITY_MISMATCH');
  return edges;
}
export async function encodePage(records, first, m) {
  need(records.length > 0 && records.length <= m.bound.pageFrames && integer(first) && first > 0, 'INVALID_PAGE');
  let size = 24; const bodies = [];
  for (const r of records) { need(KINDS.includes(r.kind), 'INVALID_GRAPH'); const data = r.kind === 'chunk' ? r.body.data : m.canonical(r.body);
    size += 38 + data.length; need(size <= m.bound.pageBytes, 'RESOURCE_LIMIT'); bodies.push(data); }
  need(integer(first + records.length - 1), 'INVALID_PAGE'); m.reserve(size); m.tick(size);
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer); bytes.set([70, 80, 87, 49]); bytes[4] = 1;
  view.setUint16(6, 24); view.setBigUint64(8, BigInt(first)); view.setUint16(16, records.length); view.setUint32(20, size - 24);
  let offset = 24;
  for (let i = 0; i < records.length; i++) {
    const r = records[i]; bytes[offset] = KINDS.indexOf(r.kind) + 1; bytes[offset + 1] = r.kind === 'chunk' ? 2 : 1;
    bytes.set(Uint8Array.from(r.id.match(/../g), s => parseInt(s, 16)), offset + 2); view.setUint32(offset + 34, bodies[i].length);
    bytes.set(new TextEncoder().encode(bodies[i]), offset + 38); offset += 38 + bodies[i].length;
  }
  return { id: await m.digest(D + 'page/1', bytes), bytes };
}
export async function decodePage(bytes, expected, m) {
  need(bytes instanceof Uint8Array && bytes.length >= 24 && bytes.length <= m.bound.pageBytes, 'INVALID_PAGE'); m.tick(bytes.length);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  need(bytes[0] === 70 && bytes[1] === 80 && bytes[2] === 87 && bytes[3] === 49 && bytes[4] === 1 && bytes[5] === 0 &&
    view.getUint16(6) === 24 && view.getUint16(18) === 0 && view.getUint32(20) === bytes.length - 24, 'INVALID_PAGE');
  const seq = view.getBigUint64(8), count = view.getUint16(16);
  need(seq > 0n && seq <= BigInt(Number.MAX_SAFE_INTEGER) && count > 0 && count <= m.bound.pageFrames &&
    seq + BigInt(count - 1) <= BigInt(Number.MAX_SAFE_INTEGER), 'INVALID_PAGE');
  need(await m.digest(D + 'page/1', bytes) === expected, 'INTEGRITY_MISMATCH');
  const records = []; let offset = 24;
  for (let i = 0; i < count; i++) {
    m.tick(); need(offset + 38 <= bytes.length, 'INVALID_PAGE'); const code = bytes[offset], codec = bytes[offset + 1], length = view.getUint32(offset + 34);
    need(code > 0 && code <= KINDS.length && codec === (code === 1 ? 2 : 1) && offset + 38 + length <= bytes.length, 'INVALID_PAGE');
    const id = [...bytes.subarray(offset + 2, offset + 34)].map(n => n.toString(16).padStart(2, '0')).join('');
    const raw = bytes.subarray(offset + 38, offset + 38 + length); for (const n of raw) need(n >= 32 && n <= 126, 'INVALID_PAGE');
    m.tick(length); const text = new TextDecoder().decode(raw), body = codec === 2 ? { data: text } : JSON.parse(text);
    if (codec === 1) need(m.canonical(body) === text, 'INVALID_PAGE');
    const r = { id, kind: KINDS[code - 1], body, sequence: Number(seq) + i }; freeze(r); if (codec === 1) m.remember(body, text); records.push(r); offset += 38 + length;
  }
  need(offset === bytes.length, 'INVALID_PAGE'); return records;
}
export function metadataShape(type, b) {
  const shapes = { delta: ['profile', 'physicalInstance', 'generation', 'revision', 'previous', 'firstSequence', 'objects', 'pages', 'logicalRoot'],
    seal: ['profile', 'physicalInstance', 'generation', 'revision', 'baseState', 'logicalRoot', 'inventoryRoot', 'previous', 'operationId', 'semanticDigest', 'requestFingerprint', 'pinRoot', 'effects'],
    state: ['profile', 'capabilities', 'layout', 'physicalInstance', 'generation', 'revision', 'logicalRoot', 'dataRoot', 'inventoryRoot', 'sealRoot', 'pinRoot', 'sequence', 'objects', 'payloadBytes'],
    pins: ['profile', 'physicalInstance', 'generation', 'revision', 'previous', 'pins'] };
  need(Object.hasOwn(shapes, type), 'INVALID_FORMAT'); fields(b, shapes[type]);
}
