// P1 pure model internals. No external effects or production imports.
import { canonical, hash, sha, copy, freeze, need, fields, plain, text, keyEncode, keyDecode,
  keyCompare } from './backupFormat.js';
import { makeGraph, readGraph } from './backupGraph.js';

export { canonical, copy, freeze, need, fields, plain, text, keyEncode, keyDecode, keyCompare };
export const P1 = 'FinPath/P1/';
const decodedValues = new WeakMap(); // Immutable-entry memo, not model authority.
const models = new WeakMap();
export function modelState(model) { const s = models.get(model); need(s, 'INVALID_MODEL'); return s; }
export function registerModel(model, state) { models.set(model, Object.freeze(state)); return model; }
export const MODEL_LIMITS = Object.freeze({ objects: 400000, retainedBytes: 256 * 1024 * 1024,
  changes: 128, operations: 10000, refs: 768, depth: 64, chunk: 60 * 1024, record: 64 * 1024,
  pageRows: 128, pageBytes: 256 * 1024, visits: 4000000 });
const safeCodes = new Set(['INVALID_INPUT', 'INVALID_FIELDS', 'UNSUPPORTED_TYPE', 'UNSAFE_NUMBER', 'RESOURCE_LIMIT',
  'SYNTHETIC_INPUT_REQUIRED', 'INVALID_MODEL', 'INVALID_KEY', 'INVALID_IDENTITY', 'INVALID_ORIGIN', 'INVALID_DATASET',
  'STALE_REVISION', 'OPERATION_CONFLICT', 'NODE_HASH_COLLISION', 'INVALID_GRAPH', 'INTEGRITY_MISMATCH',
  'INVALID_CONTINUATION', 'UNSUPPORTED_SCOPE', 'SOURCE_CONTEXT', 'MISSING_OBJECT', 'INVALID_PAGE', 'INCOMPLETE_READ',
  'CANCELLED', 'DIGEST_UNAVAILABLE', 'INVALID_UTF8', 'INVALID_JSON', 'DUPLICATE_JSON_KEY', 'UNSUPPORTED_VERSION',
  'INVALID_FORMAT', 'UNSUPPORTED_CAPABILITY', 'ACTIVE_STATE', 'INVALID_HISTORY', 'INVALID_ALIAS']);
