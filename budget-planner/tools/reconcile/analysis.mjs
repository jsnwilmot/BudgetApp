import { isDeepStrictEqual } from 'node:util';
import { buildPlannerRows } from '../../src/logic/projectionLogic.js';
import { getHistoricalItems, getPeriodRow } from '../../src/logic/plannerHistory.js';
import { inspectHistoricalEntry } from '../../src/logic/historicalIntegrity.js';
import { parseLocalDate } from '../../src/logic/dateLogic.js';

const plain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const dateOK = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseLocalDate(s).getTime()) && s >= '1900-01-01' && s <= '2100-12-31';
// No rounding, binary arithmetic or null/blank coercion in candidate comparison.
export function cents(value) {
  if (!['number', 'string'].includes(typeof value)) return null;
  const s = String(value);
  if (!/^-?\d{1,10}(?:\.\d{1,2})?$/.test(s)) return null;
  const negative = s.startsWith('-'); const [whole, fraction = ''] = s.replace(/^-/, '').split('.');
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  return negative ? -result : result;
}
export function savedAmount(entry) {
  if (!plain(entry) || typeof entry.validated !== 'boolean' || typeof entry.useActual !== 'boolean') return null;
  if (entry.lineItems != null && !Array.isArray(entry.lineItems)) return null;
  if (entry.lineItems?.length) {
    let total = 0n;
    for (const line of entry.lineItems) { const n = plain(line) ? cents(line.amount) : null; if (n === null) return null; total += n; }
    return total;
  }
  return cents(entry.useActual ? entry.actualAmount : entry.plannedAmount);
}
function unpack(input) {
  if (!plain(input)) throw new Error();
  if (input.exportVersion != null && input.exportVersion !== 1) throw new Error();
  if (input.schemaVersion != null && ![1, 2].includes(input.schemaVersion)) throw new Error();
  const data = plain(input.data) ? input.data : input;
  if (data.plannerEntries && data.planner?.entries && !isDeepStrictEqual(data.plannerEntries, data.planner.entries)) throw new Error();
  const entries = data.plannerEntries ?? data.planner?.entries;
  if (!plain(entries) || !plain(data.settings)) throw new Error();
  const copy = structuredClone({ ...data, plannerEntries: entries });
  for (const name of ['accounts', 'categories', 'scheduledItems', 'savingsBuckets', 'transfers', 'manualAdjustments', 'savingsBucketAdjustments']) {
    if (copy[name] === undefined) copy[name] = [];
    if (!Array.isArray(copy[name]) || copy[name].length > 2000 || copy[name].some((v) => !plain(v) || typeof v.id !== 'string' || !v.id)) throw new Error();
    if (new Set(copy[name].map((v) => v.id)).size !== copy[name].length) throw new Error();
  }
  if (Object.keys(entries).length > 5000 || !dateOK(copy.settings.payPeriodAnchorDate) || ![7,14,28,30].includes(copy.settings.payFrequencyDays) || ![3,6,12,18,24].includes(copy.settings.projectionMonths)) throw new Error();
  if (!['CAD','USD','EUR','GBP','AUD','NZD','CHF'].includes(copy.settings.currency)) throw new Error();
  return copy;
}
function compare(old, current) {
  const eligible = (r) => !r.invalid && r.validated && !r.unresolvedAmount && r.amount > 0n;
  const a = old.filter(eligible); const b = current.filter(eligible);
  let candidateEdges = 0, uniquePairs = 0, ambiguousComponents = 0, ambiguousEntries = 0;
  const matched = new Set();
  for (const token of new Set(a.map((r) => `${r.date}:${r.amount}`))) {
    const left = a.filter((r) => `${r.date}:${r.amount}` === token); const right = b.filter((r) => `${r.date}:${r.amount}` === token);
    if (!right.length) continue;
    candidateEdges += left.length * right.length;
    [...left, ...right].forEach((r) => matched.add(r));
    if (left.length === 1 && right.length === 1) uniquePairs++;
    else { ambiguousComponents++; ambiguousEntries += left.length + right.length; }
  }
  const onlyDates = (left, right) => new Set(left.filter((r) => !right.some((s) => s.date === r.date)).map((r) => r.date)).size;
  const conflicts = [...a, ...b].filter((r) => !matched.has(r) && (a.includes(r) ? b : a).some((s) => s.date === r.date));
  return { candidateEdges, uniqueOneToOneValuePairs: uniquePairs, ambiguousComponents, ambiguousEntries,
    unmatchedOrphanEntries: a.filter((r) => !matched.has(r)).length, unmatchedCurrentEntries: b.filter((r) => !matched.has(r)).length,
    equalDateMismatchedAmountEntries: conflicts.length, conflictingDates: new Set(conflicts.map((r) => r.date)).size,
    orphanOnlyDates: onlyDates(old, current), currentOnlyDates: onlyDates(current, old) };
}
function representations(rows, data, planner, sources) {
  const result = { stored: rows.length, diagnosticOrphans: 0, sourceRowMembers: 0, siblingSeeded: 0, malformedSeeded: 0,
    inCalculationWindow: 0, outsideCalculationWindow: 0, projectedAccountEffects: 0, validatedAccountEffects: 0,
    projectedSavingsEffects: 0, validatedSavingsEffects: 0, projectedBucketEffects: 0, validatedBucketEffects: 0,
    reportPeriodAmountEffects: 0, reportSavingsActivityEffects: 0, reportCumulativeBalanceEffects: 0, uncertainAttribution: 0, calculatorAmountDisagreements: 0 };
  for (const entry of rows) {
    if (entry.inspection.orphan) result.diagnosticOrphans++;
    const source = sources.find((s) => s.id === entry.sourceId);
    if (source && !data.scheduledItems.some((s) => s.id === source.id)) {
      if (!entry.raw.scheduledItemSnapshot) result.siblingSeeded++;
      if (!['income','expense','transfer','savings','debt','general'].includes(source.type)) result.malformedSeeded++;
    }
    const row = planner?.rows.find((r) => r.id === entry.sourceId);
    if (!row) continue;
    result.sourceRowMembers++;
    if (!planner.calculationPeriods.some((p) => p.date === entry.date)) { result.outsideCalculationWindow++; continue; }
    result.inCalculationWindow++;
    const resolved = getPeriodRow(row, entry.date); const amount = row.amountsByPeriod[entry.date];
    if (resolved.item.id !== entry.sourceId || !Number.isFinite(amount)) { result.uncertainAttribution++; continue; }
    if (entry.amount !== null && cents(amount) !== entry.amount) result.calculatorAmountDisagreements++;
    if (!amount) continue;
    const type = data.accounts.find((a) => a.id === resolved.accountId)?.type;
    const accountEffect = resolved.type === 'transfer' || !type || ['chequing','savings'].includes(type);
    const savingsEffect = resolved.type === 'transfer' || type === 'savings';
    const bucketEffect = resolved.type === 'transfer' && data.savingsBuckets.some((b) => b.id === resolved.item.bucketId);
    if (accountEffect) { result.projectedAccountEffects++; if (entry.raw.validated) result.validatedAccountEffects++; }
    if (savingsEffect) { result.projectedSavingsEffects++; if (entry.raw.validated) result.validatedSavingsEffects++; }
    if (bucketEffect) { result.projectedBucketEffects++; if (entry.raw.validated) result.validatedBucketEffects++; }
    if (resolved.type === 'transfer' || !type || type === 'chequing') result.reportCumulativeBalanceEffects++;
    if (planner.payPeriods.some((p) => p.date === entry.date)) {
      result.reportPeriodAmountEffects++;
      if (resolved.type === 'transfer' && (resolved.item.bucketId || data.accounts.some((a) => a.id === resolved.item.toAccountId && a.type === 'savings'))) result.reportSavingsActivityEffects++;
    }
  }
  if (!planner) {
    for (const key of Object.keys(result)) {
      if (!['stored','diagnosticOrphans','siblingSeeded','malformedSeeded'].includes(key)) result[key] = null;
    }
  }
  return result;
}

