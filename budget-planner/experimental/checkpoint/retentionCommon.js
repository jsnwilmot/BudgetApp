// P1.1a only: deterministic, bounded, effect-free comparison helpers.
import { canonical, copy, freeze, need, plain, fields, hash, DOMAIN, fromBits, keyCompare } from './backupFormat.js';
import { modelState, indexAt, indexDTO, indexDigest, get, validateRecord, refsOf, valueChildren } from './historyCore.js';
import { createMemoryPageSource } from './historyReader.js';
export { canonical, copy, freeze, need, plain, fields, hash, refsOf };
export const BASELINE = '7bd40fdb0dc23ec94fbc1a522260d0403b1f22ec';
export const D = 'FinPath/P1.1a/';
export const PROFILE = 'P1.1a-RETENTION-PLAN-1';
export const KINDS = Object.freeze(['chunk', 'value', 'map', 'version', 'origin', 'dataset', 'data-root', 'journal', 'event', 'model-root']);
export const CAPS = Object.freeze({ objects: 400000, bytes: 268435456, refs: 768, depth: 64, visits: 12000000,
  workBytes: 2147483648, pages: 10000, planBytes: 16777216, pageRows: 128, pageBytes: 262144,
  record: 65536, durationMs: 1200000, pins: 256 });
const codes = new Set(['INVALID_INPUT', 'INVALID_MODEL', 'UNSUPPORTED_TYPE', 'INVALID_FIELDS', 'RESOURCE_LIMIT',
  'SYNTHETIC_INPUT_REQUIRED', 'SOURCE_CONTEXT', 'UNRESOLVED_PIN', 'INVALID_GRAPH', 'INTEGRITY_MISMATCH',
  'MISSING_OBJECT', 'INVALID_PAGE', 'CANCELLED', 'DIGEST_UNAVAILABLE', 'INVALID_CLOCK', 'UNSUPPORTED_VERSION']);
