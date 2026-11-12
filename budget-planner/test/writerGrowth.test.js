import test from 'node:test';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

let integrityFailure = false;
for (const years of [1, 3, 5]) for (const variant of ['low', 'medium', 'high']) {
  test(`W14: ${years} years ${variant} actual writer, original P1 roots and complete history`, async t => {
    if (integrityFailure) throw Error('STOP: previous writer integrity failure; remaining simulations not executed');
    try {
      // One fresh process per measured cell: previous fixtures/old reference
      // heaps cannot consume the next cell's fixed cooperative command budget.
      // No retries, larger caps, altered commands or omitted history checks.
      const result = await new Promise((resolve, reject) => execFile(process.execPath,
        ['--import', new URL('./register.mjs', import.meta.url).href,
          fileURLToPath(new URL('./fixtures/writerWorkloadWorker.mjs', import.meta.url)), String(years), variant],
        { encoding: 'utf8', maxBuffer: 1048576 }, (error, stdout, stderr) => {
          if (error) reject(Error(stderr || stdout || error.message)); else { try { resolve(JSON.parse(stdout)); } catch (e) { reject(e); } }
        }));
      t.diagnostic(JSON.stringify(result));
    }
    catch (e) { integrityFailure = true; throw e; }
  });
}