// Only fixed keys/codes and counts leave this function. No records, amounts, dates or IDs.
export function analyze(input, options) {
  const data = unpack(input);
  const orphanIds = Array.isArray(options?.orphanSource) ? options.orphanSource : [options?.orphanSource];
  const currentIds = Array.isArray(options?.currentSource) ? options.currentSource : [options?.currentSource];
  const ids = [...orphanIds, ...currentIds];
  if (!orphanIds.length || !currentIds.length || ids.some((s) => typeof s !== 'string' || !s) || new Set(ids).size !== ids.length ||
    (options.from && !dateOK(options.from)) || (options.to && !dateOK(options.to)) || (options.from && options.to && options.from > options.to)) throw new Error();
  const sources = getHistoricalItems(data.scheduledItems, Object.fromEntries(Object.entries(data.plannerEntries).filter(([, v]) => plain(v))));
  if (sources.length * (Object.keys(data.plannerEntries).length + 120) > 2000000) throw new Error();
  const all = Object.entries(data.plannerEntries).map(([key, raw]) => {
    const boundary = key.lastIndexOf('__'); const sourceId = key.slice(0, boundary); const date = key.slice(boundary + 2);
    const entry = plain(raw) ? raw : {};
    const inspection = inspectHistoricalEntry(key, entry, data);
    const source = entry.scheduledItemSnapshot || sources.find((s) => s.id === sourceId);
    const amount = savedAmount(entry);
    const auditInvalid = (entry.historicalReview != null && !plain(entry.historicalReview)) ||
      (entry.historicalReview?.source != null && (!plain(entry.historicalReview.source) || typeof entry.historicalReview.source.evidence !== 'string' || !entry.historicalReview.source.evidence.trim())) ||
      (entry.historicalSourceCorrections != null && (!Array.isArray(entry.historicalSourceCorrections) || entry.historicalSourceCorrections.some((a) => !plain(a) || typeof a.evidence !== 'string' || !a.evidence.trim())));
    const currencyConflict = [entry.currency, source?.currency].some((c) => c != null && c !== data.settings.currency);
    const invalid = currencyConflict || !plain(raw) || !dateOK(date) || amount === null || auditInvalid || inspection.integrityIssues.some((i) => ['key_invalid','key_conflict','source_conflict','date_conflict'].includes(i.code));
    const cohortId = ids.includes(sourceId) ? sourceId : ids.includes(entry.scheduledItemId) ? entry.scheduledItemId : sourceId;
    return { sourceId, cohortId, date, currencyConflict, raw: entry, inspection, amount, invalid, auditInvalid, validated: entry.validated === true,
      unresolvedAmount: Boolean(entry.historicalAmountNeedsReview), source,
      expense: ['expense','debt','general'].includes(source?.type),
      uncertain: !['transfer','savings'].includes(source?.type) || inspection.sourceNeedsReview || inspection.integrityIssues.length > 0 };
  });
  const selected = all.filter((r) => ids.includes(r.cohortId) &&
    (!dateOK(r.date) || ((!options.from || r.date >= options.from) && (!options.to || r.date <= options.to))));
  const contribution = selected.filter((r) => !r.expense && r.source?.type !== 'income');
  const old = contribution.filter((r) => orphanIds.includes(r.cohortId)); const current = contribution.filter((r) => currentIds.includes(r.cohortId));
  let planner = null;
  try { planner = buildPlannerRows(data); } catch { /* Raw malformed data remains reported; no normalized repair or invented totals. */ }
  let referenceMismatchCandidateEdges = 0;
  for (const a of old) for (const b of current) {
    if (!a.invalid && !b.invalid && a.validated && b.validated && a.amount > 0n && a.amount === b.amount && a.date === b.date &&
      ['accountId','bucketId','savingsBucketId'].some((key) => a.source?.[key] && b.source?.[key] && a.source[key] !== b.source[key])) referenceMismatchCandidateEdges++;
  }
  const counts = { allSavedEntries: all.length, allInvalidEntries: all.filter((r) => r.invalid).length, referenceMismatchCandidateEdges, selectedEntries: selected.length, excludedExpenseEntries: selected.filter((r) => r.expense).length,
    allSavedExpenseEntries: all.filter((r) => r.expense).length, excludedIncomeEntries: selected.filter((r) => r.source?.type === 'income').length,
    contributionEntries: contribution.length, orphanCohortEntries: old.length, currentCohortEntries: current.length,
    currencyConflictEntries: selected.filter((r) => r.currencyConflict).length,
    invalidEntries: contribution.filter((r) => r.invalid).length, malformedEvidenceEntries: selected.filter((r) => r.auditInvalid).length,
    unvalidatedEntries: contribution.filter((r) => !r.validated).length, unresolvedAmountEntries: contribution.filter((r) => r.unresolvedAmount).length,
    nonPositiveEntries: contribution.filter((r) => r.amount !== null && r.amount <= 0n).length,
    uncertainClassificationEntries: contribution.filter((r) => r.uncertain).length,
    referenceProblemEntries: selected.filter((r) => r.inspection.integrityIssues.some((i) => /account|bucket|category/.test(i.code))).length };
  const overlaps = { manualContributionCandidateEdges: 0, withdrawalBillCandidateEdges: 0, withdrawalAdjustmentCandidateEdges: 0,
    contributionAdjustmentCandidateEdges: 0, billAdjustmentCandidateEdges: 0, directionMismatchTransfers: 0, invalidMovementRecords: 0, missingMovementReferences: 0, unvalidatedManualTransfers: 0 };
  const compatible = (a,b) => !a || !b || a === b;
  const inWindow = (date) => !dateOK(date) || ((!options.from || date >= options.from) && (!options.to || date <= options.to));
  const bills = all.filter((r) => r.expense && !r.invalid && r.validated && inWindow(r.date));
  for (const t of data.transfers) {
    if (!inWindow(t.payPeriodDate)) continue;
    const amount = cents(t.amount); const date = t.payPeriodDate;
    if (amount === null || amount <= 0n || !dateOK(date)) { overlaps.invalidMovementRecords++; continue; }
    if (!data.accounts.some((a) => a.id === t.fromAccountId) || !data.accounts.some((a) => a.id === t.toAccountId) ||
      (t.bucketId && !data.savingsBuckets.some((b) => b.id === t.bucketId))) overlaps.missingMovementReferences++;
    const fromType = data.accounts.find((a) => a.id === t.fromAccountId)?.type;
    const toType = data.accounts.find((a) => a.id === t.toAccountId)?.type;
    if ((t.transferType === 'from_savings_bucket' && (fromType !== 'savings' || toType !== 'chequing')) ||
        (t.transferType === 'to_savings_bucket' && (fromType !== 'chequing' || toType !== 'savings'))) overlaps.directionMismatchTransfers++;
    if (t.validated !== true) overlaps.unvalidatedManualTransfers++;
    if (t.transferType === 'to_savings_bucket') overlaps.manualContributionCandidateEdges += contribution.filter((r) => !r.invalid && r.validated && r.date === date && r.amount === amount && compatible(r.source?.bucketId || r.source?.savingsBucketId,t.bucketId)).length;
    if (t.transferType === 'from_savings_bucket' || (fromType === 'savings' && toType === 'chequing')) {
      overlaps.withdrawalBillCandidateEdges += bills.filter((r) => r.date === date && r.amount === amount).length;
      overlaps.withdrawalAdjustmentCandidateEdges += data.savingsBucketAdjustments.filter((a) => a.payPeriodDate === date && cents(a.amount) === -amount && compatible(a.bucketId,t.bucketId)).length;
    }
  }
  for (const a of [...data.savingsBucketAdjustments, ...data.manualAdjustments]) {
    if (!inWindow(a.payPeriodDate)) continue;
    const amount = cents(a.amount);
    if (amount === null || !dateOK(a.payPeriodDate)) { overlaps.invalidMovementRecords++; continue; }
    if ((a.accountId && !data.accounts.some((v) => v.id === a.accountId)) || (a.bucketId && !data.savingsBuckets.some((v) => v.id === a.bucketId))) overlaps.missingMovementReferences++;
    overlaps.billAdjustmentCandidateEdges += bills.filter((r) => r.date === a.payPeriodDate && (r.amount === amount || r.amount === -amount)).length;
    overlaps.contributionAdjustmentCandidateEdges += contribution.filter((r) => !r.invalid && r.validated && r.date === a.payPeriodDate && (r.amount === amount || r.amount === -amount)).length;
  }
  const warnings = ['CANDIDATES_NOT_CONFIRMED_DUPLICATES','BILL_EXPENSES_ARE_SEPARATE','ORIGINAL_EVIDENCE_AND_BASELINE_REVIEW_REQUIRED',
    'UNKNOWN_CLASSIFICATION_NOT_CERTIFIED','REPORT_VIEWS_HAVE_DIFFERENT_COVERAGE','MANUAL_REPORT_MOVEMENT_NOT_VALIDATED_BALANCE','NO_CORRECTIONS_PERFORMED'];
  if (!planner) warnings.push('CALCULATION_UNAVAILABLE_FOR_RAW_INPUT');
  if (!old.length || !current.length) warnings.push('SELECTED_COHORT_EMPTY_OR_NON_CONTRIBUTION');
  if (counts.referenceProblemEntries) warnings.push('BROKEN_REFERENCES_DO_NOT_PROVE_EXCLUSION');
  return { reportVersion: 1, counts, comparison: compare(old,current), representationAvailable: Boolean(planner),
    representation: { orphanCohort: representations(old,data,planner,sources), currentCohort: representations(current,data,planner,sources) }, overlaps, warnings };
}
