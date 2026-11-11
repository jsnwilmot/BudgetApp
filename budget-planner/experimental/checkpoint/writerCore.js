// Command-local logical interning, physical materialization and private index.
import { need, freeze, P, D, PROFILE, LAYOUT, CAPS } from './writerFormat.js';
import { graphBuilder, childrenOf, materializer } from './writerValue.js';
import { lookup, indexBuilder } from './writerIndex.js';
import { refs, encodePage } from './writerWire.js';
import { mapEditor } from './writerMap.js';

export function logicalBuilder(base, m) {
  const staged = new Map(), encodings = new Map(), graph = graphBuilder(m), pins = [];
  const stageStart = m.stats.stageBytes;
  function maybe(id) { m.tick(); if (staged.has(id)) return staged.get(id);
    need(++m.stats.oldLookups <= m.bound.oldLookups, 'RESOURCE_LIMIT'); const r = lookup(base.pool, id, m);
    need(!r || !r.physicalType, 'INVALID_GRAPH'); return r;
  }
  const get = id => { const r = maybe(id); need(r, 'MISSING_OBJECT'); return r; };
  async function intern(kind, body, forced) {
    const encoded = kind === 'chunk' ? body.data : m.canonical(body), key = kind + ':' + encoded;
    if (encodings.has(key)) return encodings.get(key);
    if (kind === 'map') m.stats.mapHashCalls++;
    const id = forced ?? await m.digest(P + kind + '/1', encoded), old = maybe(id);
    if (old) { need(old.kind === kind && (kind === 'chunk' ? old.body.data : m.canonical(old.body)) === encoded, 'NODE_HASH_COLLISION'); encodings.set(key, id); return id; }
    const r = { id, kind, body: freeze(body), bodyBytes: encoded.length };
    if (kind !== 'chunk') m.remember(r.body, encoded);
    r.edges = refs(r, m); need(++m.stats.stagedRecords <= m.bound.stagedRecords, 'RESOURCE_LIMIT');
    m.reserve(encoded.length + 38); if (kind === 'map') m.stats.finalizedMaps++;
    staged.set(id, r); encodings.set(key, id); return id;
  }
  async function value(input) {
    const root = await graph.value(input);
    async function ensure(id, depth = 0) {
      m.tick(); need(depth <= m.bound.depth, 'RESOURCE_LIMIT'); const old = maybe(id);
      if (old) { need(old.kind === 'value', 'INVALID_GRAPH'); return id; }
      const node = graph.nodes.get(id); need(node, 'INVALID_GRAPH'); const children = childrenOf(node), text = m.canonical(node);
      need(children.length + Math.ceil(text.length / 61440) <= m.bound.refs, 'RESOURCE_LIMIT');
      for (const child of children) await ensure(child, depth + 1);
      const chunks = []; for (let offset = 0; offset < text.length; offset += 61440) {
        const data = text.slice(offset, offset + 61440); need(data.length <= m.bound.chunkBytes, 'RESOURCE_LIMIT');
        chunks.push(await intern('chunk', { data }, await m.digest(P + 'chunk/1', data)));
      }
      await intern('value', { logicalBytes: text.length, chunks, children }, id); return id;
    }
    return ensure(root);
  }
  const b = { staged, pins, get, maybe, intern, value, fingerprint: graph.value,
    decode: materializer(get, m), hash: m.hash, cleanup: () => m.release(m.stats.stageBytes - stageStart) };
  b.maps = mapEditor(b, m); return b;
}