export const bad = e => {
  const d = e && typeof e === 'object' ? Object.getOwnPropertyDescriptor(e, 'code') : null;
  const code = d && 'value' in d && safeCodes.has(d.value) ? d.value : 'INVALID_INPUT';
  return freeze({ ok: false, diagnostics: [{ code }] });
};
export function limits(input = {}) {
  need(plain(input), 'INVALID_INPUT'); const out = { ...MODEL_LIMITS };
  for (const [k, v] of Object.entries(input)) {
    need(Object.hasOwn(out, k) && Number.isSafeInteger(v) && v > 0 && v <= out[k], 'RESOURCE_LIMIT'); out[k] = v;
  }
  return freeze(out);
}
export function refsOf(kind, b) {
  switch (kind) {
    case 'chunk': return [];
    case 'value': return [...b.chunks, ...b.children];
    case 'map': return b.tag === 'leaf' ? b.entries.flatMap(e => [e.keyRef, e.valueRef, e.versionRef].filter(Boolean)) : b.children.flatMap(c => [c.ref, c.firstKeyRef]);
    case 'version': return [b.keyRef, b.valueRef, b.previous, b.sourceVersionRef].filter(Boolean);
    case 'origin': return [b.envelopeRef, ...b.inventory.map(i => i.root)];
    case 'dataset': return [b.originRef, ...b.collections.map(i => i.root)];
    case 'data-root': return [b.originsRoot, b.datasetsRoot];
    case 'journal': return [b.previous, b.beforeModelRoot, b.afterDataRoot].filter(Boolean);
    case 'event': return [b.journal, b.afterDataRoot, b.originRef].filter(Boolean);
    case 'model-root': return [b.dataRoot, b.operationsRoot, b.journal].filter(Boolean);
    default: need(false, 'INVALID_GRAPH');
  }
}
export const valueChildren = v => v[0] === 'obj' ? v[2].map(p => p[1]) : v[0] === 'arr-leaf' ? v[1] : v[0] === 'arr-branch' ? v[2] : [];
export async function typedFingerprint(value) { return (await makeGraph([copy(value)])).roots[0]; }
export function indexDTO(n) {
  if (!n) return null;
  return n.tag === 'leaf' ? { tag: 'leaf', id: n.record.id, ordinal: n.record.ordinal,
    recordDigest: n.record.recordDigest, payloadBytes: n.record.payloadBytes } :
    { tag: 'branch', children: n.children.map(c => c?.digest ?? null) };
}
export const indexDigest = d => hash(P1 + (d.tag === 'leaf' ? 'index-leaf/1' : 'index-branch/1'), d);
export function indexAt(root, path) {
  let n = root;
  for (const char of path) { if (!n || n.tag !== 'branch') return null; n = n.children[parseInt(char, 16)]; }
  return n;
}
export function get(root, id) {
  need(typeof id === 'string' && /^[0-9a-f]{64}$/.test(id), 'MISSING_OBJECT');
  let n = root, depth = 0;
  while (n?.tag === 'branch' && depth < 64) n = n.children[parseInt(id[depth++], 16)];
  need(n?.tag === 'leaf' && n.record.id === id, 'MISSING_OBJECT'); return n.record;
}
async function insert(root, leaf, depth, charge) {
  if (!root) return leaf;
  need(depth < 64, 'INVALID_GRAPH');
  let children;
  if (root.tag === 'leaf') {
    need(root.record.id !== leaf.record.id, 'NODE_HASH_COLLISION'); children = Array(16).fill(null);
    children[parseInt(root.record.id[depth], 16)] = root;
  } else children = [...root.children];
  const slot = parseInt(leaf.record.id[depth], 16);
  children[slot] = await insert(children[slot], leaf, depth + 1, charge);
  const d = { tag: 'branch', children: children.map(n => n?.digest ?? null) };
  charge(); return Object.freeze({ tag: 'branch', children: Object.freeze(children), digest: await indexDigest(d) });
}
export function builder(state) {
  let pool = state.pool; const stats = { ...state.stats, kinds: { ...state.stats.kinds }, kindBytes: { ...state.stats.kindBytes } };
  const l = state.limits, cache = new Map();
  const lookup = id => { need(++stats.lookupVisits <= l.visits, 'RESOURCE_LIMIT'); return get(pool, id); };
  const h = async (domain, value) => { stats.hashCalls++; return hash(domain, value); };
  async function intern(kind, body, forcedId) {
    const id = forcedId ?? await h(P1 + kind + '/1', body), encoded = canonical(body);
    let prior; try { prior = lookup(id); } catch (e) { if (e.code !== 'MISSING_OBJECT') throw e; }
    if (prior) { need(prior.kind === kind && canonical(prior.body) === encoded, 'NODE_HASH_COLLISION'); return id; }
    const refs = refsOf(kind, body); need(refs.length <= l.refs, 'RESOURCE_LIMIT');
    for (const ref of refs) lookup(ref);
    const ordinal = stats.objects + 1;
    const recordDigest = await h(P1 + 'record/1', { id, kind, body });
    const metadata = canonical({ id, kind, ordinal, recordDigest }).length;
    const payloadBytes = (kind === 'chunk' ? body.data.length : encoded.length) + metadata;
    need(payloadBytes <= l.record && stats.objects < l.objects && stats.retainedBytes + payloadBytes <= l.retainedBytes, 'RESOURCE_LIMIT');
    const record = freeze({ id, kind, body, ordinal, payloadBytes, recordDigest });
    stats.indexAllocations++; stats.hashCalls++; const leaf = Object.freeze({ tag: 'leaf', record, digest: await indexDigest(indexDTO({ tag: 'leaf', record })) });
    pool = await insert(pool, leaf, 0, () => { stats.indexAllocations++; stats.hashCalls++; });
    stats.objects++; stats.retainedBytes += payloadBytes;
    stats.kinds[kind] = (stats.kinds[kind] ?? 0) + 1; stats.kindBytes[kind] = (stats.kindBytes[kind] ?? 0) + payloadBytes;
    return id;
  }
  async function value(input) {
    const v = copy(input), graph = await makeGraph([v]), nodes = new Map(graph.nodes.map(n => [n.id, n.value]));
    async function ensure(id, depth = 0) {
      need(depth <= l.depth, 'RESOURCE_LIMIT');
      try { const old = lookup(id); need(old.kind === 'value', 'NODE_HASH_COLLISION'); return id; }
      catch (e) { if (e.code !== 'MISSING_OBJECT') throw e; }
      const node = nodes.get(id), children = valueChildren(node), bytes = canonical(node);
      need(Math.ceil(bytes.length / l.chunk) + children.length <= l.refs, 'RESOURCE_LIMIT');
      for (const child of children) await ensure(child, depth + 1);
      const chunks = [];
      for (let offset = 0; offset < bytes.length; offset += l.chunk) {
        const data = bytes.slice(offset, offset + l.chunk); stats.hashCalls++;
        const chunkId = await sha(new TextEncoder().encode(P1 + 'chunk/1\n' + data));
        chunks.push(await intern('chunk', { data }, chunkId));
      }
      need(chunks.length <= l.refs, 'RESOURCE_LIMIT');
      const ref = await intern('value', { logicalBytes: bytes.length, chunks, children }, id);
      stats.logicalValueBytes += bytes.length; return ref;
    }
    const id = await ensure(graph.roots[0]), frozen = freeze(v); cache.set(id, frozen); decodedValues.set(lookup(id), frozen); return id;
  }
  async function decode(id) {
    if (cache.has(id)) return cache.get(id);
    const entry = lookup(id);
    if (decodedValues.has(entry)) return decodedValues.get(entry);
    const rows = new Map();
    function collect(ref, depth = 0) {
      need(depth <= l.depth, 'RESOURCE_LIMIT'); if (rows.has(ref)) return;
      const r = lookup(ref); need(r.kind === 'value', 'INVALID_GRAPH');
      const bytes = r.body.chunks.map(c => { const chunk = lookup(c); need(chunk.kind === 'chunk', 'INVALID_GRAPH'); return chunk.body.data; }).join('');
      need(bytes.length === r.body.logicalBytes, 'INTEGRITY_MISMATCH'); const n = JSON.parse(bytes);
      need(canonical(valueChildren(n)) === canonical(r.body.children), 'INVALID_GRAPH');
      rows.set(ref, n); for (const child of r.body.children) collect(child, depth + 1);
    }
    collect(id); const graph = await readGraph([...rows].sort(([a], [b]) => a < b ? -1 : 1).map(([id, value]) => ({ id, value })), [id]);
    const v = freeze(graph.values[0]); cache.set(id, v); decodedValues.set(entry, v); return v;
  }
  return { intern, value, decode, get: lookup, hash: h,
    done: () => ({ pool, stats: freeze({ ...stats, kinds: { ...stats.kinds }, kindBytes: { ...stats.kindBytes } }) }) };
}

