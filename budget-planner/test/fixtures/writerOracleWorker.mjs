// Independent unmodified P1 runs first and exits. No candidate objects/input.
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { modelFixture, goodModel } from './historyModel.js';
import { inventory } from './retention.js';
import { changeHistory, inspectHistoryModel } from '../../experimental/checkpoint/historyModel.js';
import { canonical } from '../../experimental/checkpoint/backupFormat.js';
import { workloadChanges, observeCrypto } from './writerWorkload.js';
import { requestFor } from './writerCompletion.js';

const years = Number(process.argv[2]), variant = process.argv[3];
if (![1, 3, 5].includes(years) || !['low', 'medium', 'high'].includes(variant)) throw Error('Invalid synthetic oracle workload');
const crypto = observeCrypto(), bootstrapStarted = performance.now();
const fixture = await modelFixture(), initial = goodModel(inspectHistoryModel(fixture.model)).stats;
const bootstrap = { elapsedMs: performance.now() - bootstrapStarted, observedCrypto: crypto.read() };
let model = fixture.model; const roots = [], times = [], observed = { calls: 0, bytes: 0, maps: 0 };
try {
  for (let op = 0; op < years * 370; op++) {
    const changes = workloadChanges(op, years, variant); crypto.reset(); const start = performance.now();
    model = goodModel(await changeHistory(model, requestFor(model, 'work-' + op, changes))).model;
    times.push(performance.now() - start); const measured = crypto.read(); for (const k of Object.keys(observed)) observed[k] += measured[k];
    roots.push([model.root, model.dataRoot]);
  }
} finally { crypto.close(); }
const facts = [];
for (const r of inventory(model).values()) if (r.kind !== 'map') facts.push([r.id, r.kind, createHash('sha256').update(canonical(r.body)).digest('hex')]);
process.stdout.write(JSON.stringify({ initial, final: goodModel(inspectHistoryModel(model)).stats, roots, times, observed, bootstrap, facts,
  sourceBytes: Buffer.from(fixture.bytes).toString('base64') }) + '\n');
