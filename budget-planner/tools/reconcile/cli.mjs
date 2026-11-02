#!/usr/bin/env node
import { open, lstat, constants } from 'node:fs/promises';
import { register } from 'node:module';
import { decodeBackup } from './json.mjs';

// One explicit local regular file, opened read-only. No directory search, stdin dump or output path.
const HELP = 'FinPath offline reconciliation (review required before private-data use)\nnode tools/reconcile/cli.mjs --input <local-copy.json> --orphan-source <id> --current-source <id> [--from YYYY-MM-DD --to YYYY-MM-DD]\nOutput: aggregate counts and fixed risk warnings only. No corrections or files are produced.\n';
const ERRORS = { arguments: 'Invalid command options. Use --help.', input: 'Cannot read a supported local JSON input.', analysis: 'Input is unsupported, inconsistent or exceeds analysis limits.' };
for (const stream of [process.stdout, process.stderr]) stream.on('error', () => { process.exitCode = 4; });
let handle;
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') process.stdout.write(HELP);
  else {
    const flags = new Set(['--input', '--orphan-source', '--current-source', '--from', '--to']);
    const options = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!flags.has(args[i]) || !args[i + 1] || args[i + 1].startsWith('--') || (Object.hasOwn(options, args[i]) && !['--orphan-source','--current-source'].includes(args[i]))) throw new Error('arguments');
      if (['--orphan-source','--current-source'].includes(args[i])) options[args[i]] = [...(options[args[i]] || []), args[i + 1]];
      else options[args[i]] = args[i + 1];
    }
    if (!options['--input'] || !options['--orphan-source'] || !options['--current-source']) throw new Error('arguments');
    const filename = options['--input'];
    if (/^(?:[a-z]+:\/\/|\\\\|\/\/)/i.test(filename)) throw new Error('input');
    let backup;
    try {
      const before = await lstat(filename);
      if (!before.isFile() || before.isSymbolicLink()) throw new Error();
      handle = await open(filename, constants.O_RDONLY | (constants.O_NONBLOCK || 0) | (constants.O_NOFOLLOW || 0));
      const stat = await handle.stat();
      if (!stat.isFile() || before.dev !== stat.dev || before.ino !== stat.ino || stat.size > 16 * 1024 * 1024) throw new Error();
      const buffer = Buffer.alloc(stat.size + 1);
      let size = 0;
      while (size < buffer.length) {
        const read = await handle.read(buffer, size, buffer.length - size, size);
        if (!read.bytesRead) break;
        size += read.bytesRead;
      }
      const after = await handle.stat();
      if (size !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs) throw new Error();
      backup = decodeBackup(buffer.subarray(0, size).toString('utf8').replace(/^\uFEFF/, ''));
    } catch { throw new Error('input'); }
    await handle.close(); handle = undefined;
    register('./loader.mjs', import.meta.url);
    let report;
    try {
      const { analyze } = await import('./analysis.mjs');
      report = analyze(backup, { orphanSource: options['--orphan-source'], currentSource: options['--current-source'], from: options['--from'], to: options['--to'] });
    } catch { throw new Error('analysis'); }
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  }
} catch (error) {
  process.stderr.write(`${ERRORS[error.message] || ERRORS.analysis}\n`);
  process.exitCode = error.message === 'arguments' ? 2 : error.message === 'input' ? 3 : 4;
} finally { if (handle) await handle.close().catch(() => {}); }