export function failure(error) {
  const d = error && typeof error === 'object' ? Object.getOwnPropertyDescriptor(error, 'code') : null;
  return freeze({ ok: false, diagnostics: [{ code: d && 'value' in d && codes.has(d.value) ? d.value : 'INVALID_INPUT' }] });
}
export const isHash = v => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);
export const integer = v => Number.isSafeInteger(v) && v >= 0;
export function methods(value, names) {
  need(plain(value) && Object.getOwnPropertySymbols(value).length === 0, 'UNSUPPORTED_TYPE');
  const ds = Object.getOwnPropertyDescriptors(value);
  need(Object.keys(ds).length === names.length && names.every(k => ds[k] && 'value' in ds[k] && typeof ds[k].value === 'function'), 'UNSUPPORTED_TYPE');
  return Object.fromEntries(names.map(k => [k, ds[k].value]));
}
export function context(model, input, runtime) {
  const state = modelState(model), r = copy(input), allowed = ['synthetic', 'baselineSha', 'sourceRoot', 'sourceIndexRoot', 'pins', 'limits'];
  need(plain(r) && Object.keys(r).every(k => allowed.includes(k)) && allowed.slice(0, 5).every(k => Object.hasOwn(r, k)), 'INVALID_FIELDS');
  need(r.synthetic === true, 'SYNTHETIC_INPUT_REQUIRED');
  need(r.baselineSha === BASELINE && r.sourceRoot === model.root && r.sourceIndexRoot === model.indexRoot, 'SOURCE_CONTEXT');
  const limits = { ...CAPS };
  need(r.limits === undefined || plain(r.limits), 'INVALID_FIELDS');
  for (const [k, v] of Object.entries(r.limits ?? {})) {
    need(Object.hasOwn(limits, k) && Number.isSafeInteger(v) && v > 0 && v <= limits[k], 'RESOURCE_LIMIT'); limits[k] = v;
  }
  need(state.stats.objects <= limits.objects && state.stats.retainedBytes <= limits.bytes, 'RESOURCE_LIMIT');
  need(Array.isArray(r.pins) && r.pins.length <= limits.pins, 'RESOURCE_LIMIT');
  const pins = [], seen = new Set(); let full = false;
  for (const pin of r.pins) {
    fields(pin, ['kind', 'id']); need(isHash(pin.id), 'UNRESOLVED_PIN');
    if (pin.kind === 'full-inventory') { need(pin.id === model.indexRoot, 'UNRESOLVED_PIN'); full = true; }
    else { need(pin.kind === 'object', 'UNRESOLVED_PIN'); try { get(state.pool, pin.id); } catch { need(false, 'UNRESOLVED_PIN'); } }
    const key = canonical(pin); need(!seen.has(key), 'UNRESOLVED_PIN'); seen.add(key); pins.push(pin);
  }
  pins.sort((a, b) => canonical(a) < canonical(b) ? -1 : 1);
  const rt = methods(runtime, ['now', 'cancelled']); let last = rt.now();
  need(typeof last === 'number' && Number.isFinite(last) && last >= 0, 'INVALID_CLOCK'); const started = last;
  const work = { visits: 0, workBytes: 0, sourcePages: 0, indexNodes: 0, records: 0, refs: 0, manifestPages: 0 };
  const tick = (bytes = 0, visits = 1) => {
    work.visits += visits; work.workBytes += bytes;
    need(work.visits <= limits.visits && work.workBytes <= limits.workBytes, 'RESOURCE_LIMIT');
    const now = rt.now(); need(typeof now === 'number' && Number.isFinite(now) && now >= last, 'INVALID_CLOCK'); last = now;
    need(now - started <= limits.durationMs, 'RESOURCE_LIMIT');
    const cancelled = rt.cancelled(); need(typeof cancelled === 'boolean', 'INVALID_INPUT'); need(!cancelled, 'CANCELLED');
  };
  tick();
  const binding = { sha: BASELINE, instanceId: state.instanceId, generation: state.generation, modelRoot: model.root, indexRoot: model.indexRoot };
  return { state, limits, pins: freeze(pins), full, binding, work, tick,
    report: () => freeze({ ...work, elapsedMicros: Math.ceil((last - started) * 1000),
      p1CumulativeIndexAllocations: state.stats.indexAllocations, currentReachableIndexNodes: work.indexNodes,
      pinnedOlderIndexHeap: 'UNKNOWN', writerIndexNativeCost: 'UNKNOWN' }) };
}
export function createRetentionSource(model) { return createMemoryPageSource(model); }
export const emptyDescriptor = () => ({ tip: null, pages: 0, rows: 0, bytes: 0 });
export function verificationRecord(planId, source, manifests, candidate) {
  return freeze({ profile: 'P1.1a-VERIFICATION-1', modelOnly: true, experimentOnly: true,
    status: 'VERIFIED_COUNTERFACTUAL', method: 'reverse-ordinal-v1', planId,
    sourceInventoryDigest: source.inventoryDigest, rootsTip: manifests.roots.tip,
    excludedTip: manifests.excluded.tip, pinsTip: manifests.pins.tip,
    keptCount: candidate.keptCount, keptBytes: candidate.keptBytes });
}
export async function appendPage(descriptor, kind, rows, c, emit) {
  if (!rows.length) return;
  const body = { kind, index: descriptor.pages, previous: descriptor.tip, rows }, id = await hash(D + 'page/1', body);
  const page = freeze({ id, body }), bytes = canonical(page).length; c.tick(bytes);
  need(rows.length <= c.limits.pageRows && bytes <= c.limits.record && bytes <= c.limits.pageBytes, 'RESOURCE_LIMIT');
  need(++c.work.manifestPages <= c.limits.pages, 'RESOURCE_LIMIT');
  descriptor.tip = id; descriptor.pages++; descriptor.rows += rows.length; descriptor.bytes += bytes;
  if (emit) emit(page);
}
export function addCount(census, record) {
  census.objects++; census.bytes += record.payloadBytes;
  const cell = census.byKind[record.kind] ??= { count: 0, bytes: 0 }; cell.count++; cell.bytes += record.payloadBytes;
}
export function strictRefs(record, c) {
  const b = record.body; need(KINDS.includes(record.kind) && plain(b), 'INVALID_GRAPH');
  const keys = {
    chunk: ['data'], value: ['logicalBytes', 'chunks', 'children'],
    'data-root': ['originsRoot', 'datasetsRoot'], 'model-root': ['instanceId', 'generation', 'revision', 'dataRoot', 'operationsRoot', 'journal'],
    journal: ['previous', 'beforeModelRoot', 'afterDataRoot', 'operationId', 'requestDigest', 'revision', 'kind'],
    origin: ['originId', 'sourceProfile', 'databaseName', 'envelopeRef', 'inventory', 'snapshotDigest', 'contentDigest', 'transportDigest', 'transportBytesRetained'],
    dataset: ['datasetId', 'originId', 'originRef', 'collections'],
  };
  if (keys[record.kind]) fields(b, keys[record.kind]);
  if (record.kind === 'map') {
    need(['leaf', 'branch'].includes(b.tag), 'INVALID_GRAPH');
    fields(b, b.tag === 'leaf' ? ['tag', 'entries', 'total', 'live'] : ['tag', 'children', 'total', 'live']);
    need(integer(b.total) && integer(b.live) && b.live <= b.total, 'INVALID_GRAPH');
    const rows = b.tag === 'leaf' ? b.entries : b.children;
    need(Array.isArray(rows) && rows.length <= 64 && (b.tag === 'leaf' || rows.length >= 2), 'INVALID_GRAPH');
    for (const row of rows) { fields(row, b.tag === 'leaf' ? ['keyRef', 'valueRef', 'versionRef', 'deleted'] : ['ref', 'firstKeyRef', 'total', 'live']);
      if (b.tag === 'leaf') need(typeof row.deleted === 'boolean' && (row.valueRef === null || isHash(row.valueRef)), 'INVALID_GRAPH');
      else need(integer(row.total) && integer(row.live) && row.live <= row.total, 'INVALID_GRAPH'); }
  }
  if (record.kind === 'version') {
    fields(b, ['datasetId', 'store', 'keyRef', 'valueRef', 'deleted', 'previous', 'sourceVersionRef', 'localRevision', ...(Object.hasOwn(b, 'originId') ? ['originId'] : [])]);
    need(typeof b.deleted === 'boolean' && (b.valueRef === null || isHash(b.valueRef)), 'INVALID_GRAPH');
  }
  if (record.kind === 'event') {
    need(Object.keys(b).every(k => ['operationId', 'requestDigest', 'journal', 'afterDataRoot', 'revision', 'status', 'originId', 'originRef', 'datasetId'].includes(k)), 'INVALID_GRAPH');
    for (const k of ['operationId', 'requestDigest', 'journal', 'afterDataRoot', 'revision', 'status']) need(Object.hasOwn(b, k), 'INVALID_GRAPH');
    need(b.status === 'MODEL_ONLY', 'INVALID_GRAPH');
  }
  if (record.kind === 'chunk') need(typeof b.data === 'string' && b.data.length <= 61440 && /^[\u0020-\u007e]*$/.test(b.data), 'RESOURCE_LIMIT');
  if (record.kind === 'value') need(integer(b.logicalBytes) && b.logicalBytes > 0 && b.logicalBytes <= 33554432 && Array.isArray(b.chunks) && b.chunks.length > 0 && Array.isArray(b.children), 'INVALID_GRAPH');
  if (record.kind === 'origin') {
    need(Array.isArray(b.inventory) && b.inventory.length === 17 && b.transportBytesRetained === false, 'INVALID_GRAPH');
    for (const row of b.inventory) { fields(row, ['store', 'keyPath', 'root', 'count']); need(integer(row.count), 'INVALID_GRAPH'); }
  }
  if (record.kind === 'dataset') {
    need(Array.isArray(b.collections) && b.collections.length === 13, 'INVALID_GRAPH'); for (const row of b.collections) fields(row, ['store', 'root']);
  }
  const refs = refsOf(record.kind, b); need(refs.length <= c.limits.refs && refs.every(isHash), 'RESOURCE_LIMIT');
  c.work.refs += refs.length; c.tick(refs.length * 64, refs.length); return refs;
}
// Complete source scan, independent of any proposed smaller inventory.
export async function scanEvidence(c, source) {
  const io = methods(source, ['readIndex', 'readRecord']), records = new Map(), ordinals = new Set();
  const census = { objects: 0, bytes: 0, byKind: {} }, inventory = emptyDescriptor(), stack = [{ path: '', digest: c.binding.indexRoot }];
  let rows = [], groupRows = 0, groupBytes = 0, lastId = '';
  while (stack.length) {
    c.tick(); const next = stack.pop(); need(next.path.length <= c.limits.depth, 'RESOURCE_LIMIT');
    const raw = await io.readIndex({ instanceId: c.binding.instanceId, root: c.binding.indexRoot, scope: 'all-retained', path: next.path });
    const d = copy(raw); c.tick(canonical(d).length); c.work.indexNodes++;
    const expected = indexDTO(indexAt(c.state.pool, next.path));
    need(d && canonical(d) === canonical(expected) && await indexDigest(d) === next.digest, 'INTEGRITY_MISMATCH');
    if (d.tag === 'branch') {
      need(next.path.length < 64, 'INVALID_GRAPH');
      for (let i = 15; i >= 0; i--) if (d.children[i]) stack.push({ path: next.path + i.toString(16), digest: d.children[i] });
      continue;
    }
    need(d.tag === 'leaf' && isHash(d.id) && d.id > lastId && d.id.startsWith(next.path), 'INVALID_PAGE'); lastId = d.id;
    const value = await io.readRecord({ instanceId: c.binding.instanceId, root: c.binding.indexRoot, scope: 'all-retained', id: d.id });
    // Descriptor-safe copy and full hash/cost validation, not trust in a source callback.
    const r = await validateRecord(value), bytes = canonical(r).length; c.tick(bytes);
    need(canonical(r) === canonical(get(c.state.pool, d.id)) && r.recordDigest === d.recordDigest && r.ordinal === d.ordinal, 'INTEGRITY_MISMATCH');
    need(!records.has(r.id) && !ordinals.has(r.ordinal), 'INVALID_GRAPH');
    need(r.ordinal <= c.limits.objects && r.payloadBytes <= c.limits.record, 'RESOURCE_LIMIT');
    need(r.payloadBytes <= c.limits.pageBytes, 'RESOURCE_LIMIT');
    if (groupRows === c.limits.pageRows || groupBytes + r.payloadBytes > c.limits.pageBytes) { groupRows = 0; groupBytes = 0; }
    if (!groupRows) need(++c.work.sourcePages <= c.limits.pages, 'RESOURCE_LIMIT'); groupRows++; groupBytes += r.payloadBytes;
    strictRefs(r, c); records.set(r.id, freeze(r)); ordinals.add(r.ordinal); addCount(census, r); c.work.records++;
    need(census.objects <= c.limits.objects && census.bytes <= c.limits.bytes, 'RESOURCE_LIMIT');
    rows.push([r.id, r.kind, r.ordinal, r.payloadBytes, r.recordDigest]);
    if (rows.length === c.limits.pageRows) { await appendPage(inventory, 'inventory', rows, c); rows = []; }
  }
  await appendPage(inventory, 'inventory', rows, c);
  need(census.objects === c.state.stats.objects && census.bytes === c.state.stats.retainedBytes, 'INTEGRITY_MISMATCH');
  for (const [kind, cell] of Object.entries(census.byKind)) need(cell.count === c.state.stats.kinds[kind] && cell.bytes === c.state.stats.kindBytes[kind], 'INTEGRITY_MISMATCH');
  const ordered = [...records.values()].sort((a, b) => a.ordinal - b.ordinal);
  for (let i = 0; i < ordered.length; i++) {
    const r = ordered[i]; need(r.ordinal === i + 1, 'INVALID_GRAPH');
    for (const id of refsOf(r.kind, r.body)) { c.tick(); const child = records.get(id); need(child && child.ordinal < r.ordinal, 'INVALID_GRAPH'); }
  }
  await validateValuesAndMaps(ordered, records, c);
  const inventoryDigest = await hash(D + 'inventory/1', { binding: c.binding, census, manifest: inventory });
  return { records, ordered, census: freeze(census), inventoryDigest };
}
async function validateValuesAndMaps(ordered, records, c) {
  const nodes = new Map(), values = new Map(), maps = new Map(), decoded = new Map();
  function key(id) {
    if (decoded.has(id)) return decoded.get(id); c.tick(); const n = nodes.get(id); need(n, 'INVALID_GRAPH');
    let v;
    if (n[0] === 's') v = n[1];
    else if (n[0] === 'arr-leaf') v = n[1].map(key);
    else if (n[0] === 'arr-branch') v = n[2].flatMap(key);
    else need(false, 'INVALID_GRAPH');
    decoded.set(id, v); return v;
  }
  for (const r of ordered) {
    c.tick(); const b = r.body;
    if (r.kind === 'value') {
      let bytes = '';
      for (const id of b.chunks) { const chunk = records.get(id); need(chunk?.kind === 'chunk', 'INVALID_GRAPH'); bytes += chunk.body.data; need(bytes.length <= b.logicalBytes, 'INVALID_GRAPH'); }
      need(bytes.length === b.logicalBytes, 'INTEGRITY_MISMATCH'); c.tick(bytes.length);
      const n = JSON.parse(bytes); need(Array.isArray(n) && canonical(n) === bytes, 'INVALID_GRAPH');
      need(await hash(DOMAIN.node, n) === r.id && canonical(valueChildren(n)) === canonical(b.children), 'INTEGRITY_MISMATCH');
      const tag = n[0]; let own = 16;
      if (tag === 'n' || tag === 'u') need(n.length === 1, 'INVALID_GRAPH');
      else if (tag === 'b') need(n.length === 2 && typeof n[1] === 'boolean', 'INVALID_GRAPH');
      else if (tag === 's') { need(n.length === 2 && typeof n[1] === 'string' && n[1].length <= 1048576, 'INVALID_GRAPH'); own += n[1].length * 2; }
      else if (tag === 'f64') { need(n.length === 2, 'INVALID_GRAPH'); fromBits(n[1]); }
      else if (tag === 'obj') {
        need(n.length === 3 && Array.isArray(n[1]) && Array.isArray(n[2]) && n[1].length === n[2].length && new Set(n[1]).size === n[1].length, 'INVALID_GRAPH');
        const names = [...n[1]].sort(); need(n[1].every(k => typeof k === 'string') && n[2].every((p, i) => Array.isArray(p) && p.length === 2 && p[0] === names[i]), 'INVALID_GRAPH');
        own = 32 + n[1].reduce((s, k) => s + 16 + k.length * 2, 0);
      } else if (tag === 'arr-leaf') { need(n.length === 2 && Array.isArray(n[1]) && n[1].length <= 64, 'INVALID_GRAPH'); own = 32 + n[1].length * 8; }
      else if (tag === 'arr-branch') { need(n.length === 3 && integer(n[1]) && n[1] > 64 && Array.isArray(n[2]) && n[2].length >= 2 && n[2].length <= 64, 'INVALID_GRAPH'); own = 32; }
      else need(false, 'INVALID_GRAPH');
      let height = 0, expanded = own;
      for (const id of b.children) { const child = values.get(id); need(child, 'INVALID_GRAPH'); height = Math.max(height, child.height + 1); expanded += child.expanded; }
      need(height <= c.limits.depth && expanded <= 134217728, 'RESOURCE_LIMIT'); nodes.set(r.id, n); values.set(r.id, { height, expanded });
    }
    if (r.kind === 'map') {
      let first = null, last = null, total = 0, live = 0, height = 0;
      if (b.tag === 'leaf') {
        for (const e of b.entries) { const k = key(e.keyRef); if (last !== null) need(keyCompare(last, k) < 0, 'INVALID_GRAPH'); first ??= k; last = k; total++; if (!e.deleted) live++; }
      } else for (const e of b.children) {
        const child = maps.get(e.ref); need(child && child.first !== null && keyCompare(key(e.firstKeyRef), child.first) === 0 && child.total === e.total && child.live === e.live, 'INVALID_GRAPH');
        if (last !== null) need(keyCompare(last, child.first) < 0, 'INVALID_GRAPH'); first ??= child.first; last = child.last; total += child.total; live += child.live; height = Math.max(height, child.height + 1);
      }
      need(total === b.total && live === b.live && height <= c.limits.depth, 'INVALID_GRAPH'); maps.set(r.id, { first, last, total, live, height });
    }
  }
}