export async function materialize(base, b, logical, binding, m) {
  const ordered = [], visited = new Set(), visiting = new Set();
  const roots = [...b.staged.values()].filter(r => r.kind !== 'map').map(r => r.id).concat(b.pins.filter(p => p.kind === 'object').map(p => p.id));
  // Explicit iterative postorder. Old references stop at the trusted base.
  for (const root of roots) {
    const queue = [{ id: root, done: false }];
    while (queue.length) {
      m.tick(); const step = queue.pop(); if (visited.has(step.id) || !b.staged.has(step.id)) continue;
      if (step.done) { visiting.delete(step.id); visited.add(step.id); ordered.push(b.staged.get(step.id)); continue; }
      need(!visiting.has(step.id), 'INVALID_GRAPH'); visiting.add(step.id); queue.push({ id: step.id, done: true });
      const edges = b.staged.get(step.id).edges;
      for (let i = edges.length - 1; i >= 0; i--) queue.push({ id: edges[i], done: false });
    }
  }
  need(ordered.length <= m.bound.stagedRecords, 'RESOURCE_LIMIT');
  const pages = [], records = []; let group = [], bytes = 24, seq = base.sequence;
  async function flush() {
    if (!group.length) return; const page = await encodePage(group, seq + 1, m); const first = seq + 1;
    for (let slot = 0; slot < group.length; slot++) records.push(Object.freeze({ ...group[slot], sequence: ++seq,
      locator: freeze({ page: page.id, slot, sequence: seq }) }));
    pages.push({ id: page.id, bytes: page.bytes, first, frames: group.length }); group = []; bytes = 24;
  }
  for (const r of ordered) { m.tick(); if (group.length >= m.bound.pageFrames || bytes + 38 + r.bodyBytes > m.bound.pageBytes) await flush();
    need(24 + 38 + r.bodyBytes <= m.bound.pageBytes, 'RESOURCE_LIMIT'); group.push(r); bytes += 38 + r.bodyBytes; }
  await flush();
  const index = indexBuilder(base.pool, m), metadata = [], counts = { ...base.counts }, kindBytes = { ...base.kindBytes };
  for (const r of records) { index.put(r.id, r); counts[r.kind] = (counts[r.kind] ?? 0) + 1;
    kindBytes[r.kind] = (kindBytes[r.kind] ?? 0) + 38 + r.bodyBytes; }
  let addedBytes = 0;
  for (const page of pages) { addedBytes += page.bytes.length + 32;
    index.put(page.id, Object.freeze({ physicalType: 'page', ...page, revision: binding.revision })); }
  async function meta(type, domain, body) {
    const text = m.canonical(body); need(text.length + 32 <= 65536, 'RESOURCE_LIMIT');
    const id = await m.digest(D + domain + '/1', text), record = freeze({ physicalType: type, id, body, revision: binding.revision });
    m.reserve(text.length + 32); metadata.push(record); addedBytes += text.length + 32; index.put(id, record); return id;
  }
  let inventoryRoot = base.inventoryRoot;
  for (let offset = 0; offset < pages.length || offset === 0; offset += 128) {
    const batch = pages.slice(offset, offset + 128);
    inventoryRoot = await meta('delta', 'inventory-delta', { profile: 'FP-WRITER-INVENTORY-1', physicalInstance: binding.physicalInstance,
      generation: binding.generation, revision: binding.revision, previous: inventoryRoot,
      firstSequence: batch[0]?.first ?? base.sequence + 1, objects: batch.reduce((n, p) => n + p.frames, 0),
      pages: batch.map(p => [p.id, p.bytes.length, p.frames]), logicalRoot: logical.root });
  }
  let pinRoot = base.pinRoot;
  if (b.pins.length) pinRoot = await meta('pins', 'pins', { profile: 'FP-WRITER-PINS-1', physicalInstance: binding.physicalInstance,
    generation: binding.generation, revision: binding.revision, previous: pinRoot, pins: b.pins });
  const seal = { profile: 'FP-WRITER-SEAL-1', physicalInstance: binding.physicalInstance, generation: binding.generation,
    revision: binding.revision, baseState: base.stateRoot, logicalRoot: logical.root, inventoryRoot, previous: base.sealRoot,
    operationId: binding.operationId, semanticDigest: binding.semanticDigest, requestFingerprint: binding.requestFingerprint,
    pinRoot, effects: { versions: records.filter(r => r.kind === 'version').length, newObjects: records.length } };
  const sealRoot = await meta('seal', 'command-seal', seal);
  const state = { profile: PROFILE, capabilities: [...CAPS], layout: LAYOUT, physicalInstance: binding.physicalInstance,
    generation: binding.generation, revision: binding.revision, logicalRoot: logical.root, dataRoot: logical.dataRoot,
    inventoryRoot, sealRoot, pinRoot, sequence: seq, objects: base.objects + records.length + metadata.length + 1, payloadBytes: 0 };
  for (let i = 0; i < 16; i++) {
    const cost = base.payloadBytes + addedBytes + m.canonical(state).length + 32;
    if (cost === state.payloadBytes) break; state.payloadBytes = cost; need(i < 15, 'RESOURCE_LIMIT');
  }
  need(state.objects + base.pageCount + pages.length <= m.bound.objects && state.payloadBytes <= m.bound.retainedBytes, 'RESOURCE_LIMIT');
  const stateRoot = await meta('state', 'state', state), built = index.finish();
  let replayPool = base.replayPool, replayAdded = 0, replayAllocations = 0;
  if (binding.operationId !== null) {
    const replay = indexBuilder(replayPool, m); replay.put(binding.semanticDigest, freeze({ id: binding.semanticDigest,
      operationId: binding.operationId, semanticDigest: binding.semanticDigest, requestFingerprint: binding.requestFingerprint, sealRoot,
      lookupBytes: 160 + binding.operationId.length * 2 }));
    const completed = replay.finish(); replayPool = completed.root; replayAdded = completed.bytes; replayAllocations = completed.allocated;
  }
  return { ...base, ...logical, ...binding, pool: built.root, replayPool, state: freeze(state), stateRoot, inventoryRoot, sealRoot, pinRoot,
    sequence: seq, objects: state.objects, payloadBytes: state.payloadBytes, pageCount: base.pageCount + pages.length,
    lookupBytes: base.lookupBytes + built.bytes + replayAdded,
    lookupAllocations: base.lookupAllocations + built.allocated + replayAllocations, counts, kindBytes,
    candidate: { pages, records, metadata, seal, state }, work: m.report() };
}
