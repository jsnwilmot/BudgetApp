// Metered FP-TV-1 construction/materialization. Existing logical format unchanged.
import { need, bits, fromBits, put, freeze } from './writerFormat.js';
export const NODE_DOMAIN = 'FinPath/FP-TV-1/node';
export const childrenOf = n => n[0] === 'obj' ? n[2].map(p => p[1]) : n[0] === 'arr-leaf' ? n[1] : n[0] === 'arr-branch' ? n[2] : [];
export function graphBuilder(m) {
  const encoded = new Map(), nodes = new Map();
  async function intern(node) {
    const text = m.canonical(node); if (encoded.has(text)) return encoded.get(text);
    need(nodes.size < m.bound.stagedRecords, 'RESOURCE_LIMIT'); m.reserve(text.length + 80);
    const id = await m.digest(NODE_DOMAIN, text); need(!nodes.has(id) || m.canonical(nodes.get(id)) === text, 'NODE_HASH_COLLISION');
    freeze(node); m.remember(node, text); encoded.set(text, id); nodes.set(id, node); return id;
  }
  async function array(refs) {
    m.tick(); if (refs.length <= 64) return intern(['arr-leaf', refs]);
    let size = 64; while (size * 64 < refs.length) { m.tick(); size *= 64; }
    const roots = []; for (let i = 0; i < refs.length; i += size) roots.push(await array(refs.slice(i, i + size)));
    return intern(['arr-branch', refs.length, roots]);
  }
  async function value(v, depth = 0) {
    m.tick(); need(depth <= m.bound.depth, 'RESOURCE_LIMIT');
    if (v === null) return intern(['n']); if (v === undefined) return intern(['u']);
    if (typeof v === 'boolean') return intern(['b', v]);
    if (typeof v === 'string') return intern(['s', v]);
    if (typeof v === 'number') { need(Number.isFinite(v), 'UNSAFE_NUMBER'); return intern(['f64', bits(v)]); }
    if (Array.isArray(v)) { const refs = []; for (const x of v) refs.push(await value(x, depth + 1)); return array(refs); }
    const keys = Object.keys(v), pairs = []; m.tick(0, keys.length);
    for (const key of [...keys].sort()) pairs.push([key, await value(v[key], depth + 1)]);
    return intern(['obj', keys, pairs]);
  }
  return { value, nodes };
}
export function materializer(get, m) {
  const cache = new Map(), visiting = new Set();
  function value(id, depth = 0) {
    m.tick(); need(depth <= m.bound.depth && !visiting.has(id), 'INVALID_GRAPH'); if (cache.has(id)) return cache.get(id);
    const r = get(id); need(r.kind === 'value', 'INVALID_GRAPH'); const d = r.body;
    let size = 0; const parts = [];
    for (const c of d.chunks) { const chunk = get(c); need(chunk.kind === 'chunk', 'INVALID_GRAPH'); size += chunk.body.data.length;
      need(size <= m.bound.workBytes - m.stats.workBytes, 'RESOURCE_LIMIT'); parts.push(chunk.body.data); }
    need(size === d.logicalBytes, 'INVALID_GRAPH'); m.tick(size); const n = JSON.parse(parts.join(''));
    visiting.add(id); let out;
    if (n[0] === 'n') out = null;
    else if (n[0] === 'u') out = undefined;
    else if (n[0] === 's' || n[0] === 'b') out = n[1];
    else if (n[0] === 'f64') out = fromBits(n[1]);
    else if (n[0] === 'obj') {
      out = {}; const pairs = new Map(n[2]); for (const k of n[1]) { m.tick(); put(out, k, value(pairs.get(k), depth + 1)); }
    } else if (n[0] === 'arr-leaf') out = n[1].map(r => value(r, depth + 1));
    else { need(n[0] === 'arr-branch', 'INVALID_GRAPH'); out = []; for (const r of n[2]) for (const item of value(r, depth + 1)) { m.tick(); out.push(item); } }
    visiting.delete(id); cache.set(id, out); return out;
  }
  return value;
}
