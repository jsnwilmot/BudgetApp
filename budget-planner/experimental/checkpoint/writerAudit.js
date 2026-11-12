// Independent read-only physical inventory verification. Not restore/activation.
// Retained verification records have the existing 400k/256MiB full-audit bound;
// only one page/metadata copy occupies staging at a time (8MiB unchanged).
import { PROFILE, LAYOUT, CAPS, D, need, fields, plain, freeze, failure, meter, isHash, integer } from './writerFormat.js';
import { metadataShape, decodePage, checkLogical } from './writerWire.js';
import { encodeCanonical } from './writerCanonical.js';

const domains = { state: 'state', seal: 'command-seal', delta: 'inventory-delta', pins: 'pins' };
const profiles = { state: PROFILE, seal: 'FP-WRITER-SEAL-1', delta: 'FP-WRITER-INVENTORY-1', pins: 'FP-WRITER-PINS-1' };
function methods(source) {
  need(plain(source) && !Object.getOwnPropertySymbols(source).length, 'UNSUPPORTED_TYPE');
  const ds = Object.getOwnPropertyDescriptors(source), names = ['context', 'readPage', 'readMetadata', 'readLogical', 'beginIndex', 'readIndex'];
  need(Object.keys(ds).length === names.length && names.every(k => ds[k] && 'value' in ds[k]), 'UNSUPPORTED_TYPE');
  need(names.slice(1).every(k => typeof ds[k].value === 'function'), 'UNSUPPORTED_TYPE');
  return Object.fromEntries(names.map(k => [k, ds[k].value]));
}
function result(raw, names) {
  need(plain(raw) && !Object.getOwnPropertySymbols(raw).length, 'UNSUPPORTED_TYPE');
  const ds = Object.getOwnPropertyDescriptors(raw); need(ds.ok && 'value' in ds.ok, 'UNSUPPORTED_TYPE');
  need(ds.ok.value === true, 'MISSING_OBJECT');
  need(Object.keys(ds).length === names.length + 1 && names.every(k => ds[k] && 'value' in ds[k]), 'UNSUPPORTED_TYPE');
  return Object.fromEntries(names.map(k => [k, ds[k].value]));
}
export async function verifyInventory(expected, supplied, runtime) {
  const m = meter(expected.limits, runtime, false, true), source = methods(supplied), records = new Map(), values = new Map(), metas = new Map();
  const pageRows = [], states = [], revisionBytes = new Map(); let retained = 0, physicalBytes = 0;
  const capabilityDigest = await m.hash(D + 'capabilities/1', CAPS);
  const charge = bytes => { need(integer(bytes) && retained + bytes <= m.bound.retainedBytes, 'RESOURCE_LIMIT'); retained += bytes; };
  function context(b) { need(b.physicalInstance === expected.physicalInstance && b.generation === expected.generation &&
    integer(b.revision) && b.revision <= expected.revision, 'SOURCE_CONTEXT'); }
  const sc = m.copy(source.context); fields(sc, ['physicalInstance', 'generation', 'stateRoot']);
  need(sc.physicalInstance === expected.physicalInstance && sc.generation === expected.generation && sc.stateRoot === expected.stateRoot, 'SOURCE_CONTEXT');
  async function metadata(id, type) {
    need(isHash(id), 'INVALID_GRAPH'); if (metas.has(id)) { const r = metas.get(id); need(r.physicalType === type, 'INVALID_GRAPH'); return r.body; }
    const mark = m.stats.stageBytes;
    try {
      const received = result(await source.readMetadata(id), ['record']); m.tick(); const r = m.copy(received.record);
      fields(r, ['physicalType', 'id', 'body', 'revision']); need(r.id === id && r.physicalType === type, 'INVALID_GRAPH');
      metadataShape(type, r.body); context(r.body); need(r.revision === r.body.revision && r.body.profile === profiles[type], 'SOURCE_CONTEXT');
      const text = encodeCanonical(r.body, m); need(text.length + 32 <= 65536 && await m.digest(D + domains[type] + '/1', text) === id, 'INTEGRITY_MISMATCH');
      need(metas.size + records.size < m.bound.objects, 'RESOURCE_LIMIT'); charge(text.length * 2 + 192); physicalBytes += text.length + 32;
      revisionBytes.set(r.revision, (revisionBytes.get(r.revision) ?? 0) + text.length + 32);
      const stored = freeze(r); metas.set(id, stored); return stored.body;
    } finally { m.release(m.stats.stageBytes - mark); }
  }
  let stateId = expected.stateRoot;
  while (stateId) {
    need(states.length <= m.bound.commands, 'RESOURCE_LIMIT'); const s = await metadata(stateId, 'state');
    need(s.profile === PROFILE && s.layout === LAYOUT && encodeCanonical(s.capabilities, m) === encodeCanonical(CAPS, m), 'UNSUPPORTED_VERSION');
    for (const k of ['revision', 'sequence', 'objects', 'payloadBytes']) need(integer(s[k]), 'INVALID_GRAPH');
    need(s.sequence <= m.bound.objects && s.objects <= m.bound.objects && s.payloadBytes <= m.bound.retainedBytes && s.revision === expected.revision - states.length, 'INVALID_GRAPH');
    const seal = await metadata(s.sealRoot, 'seal');
    need(seal.revision === s.revision && seal.logicalRoot === s.logicalRoot && seal.inventoryRoot === s.inventoryRoot && seal.pinRoot === s.pinRoot, 'INTEGRITY_MISMATCH');
    fields(seal.effects, ['versions', 'newObjects']); need(integer(seal.effects.versions) && integer(seal.effects.newObjects), 'INVALID_GRAPH');
    states.push({ id: stateId, state: s, seal }); stateId = seal.baseState;
    if (s.revision === 0) need(stateId === null && seal.previous === null && seal.operationId === null && seal.semanticDigest === null && seal.requestFingerprint === null, 'INVALID_GRAPH');
    else need(isHash(stateId) && isHash(seal.previous) && typeof seal.operationId === 'string' && seal.operationId.length > 0 && isHash(seal.semanticDigest) && isHash(seal.requestFingerprint), 'INVALID_GRAPH');
  }
  need(states.length === expected.revision + 1, 'INVALID_GRAPH'); states.reverse();
  let tip = null, pinTip = null, lastSeal = null, sequence = 0, oldBytes = 0, oldObjects = 0; const operations = new Set(), pageIds = new Set();
  for (const item of states) {
    m.tick(); const s = item.state, seal = item.seal; need(seal.previous === lastSeal, 'INTEGRITY_MISMATCH');
    const reverse = [], deltaSeen = new Set(); let deltaId = s.inventoryRoot;
    while (deltaId !== tip) {
      m.tick(); need(!deltaSeen.has(deltaId), 'INVALID_GRAPH'); deltaSeen.add(deltaId);
      const b = await metadata(deltaId, 'delta'); need(b.revision === s.revision && b.logicalRoot === s.logicalRoot && Array.isArray(b.pages) && b.pages.length <= 128, 'INVALID_GRAPH');
      reverse.push({ id: deltaId, body: b }); need(reverse.length <= m.bound.objects, 'RESOURCE_LIMIT'); deltaId = b.previous;
    }
    let frames = 0, addedBytes = 0, addedMeta = reverse.length + 2;
    for (const delta of reverse.reverse()) {
      const d = delta.body; need(d.previous === tip && d.firstSequence === sequence + 1 && integer(d.objects), 'INVALID_GRAPH'); let count = 0;
      for (const row of d.pages) {
        m.tick(); need(Array.isArray(row) && row.length === 3 && isHash(row[0]) && integer(row[1]) && row[1] >= 24 && row[1] <= m.bound.pageBytes &&
          integer(row[2]) && row[2] > 0 && row[2] <= 128 && !pageIds.has(row[0]), 'INVALID_PAGE');
        pageIds.add(row[0]); charge(128); pageRows.push({ id: row[0], bytes: row[1], frames: row[2], first: sequence + 1, revision: s.revision });
        sequence += row[2]; frames += row[2]; count += row[2]; addedBytes += row[1] + 32;
      }
      need(count === d.objects && (d.pages.length > 0 || reverse.length === 1), 'INVALID_GRAPH'); tip = delta.id;
    }
    if (s.pinRoot !== pinTip) {
      const p = await metadata(s.pinRoot, 'pins'); need(p.previous === pinTip && p.revision === s.revision && Array.isArray(p.pins) && p.pins.length <= m.bound.pins, 'INVALID_GRAPH');
      const unique = new Set(); for (const pin of p.pins) { fields(pin, ['kind', 'id']); need(isHash(pin.id) && !unique.has(pin.kind + pin.id), 'UNRESOLVED_PIN'); unique.add(pin.kind + pin.id);
        need(pin.kind === 'object' || pin.kind === 'full-inventory' && pin.id === (states[s.revision - 1]?.state.inventoryRoot ?? null), 'UNRESOLVED_PIN'); }
      pinTip = s.pinRoot; addedMeta++;
    }
    need(pinTip === s.pinRoot && tip === s.inventoryRoot && s.sequence === sequence && seal.effects.newObjects === frames, 'INTEGRITY_MISMATCH');
    addedBytes += revisionBytes.get(s.revision) ?? 0;
    need(s.payloadBytes === oldBytes + addedBytes && s.objects === oldObjects + frames + addedMeta, 'INTEGRITY_MISMATCH');
    if (s.revision) { need(!operations.has(seal.operationId), 'OPERATION_CONFLICT'); operations.add(seal.operationId); }
    if (s.revision) {
      const previous = states[s.revision - 1], guard = { physicalInstance: s.physicalInstance, generation: s.generation,
        revision: previous.state.revision, stateRoot: previous.id, logicalRoot: previous.state.logicalRoot,
        inventoryRoot: previous.state.inventoryRoot, capabilityDigest };
      need(await m.digest(D + 'physical-request/1', encodeCanonical({ guard, semanticDigest: seal.semanticDigest }, m)) === seal.requestFingerprint, 'INTEGRITY_MISMATCH');
    }
    lastSeal = s.sealRoot; oldBytes = s.payloadBytes; oldObjects = s.objects;
  }
  need(sequence === expected.state.sequence && oldBytes === expected.state.payloadBytes && oldObjects === expected.state.objects, 'INTEGRITY_MISMATCH');
  let nextSequence = 1; const byKind = {}, frameBytes = {}, versionsByRevision = new Map(); const get = id => { m.tick(); const r = records.get(id); need(r, 'MISSING_OBJECT'); return r; };
  for (const page of pageRows) {
    const mark = m.stats.stageBytes;
    try {
      const received = result(await source.readPage(page.id), ['bytes']); m.tick(); need(received.bytes instanceof Uint8Array && Object.getPrototypeOf(received.bytes) === Uint8Array.prototype && received.bytes.length === page.bytes, 'INVALID_PAGE');
      m.reserve(page.bytes * 2 + page.frames * 192); const raw = new Uint8Array(received.bytes), parsed = await decodePage(raw, page.id, m);
      need(parsed.length === page.frames && parsed[0].sequence === page.first, 'INVALID_PAGE');
      for (let slot = 0; slot < parsed.length; slot++) {
        const r = parsed[slot]; need(r.sequence === nextSequence++ && !records.has(r.id) && !metas.has(r.id) && !pageIds.has(r.id), 'INVALID_GRAPH');
        await checkLogical(r, get, m, { getValueInfo: id => values.get(id), onValue: (node, record, info) => {
          charge(80); values.set(record.id, { ...info, scalar: node[0] === 's' ? node[1] : null }); } });
        charge(r.bodyBytes * 2 + 192); records.set(r.id, freeze({ ...r, locator: { page: page.id, slot, sequence: r.sequence } }));
        byKind[r.kind] = (byKind[r.kind] ?? 0) + 1; frameBytes[r.kind] = (frameBytes[r.kind] ?? 0) + r.bodyBytes + 38;
        if (r.kind === 'version') versionsByRevision.set(page.revision, (versionsByRevision.get(page.revision) ?? 0) + 1);
        need(records.size + metas.size + pageIds.size <= m.bound.objects, 'RESOURCE_LIMIT');
        if (r.kind === 'model-root') need(r.body.instanceId === expected.logicalInstance && r.body.generation === expected.logicalGeneration, 'SOURCE_CONTEXT');
      }
      physicalBytes += raw.length + 32;
    } finally { m.release(m.stats.stageBytes - mark); }
  }
  need(records.size === expected.state.sequence && physicalBytes === expected.state.payloadBytes && records.size + metas.size === expected.state.objects, 'INTEGRITY_MISMATCH');
  const keyCache = new Map();
  function key(id) {
    m.tick(); if (keyCache.has(id)) return keyCache.get(id);
    const n = values.get(id); need(n?.tag === 'arr-leaf' && n.children.length === 2, 'INVALID_KEY');
    const tag = values.get(n.children[0]), value = values.get(n.children[1]); need(tag?.tag === 's', 'INVALID_KEY');
    let out;
    if (tag.scalar === 's') { need(value?.tag === 's', 'INVALID_KEY'); out = m.key(value.scalar); }
    else {
      need(tag.scalar === 'k' && value?.tag === 'arr-leaf' && value.children.length > 0, 'INVALID_KEY');
      out = m.key(value.children.map(id => { const c = values.get(id); need(c?.tag === 's', 'INVALID_KEY'); return c.scalar; }));
    }
    charge(80 + (Array.isArray(out[1]) ? out[1].length * 8 : 0)); keyCache.set(id, out); return out;
  }
  function find(root, wanted) {
    let at = root, hops = 0;
    while (true) { need(++hops <= m.bound.depth, 'RESOURCE_LIMIT'); const b = get(at).body;
      if (b.tag === 'leaf') return b.entries.find(row => m.compare(key(row.keyRef), wanted) === 0);
      let i = 0; for (let j = 1; j < b.children.length; j++) { if (m.compare(key(b.children[j].firstKeyRef), wanted) <= 0) i = j; else break; }
      at = b.children[i].ref;
    }
  }
  for (const record of records.values()) if (record.kind === 'map') {
    const b = record.body, rows = b.entries ?? b.children; let previous;
    for (const row of rows) {
      const current = key(row.keyRef ?? row.firstKeyRef); if (previous) need(m.compare(previous, current) < 0, 'INVALID_GRAPH'); previous = current;
      if (b.tag === 'branch') { const child = get(row.ref).body;
        need(row.total === child.total && row.live === child.live && row.firstKeyRef === (child.entries?.[0]?.keyRef ?? child.children?.[0]?.firstKeyRef), 'INVALID_GRAPH'); }
    }
  }
  for (const item of states) {
    const s = item.state, r = get(s.logicalRoot); need(r.kind === 'model-root' && r.body.revision === String(s.revision) && r.body.dataRoot === s.dataRoot, 'INTEGRITY_MISMATCH');
    need(item.seal.effects.versions === (versionsByRevision.get(s.revision) ?? 0), 'INTEGRITY_MISMATCH');
    if (s.revision) { const j = get(r.body.journal); need(j.kind === 'journal' && j.body.beforeModelRoot === states[s.revision - 1].state.logicalRoot &&
      j.body.afterDataRoot === s.dataRoot && j.body.operationId === item.seal.operationId && j.body.requestDigest === item.seal.semanticDigest, 'INTEGRITY_MISMATCH');
      const row = find(r.body.operationsRoot, m.key(item.seal.operationId)); need(row && !row.deleted && row.valueRef === row.versionRef, 'INTEGRITY_MISMATCH');
      const event = get(row.valueRef); need(event.kind === 'event' && event.body.operationId === item.seal.operationId && event.body.requestDigest === item.seal.semanticDigest &&
        event.body.journal === r.body.journal && event.body.afterDataRoot === s.dataRoot && event.body.revision === String(s.revision), 'INTEGRITY_MISMATCH'); }
    if (s.pinRoot) { const p = metas.get(s.pinRoot).body; for (const pin of p.pins) if (pin.kind === 'object') need(get(pin.id).sequence <= states[p.revision].state.sequence, 'UNRESOLVED_PIN'); }
  }
  // Exact source index membership, including otherwise hidden extra rows.
  const enumerated = new Set(), cursor = source.beginIndex(); let exhausted = false;
  while (!exhausted) {
    const mark = m.stats.stageBytes;
    try {
      const received = result(await source.readIndex(cursor), ['rows', 'exhausted']); m.tick(); need(typeof received.exhausted === 'boolean', 'INVALID_PAGE');
      const rows = m.copy(received.rows); need(Array.isArray(rows) && rows.length <= 128 && (rows.length || received.exhausted), 'INVALID_PAGE');
      for (const row of rows) { fields(row, ['id', 'type']); need(isHash(row.id) && !enumerated.has(row.id), 'INVALID_GRAPH');
        const type = records.has(row.id) ? 'logical' : pageIds.has(row.id) ? 'page' : metas.get(row.id)?.physicalType;
        need(type && row.type === type, 'INTEGRITY_MISMATCH'); enumerated.add(row.id); }
      exhausted = received.exhausted;
    } finally { m.release(m.stats.stageBytes - mark); }
  }
  need(enumerated.size === records.size + metas.size + pageIds.size, 'INTEGRITY_MISMATCH');
  const proof = freeze({ status: 'VERIFIED_WRITER_INVENTORY_MODEL', modelOnly: true, experimentOnly: true, nativeReady: false,
    stateRoot: expected.stateRoot, logicalRoot: expected.state.logicalRoot, records: records.size, metadata: metas.size, pages: pageIds.size,
    physicalBytes, byKind, frameBytes, retainedVerificationBytes: retained, work: m.report() });
  // Rebuilt read-only lookup comes only from authenticated ledger frames, not
  // the writer's private accelerator or source.readLogical. No write authority.
  const rebuilt = Object.freeze({ open(rt) { const read = meter(expected.limits, rt, false, true); return Object.freeze({
    readLogical(id) { const mark = read.stats.stageBytes; try { need(isHash(id) && records.has(id), 'MISSING_OBJECT');
      return freeze({ ok: true, record: read.copy(records.get(id)) }); } catch (e) { return failure(e); } finally { read.release(read.stats.stageBytes - mark); } }
  }); } });
  return { ok: true, proof, rebuilt };
}
