import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { historyFixture } from '../fixtures/history-ledger.js';
import { createBackupSnapshot } from '../../src/services/backupService.js';

const baseURL = process.env.FINPATH_BASE_URL || 'http://127.0.0.1:4173/BudgetApp/';
const output = await mkdtemp(join(tmpdir(), 'finpath-phase1-browser-'));
const browser = await chromium.launch({ executablePath: process.env.FINPATH_CHROMIUM_PATH || '/usr/bin/chromium',
  headless: true, args: ['--no-sandbox'] });
const evidence = { browser: await browser.version(), baseURL, output, checks: [] };
const contexts = [];
const pass = (name) => { evidence.checks.push({ name, status: 'PASS' }); console.log(`PASS ${name}`); };
async function profile(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true }); contexts.push(context);
  await context.addInitScript(() => localStorage.setItem('budgetApp:lastSeenReleaseNotesVersion', '2.0.1-phase1-review'));
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  await page.clock.install({ time: new Date('2026-12-30T12:00:00Z') });
  await page.goto(baseURL);
  await page.getByRole('button', { name: 'Settings', exact: true }).first().waitFor({ state: 'attached' });
  return { context, page };
}
async function nav(page, name) {
  const target = page.getByRole('button', { name, exact: true });
  await target.or(page.getByRole('button', { name: 'Open navigation menu' })).filter({ visible: true }).first().waitFor();
  if (!await target.first().isVisible()) await page.getByRole('button', { name: 'Open navigation menu' }).click();
  await target.filter({ visible: true }).first().click();
}
async function importBackup(page, payload) {
  await nav(page, 'Settings');
  await page.locator('input[type=file]').setInputFiles({ name: 'synthetic-backup.json', mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(payload)) });
  await page.getByText('Importing this file will replace', { exact: false }).waitFor();
  await page.getByRole('button', { name: 'Import Backup', exact: true }).last().click();
  await page.waitForFunction(() => !document.body.textContent.includes('Importing this file will replace'));
  await page.getByRole('button', { name: 'Planner', exact: true }).first().waitFor({ state: 'attached' });
}
async function records(page, storeName) {
  return page.evaluate((storeName) => new Promise((resolve, reject) => {
    const request = indexedDB.open('budget-planner-db');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result; const tx = db.transaction(storeName, 'readonly');
      const get = tx.objectStore(storeName).getAll();
      get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error);
      tx.oncomplete = () => db.close();
    };
  }), storeName);
}
async function entry(page, key = 'salary__2026-12-30') {
  return (await records(page, 'plannerEntries')).find((value) => value.entryKey === key);
}
async function openCell(page, name) {
  await nav(page, 'Planner');
  await page.getByRole('button', { name: new RegExp(`^${name}, .*2026-12-30,`) }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).waitFor();
}
async function saveCell(page, line = false) {
  await page.getByRole('button', { name: line ? 'Save Line Items' : 'Save', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).waitFor({ state: 'hidden' });
}
async function exportBackup(page) {
  await nav(page, 'Settings');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export Backup', exact: true }).click();
  const file = join(output, `backup-${Date.now()}.json`); await (await download).saveAs(file);
  return JSON.parse(await readFile(file, 'utf8'));
}
function fixture() {
  const data = historyFixture();
  data.settings.payPeriodAnchorDate = '2026-12-30'; data.settings.projectionMonths = 3;
  data.appMetadata.onboardingCompletedAt = '2026-12-30T12:00:00Z';
  for (const item of data.scheduledItems) {
    item.active = true; item.endDate = '2026-12-30';
    if (item.id === 'bill') item.allowLineItems = true;
  }
  for (const value of Object.values(data.plannerEntries)) delete value.scheduledItemSnapshot;
  delete data.plannerEntries['salary__2026-12-30'].plannedAmount;
  data.plannerEntries['salary__2026-12-30'].historicalAmountNeedsReview = true;
  data.plannerEntries['bill__2026-12-30'].historicalAmountNeedsReview = true;
  return data;
}
try {
  const { page, context } = await profile();
  await importBackup(page, createBackupSnapshot(fixture()));
  await nav(page, 'Planner');
  for (const [name, expected] of [['Projected Chequing', '1,620.00'], ['Validated Chequing', '1,620.00'], ['Projected Savings', '645.00']]) {
    const row = page.locator('tbody tr').filter({ has: page.locator('th').filter({ hasText: new RegExp(`^${name}$`) }) });
    assert.match(await row.locator('td').first().innerText(), new RegExp(expected.replace('.', '\\.')));
  }
  pass('Planner reference ledger spot check: chequing projected/validated 1620, savings 645');
  await nav(page, 'Dashboard');
  assert.match(await page.getByText('Chequing After Next Period', { exact: true }).locator('..').innerText(), /1,620\.00/);
  assert.match(await page.getByText('Savings After Next Period', { exact: true }).locator('..').innerText(), /645\.00/);
  await nav(page, 'Manage'); await page.getByRole('button', { name: /Savings Buckets/ }).last().click();
  assert.match(await page.getByText('Current Projected Buckets', { exact: true }).locator('..').innerText(), /645\.00/);
  assert.match(await page.getByText('Current Validated Buckets', { exact: true }).locator('..').innerText(), /645\.00/);
  pass('Dashboard and current Savings Buckets match the December ledger');
  await nav(page, 'Reports'); await page.getByRole('button', { name: 'Pay Period', exact: true }).click();
  await page.locator('select').first().selectOption('2026-12-30');
  assert.match(await page.getByText('Income', { exact: true }).first().locator('..').innerText(), /1,000\.00/);
  assert.match(await page.getByText('Expenses', { exact: true }).first().locator('..').innerText(), /240\.00/);
  pass('Reports December income 1000 and expenses 240 (230 bill + 10 fee) match the shared fixture');
  for (const [name, key, line] of [['Salary', 'salary__2026-12-30', false], ['Monthly bill', 'bill__2026-12-30', true]]) {
    await openCell(page, name);
    await page.locator('[name=notes]').fill(`Synthetic note only: ${name}`);
    await page.locator('[name=lastEntry]').check();
    await saveCell(page, line);
    assert.equal((await entry(page, key)).historicalAmountNeedsReview, true);
    assert.equal((await entry(page, key)).historicalSourceNeedsReview, true);
    pass(`F1 ${line ? 'line-item' : 'standard'} note/marker-only save preserves both warnings`);
  }
  await nav(page, 'Settings');
  await page.getByText('Historical confirmed amounts need review', { exact: true }).waitFor();
  await page.getByText('Historical source details need review', { exact: true }).waitFor();
  pass('Data Health exposes amount and source uncertainty');
  await openCell(page, 'Salary');
  await page.locator('[name=reviewHistoricalAmount]').check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  assert.equal(await page.locator('[name=historicalEvidence]').evaluate((input) => input.validity.valid), false);
  assert.equal((await entry(page)).historicalAmountNeedsReview, true);
  pass('explicit confirmation without evidence is blocked');
  await page.locator('[name=historicalEvidence]').fill('Synthetic statement: salary 2026-12-30, CAD 1000');
  await saveCell(page);
  assert.equal((await entry(page)).historicalAmountNeedsReview, false);
  assert.equal((await entry(page)).historicalSourceNeedsReview, true);
  pass('explicit amount confirmation with evidence leaves source warning unresolved');
  const saved = await exportBackup(page);
  const fresh = await profile(); await importBackup(fresh.page, saved);
  assert.deepEqual((await entry(fresh.page)).historicalReview, saved.data.plannerEntries['salary__2026-12-30'].historicalReview);
  assert.equal((await entry(fresh.page)).historicalSourceNeedsReview, true);
  assert.deepEqual((await records(fresh.page, 'appMetadata'))[0].plannerLastEntryMarker, saved.data.appMetadata.plannerLastEntryMarker);
  assert.equal((await entry(fresh.page, 'bill__2026-12-30')).historicalAmountNeedsReview, true);
  pass('real browser JSON download/import into fresh profile preserves warnings and evidence');
  await openCell(fresh.page, 'Monthly bill');
  await fresh.page.locator('[name=reviewHistoricalAmount]').check();
  await fresh.page.locator('[name=historicalEvidence]').fill('Synthetic invoice: saved line item CAD 230, 2026-12-30');
  await saveCell(fresh.page, true);
  assert.equal((await entry(fresh.page, 'bill__2026-12-30')).historicalAmountNeedsReview, false);
  assert.equal((await entry(fresh.page, 'bill__2026-12-30')).historicalSourceNeedsReview, true);
  pass('line-item explicit amount reconciliation preserves independent source warning');
  const before = await records(fresh.page, 'plannerEntries');
  for (const name of ['Planner', 'Dashboard', 'Reports', 'Transactions', 'Settings']) await nav(fresh.page, name);
  await fresh.page.reload(); await nav(fresh.page, 'Planner');
  assert.deepEqual(await records(fresh.page, 'plannerEntries'), before);
  pass('navigation and refresh make no planner-entry writes');
  // Offline web/PWA runtime is supported; OS-installed app launch is not implied.
  await fresh.page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await fresh.page.reload();
  await fresh.page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await fresh.context.setOffline(true); await fresh.page.reload(); await nav(fresh.page, 'Planner');
  assert.deepEqual(await records(fresh.page, 'plannerEntries'), before);
  const reopened = await fresh.context.newPage(); await reopened.goto(baseURL); await nav(reopened, 'Planner');
  assert.deepEqual(await records(reopened, 'plannerEntries'), before);
  await fresh.context.setOffline(false);
  pass('service-worker controlled offline reload and new-page reopen retain history');
  // Distinguish a current reassignment from historical evidence.
  const reassigned = fixture(); reassigned.scheduledItems[0].accountId = 's';
  await importBackup(page, createBackupSnapshot(reassigned)); await openCell(page, 'Salary');
  await page.getByText(/Source details are provisional: Salary/).waitFor();
  assert.match(await page.locator('fieldset').innerText(), /Savings/);
  await page.locator('[name=notes]').fill('Reassigned current source is not original evidence'); await saveCell(page);
  assert.equal((await entry(page)).scheduledItemSnapshot.accountId, 's');
  assert.equal((await entry(page)).scheduledItemSnapshotProvenance, 'unverified-current-source');
  assert.equal((await entry(page)).historicalSourceNeedsReview, true);
  pass('F2 reassigned current account remains provisional after note save');
  // Repair one historical cell directly: no backup restore and no live-schedule edit.
  const entriesBeforeCorrection = await records(page, 'plannerEntries');
  const schedulesBeforeCorrection = await records(page, 'scheduledItems');
  const metadataBeforeCorrection = await records(page, 'appMetadata');
  await openCell(page, 'Salary');
  await page.locator('[name=actualAmount]').fill('9999');
  await page.locator('[name=useActual]').check();
  await page.locator('[name=validated]').uncheck();
  await page.locator('[name=notes]').fill('Unsaved amount-form edits must not be included');
  await page.getByText('Correct source for this saved entry', { exact: true }).click();
  await page.locator('[name=historicalAccount]').selectOption('c');
  await page.getByRole('button', { name: 'Save historical source correction', exact: true }).click();
  assert.equal((await entry(page)).scheduledItemSnapshot.accountId, 's');
  await page.locator('[name=sourceCorrectionEvidence]').fill('Synthetic original-backup salary__2026-12-30: original account c, income');
  await page.getByRole('button', { name: 'Save historical source correction', exact: true }).click();
  assert.equal(await page.locator('[name=confirmSourceCorrection]').evaluate((input) => input.validity.valid), false);
  await page.locator('[name=confirmSourceCorrection]').check();
  await page.locator('[name=historicalAccount]').evaluate((select) => {
    const option = document.createElement('option'); option.value = 'missing-account'; option.text = 'Removed account';
    select.append(option); select.value = option.value;
  });
  await page.getByRole('button', { name: 'Save historical source correction', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: /historical account could not be found/ }).waitFor();
  assert.deepEqual(await records(page, 'plannerEntries'), entriesBeforeCorrection);
  pass('F4 missing confirmation/evidence and unknown account cannot change historical entries');
  await page.locator('[name=historicalAccount]').selectOption('c');
  await page.getByRole('button', { name: 'Save historical source correction', exact: true }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).waitFor({ state: 'hidden' });
  const correctedEntry = await entry(page);
  assert.equal(correctedEntry.scheduledItemSnapshot.accountId, 'c');
  assert.equal(correctedEntry.scheduledItemSnapshotProvenance, 'user-reconciled');
  assert.equal(correctedEntry.historicalSourceNeedsReview, false);
  assert.equal(correctedEntry.historicalAmountNeedsReview, true);
  assert.equal(correctedEntry.historicalSourceCorrections.length, 1);
  const previousEntry = entriesBeforeCorrection.find((value) => value.entryKey === correctedEntry.entryKey);
  for (const field of ['plannedAmount', 'actualAmount', 'validated', 'useActual', 'notes', 'lineItems', 'entryKey', 'scheduledItemId', 'payPeriodDate']) {
    assert.deepEqual(correctedEntry[field], previousEntry[field]);
  }
  assert.deepEqual(await records(page, 'scheduledItems'), schedulesBeforeCorrection);
  assert.deepEqual(await records(page, 'appMetadata'), metadataBeforeCorrection);
  const allCorrected = await records(page, 'plannerEntries');
  for (const other of entriesBeforeCorrection.filter((value) => value.entryKey !== correctedEntry.entryKey)) {
    assert.deepEqual(allCorrected.find((value) => value.entryKey === other.entryKey), other);
  }
  pass('F4 provisional B -> historical A correction preserves amounts, validation, other entries, marker and current B schedule');
  await nav(page, 'Planner');
  const correctedChequing = page.locator('tbody tr').filter({ has: page.locator('th').filter({ hasText: /^Validated Chequing$/ }) });
  assert.match(await correctedChequing.locator('td').first().innerText(), /1,620\.00/);
  assert.match(await correctedChequing.locator('td').nth(1).innerText(), /1,290\.00/);
  pass('F4 corrected historical account carries forward while the later B occurrence remains in B');
  const correctionBackup = await exportBackup(page);
  const correctedProfile = await profile(); await importBackup(correctedProfile.page, correctionBackup);
  assert.deepEqual((await entry(correctedProfile.page)).historicalSourceCorrections, correctedEntry.historicalSourceCorrections);
  assert.deepEqual((await entry(correctedProfile.page)).historicalReview, correctedEntry.historicalReview);
  assert.equal((await entry(correctedProfile.page)).historicalAmountNeedsReview, true);
  pass('F4 correction audit, evidence and unresolved amount warning survive real browser export and fresh-profile restore');
  await context.setOffline(false);
  await page.setViewportSize({ width: 375, height: 812 });
  await openCell(page, 'Salary');
  assert.ok(await page.locator('[name=historicalEvidence]').isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByText('Correct source for this saved entry', { exact: true }).click();
  assert.ok(await page.locator('[name=historicalAccount]').isVisible());
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: join(output, 'mobile-history-review.png') });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  pass('375px mobile editor exposes warnings and evidence control without page overflow');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await importBackup(page, createBackupSnapshot(fixture()));
  const retained = await records(page, 'plannerEntries');
  await nav(page, 'Manage'); await page.getByRole('button', { name: /Scheduled Items/ }).last().click();
  const salaryRow = () => page.locator('tbody tr').filter({ has: page.getByText('Salary', { exact: true }) });
  await salaryRow().getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Salary revised');
  await page.getByLabel('Amount', { exact: true }).fill('9000');
  await page.getByRole('button', { name: 'Save Scheduled Item', exact: true }).click();
  const revised = () => page.locator('tbody tr').filter({ has: page.getByText('Salary revised', { exact: true }) });
  await revised().getByRole('button', { name: 'Deactivate', exact: true }).click();
  await page.locator('select').filter({ has: page.locator('option[value=inactive]') }).selectOption('all');
  page.once('dialog', (dialog) => dialog.accept());
  await revised().getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForFunction(async () => {
    const request = indexedDB.open('budget-planner-db');
    return await new Promise((resolve) => { request.onsuccess = () => {
      const db = request.result; const tx = db.transaction('scheduledItems', 'readonly');
      const read = tx.objectStore('scheduledItems').get('salary'); read.onsuccess = () => resolve(!read.result);
      tx.oncomplete = () => db.close();
    }; });
  });
  const afterDelete = await records(page, 'plannerEntries');
  assert.deepEqual(afterDelete.map((value) => value.entryKey).sort(), retained.map((value) => value.entryKey).sort());
  assert.equal((await entry(page)).scheduledItemSnapshot.name, 'Salary');
  assert.equal((await entry(page)).historicalAmountNeedsReview, true);
  assert.equal((await entry(page)).historicalSourceNeedsReview, true);
  await openCell(page, 'Salary');
  assert.equal(await page.locator('[name=notes]').inputValue(), 'Retained note');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  pass('UI schedule edit/deactivate/delete preserves saved IDs, notes, original snapshot and unresolved warnings');
  const legacyProfile = await profile();
  await importBackup(legacyProfile.page, JSON.parse(await readFile(new URL('../fixtures/legacy-backup.json', import.meta.url), 'utf8')));
  await nav(legacyProfile.page, 'Settings');
  await legacyProfile.page.getByText('Historical source details need review', { exact: true }).waitFor();
  assert.equal((await entry(legacyProfile.page)).plannedAmount, 1000);
  assert.equal((await entry(legacyProfile.page)).scheduledItemSnapshot, undefined);
  pass('legacy JSON imports in a fresh real browser and warns without silently snapshotting source');
  evidence.limitations = ['Headless Chromium tests service-worker offline behavior, not OS installation/standalone app launch.',
    'Synthetic evidence only; the owner must verify real financial facts.', 'Broader multi-tab source edits and F3 Transactions historical ledger remain review limitations.'];
} catch (error) {
  evidence.error = error.stack; console.error(error); process.exitCode = 1;
} finally {
  await writeFile(join(output, 'results.json'), JSON.stringify(evidence, null, 2));
  for (const context of contexts) await context.close(); await browser.close();
  console.log(`Evidence: ${output}/results.json`);
}
