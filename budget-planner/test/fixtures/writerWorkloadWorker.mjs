// Test-only process isolation. No owner files, native databases or network.
import { runWriterWorkload } from './writerWorkload.js';
import process from 'node:process';
const years = Number(process.argv[2]), variant = process.argv[3];
if (![1, 3, 5].includes(years) || !['low', 'medium', 'high'].includes(variant)) throw Error('Invalid synthetic workload');
try { process.stdout.write(JSON.stringify(await runWriterWorkload(years, variant)) + '\n'); }
catch (error) { process.stderr.write(error.stack + '\n'); process.exitCode = 1; }
