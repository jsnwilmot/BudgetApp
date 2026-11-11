import { LIMITS, need, canonical, DOMAIN, hash, bits, fromBits, cmp, put } from './backupFormat.js';

export async function makeGraph(values) {
  const nodes = new Map(), encodings = new Map(), memo = new WeakMap(); let edges = 0;
  async function intern(value) {
    const encoded = canonical(value);
    if (encodings.has(encoded)) return encodings.get(encoded);
    const id = await hash(DOMAIN.node, value);
    need(!nodes.has(id) || canonical(nodes.get(id)) === encoded, 'NODE_HASH_COLLISION');
    need(nodes.size < LIMITS.nodes, 'RESOURCE_LIMIT');
    nodes.set(id, value); encodings.set(encoded, id); return id;
  }
  const link = count => { edges += count; need(edges <= LIMITS.edges, 'RESOURCE_LIMIT'); };
  async function array(refs) {
    if (refs.length <= 64) { link(refs.length); return intern(['arr-leaf', refs]); }
    let capacity = 64; while (capacity * 64 < refs.length) capacity *= 64;
    const children = [];
    for (let i = 0; i < refs.length; i += capacity) children.push(await array(refs.slice(i, i + capacity)));
    link(children.length); return intern(['arr-branch', refs.length, children]);
  }
  async function visit(v) {
    if (v && typeof v === 'object' && memo.has(v)) return memo.get(v);
    let id;
    if (v === null) id = await intern(['n']);
    else if (v === undefined) id = await intern(['u']);
    else if (typeof v === 'boolean') id = await intern(['b', v]);
    else if (typeof v === 'string') id = await intern(['s', v]);
    else if (typeof v === 'number') id = await intern(['f64', bits(v)]);
    else if (Array.isArray(v)) { const refs = []; for (const item of v) refs.push(await visit(item)); id = await array(refs); }
    else {
      const keys = Object.keys(v), pairs = [];
      for (const key of [...keys].sort(cmp)) pairs.push([key, await visit(v[key])]);
      link(pairs.length); id = await intern(['obj', keys, pairs]);
    }
    if (v && typeof v === 'object') memo.set(v, id);
    return id;
  }
  const roots = []; for (const value of values) roots.push(await visit(value));
  return { roots, nodes: [...nodes].sort(([a], [b]) => cmp(a, b)).map(([id, value]) => ({ id, value })) };
}

