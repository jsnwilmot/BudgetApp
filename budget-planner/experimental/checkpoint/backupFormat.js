// Pure synthetic FP-CJ-1/FP-TV-1 helpers. No application/storage imports.
export const LIMITS = Object.freeze({ bytes: 32 * 1024 * 1024, depth: 64, nodes: 200000,
  rows: 100000, edges: 1000000, string: 1048576, expanded: 128 * 1024 * 1024, visits: 2000000 });
export const CAPABILITIES = Object.freeze(['canonical-json-v1', 'closed-content-graph-v1', 'foreign-provenance-v1',
  'full-raw17-v1', 'inactive-state-only-v1', 'typed-values-v1']);
export const B1_CAPABILITIES = Object.freeze(['synthetic-repository-v1', 'raw-snapshot-v1', 'atomic-command-v1', 'inactive-draft-v1']);
export const RAW = Object.freeze(['appMetadata', 'appSettings', 'budgetTargets', 'categories', 'plannerEntries',
  'scheduledItems', 'accounts', 'manualAdjustments', 'savingsBuckets', 'savingsBucketAdjustments', 'transfers']);
export const SCHEMA = Object.freeze(Object.fromEntries([
  ...RAW.map(s => [s, s === 'plannerEntries' ? 'entryKey' : 'id']), ['financialControl', 'id'],
  ['recordRevisions', Object.freeze(['collection', 'key'])], ['checkpointDrafts', Object.freeze(['id', 'revision'])],
  ['checkpointDraftHeads', 'id'], ['financialAudit', 'id'], ['protectedSnapshots', 'id'],
]));
export const STORES = Object.freeze(Object.keys(SCHEMA).sort());
export const need = (condition, code = 'INVALID_FORMAT') => { if (!condition) throw { code }; };
export const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(v));
export const text = v => typeof v === 'string' && v.trim().length > 0;
export const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
export const own = (o, k) => Object.hasOwn(o, k);
export const put = (o, k, v) => Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
export function fields(o, names) {
  need(plain(o) && Object.keys(o).length === names.length && names.every(k => own(o, k)), 'INVALID_FIELDS');
}
export function freeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); }
  return v;
}
const codes = new Set(['INVALID_INPUT', 'SYNTHETIC_INPUT_REQUIRED', 'UNSUPPORTED_TYPE', 'RESOURCE_LIMIT', 'INVALID_UTF8',
  'INVALID_JSON', 'DUPLICATE_JSON_KEY', 'UNSAFE_NUMBER', 'INVALID_FIELDS', 'INVALID_FORMAT', 'INVALID_IDENTITY',
  'INVALID_KEY', 'INVALID_GRAPH', 'NODE_HASH_COLLISION', 'INTEGRITY_MISMATCH', 'UNSUPPORTED_CAPABILITY',
  'UNSUPPORTED_VERSION', 'ACTIVE_STATE', 'INVALID_HISTORY', 'INVALID_ALIAS', 'UNSUPPORTED_LEGACY', 'DIGEST_UNAVAILABLE']);
