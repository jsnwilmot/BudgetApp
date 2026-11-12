// Synthetic-only completion helpers. P1 runs separately, never as writer input.
import assert from 'node:assert/strict';
import { modelFixture, historicalSource, goodModel } from './historyModel.js';
import { writerOptions, runtime, equalHash } from './writerParity.js';
import * as writer from '../../experimental/checkpoint/writer.js';
import { changeHistory } from '../../experimental/checkpoint/historyModel.js';

export async function pairedFixture() {
  const source = historicalSource(), reference = await modelFixture(source);
  const candidate = goodModel(await writer.createWriter(writerOptions(source), runtime()));
  equalHash('model-root', candidate.snapshot.root, 'bootstrap', reference.model.root, candidate.snapshot.root);
  return { source, reference, candidate, model: reference.model, snapshot: candidate.snapshot };
}
export const requestFor = (snapshot, id, changes, datasetId = 'A') => ({ synthetic: true, operationId: id, datasetId,
  expectedRevision: snapshot.revision, expectedRoot: snapshot.root, changes });
export async function stage(f, request, rt = runtime()) {
  const guard = goodModel(writer.writerGuard(f.snapshot)).guard;
  const started = goodModel(await writer.beginCommand(f.candidate.controller, { kind: 'change-history', snapshot: f.snapshot, guard, request }, rt));
  if (started.replayed) return { ...started, guard, request };
  for (const ignored of request.changes) { void ignored; goodModel(await writer.stageNext(started.command)); }
  return { ...started, guard, request };
}
export async function commitPair(f, id, changes, datasetId = 'A', rt = runtime()) {
  const request = requestFor(f.snapshot, id, changes, datasetId), started = await stage(f, request, rt);
  const sealed = goodModel(await writer.sealCommand(started.command)); goodModel(await writer.validateCandidate(sealed.candidate));
  const result = goodModel(writer.publishCandidate(f.candidate.controller, sealed.candidate));
  const reference = goodModel(await changeHistory(f.model, requestFor(f.model, id, changes, datasetId)));
  equalHash('model-root', result.snapshot.root, id, reference.model.root, result.snapshot.root);
  equalHash('data-root', result.snapshot.dataRoot, id, reference.model.dataRoot, result.snapshot.dataRoot);
  assert.equal(result.receipt.status, 'MODEL_COMMITTED'); f.model = reference.model; f.snapshot = result.snapshot;
  return { ...result, request, guard: started.guard };
}