export async function readGraph(table, roots) {
  need(Array.isArray(table) && table.length <= LIMITS.nodes, 'RESOURCE_LIMIT');
  const nodes = new Map(), meta = new Map(); let edges = roots.length;
  for (let i = 0; i < table.length; i++) {
    const row = table[i];
    need(row && Object.keys(row).length === 2 && Object.hasOwn(row, 'id') && Object.hasOwn(row, 'value'), 'INVALID_FIELDS');
    need(typeof row.id === 'string' && /^[0-9a-f]{64}$/.test(row.id) && Array.isArray(row.value), 'INVALID_GRAPH');
    if (nodes.has(row.id)) need(false, canonical(nodes.get(row.id)) === canonical(row.value) ? 'INVALID_GRAPH' : 'NODE_HASH_COLLISION');
    need(i === 0 || cmp(table[i - 1].id, row.id) < 0, 'INVALID_GRAPH'); nodes.set(row.id, row.value);
  }
  for (const [id, n] of nodes) {
    const tag = n[0]; let refs = [], bytes = 16, length;
    if (['n', 'u'].includes(tag)) need(n.length === 1, 'INVALID_GRAPH');
    else if (tag === 'b') need(n.length === 2 && typeof n[1] === 'boolean', 'INVALID_GRAPH');
    else if (tag === 's') {
      need(n.length === 2 && typeof n[1] === 'string', 'INVALID_GRAPH');
      need(n[1].length <= LIMITS.string, 'RESOURCE_LIMIT'); bytes += n[1].length * 2;
    } else if (tag === 'f64') { need(n.length === 2, 'INVALID_GRAPH'); fromBits(n[1]); }
    else if (tag === 'obj') {
      need(n.length === 3 && Array.isArray(n[1]) && Array.isArray(n[2]) && n[1].length === n[2].length, 'INVALID_GRAPH');
      need(n[1].every(k => typeof k === 'string' && k.length <= LIMITS.string) && new Set(n[1]).size === n[1].length, 'INVALID_GRAPH');
      const sorted = [...n[1]].sort(cmp);
      need(n[2].every((p, i) => Array.isArray(p) && p.length === 2 && p[0] === sorted[i]), 'INVALID_GRAPH');
      refs = n[2].map(p => p[1]); bytes = 32 + n[1].reduce((sum, k) => sum + 16 + k.length * 2, 0);
      const probe = {}; n[1].forEach(k => put(probe, k, null));
      need(canonical(Object.keys(probe)) === canonical(n[1]), 'INVALID_GRAPH');
    } else if (tag === 'arr-leaf') {
      need(n.length === 2 && Array.isArray(n[1]) && n[1].length <= 64, 'INVALID_GRAPH'); refs = n[1]; length = refs.length; bytes = 32 + length * 8;
    } else if (tag === 'arr-branch') {
      need(n.length === 3 && Number.isSafeInteger(n[1]) && n[1] > 64 && Array.isArray(n[2]) && n[2].length >= 2 && n[2].length <= 64, 'INVALID_GRAPH');
      length = n[1]; refs = n[2]; bytes = 32;
    } else need(false, 'INVALID_GRAPH');
    need(refs.every(r => typeof r === 'string' && nodes.has(r)), 'INVALID_GRAPH');
    edges += refs.length; need(edges <= LIMITS.edges, 'RESOURCE_LIMIT');
    meta.set(id, { refs, bytes, length });
  }
  const costs = new Map(), visiting = new Set();
  function cost(id, depth = 0) {
    need(depth <= LIMITS.depth, 'RESOURCE_LIMIT'); need(meta.has(id) && !visiting.has(id), 'INVALID_GRAPH');
    if (costs.has(id)) { need(depth + costs.get(id).height <= LIMITS.depth, 'RESOURCE_LIMIT'); return costs.get(id); }
    visiting.add(id); const m = meta.get(id), n = nodes.get(id); let bytes = m.bytes, visits = 1, height = 0;
    for (const ref of m.refs) {
      const c = cost(ref, depth + 1); bytes += c.bytes; visits += c.visits; height = Math.max(height, c.height + 1);
      need(bytes <= LIMITS.expanded && visits <= LIMITS.visits, 'RESOURCE_LIMIT');
    }
    if (n[0] === 'arr-branch') {
      let capacity = 64; while (capacity * 64 < n[1]) capacity *= 64;
      need(m.refs.length === Math.ceil(n[1] / capacity), 'INVALID_GRAPH');
      m.refs.forEach((r, i) => need(meta.get(r).length === Math.min(capacity, n[1] - i * capacity), 'INVALID_GRAPH'));
    }
    visiting.delete(id); const c = { bytes, visits, height }; costs.set(id, c); return c;
  }
  // Validate every node, including unreachable cycles, before trusting hashes.
  for (const id of nodes.keys()) cost(id);
  const reachable = new Set();
  function mark(id) { need(meta.has(id), 'INVALID_GRAPH'); if (reachable.has(id)) return; reachable.add(id); meta.get(id).refs.forEach(mark); }
  let expanded = 0, visits = 0;
  for (const r of roots) { const c = cost(r); expanded += c.bytes; visits += c.visits; mark(r); }
  need(expanded <= LIMITS.expanded && visits <= LIMITS.visits && edges <= LIMITS.edges, 'RESOURCE_LIMIT');
  need(reachable.size === nodes.size, 'INVALID_GRAPH');
  // Bounded batches avoid hundreds of thousands of pending crypto promises.
  for (let i = 0; i < table.length; i += 128) await Promise.all(table.slice(i, i + 128).map(async row => {
    need(await hash(DOMAIN.node, row.value) === row.id, 'INTEGRITY_MISMATCH');
  }));
  function materialize(id) {
    const n = nodes.get(id);
    switch (n[0]) {
      case 'n': return null;
      case 'u': return undefined;
      case 'b': case 's': return n[1];
      case 'f64': return fromBits(n[1]);
      case 'obj': {
        const out = {}, pairs = new Map(n[2]); n[1].forEach(k => put(out, k, materialize(pairs.get(k)))); return out;
      }
      case 'arr-leaf': return n[1].map(materialize);
      case 'arr-branch': { const out = []; for (const r of n[2]) for (const item of materialize(r)) out.push(item); return out; }
    }
  }
  return { values: roots.map(materialize), stats: { nodes: nodes.size, edges, expanded, visits } };
}
