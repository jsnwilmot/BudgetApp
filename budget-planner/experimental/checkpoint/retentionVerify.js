// Separate reverse-ordinal proof. No discovery/selection or plan-builder imports.
import { D, PROFILE, canonical, copy, freeze, need, fields, hash, context, scanEvidence, failure, methods, integer, verificationRecord } from './retentionCommon.js';

// Independent reference extraction, intentionally not P1 refsOf/discovery DFS.
function verificationReferences(r) {
  const b = r.body;
  switch (r.kind) {
    case 'chunk': return [];
    case 'value': return b.children.concat(b.chunks);
    case 'map': return b.tag === 'branch' ? b.children.flatMap(x => [x.firstKeyRef, x.ref]) : b.entries.flatMap(x => [x.versionRef, x.keyRef, x.valueRef].filter(x => x !== null));
    case 'version': return [b.sourceVersionRef, b.previous, b.valueRef, b.keyRef].filter(x => x !== null);
    case 'origin': return b.inventory.map(x => x.root).concat(b.envelopeRef);
    case 'dataset': return b.collections.map(x => x.root).concat(b.originRef);
    case 'data-root': return [b.datasetsRoot, b.originsRoot];
    case 'model-root': return [b.journal, b.operationsRoot, b.dataRoot].filter(x => x !== null);
    case 'journal': return [b.afterDataRoot, b.beforeModelRoot, b.previous].filter(x => x !== null);
    case 'event': return [b.afterDataRoot, b.journal, ...(b.originRef ? [b.originRef] : [])];
    default: need(false, 'INVALID_GRAPH');
  }
}
async function readManifest(kind, expectedRows, descriptor, plan, io, c) {
  fields(descriptor, ['tip', 'pages', 'rows', 'bytes']);
  need([descriptor.pages, descriptor.rows, descriptor.bytes].every(integer) && descriptor.pages <= c.limits.pages && descriptor.bytes <= c.limits.planBytes && descriptor.rows === expectedRows.length, 'INVALID_PAGE');
  let previous = null, rows = 0, bytes = 0;
  for (let index = 0; index < descriptor.pages; index++) {
    c.tick(); const raw = await io.readPage({ planId: plan.planId, kind, index }); need(raw !== null, 'INVALID_PAGE');
    const page = copy(raw); fields(page, ['id', 'body']); fields(page.body, ['kind', 'index', 'previous', 'rows']);
    const b = page.body, size = canonical(page).length; c.tick(size); c.work.manifestPages++;
    need(c.work.manifestPages <= c.limits.pages && size <= c.limits.record && size <= c.limits.pageBytes, 'RESOURCE_LIMIT');
    need(b.kind === kind && b.index === index && b.previous === previous && Array.isArray(b.rows) && b.rows.length > 0 && b.rows.length <= c.limits.pageRows, 'INVALID_PAGE');
    need(await hash(D + 'page/1', b) === page.id, 'INTEGRITY_MISMATCH');
    for (const row of b.rows) { c.tick(); need(rows < expectedRows.length && canonical(row) === canonical(expectedRows[rows++]), 'INTEGRITY_MISMATCH'); }
    previous = page.id; bytes += size;
  }
  need(await io.readPage({ planId: plan.planId, kind, index: descriptor.pages }) === null, 'INVALID_PAGE');
  need(rows === descriptor.rows && bytes === descriptor.bytes && previous === descriptor.tip, 'INTEGRITY_MISMATCH'); return bytes;
}
function checkDelta(d, baseline, candidate) {
  fields(d, ['direction', 'bytes', 'basisPoints']);
  const direction = candidate < baseline ? 'decrease' : candidate === baseline ? 'equal' : 'increase', bytes = Math.abs(candidate - baseline);
  need(d.direction === direction && d.bytes === bytes && d.basisPoints === (baseline ? Math.floor(bytes * 10000 / baseline) : 0), 'INTEGRITY_MISMATCH');
}
export async function verifyRetention(model, input, source, planInput, pageSource, runtime) {
  try {
    const c = context(model, input, runtime), plan = copy(planInput); fields(plan, ['planId', 'body']);
    const b = plan.body; fields(b, ['profile', 'modelOnly', 'experimentOnly', 'source', 'policy', 'manifests', 'candidate', 'accounting', 'qualifications']);
    need(b.profile === PROFILE && b.modelOnly === true && b.experimentOnly === true, 'UNSUPPORTED_VERSION');
    need(await hash(D + 'plan/1', b) === plan.planId, 'INTEGRITY_MISMATCH');
    const e = await scanEvidence(c, source);
    need(canonical(b.source) === canonical({ ...c.binding, inventoryDigest: e.inventoryDigest, census: e.census }), 'SOURCE_CONTEXT');
    need(canonical(b.policy) === canonical({ fullInventoryPinned: c.full, roots: 'all-non-map-plus-pins', kept: 'source-minus-exclusions' }), 'INTEGRITY_MISMATCH');
    const required = new Set(), roots = new Set();
    for (const r of e.ordered) if (c.full || r.kind !== 'map') { required.add(r.ordinal); roots.add(r.ordinal); }
    for (const pin of c.pins) if (pin.kind === 'object') { const ordinal = e.records.get(pin.id).ordinal; required.add(ordinal); roots.add(ordinal); }
    // Every edge goes to a smaller original ordinal: one reverse pass propagates
    // requirements without roots*pool walks or sharing discovery's DFS.
    for (let i = e.ordered.length - 1; i >= 0; i--) {
      c.tick(); const r = e.ordered[i];
      for (const id of verificationReferences(r)) {
        c.tick(); const child = e.records.get(id); need(child && child.ordinal < r.ordinal, 'INVALID_GRAPH');
        if (required.has(r.ordinal)) required.add(child.ordinal);
      }
    }
    const excluded = [], expectedKinds = {}, candidate = { keptCount: 0, keptBytes: 0, excludedMapCount: 0, excludedMapBytes: 0,
      protectedMapCount: 0, protectedMapBytes: 0, byKind: expectedKinds, ordinalPolicy: 'source-gaps-preserved' };
    for (const [kind] of Object.entries(e.census.byKind)) expectedKinds[kind] = { count: 0, bytes: 0 };
    for (const r of e.ordered) {
      c.tick();
      if (!required.has(r.ordinal)) { need(r.kind === 'map', 'INVALID_GRAPH'); excluded.push(r.ordinal); candidate.excludedMapCount++; candidate.excludedMapBytes += r.payloadBytes; }
      else { candidate.keptCount++; candidate.keptBytes += r.payloadBytes; expectedKinds[r.kind].count++; expectedKinds[r.kind].bytes += r.payloadBytes;
        if (r.kind === 'map') { candidate.protectedMapCount++; candidate.protectedMapBytes += r.payloadBytes; } }
    }
    need(canonical(candidate) === canonical(b.candidate), 'INTEGRITY_MISMATCH'); fields(b.manifests, ['roots', 'excluded', 'pins']);
    const io = methods(pageSource, ['readPage']); let pageBytes = 0;
    for (const [kind, expected] of [['roots', [...roots].sort((a, b) => a - b)], ['excluded', excluded], ['pins', c.pins]]) pageBytes += await readManifest(kind, expected, b.manifests[kind], plan, io, c);
    const a = b.accounting; fields(a, ['pageBytes', 'headerBytes', 'verificationBytes', 'overheadBytes', 'accountedBytes', 'mapDelta', 'totalDelta', 'mapGoal', 'totalGoal', 'noRegression']);
    const proof = verificationRecord(plan.planId, b.source, b.manifests, candidate), proofBytes = canonical(proof).length;
    const size = canonical(plan).length; c.tick(size + proofBytes); need(size <= c.limits.record && proofBytes <= c.limits.record && pageBytes + size + proofBytes <= c.limits.planBytes, 'RESOURCE_LIMIT');
    need(a.pageBytes === pageBytes && a.headerBytes === size && a.verificationBytes === proofBytes && a.overheadBytes === pageBytes + size + proofBytes && a.accountedBytes === candidate.keptBytes + pageBytes + size + proofBytes, 'INTEGRITY_MISMATCH');
    checkDelta(a.totalDelta, e.census.bytes, a.accountedBytes); checkDelta(a.mapDelta, e.census.byKind.map.bytes, candidate.protectedMapBytes + a.overheadBytes);
    need(a.mapGoal === (a.mapDelta.direction === 'decrease' && a.mapDelta.bytes * 5 >= e.census.byKind.map.bytes)
      && a.totalGoal === (a.totalDelta.direction === 'decrease' && a.totalDelta.bytes * 10 >= e.census.bytes) && a.noRegression === (a.accountedBytes <= e.census.bytes), 'INTEGRITY_MISMATCH');
    need(canonical(b.qualifications) === canonical(['MODEL_ONLY', 'EXPERIMENT_ONLY', 'NOT_P1_INVENTORY', 'NOT_BACKUP', 'NOT_RESTORE', 'WRITER_INDEX_NATIVE_COST_UNKNOWN']), 'INTEGRITY_MISMATCH');
    c.tick();
    const work = c.report();
    return freeze({ ok: true, status: 'VERIFIED_COUNTERFACTUAL', modelOnly: true, experimentOnly: true, planId: plan.planId, verificationRecord: proof, work, workReportBytes: canonical(work).length });
  } catch (error) { return failure(error); }
}
