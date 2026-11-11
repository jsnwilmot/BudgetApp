import { need, keyCompare, keyEncode, keyDecode, canonical } from './historyCore.js';

export async function emptyMap(b) { return b.intern('map', { tag: 'leaf', entries: [], total: 0, live: 0 }); }
const sum = (items, field) => items.reduce((n, i) => n + i[field], 0);
async function summary(b, ref) {
  const n = b.get(ref).body;
  return { ref, firstKeyRef: n.tag === 'leaf' ? n.entries[0].keyRef : n.children[0].firstKeyRef, total: n.total, live: n.live };
}
async function leaf(b, entries) {
  return b.intern('map', { tag: 'leaf', entries, total: entries.length, live: entries.filter(e => !e.deleted).length });
}
async function branch(b, children) { return b.intern('map', { tag: 'branch', children, total: sum(children, 'total'), live: sum(children, 'live') }); }
export async function mapFind(b, root, key) {
  const target = keyEncode(key); let ref = root, depth = 0;
  while (true) {
    need(++depth <= 64, 'RESOURCE_LIMIT'); const n = b.get(ref); need(n.kind === 'map', 'INVALID_GRAPH');
    if (n.body.tag === 'leaf') {
      for (const e of n.body.entries) if (keyCompare(await b.decode(e.keyRef), target) === 0) return e;
      return null;
    }
    let slot = 0;
    for (let i = 1; i < n.body.children.length; i++) {
      if (keyCompare(await b.decode(n.body.children[i].firstKeyRef), target) <= 0) slot = i; else break;
    }
    ref = n.body.children[slot].ref;
  }
}
export async function mapPut(b, root, key, entry) {
  const encoded = keyEncode(key), keyRef = await b.value(encoded);
  const value = { keyRef, valueRef: entry.valueRef, versionRef: entry.versionRef, deleted: entry.deleted === true };
  async function visit(ref, depth = 0) {
    need(depth <= 64, 'RESOURCE_LIMIT'); const node = b.get(ref); need(node.kind === 'map', 'INVALID_GRAPH'); const n = node.body;
    if (n.tag === 'leaf') {
      const entries = [...n.entries]; let at = 0;
      while (at < entries.length && keyCompare(await b.decode(entries[at].keyRef), encoded) < 0) at++;
      const same = at < entries.length && keyCompare(await b.decode(entries[at].keyRef), encoded) === 0;
      if (same && canonical(entries[at]) === canonical(value)) return [ref];
      entries.splice(at, same ? 1 : 0, value);
      return entries.length <= 64 ? [await leaf(b, entries)] : [await leaf(b, entries.slice(0, 32)), await leaf(b, entries.slice(32))];
    }
    let at = 0;
    for (let i = 1; i < n.children.length; i++) {
      if (keyCompare(await b.decode(n.children[i].firstKeyRef), encoded) <= 0) at = i; else break;
    }
    const children = [...n.children], replacements = await visit(children[at].ref, depth + 1);
    children.splice(at, 1, ...await Promise.all(replacements.map(r => summary(b, r))));
    return children.length <= 64 ? [await branch(b, children)] : [await branch(b, children.slice(0, 32)), await branch(b, children.slice(32))];
  }
  const refs = await visit(root); return refs.length === 1 ? refs[0] : branch(b, await Promise.all(refs.map(r => summary(b, r))));
}
export async function mapRows(b, root, includeDeleted = true) {
  const rows = [];
  async function walk(ref, depth = 0) {
    need(depth <= 64, 'RESOURCE_LIMIT'); const n = b.get(ref); need(n.kind === 'map', 'INVALID_GRAPH');
    if (n.body.tag === 'leaf') {
      for (const e of n.body.entries) if (includeDeleted || !e.deleted) rows.push({ ...e, key: keyDecode(await b.decode(e.keyRef)) });
    } else for (const c of n.body.children) await walk(c.ref, depth + 1);
  }
  await walk(root); return rows;
}
