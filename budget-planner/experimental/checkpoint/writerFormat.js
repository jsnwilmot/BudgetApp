// P1.1b1 ONLY. Frozen WRITER_FORMAT.md; no production/storage imports.
import { need, plain, fields, freeze, bits, fromBits, put } from './backupFormat.js';
export { need, plain, fields, freeze, bits, fromBits, put };
export const PROFILE = 'P1.1b-WRITER-MODEL-1', LAYOUT = 'fp-tv-chunk61440-cj1';
export const D = 'FinPath/P1.1b/', P = 'FinPath/P1/';
export const CAPS = Object.freeze(['command-transients-v1', 'logical-fp-map1-v1',
  'committed-sequence-v1', 'bounded-batch-pages-v1', 'append-inventory-v1']);
export const KINDS = Object.freeze(['chunk', 'value', 'map', 'version', 'origin', 'dataset',
  'data-root', 'journal', 'event', 'model-root']);
export const LIMITS = Object.freeze({ changes: 128, keyUnits: 32768, comparedUnits: 4194304,
  requestBytes: 4194304, stageBytes: 8388608, stagedRecords: 16384, dirtyMaps: 8192,
  refs: 768, depth: 64, oldLookups: 65536, visits: 1000000, workBytes: 67108864,
  durationMs: 2000, pageFrames: 128, pageBytes: 65504, chunkBytes: 61440,
  objects: 400000, retainedBytes: 268435456, commands: 10000, pins: 128 });
const errors = new Set(['INVALID_INPUT', 'INVALID_FIELDS', 'UNSUPPORTED_TYPE', 'UNSAFE_NUMBER',
  'RESOURCE_LIMIT', 'SYNTHETIC_INPUT_REQUIRED', 'INVALID_KEY', 'INVALID_IDENTITY', 'INVALID_HISTORY',
  'INVALID_ORIGIN', 'INVALID_DATASET', 'ACTIVE_STATE', 'UNSUPPORTED_CAPABILITY', 'UNSUPPORTED_VERSION',
  'INVALID_FORMAT', 'INVALID_GRAPH', 'INTEGRITY_MISMATCH', 'NODE_HASH_COLLISION', 'MISSING_OBJECT',
  'STALE_REVISION', 'OPERATION_CONFLICT', 'SOURCE_CONTEXT', 'INVALID_MODEL', 'INVALID_CANDIDATE',
  'UNRESOLVED_PIN', 'CANCELLED', 'INVALID_CLOCK', 'DIGEST_UNAVAILABLE', 'INVALID_PAGE',
  'LEGACY_INVENTORY_REQUIRES_ARCHIVE']);
