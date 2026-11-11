// P1 in-memory paging proof only; no native I/O or transaction behavior.
import { modelState, indexAt, indexDTO, indexDigest, validateRecord, refsOf, get,
  copy, freeze, need, fields, plain, canonical, bad, MODEL_LIMITS, P1 } from './historyCore.js';
import { hash } from './backupFormat.js';

const readers = new WeakMap();
function readerState(handle) { const s = readers.get(handle); need(s, 'INVALID_CONTINUATION'); return s; }
async function handle(s) {
  const continuation = freeze({ instanceId: s.model.instanceId, root: s.model.pool.digest, scope: s.scope,
    digest: await hash(P1 + 'continuation/1', { stack: s.stack, emitted: s.emitted, bytes: s.bytes,
      visits: s.visits, cancelled: s.cancelled, instanceId: s.model.instanceId, root: s.model.pool.digest, scope: s.scope }) });
  const reader = freeze({ modelOnly: true, root: s.model.pool.digest, scope: s.scope,
    emitted: s.emitted, bytes: s.bytes, visits: s.visits, cancelled: s.cancelled });
  readers.set(reader, Object.freeze({ ...s, continuation, stack: freeze(s.stack) }));
  return { reader, continuation };
}
function context(s, r) {
  fields(r, ['instanceId', 'root', 'scope', 'path']);
  need(r.instanceId === s.instanceId && r.root === s.pool.digest && r.scope === 'all-retained', 'SOURCE_CONTEXT');
  need(typeof r.path === 'string' && /^[0-9a-f]{0,64}$/.test(r.path), 'INVALID_PAGE');
}
export function createMemoryPageSource(model) {
  try {
    const s = modelState(model);
    return freeze({ ok: true, source: {
      readIndex: async request => { const r = copy(request); context(s, r); return freeze(indexDTO(indexAt(s.pool, r.path))); },
      readRecord: async request => {
        const r = copy(request); fields(r, ['instanceId', 'root', 'scope', 'id']);
        need(r.instanceId === s.instanceId && r.root === s.pool.digest && r.scope === 'all-retained', 'SOURCE_CONTEXT');
        return get(s.pool, r.id);
      },
    } });
  } catch (e) { return bad(e); }
}
export async function beginPinnedRead(model, input = { scope: 'all-retained' }) {
  try {
    const s = modelState(model), r = copy(input);
    need(Object.keys(r).every(k => ['scope', 'budgets'].includes(k)), 'INVALID_FIELDS');
    need(r.scope === 'all-retained', 'UNSUPPORTED_SCOPE');
    need(r.budgets === undefined || plain(r.budgets), 'INVALID_FIELDS');
    const defaults = { pageRows: MODEL_LIMITS.pageRows, pageBytes: MODEL_LIMITS.pageBytes,
      totalBytes: s.limits.retainedBytes, visits: s.limits.visits };
    for (const [k, v] of Object.entries(r.budgets ?? {})) {
      need(Object.hasOwn(defaults, k) && Number.isSafeInteger(v) && v > 0 && v <= defaults[k], 'RESOURCE_LIMIT'); defaults[k] = v;
    }
    need(s.stats.retainedBytes <= defaults.totalBytes, 'RESOURCE_LIMIT');
    return freeze({ ok: true, ...await handle({ model: s, scope: r.scope, budgets: freeze(defaults),
      stack: [{ path: '', digest: s.pool.digest }], emitted: 0, bytes: 0, visits: 0, cancelled: false }) });
  } catch (e) { return bad(e); }
}
export async function readHistoryPage(reader, tokenInput, source) {
  try {
    const s = readerState(reader); need(!s.cancelled, 'CANCELLED');
    const token = copy(tokenInput); need(canonical(token) === canonical(s.continuation), 'INVALID_CONTINUATION');
    // Accessor methods are rejected without execution. The injected callable
    // itself is trusted to be in-memory, not sandboxed.
    const desc = Object.getOwnPropertyDescriptors(source ?? {});
    need(Object.getOwnPropertySymbols(source ?? {}).length === 0 && Object.keys(desc).length === 2 &&
      ['readIndex', 'readRecord'].every(k => desc[k] && 'value' in desc[k] && typeof desc[k].value === 'function'), 'INVALID_PAGE');
    const next = { ...s, stack: [...s.stack] }, page = []; let pageBytes = 0;
    while (next.stack.length && page.length < next.budgets.pageRows) {
      const work = next.stack.at(-1);
      need(++next.visits <= next.budgets.visits, 'RESOURCE_LIMIT');
      const d = copy(await desc.readIndex.value({ instanceId: s.model.instanceId, root: s.model.pool.digest, scope: s.scope, path: work.path }));
      need(d && canonical(d) === canonical(indexDTO(indexAt(s.model.pool, work.path))) && await indexDigest(d) === work.digest, 'INTEGRITY_MISMATCH');
      if (d.tag === 'branch') {
        need(work.path.length < 64, 'INVALID_GRAPH'); next.stack.pop();
        for (let i = 15; i >= 0; i--) if (d.children[i]) next.stack.push({ path: work.path + i.toString(16), digest: d.children[i] });
        continue;
      }
      need(d.tag === 'leaf' && d.id.startsWith(work.path), 'INVALID_PAGE');
      const raw = await desc.readRecord.value({ instanceId: s.model.instanceId, root: s.model.pool.digest, scope: s.scope, id: d.id });
      const entry = await validateRecord(raw), expected = get(s.model.pool, d.id);
      need(canonical(entry) === canonical(expected) && entry.ordinal === d.ordinal && entry.recordDigest === d.recordDigest, 'INTEGRITY_MISMATCH');
      need(entry.payloadBytes <= next.budgets.pageBytes, 'RESOURCE_LIMIT');
      if (pageBytes + entry.payloadBytes > next.budgets.pageBytes) break; // Bounded leaf retained for next call.
      const refs = refsOf(entry.kind, entry.body);
      for (const ref of refs) { need(++next.visits <= next.budgets.visits, 'RESOURCE_LIMIT'); need(get(s.model.pool, ref).ordinal < entry.ordinal, 'INVALID_GRAPH'); }
      next.stack.pop(); page.push(entry); pageBytes += entry.payloadBytes;
      next.emitted++; next.bytes += entry.payloadBytes;
      need(next.bytes <= next.budgets.totalBytes, 'RESOURCE_LIMIT');
    }
    return freeze({ ok: true, ...await handle(next), page, payloadBytes: pageBytes, status: 'PAGE', exhausted: next.stack.length === 0 });
  } catch (e) { return bad(e); }
}
export function finishHistoryRead(reader) {
  try {
    const s = readerState(reader); need(!s.cancelled, 'CANCELLED');
    need(s.stack.length === 0 && s.emitted === s.model.stats.objects && s.bytes === s.model.stats.retainedBytes, 'INCOMPLETE_READ');
    return freeze({ ok: true, status: 'COMPLETE_MODEL_INVENTORY', modelOnly: true, root: s.model.pool.digest,
      objects: s.emitted, payloadBytes: s.bytes, visits: s.visits, scope: s.scope });
  } catch (e) { return bad(e); }
}
export async function cancelHistoryRead(reader) {
  try { const s = readerState(reader); return freeze({ ok: true, ...await handle({ ...s, cancelled: true }) }); }
  catch (e) { return bad(e); }
}
