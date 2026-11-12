// Independent delta/index verifier: no transient-map/editor/builder imports.
import { need, D, PROFILE, LAYOUT, CAPS, fields, isHash } from './writerFormat.js';
import { decodePage, checkLogical, metadataShape } from './writerWire.js';
import { lookup } from './writerIndex.js';

function appendIndex(before, after, expected, m) {
  const added = new Map(), queue = [[before, after]];
  function scan(n) {
    const q = n ? [n] : []; while (q.length) { m.tick(); const x = q.pop();
      if (x.tag === 'leaf') { need(!added.has(x.id), 'INVALID_GRAPH'); added.set(x.id, x.record); }
      else for (const [, c] of x.children) q.push(c);
    }
  }
  while (queue.length) {
    m.tick(); const [old, next] = queue.pop(); if (old === next) continue;
    if (!old) { scan(next); continue; } need(next, 'INTEGRITY_MISMATCH');
    if (old.tag === 'leaf' && next.tag === 'leaf') { need(old.id === next.id && old.record === next.record, 'INTEGRITY_MISMATCH'); continue; }
    const prefix = old.tag === 'leaf' ? old.id : old.prefix;
    need(next.tag === 'branch' && prefix.startsWith(next.prefix), 'INTEGRITY_MISMATCH');
    const children = new Map(next.children); need(children.size === next.children.length && children.size >= 2 && children.size <= 16, 'INVALID_GRAPH');
    if (old.tag === 'branch' && old.prefix === next.prefix) {
      for (const [digit, child] of old.children) { need(children.has(digit), 'INTEGRITY_MISMATCH'); queue.push([child, children.get(digit)]); children.delete(digit); }
      for (const child of children.values()) scan(child);
    } else {
      const digit = prefix[next.prefix.length]; need(children.has(digit), 'INTEGRITY_MISMATCH'); queue.push([old, children.get(digit)]); children.delete(digit);
      for (const child of children.values()) scan(child);
    }
  }
  need(added.size === expected.size, 'INTEGRITY_MISMATCH');
  for (const [id, record] of expected) { m.tick(); need(added.get(id) === record && lookup(after, id, m) === record, 'INTEGRITY_MISMATCH'); }
}
export async function verifyDelta(base, next, m) {
  const c = next.candidate, seen = new Map(), membership = new Map(), pageIds = new Set(); let seq = base.sequence, bytes = base.payloadBytes;
  const get = id => { m.tick(); m.stats.logicalLookups++; if (seen.has(id)) return seen.get(id);
    need(++m.stats.oldLookups <= m.bound.oldLookups, 'RESOURCE_LIMIT'); const r = lookup(base.pool, id, m); need(r && !r.physicalType, 'MISSING_OBJECT'); return r; };
  for (const page of c.pages) {
    need(!pageIds.has(page.id) && !lookup(base.pool, page.id, m), 'INVALID_PAGE'); pageIds.add(page.id);
    const parsed = await decodePage(page.bytes, page.id, m); need(parsed.length === page.frames && page.first === seq + 1, 'INVALID_PAGE');
    for (const record of parsed) {
      m.stats.logicalLookups += 2;
      need(record.sequence === ++seq && !seen.has(record.id) && !lookup(base.pool, record.id, m), 'INVALID_PAGE');
      await checkLogical(record, get, m); seen.set(record.id, record);
      const stored = lookup(next.pool, record.id, m); need(stored && !stored.physicalType && stored.sequence === record.sequence &&
        stored.locator.page === page.id && stored.locator.slot === record.sequence - page.first &&
        (record.kind === 'chunk' ? stored.body.data === record.body.data : m.canonical(stored.body) === m.canonical(record.body)) && stored.kind === record.kind, 'INTEGRITY_MISMATCH'); membership.set(record.id, stored);
    }
    const stored = lookup(next.pool, page.id, m); need(stored?.physicalType === 'page' && stored.bytes === page.bytes, 'INTEGRITY_MISMATCH'); membership.set(page.id, stored);
    bytes += page.bytes.length + 32;
  }
  need(seen.size === c.records.length && seq === next.sequence, 'INTEGRITY_MISMATCH');
  const domains = { delta: 'inventory-delta', pins: 'pins', seal: 'command-seal', state: 'state' };
  let inventory = base.inventoryRoot, pageAt = 0, pinRoot = base.pinRoot, sealRoot = null;
  for (const record of c.metadata) {
    m.tick(); metadataShape(record.physicalType, record.body); const b = record.body;
    need(b.physicalInstance === next.physicalInstance && b.generation === next.generation && b.revision === next.revision, 'SOURCE_CONTEXT');
    need(await m.hash(D + domains[record.physicalType] + '/1', b) === record.id && !membership.has(record.id) && !lookup(base.pool, record.id, m), 'INTEGRITY_MISMATCH');
    need(lookup(next.pool, record.id, m) === record, 'INTEGRITY_MISMATCH'); membership.set(record.id, record); bytes += m.canonical(b).length + 32;
    if (record.physicalType === 'delta') {
      need(b.profile === 'FP-WRITER-INVENTORY-1' && b.previous === inventory && b.logicalRoot === next.root && b.pages.length <= 128, 'INVALID_GRAPH');
      let n = 0; const first = pageAt < c.pages.length ? c.pages[pageAt].first : base.sequence + 1;
      for (const row of b.pages) { const p = c.pages[pageAt++]; need(p && m.canonical(row) === m.canonical([p.id, p.bytes.length, p.frames]), 'INVALID_GRAPH'); n += p.frames; }
      need(b.objects === n && b.firstSequence === first, 'INVALID_GRAPH'); inventory = record.id;
    } else if (record.physicalType === 'pins') {
      need(b.profile === 'FP-WRITER-PINS-1' && b.previous === pinRoot && b.pins.length <= m.bound.pins, 'INVALID_GRAPH');
      const unique = new Set(); for (const p of b.pins) { fields(p, ['kind', 'id']); need(isHash(p.id) && !unique.has(p.kind + p.id), 'UNRESOLVED_PIN'); unique.add(p.kind + p.id);
        if (p.kind === 'object') get(p.id); else need(p.kind === 'full-inventory' && p.id === base.inventoryRoot, 'UNRESOLVED_PIN'); }
      pinRoot = record.id;
    } else if (record.physicalType === 'seal') {
      need(b.profile === 'FP-WRITER-SEAL-1' && b.previous === base.sealRoot && b.baseState === base.stateRoot && b.inventoryRoot === inventory &&
        b.pinRoot === pinRoot && b.logicalRoot === next.root && b.operationId === next.operationId && b.semanticDigest === next.semanticDigest &&
        b.requestFingerprint === next.requestFingerprint, 'INTEGRITY_MISMATCH'); fields(b.effects, ['versions', 'newObjects']);
      need(b.effects.newObjects === seen.size && b.effects.versions === [...seen.values()].filter(r => r.kind === 'version').length, 'INTEGRITY_MISMATCH'); sealRoot = record.id;
    } else {
      need(b.profile === PROFILE && b.layout === LAYOUT && m.canonical(b.capabilities) === m.canonical(CAPS) &&
        b.sealRoot === sealRoot && b.inventoryRoot === inventory && b.pinRoot === pinRoot && b.logicalRoot === next.root &&
        b.sequence === seq && b.objects === base.objects + seen.size + c.metadata.length && b.payloadBytes === bytes &&
        b.dataRoot === next.dataRoot && record.id === next.stateRoot, 'INTEGRITY_MISMATCH');
    }
  }
  need(pageAt === c.pages.length && inventory === next.inventoryRoot && sealRoot === next.sealRoot && bytes === next.payloadBytes, 'INTEGRITY_MISMATCH');
  const root = get(next.root); need(root.kind === 'model-root' && root.body.dataRoot === next.dataRoot && root.body.revision === String(next.revision) &&
    root.body.instanceId === next.logicalInstance && root.body.generation === next.logicalGeneration, 'SOURCE_CONTEXT');
  appendIndex(base.pool, next.pool, membership, m);
  const replayAdded = new Map();
  if (next.operationId !== null) { const replay = lookup(next.replayPool, next.semanticDigest, m);
    need(replay?.sealRoot === next.sealRoot && replay.operationId === next.operationId && replay.requestFingerprint === next.requestFingerprint, 'INTEGRITY_MISMATCH'); replayAdded.set(next.semanticDigest, replay); }
  appendIndex(base.replayPool, next.replayPool, replayAdded, m);
  return { status: 'MODEL_DELTA_VERIFIED', newObjects: seen.size, indexEntries: membership.size, bytesAdded: bytes - base.payloadBytes };
}