export const emptyStats = () => ({ objects: 0, retainedBytes: 0, logicalValueBytes: 0, indexAllocations: 0,
  hashCalls: 0, lookupVisits: 0, kinds: {}, kindBytes: {} });
export async function validateRecord(record) {
  const r = copy(record); fields(r, ['id', 'kind', 'body', 'ordinal', 'payloadBytes', 'recordDigest']);
  need(Number.isSafeInteger(r.ordinal) && r.ordinal > 0, 'INVALID_GRAPH');
  need(await hash(P1 + 'record/1', { id: r.id, kind: r.kind, body: r.body }) === r.recordDigest, 'INTEGRITY_MISMATCH');
  if (r.kind === 'chunk') need(await sha(new TextEncoder().encode(P1 + 'chunk/1\n' + r.body.data)) === r.id, 'INTEGRITY_MISMATCH');
  else if (r.kind !== 'value') need(await hash(P1 + r.kind + '/1', r.body) === r.id, 'INTEGRITY_MISMATCH');
  const cost = (r.kind === 'chunk' ? r.body.data.length : canonical(r.body).length) + canonical({ id: r.id, kind: r.kind, ordinal: r.ordinal, recordDigest: r.recordDigest }).length;
  need(cost === r.payloadBytes && cost <= MODEL_LIMITS.record, 'RESOURCE_LIMIT'); return r;
}