export const isHash = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export const integer = v => Number.isSafeInteger(v) && v >= 0;
export function failure(e) {
  const d = e && typeof e === 'object' ? Object.getOwnPropertyDescriptor(e, 'code') : null;
  return freeze({ ok: false, diagnostics: [{ code: d && 'value' in d && errors.has(d.value) ? d.value : 'INVALID_INPUT' }] });
}
export function limits(input = {}) {
  need(plain(input), 'INVALID_INPUT'); const ds = Object.getOwnPropertyDescriptors(input), out = { ...LIMITS };
  need(Object.getOwnPropertySymbols(input).length === 0, 'UNSUPPORTED_TYPE');
  for (const [k, d] of Object.entries(ds)) {
    need('value' in d && d.enumerable, 'UNSUPPORTED_TYPE');
    need(Object.hasOwn(out, k) && Number.isSafeInteger(d.value) && d.value > 0 && d.value <= out[k], 'RESOURCE_LIMIT'); out[k] = d.value;
  }
  return freeze(out);
}
export function meter(l, runtime, bootstrap = false, audit = false) {
  need(plain(runtime), 'INVALID_INPUT'); const ds = Object.getOwnPropertyDescriptors(runtime);
  need(Object.keys(ds).length === 2 && ['now', 'cancelled'].every(k => ds[k] && 'value' in ds[k] && typeof ds[k].value === 'function'), 'UNSUPPORTED_TYPE');
  const now = ds.now.value, cancelled = ds.cancelled.value;
  const initial = now(); need(typeof initial === 'number' && Number.isFinite(initial) && initial >= 0, 'INVALID_CLOCK'); let last = initial;
  const bound = { ...l, ...(bootstrap ? { stageBytes: Math.min(l.stageBytes * 2, 16777216),
    workBytes: Math.min(l.workBytes * 2, 134217728), durationMs: Math.min(l.durationMs * 30, 60000) } : {}),
  ...(audit ? { visits: 4000000, oldLookups: 4000000, workBytes: 2147483648, durationMs: 60000 } : {}) };
  const stats = { visits: 0, workBytes: 0, copiedBytes: 0, encodedBytes: 0, hashCalls: 0, hashedBytes: 0,
    oldLookups: 0, logicalLookups: 0, indexVisits: 0, comparedUnits: 0, transientMaps: 0, finalizedMaps: 0, mapHashCalls: 0,
    stagedRecords: 0, indexAllocations: 0, indexBytes: 0, stageBytes: 0, peakStageBytes: 0 };
  const canonicalCache = new WeakMap(), quoted = new Map();
  function tick(bytes = 0, visits = 1) {
    stats.visits += visits; stats.workBytes += bytes;
    need(stats.visits <= bound.visits && stats.workBytes <= bound.workBytes, 'RESOURCE_LIMIT');
    const t = now(); need(typeof t === 'number' && Number.isFinite(t) && t >= last, 'INVALID_CLOCK'); last = t;
    need(t - initial <= bound.durationMs, 'RESOURCE_LIMIT');
    const c = cancelled(); need(typeof c === 'boolean', 'INVALID_INPUT'); need(!c, 'CANCELLED');
  }
  const reserve = n => { tick(0, 0); need(integer(n) && stats.stageBytes + n <= bound.stageBytes, 'RESOURCE_LIMIT');
    stats.stageBytes += n; stats.peakStageBytes = Math.max(stats.peakStageBytes, stats.stageBytes); };
  const release = n => { need(integer(n) && n <= stats.stageBytes, 'INVALID_INPUT'); stats.stageBytes -= n; };
  function copy(v, seen = new Set(), depth = 0) {
    tick(); need(depth <= bound.depth, 'RESOURCE_LIMIT');
    if (typeof v === 'string') { need(v.length <= 1048576, 'RESOURCE_LIMIT'); reserve(16 + v.length * 2); stats.copiedBytes += 16 + v.length * 2; return v; }
    reserve(16); stats.copiedBytes += 16;
    if (v == null || typeof v === 'boolean') return v;
    if (typeof v === 'number') { need(Number.isFinite(v), 'UNSAFE_NUMBER'); return v; }
    const arr = Array.isArray(v); need((plain(v) || arr && Object.getPrototypeOf(v) === Array.prototype) && !seen.has(v), 'UNSUPPORTED_TYPE');
    need(!Object.getOwnPropertySymbols(v).length, 'UNSUPPORTED_TYPE');
    if (arr) need(v.length <= bound.visits, 'RESOURCE_LIMIT');
    // Descriptor allocation is bounded by the remaining visit count before use;
    // arbitrary proxy traps are untrusted and their exceptions are sanitized.
    const keys = Reflect.ownKeys(v); tick(0, keys.length); reserve(keys.length * 16);
    const out = arr ? [] : {}; seen.add(v); let elements = 0;
    for (const k of keys) {
      need(typeof k === 'string', 'UNSUPPORTED_TYPE'); const d = Object.getOwnPropertyDescriptor(v, k);
      need(d && 'value' in d && (d.enumerable || arr && k === 'length'), 'UNSUPPORTED_TYPE');
      if (arr && k === 'length') continue;
      need(k.length <= 1048576, 'RESOURCE_LIMIT'); reserve(k.length * 2); stats.copiedBytes += k.length * 2;
      put(out, k, copy(d.value, seen, depth + 1)); elements++;
    }
    need(!arr || elements === v.length && Object.keys(out).length === v.length, 'UNSUPPORTED_TYPE'); seen.delete(v); return out;
  }
  function quote(v) {
    if (quoted.has(v)) { tick(0, 0); return quoted.get(v); }
    const scratch = 6 * v.length + 2; reserve(scratch);
    tick(v.length, 0); const parts = []; let len = 2, chunk = '';
    for (let i = 0; i < v.length; i++) {
      if (i % 1024 === 0) tick(0, 0); const c = v.charCodeAt(i);
      const s = c === 34 ? '\\"' : c === 92 ? '\\\\' : c < 32 || c > 126 ? `\\u${c.toString(16).padStart(4, '0')}` : v[i];
      len += s.length; need(len <= bound.workBytes - stats.workBytes, 'RESOURCE_LIMIT'); chunk += s;
      if (chunk.length >= 4096) { parts.push(chunk); chunk = ''; }
    }
    if (chunk) parts.push(chunk); tick(len, 0); const out = '"' + parts.join('') + '"'; release(scratch); reserve(len + 16); quoted.set(v, out); return out;
  }
  function canonical(v, depth = 0) {
    tick(); need(depth <= bound.depth + 8, 'RESOURCE_LIMIT'); if (v && typeof v === 'object' && canonicalCache.has(v)) return canonicalCache.get(v); let out;
    if (v === null) out = 'null';
    else if (typeof v === 'string') out = quote(v);
    else if (typeof v === 'boolean') out = String(v);
    else if (typeof v === 'number') { need(integer(v) && !Object.is(v, -0), 'UNSAFE_NUMBER'); out = String(v); }
    else if (Array.isArray(v)) {
      tick(0, v.length); const parts = v.map(x => canonical(x, depth + 1)), n = parts.reduce((n, s) => n + s.length + 1, 1);
      tick(n, 0); out = '[' + parts.join(',') + ']';
    } else {
      need(plain(v), 'UNSUPPORTED_TYPE'); const keys = Object.keys(v).sort(); tick(0, keys.length);
      const parts = keys.map(k => quote(k) + ':' + canonical(v[k], depth + 1));
      tick(parts.reduce((n, s) => n + s.length + 1, 1), 0); out = '{' + parts.join(',') + '}';
    }
    stats.encodedBytes += out.length; return out;
  }
  async function digest(domain, input) {
    tick(input.length + domain.length + 1, 0); stats.hashCalls++; stats.hashedBytes += input.length + domain.length + 1;
    need(globalThis.crypto?.subtle, 'DIGEST_UNAVAILABLE');
    const prefix = new TextEncoder().encode(domain + '\n'); const bytes = new Uint8Array(prefix.length + input.length);
    bytes.set(prefix); bytes.set(typeof input === 'string' ? new TextEncoder().encode(input) : input, prefix.length);
    const result = await globalThis.crypto.subtle.digest('SHA-256', bytes); tick(0, 0);
    return [...new Uint8Array(result)].map(n => n.toString(16).padStart(2, '0')).join('');
  }
  const hash = (domain, body) => digest(domain, canonical(body));
  function key(k) {
    tick(); const arr = Array.isArray(k); need(typeof k === 'string' || arr && k.length > 0, 'INVALID_KEY');
    let n = 0; for (const s of arr ? k : [k]) { tick(); need(typeof s === 'string', 'INVALID_KEY'); n += s.length; need(n <= bound.keyUnits, 'RESOURCE_LIMIT'); }
    return arr ? ['k', [...k]] : ['s', k];
  }
  function compare(a, b) {
    const av = a[1], bv = b[1]; tick(); if (a[0] !== b[0]) return a[0] === 's' ? -1 : 1;
    function str(x, y) {
      for (let i = 0; i < Math.min(x.length, y.length); i++) {
        need(++stats.comparedUnits <= bound.comparedUnits, 'RESOURCE_LIMIT'); if (i % 1024 === 0) tick();
        const d = x.charCodeAt(i) - y.charCodeAt(i); if (d) return d;
      } return x.length - y.length;
    }
    if (a[0] === 's') return str(av, bv);
    for (let i = 0; i < Math.min(av.length, bv.length); i++) { const c = str(av[i], bv[i]); if (c) return c; } return av.length - bv.length;
  }
  tick(); return { bound, stats, tick, reserve, release, copy, canonical, digest, hash, key, compare,
    remember(body, encoded) { need(Object.isFrozen(body), 'INVALID_INPUT'); canonicalCache.set(body, encoded); },
    report: () => freeze({ ...stats, elapsedMicros: Math.ceil((last - initial) * 1000) }) };
}