export const failure = e => freeze({ ok: false, diagnostics: [{ code: codes.has(e?.code) ? e.code : 'INVALID_INPUT' }] });
export function budget() {
  return { visits: 0, expanded: 0, charge(bytes = 16) {
    this.visits++; this.expanded += bytes;
    need(this.visits <= LIMITS.visits && this.expanded <= LIMITS.expanded, 'RESOURCE_LIMIT');
  } };
}
// Copy descriptors, not property reads; no getters execute. Check expanded input
// work before encoding; this cannot bound any preceding repository getAll.
export function copy(v, b = budget(), seen = new Set(), depth = 0) {
  need(depth <= LIMITS.depth, 'RESOURCE_LIMIT');
  if (typeof v === 'string') { need(v.length <= LIMITS.string, 'RESOURCE_LIMIT'); b.charge(16 + 2 * v.length); return v; }
  b.charge();
  if (v === null || v === undefined || typeof v === 'boolean') return v;
  if (typeof v === 'number') { need(Number.isFinite(v), 'UNSAFE_NUMBER'); return v; }
  const arr = Array.isArray(v);
  need((plain(v) || (arr && Object.getPrototypeOf(v) === Array.prototype)) && !seen.has(v), 'UNSUPPORTED_TYPE');
  if (arr) need(v.length <= LIMITS.visits, 'RESOURCE_LIMIT');
  need(Object.getOwnPropertySymbols(v).length === 0, 'UNSUPPORTED_TYPE');
  const d = Object.getOwnPropertyDescriptors(v), keys = Object.keys(d);
  need(keys.every(k => 'value' in d[k] && (d[k].enumerable || (arr && k === 'length'))), 'UNSUPPORTED_TYPE');
  if (arr) need(keys.length === v.length + 1 && Object.keys(v).length === v.length, 'UNSUPPORTED_TYPE');
  seen.add(v); const out = arr ? [] : {};
  for (const k of keys) if (!(arr && k === 'length')) {
    need(k.length <= LIMITS.string, 'RESOURCE_LIMIT'); b.expanded += 16 + k.length * 2;
    need(b.expanded <= LIMITS.expanded, 'RESOURCE_LIMIT'); put(out, k, copy(d[k].value, b, seen, depth + 1));
  }
  seen.delete(v); return out;
}
export function quote(s) {
  let out = '"';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out += c === 34 ? '\\"' : c === 92 ? '\\\\' : c < 32 || c > 126 ? `\\u${c.toString(16).padStart(4, '0')}` : s[i];
  }
  return out + '"';
}
export function canonical(v) {
  if (v === null) return 'null';
  if (typeof v === 'string') return quote(v);
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') { need(Number.isSafeInteger(v) && v >= 0 && !Object.is(v, -0), 'UNSAFE_NUMBER'); return String(v); }
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  need(plain(v), 'UNSUPPORTED_TYPE');
  return `{${Object.keys(v).sort(cmp).map(k => `${quote(k)}:${canonical(v[k])}`).join(',')}}`;
}
export const equal = (a, b) => canonical(a) === canonical(b);
export async function sha(bytes) {
  need(globalThis.crypto?.subtle, 'DIGEST_UNAVAILABLE');
  const r = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(r)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export const hash = (domain, payload) => sha(new TextEncoder().encode(`${domain}\n${canonical(payload)}`));
export const DOMAIN = Object.freeze({ node: 'FinPath/FP-TV-1/node', keys: 'FinPath/FP-FULL-1/keys',
  collection: 'FinPath/FP-FULL-1/collection', snapshot: 'FinPath/FP-FULL-1/snapshot', envelope: 'FinPath/FP-FULL-1/envelope' });
export function bits(n) {
  const b = new ArrayBuffer(8); new DataView(b).setFloat64(0, n, false);
  return [...new Uint8Array(b)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export function fromBits(s) {
  need(typeof s === 'string' && /^[0-9a-f]{16}$/.test(s), 'INVALID_GRAPH');
  const n = new DataView(Uint8Array.from(s.match(/../g), v => parseInt(v, 16)).buffer).getFloat64(0, false);
  need(Number.isFinite(n), 'UNSAFE_NUMBER'); return n;
}
export function keyEncode(k) {
  need(typeof k === 'string' || (Array.isArray(k) && k.length > 0 && k.every(v => typeof v === 'string')), 'INVALID_KEY');
  return typeof k === 'string' ? ['s', k] : ['k', [...k]];
}
export function keyDecode(k) {
  need(Array.isArray(k) && k.length === 2 && ['s', 'k'].includes(k[0]), 'INVALID_KEY');
  const v = k[1]; need(k[0] === 's' ? typeof v === 'string' : Array.isArray(v) && v.length > 0 && v.every(x => typeof x === 'string'), 'INVALID_KEY');
  return v;
}
export function keyCompare(a, b) {
  const av = keyDecode(a), bv = keyDecode(b);
  if (typeof av !== typeof bv) return typeof av === 'string' ? -1 : 1;
  if (typeof av === 'string') return cmp(av, bv);
  for (let i = 0; i < Math.min(av.length, bv.length); i++) if (av[i] !== bv[i]) return cmp(av[i], bv[i]);
  return av.length - bv.length;
}
