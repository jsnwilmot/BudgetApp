// Private replaceable compressed radix lookup; NOT persisted authority.
import { need, isHash } from './writerFormat.js';
export function lookup(root, id, m) {
  need(isHash(id), 'MISSING_OBJECT'); let n = root;
  while (n) {
    m.tick(); if (n.tag === 'leaf') return n.id === id ? n.record : null;
    if (!id.startsWith(n.prefix)) return null;
    n = n.children.find(([digit]) => digit === id[n.prefix.length])?.[1];
  } return null;
}
export function indexBuilder(root, m) {
  const owned = new WeakSet(), allocated = [];
  function make(n) { m.tick(); m.reserve(n.tag === 'leaf' ? n.record.lookupBytes ?? 96 : 24 + n.prefix.length + n.children.length * 8);
    m.stats.indexAllocations++; owned.add(n); allocated.push(n); return n; }
  function branch(prefix, children) { return make({ tag: 'branch', prefix, children: children.sort(([a], [b]) => a < b ? -1 : 1) }); }
  function insert(n, id, record) {
    m.tick(); if (!n) return make({ tag: 'leaf', id, record });
    if (n.tag === 'leaf' && n.id === id) { need(n.record === record, 'NODE_HASH_COLLISION'); return n; }
    const oldPrefix = n.tag === 'leaf' ? n.id : n.prefix; let shared = 0;
    while (shared < Math.min(oldPrefix.length, id.length) && oldPrefix[shared] === id[shared]) shared++;
    if (shared < oldPrefix.length) return branch(id.slice(0, shared), [[oldPrefix[shared], n], [id[shared], make({ tag: 'leaf', id, record })]]);
    need(n.tag === 'branch', 'INVALID_GRAPH');
    if (!owned.has(n)) n = branch(n.prefix, [...n.children]);
    const digit = id[n.prefix.length], at = n.children.findIndex(([d]) => d === digit);
    if (at < 0) { n.children.push([digit, make({ tag: 'leaf', id, record })]); n.children.sort(([a], [b]) => a < b ? -1 : 1); }
    else n.children[at] = [digit, insert(n.children[at][1], id, record)];
    return n;
  }
  return { put(id, record) { root = insert(root, id, record); },
    finish() {
      let bytes = 0;
      for (const n of allocated) { const size = n.tag === 'leaf' ? n.record.lookupBytes ?? 96 : 24 + n.prefix.length + n.children.length * 8;
        bytes += size; if (n.children) { n.children.forEach(Object.freeze); Object.freeze(n.children); } Object.freeze(n); }
      m.stats.indexBytes += bytes; return { root, allocated: allocated.length, bytes };
    } };
}
export function indexInventory(root, m) {
  const records = [], queue = root ? [root] : []; let nodes = 0, bytes = 0;
  while (queue.length) { m.tick(); const n = queue.pop(); nodes++;
    bytes += n.tag === 'leaf' ? n.record.lookupBytes ?? 96 : 24 + n.prefix.length + n.children.length * 8;
    if (n.tag === 'leaf') records.push(n.record); else for (const [, child] of n.children) queue.push(child);
  } return { records, nodes, bytes };
}
