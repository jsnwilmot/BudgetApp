// Pure post-hoc retention hypothesis. Never edits a P1 model or creates a writer.
import { D, PROFILE, canonical, copy, freeze, need, hash, refsOf,
  context, scanEvidence, emptyDescriptor, appendPage, failure, methods, verificationRecord } from './retentionCommon.js';
export { BASELINE, createRetentionSource } from './retentionCommon.js';

function discoverRequired(evidence, c) {
  const roots = new Set(), required = new Set(), stack = [];
  for (const r of evidence.ordered) if (c.full || r.kind !== 'map') roots.add(r.ordinal);
  for (const pin of c.pins) if (pin.kind === 'object') roots.add(evidence.records.get(pin.id).ordinal);
  for (const ordinal of roots) stack.push(evidence.ordered[ordinal - 1].id);
  while (stack.length) {
    c.tick(); const id = stack.pop(); if (required.has(id)) continue;
    const record = evidence.records.get(id); need(record, 'INVALID_GRAPH'); required.add(id);
    for (const ref of refsOf(record.kind, record.body)) { c.tick(); need(evidence.records.has(ref), 'MISSING_OBJECT'); stack.push(ref); }
  }
  return { roots: [...roots].sort((a, b) => a - b), required };
}
async function makeManifests(rows, c) {
  const pages = {}, manifests = {}; let bytes = 0;
  for (const kind of ['roots', 'excluded', 'pins']) {
    const descriptor = emptyDescriptor(), output = []; pages[kind] = output;
    for (let i = 0; i < rows[kind].length; i += c.limits.pageRows) await appendPage(descriptor, kind, rows[kind].slice(i, i + c.limits.pageRows), c, page => output.push(page));
    manifests[kind] = descriptor; bytes += descriptor.bytes; need(bytes <= c.limits.planBytes, 'RESOURCE_LIMIT');
  }
  return { pages: freeze(pages), manifests: freeze(manifests), bytes };
}
function delta(baseline, candidate) {
  const bytes = Math.abs(baseline - candidate);
  return { direction: candidate < baseline ? 'decrease' : candidate > baseline ? 'increase' : 'equal', bytes,
    basisPoints: baseline ? Math.floor(bytes * 10000 / baseline) : 0 };
}
async function buildPlan(e, selection, manifest, c) {
  const byKind = Object.fromEntries(Object.entries(e.census.byKind).map(([k, v]) => [k, { ...v }]));
  let excludedMapBytes = 0, excludedMapCount = 0;
  for (const r of e.ordered) if (!selection.required.has(r.id)) {
    c.tick(); need(r.kind === 'map', 'INVALID_GRAPH'); excludedMapBytes += r.payloadBytes; excludedMapCount++;
    byKind.map.count--; byKind.map.bytes -= r.payloadBytes;
  }
  const candidate = { keptCount: e.census.objects - excludedMapCount, keptBytes: e.census.bytes - excludedMapBytes,
    excludedMapCount, excludedMapBytes, protectedMapCount: byKind.map.count, protectedMapBytes: byKind.map.bytes,
    byKind, ordinalPolicy: 'source-gaps-preserved' };
  const source = { ...c.binding, inventoryDigest: e.inventoryDigest, census: e.census };
  const verificationBytes = canonical(verificationRecord('0'.repeat(64), source, manifest.manifests, candidate)).length;
  let headerBytes = 0, body;
  for (let attempt = 0; attempt < 32; attempt++) {
    const overhead = manifest.bytes + headerBytes + verificationBytes, accounted = candidate.keptBytes + overhead;
    const mapDelta = delta(e.census.byKind.map.bytes, candidate.protectedMapBytes + overhead), totalDelta = delta(e.census.bytes, accounted);
    body = { profile: PROFILE, modelOnly: true, experimentOnly: true,
      source,
      policy: { fullInventoryPinned: c.full, roots: 'all-non-map-plus-pins', kept: 'source-minus-exclusions' },
      manifests: manifest.manifests, candidate,
      accounting: { pageBytes: manifest.bytes, headerBytes, verificationBytes, overheadBytes: overhead, accountedBytes: accounted,
        mapDelta, totalDelta, mapGoal: mapDelta.direction === 'decrease' && mapDelta.bytes * 5 >= e.census.byKind.map.bytes,
        totalGoal: totalDelta.direction === 'decrease' && totalDelta.bytes * 10 >= e.census.bytes, noRegression: accounted <= e.census.bytes },
      qualifications: ['MODEL_ONLY', 'EXPERIMENT_ONLY', 'NOT_P1_INVENTORY', 'NOT_BACKUP', 'NOT_RESTORE', 'WRITER_INDEX_NATIVE_COST_UNKNOWN'] };
    const size = canonical({ planId: '0'.repeat(64), body }).length; c.tick(size);
    need(size <= c.limits.record && verificationBytes <= c.limits.record && size + manifest.bytes + verificationBytes <= c.limits.planBytes, 'RESOURCE_LIMIT');
    if (size === headerBytes) {
      const plan = freeze({ planId: await hash(D + 'plan/1', body), body }); need(canonical(plan).length === size, 'INTEGRITY_MISMATCH'); return plan;
    }
    headerBytes = size;
  }
  need(false, 'RESOURCE_LIMIT');
}
function manifestSource(plan, pages) {
  return freeze({ readPage: async request => {
    const r = copy(request); need(Object.keys(r).length === 3 && r.planId === plan.planId && ['roots', 'excluded', 'pins'].includes(r.kind) && Number.isSafeInteger(r.index) && r.index >= 0, 'INVALID_PAGE');
    return pages[r.kind][r.index] ?? null;
  } });
}
export async function analyzeRetention(model, input, source, runtime) {
  try {
    const c = context(model, input, runtime), evidence = await scanEvidence(c, source), selection = discoverRequired(evidence, c);
    const excluded = evidence.ordered.filter(r => !selection.required.has(r.id)).map(r => r.ordinal);
    const manifest = await makeManifests({ roots: selection.roots, excluded, pins: c.pins }, c);
    const plan = await buildPlan(evidence, selection, manifest, c);
    c.tick();
    const work = c.report();
    return freeze({ ok: true, status: 'COUNTERFACTUAL_PLAN', plan, pageSource: manifestSource(plan, manifest.pages), work, workReportBytes: canonical(work).length });
  } catch (error) { return failure(error); }
}
// Read one bounded, hash-bound manifest page. Full verification is a separate API.
export async function readRetentionPage(planInput, kind, index, source) {
  try {
    const plan = copy(planInput); need(plan.body?.profile === PROFILE, 'UNSUPPORTED_VERSION');
    need(plan.planId === await hash(D + 'plan/1', plan.body) && canonical(plan).length <= 65536, 'INTEGRITY_MISMATCH');
    need(['roots', 'excluded', 'pins'].includes(kind) && Number.isSafeInteger(index) && index >= 0, 'INVALID_PAGE');
    const { readPage } = methods(source, ['readPage']); const raw = await readPage({ planId: plan.planId, kind, index });
    if (raw === null) { need(index >= plan.body.manifests[kind].pages, 'INVALID_PAGE'); return freeze({ ok: true, page: null }); }
    const page = copy(raw); need(Object.keys(page).length === 2 && Object.keys(page.body ?? {}).length === 4 && index < plan.body.manifests[kind].pages && page.body?.kind === kind && page.body.index === index && page.id === await hash(D + 'page/1', page.body), 'INTEGRITY_MISMATCH');
    need(Array.isArray(page.body.rows) && page.body.rows.length <= 128 && canonical(page).length <= 65536, 'RESOURCE_LIMIT');
    return freeze({ ok: true, page });
  } catch (error) { return failure(error); }
}
