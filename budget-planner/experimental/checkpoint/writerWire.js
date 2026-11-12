// Closed physical grammar. Independent from transient map construction.
import { need, fields, plain, isHash, integer, KINDS, D, P, freeze, fromBits, put } from './writerFormat.js';
import { STORES, SCHEMA, RAW } from './backupFormat.js';
import { parseCanonical } from './writerCanonical.js';
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
      out = []; let total = 0, live = 0;
      for (const row of list) {
        m.tick(); fields(row, b.tag === 'leaf' ? ['keyRef', 'valueRef', 'versionRef', 'deleted'] : ['ref', 'firstKeyRef', 'total', 'live']);
        if (b.tag === 'leaf') { need(typeof row.deleted === 'boolean' && (row.deleted ? row.valueRef === null : isHash(row.valueRef)), 'INVALID_GRAPH'); out.push(row.keyRef); if (row.valueRef) out.push(row.valueRef); out.push(row.versionRef); total++; if (!row.deleted) live++; }
        else { need(integer(row.total) && integer(row.live) && row.live <= row.total, 'INVALID_GRAPH'); total += row.total; live += row.live; out.push(row.ref, row.firstKeyRef); }
      }
      need(total === b.total && live === b.live, 'INVALID_GRAPH'); break;
    }
    case 'version': fields(b, ['datasetId', 'store', 'keyRef', 'valueRef', 'deleted', 'previous', 'sourceVersionRef', 'localRevision', ...(Object.hasOwn(b, 'originId') ? ['originId'] : [])]);
      need(typeof b.deleted === 'boolean' && STORES.includes(b.store) && (b.deleted ? b.valueRef === null : isHash(b.valueRef)), 'INVALID_GRAPH');
      out = [b.keyRef, b.valueRef, b.previous, b.sourceVersionRef].filter(Boolean); break;
    case 'origin':
      need(Array.isArray(b.inventory) && b.inventory.length === 17 && b.transportBytesRetained === false, 'INVALID_GRAPH');
      for (let i = 0; i < b.inventory.length; i++) { const row = b.inventory[i]; fields(row, ['store', 'keyPath', 'root', 'count']);
        need(row.store === STORES[i] && m.canonical(row.keyPath) === m.canonical(SCHEMA[row.store]) && integer(row.count), 'INVALID_GRAPH'); }
      out = [b.envelopeRef, ...b.inventory.map(i => i.root)]; break;
    case 'dataset':
      need(Array.isArray(b.collections) && b.collections.length === 13, 'INVALID_GRAPH');
      for (let i = 0; i < b.collections.length; i++) { const row = b.collections[i]; fields(row, ['store', 'root']); need(row.store === [...RAW, 'checkpointDrafts', 'checkpointDraftHeads'][i], 'INVALID_GRAPH'); }
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
export function valueShape(node, getInfo, m) {
  need(Array.isArray(node), 'INVALID_GRAPH'); const tag = node[0]; let children = [], bytes = 16, length;
  if (tag === 'n' || tag === 'u') need(node.length === 1, 'INVALID_GRAPH');
  else if (tag === 'b') need(node.length === 2 && typeof node[1] === 'boolean', 'INVALID_GRAPH');
  else if (tag === 's') { need(node.length === 2 && typeof node[1] === 'string' && node[1].length <= 1048576, 'INVALID_GRAPH'); bytes += node[1].length * 2; }
  else if (tag === 'f64') { need(node.length === 2, 'INVALID_GRAPH'); fromBits(node[1]); }
  else if (tag === 'obj') {
    need(node.length === 3 && Array.isArray(node[1]) && Array.isArray(node[2]) && node[1].length === node[2].length &&
      node[1].every(k => typeof k === 'string' && k.length <= 1048576) && new Set(node[1]).size === node[1].length, 'INVALID_GRAPH');
    const sorted = [...node[1]].sort(), probe = {};
    for (let i = 0; i < sorted.length; i++) { m.tick(); const p = node[2][i]; need(Array.isArray(p) && p.length === 2 && p[0] === sorted[i], 'INVALID_GRAPH'); children.push(p[1]); }
    for (const k of node[1]) put(probe, k, null);
    need(Object.keys(probe).every((k, i) => k === node[1][i]), 'INVALID_GRAPH'); bytes = 32 + node[1].reduce((n, k) => n + 16 + k.length * 2, 0);
  } else if (tag === 'arr-leaf') {
    need(node.length === 2 && Array.isArray(node[1]) && node[1].length <= 64, 'INVALID_GRAPH'); children = node[1]; length = children.length; bytes = 32 + length * 8;
  } else {
    need(tag === 'arr-branch' && node.length === 3 && integer(node[1]) && node[1] > 64 && Array.isArray(node[2]) && node[2].length >= 2 && node[2].length <= 64, 'INVALID_GRAPH');
    children = node[2]; length = node[1]; bytes = 32;
  }
  need(children.every(isHash), 'INVALID_GRAPH'); let expanded = bytes, visits = 1, height = 0;
  if (getInfo) for (const id of children) { m.tick(); const c = getInfo(id); need(c, 'INVALID_GRAPH'); expanded += c.expanded; visits += c.visits; height = Math.max(height, c.height + 1);
    need(expanded <= 134217728 && visits <= 2000000 && height <= m.bound.depth, 'RESOURCE_LIMIT'); }
  if (getInfo && tag === 'arr-branch') {
    let capacity = 64; while (capacity * 64 < length) capacity *= 64;
    need(children.length === Math.ceil(length / capacity), 'INVALID_GRAPH');
    for (let i = 0; i < children.length; i++) need(getInfo(children[i]).length === Math.min(capacity, length - i * capacity), 'INVALID_GRAPH');
  }
  return { children, tag, expanded, visits, height, length };
}
export async function checkLogical(record, get, m, options) {
  const edges = refs(record, m), { kind, id, body } = record; need(isHash(id), 'INVALID_GRAPH');
  // A full audit already owns an authenticated, child-before-parent registry.
  // Resolve directly against it instead of allocating/populating a second Map
  // per record. refs() still meters every edge and every role is checked below.
  const resolved = options?.verifiedRecords ?? new Map();
  if (options?.verifiedRecords) { for (const ref of edges) need(resolved.has(ref), 'MISSING_OBJECT'); }
  else for (const ref of edges) if (!resolved.has(ref)) { const child = get(ref); need(child, 'MISSING_OBJECT'); resolved.set(ref, child); }
  const role = (ref, allowed) => { if (ref !== null) need(resolved.has(ref) && allowed.includes(resolved.get(ref).kind), 'INVALID_GRAPH'); };
  if (kind === 'value') { for (const r of body.chunks) role(r, ['chunk']); for (const r of body.children) role(r, ['value']); }
  if (kind === 'map') for (const row of body.entries ?? body.children) {
    if (body.tag === 'leaf') { role(row.keyRef, ['value']); role(row.valueRef, ['value', 'origin', 'dataset', 'event']); role(row.versionRef, ['version', 'origin', 'dataset', 'event']); }
    else { role(row.ref, ['map']); role(row.firstKeyRef, ['value']); }
  }
  if (kind === 'version') { role(body.keyRef, ['value']); role(body.valueRef, ['value']); role(body.previous, ['version']); role(body.sourceVersionRef, ['version']); }
  if (kind === 'origin') { role(body.envelopeRef, ['value']); for (const row of body.inventory) role(row.root, ['map']); }
  if (kind === 'dataset') { role(body.originRef, ['origin']); for (const row of body.collections) role(row.root, ['map']); }
  if (kind === 'data-root') { role(body.originsRoot, ['map']); role(body.datasetsRoot, ['map']); }
  if (kind === 'journal') { role(body.previous, ['journal']); role(body.beforeModelRoot, ['model-root']); role(body.afterDataRoot, ['data-root']); }
  if (kind === 'event') { role(body.journal, ['journal']); role(body.afterDataRoot, ['data-root']); if (body.originRef) role(body.originRef, ['origin']); }
  if (kind === 'model-root') { role(body.dataRoot, ['data-root']); role(body.operationsRoot, ['map']); role(body.journal, ['journal']); }
  if (kind === 'chunk') need(await m.digest(P + 'chunk/1', body.data) === id, 'INTEGRITY_MISMATCH');
  else if (kind === 'value') {
    const mark = m.stats.stageBytes;
    try {
    need(body.chunks.length === Math.ceil(body.logicalBytes / 61440), 'INVALID_GRAPH');
    let n = 0; const parts = []; for (const c of body.chunks) { const r = resolved.get(c); need(r.kind === 'chunk' &&
      r.body.data.length === Math.min(61440, body.logicalBytes - n), 'INVALID_GRAPH'); n += r.body.data.length; need(n <= 33554432, 'RESOURCE_LIMIT'); parts.push(r.body.data); }
    need(n === body.logicalBytes, 'INVALID_GRAPH'); m.reserve(n * 3 + 256); m.tick(n); const encoded = parts.join(''), node = parseCanonical(encoded, m);
    need(await m.digest('FinPath/FP-TV-1/node', encoded) === id, 'INTEGRITY_MISMATCH');
    const info = valueShape(node, options?.getValueInfo, m), actual = info.children;
    need(actual.length === body.children.length, 'INVALID_GRAPH');
    for (let i = 0; i < actual.length; i++) { m.tick(); need(actual[i] === body.children[i], 'INVALID_GRAPH'); }
    if (options?.onValue) options.onValue(node, record, info);
    } finally { m.release(m.stats.stageBytes - mark); }
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
    m.tick(length); const text = new TextDecoder().decode(raw), body = codec === 2 ? { data: text } : parseCanonical(text, m);
    const r = { id, kind: KINDS[code - 1], body, sequence: Number(seq) + i, bodyBytes: length }; freeze(r); if (codec === 1) m.remember(body, text); records.push(r); offset += 38 + length;
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
