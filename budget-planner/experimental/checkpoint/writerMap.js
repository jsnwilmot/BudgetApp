// Command-scoped transient FP-MAP-1. Never calls accepted eager mapPut.
import { need } from './writerFormat.js';
const sum = (rows, field) => rows.reduce((n, x) => n + x[field], 0);
export function mapEditor(b, m) {
  const owned = new WeakSet(), sealed = new WeakMap();
  function dirty(body) {
    need(++m.stats.transientMaps <= m.bound.dirtyMaps, 'RESOURCE_LIMIT'); m.reserve(32 + (body.entries ?? body.children).length * 32);
    const n = { ...body, ...(body.entries ? { entries: [...body.entries] } : { children: [...body.children] }) }; owned.add(n); return n;
  }
  const body = node => typeof node === 'string' ? b.get(node).body : node;
  function mutable(node) { return typeof node === 'string' || sealed.has(node) || !owned.has(node) ? dirty(body(node)) : node; }
  function summary(node) {
    const n = body(node); return { ref: node, firstKeyRef: n.tag === 'leaf' ? n.entries[0].keyRef : n.children[0].firstKeyRef,
      total: n.total, live: n.live };
  }
  function refresh(n) { n.total = n.tag === 'leaf' ? n.entries.length : sum(n.children, 'total');
    n.live = n.tag === 'leaf' ? n.entries.filter(e => !e.deleted).length : sum(n.children, 'live'); return n; }
  async function find(node, key) {
    const encoded = m.key(key); let depth = 0;
    while (true) {
      m.tick(); need(++depth <= m.bound.depth, 'RESOURCE_LIMIT'); const n = body(node);
      if (n.tag === 'leaf') { for (const e of n.entries) if (m.compare(b.decode(e.keyRef), encoded) === 0) return e; return null; }
      let at = 0; for (let i = 1; i < n.children.length; i++) { if (m.compare(b.decode(n.children[i].firstKeyRef), encoded) <= 0) at = i; else break; }
      node = n.children[at].ref;
    }
  }
  async function put(root, key, entry) {
    const encoded = m.key(key), keyRef = await b.value(encoded);
    const item = { keyRef, valueRef: entry.valueRef, versionRef: entry.versionRef, deleted: entry.deleted === true };
    function visit(node, depth = 0) {
      m.tick(); need(depth <= m.bound.depth, 'RESOURCE_LIMIT'); const source = body(node);
      if (source.tag === 'leaf') {
        let at = 0; while (at < source.entries.length && m.compare(b.decode(source.entries[at].keyRef), encoded) < 0) at++;
        const same = at < source.entries.length && m.compare(b.decode(source.entries[at].keyRef), encoded) === 0;
        if (same && m.canonical(source.entries[at]) === m.canonical(item)) return [node];
        const n = mutable(node); n.entries.splice(at, same ? 1 : 0, item); refresh(n);
        if (n.entries.length <= 64) return [n];
        return [refresh(dirty({ tag: 'leaf', entries: n.entries.slice(0, 32) })), refresh(dirty({ tag: 'leaf', entries: n.entries.slice(32) }))];
      }
      let at = 0; for (let i = 1; i < source.children.length; i++) { if (m.compare(b.decode(source.children[i].firstKeyRef), encoded) <= 0) at = i; else break; }
      const n = mutable(node), children = visit(n.children[at].ref, depth + 1);
      n.children.splice(at, 1, ...children.map(summary)); refresh(n); if (n.children.length <= 64) return [n];
      return [refresh(dirty({ tag: 'branch', children: n.children.slice(0, 32) })), refresh(dirty({ tag: 'branch', children: n.children.slice(32) }))];
    }
    const nodes = visit(root); return nodes.length === 1 ? nodes[0] : refresh(dirty({ tag: 'branch', children: nodes.map(summary) }));
  }
  async function finish(node) {
    if (typeof node === 'string') return node; if (sealed.has(node)) return sealed.get(node);
    const n = body(node), out = n.tag === 'leaf' ? { tag: 'leaf', entries: n.entries, total: n.total, live: n.live } :
      { tag: 'branch', children: [], total: n.total, live: n.live };
    if (n.tag === 'branch') for (const c of n.children) out.children.push({ ...c, ref: await finish(c.ref) });
    const id = await b.intern('map', out); sealed.set(node, id); return id;
  }
  function rows(root) {
    const result = [], queue = [root]; let visits = 0;
    while (queue.length) { m.tick(); need(++visits <= m.bound.visits, 'RESOURCE_LIMIT'); const n = body(queue.pop());
      if (n.tag === 'branch') for (let i = n.children.length - 1; i >= 0; i--) queue.push(n.children[i].ref);
      else for (const e of n.entries) result.push({ ...e, key: b.decode(e.keyRef)[1] }); }
    return result;
  }
  return { empty: () => dirty({ tag: 'leaf', entries: [], total: 0, live: 0 }), find, put, finish, rows };
}
