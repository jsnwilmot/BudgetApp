import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, cents, savedAmount } from '../tools/reconcile/analysis.mjs';
import { reconciliationFixture, selection } from './fixtures/reconciliation.js';
import { buildPlannerRows, buildSavingsBucketProjection } from '../src/logic/projectionLogic.js';
import { buildReportRowsFromPlannerData } from '../src/logic/reportLogic.js';
const oldKey = 'PRIVATE_OLD_SENTINEL__2026-01-02';
const currentKey = 'PRIVATE_CURRENT_SENTINEL__2026-01-02';
const deepFreeze = (x) => { if (x && typeof x==='object') { Object.values(x).forEach(deepFreeze); Object.freeze(x); } return x; };

test('offline: frozen 25/22/2 input yields 22 value pairs, 3 unmatched, separate bills and row-aware exclusion without data leakage', () => {
  const f=deepFreeze(reconciliationFixture()); const before=JSON.stringify(f); const r=analyze(f,selection);
  assert.equal(r.counts.allSavedExpenseEntries,2); assert.equal(r.counts.contributionEntries,47);
  assert.equal(r.comparison.uniqueOneToOneValuePairs,22); assert.equal(r.comparison.candidateEdges,22);
  assert.equal(r.comparison.unmatchedOrphanEntries,3); assert.equal(r.comparison.orphanOnlyDates,3);
  assert.equal(r.representation.orphanCohort.diagnosticOrphans,25); assert.equal(r.representation.orphanCohort.sourceRowMembers,0);
  assert.equal(r.representation.currentCohort.validatedSavingsEffects,22); assert.equal(r.representation.currentCohort.validatedBucketEffects,22);
  assert.equal(JSON.stringify(f),before); assert.doesNotMatch(JSON.stringify(r),/PRIVATE_|2026-|8765432|10000|CAD/);
  assert.deepEqual(analyze(f,selection),r);
});
test('offline: exact money precedence rejects coercion and excess precision without float rounding', () => {
  for(const n of [null,undefined,'',true,NaN,Infinity,'1e2','1.001',' 1.00','1,000.00']) assert.equal(cents(n),null);
  assert.equal(cents('0.10')+cents('0.20'),30n); assert.equal(cents('-0.00'),0n);
  const base={validated:true,useActual:true,plannedAmount:999,actualAmount:50};
  assert.equal(savedAmount({...base,lineItems:[{amount:'0.10'},{amount:'0.20'}]}),30n);
  assert.equal(savedAmount({...base,lineItems:[{amount:null}]}),null);
  assert.equal(savedAmount({...base,actualAmount:null}),null);
  assert.equal(savedAmount({...base,useActual:false,plannedAmount:0}),0n);
});
test('offline: conflict, ambiguity, unvalidated, missing amount and malformed audit are independent counts', () => {
  const f=reconciliationFixture(); const entries=f.data.plannerEntries;
  entries[currentKey].actualAmount=101;
  const second='PRIVATE_OLD_SENTINEL__2026-01-09';
  entries[second].payPeriodDate='2026-01-02'; // cannot create a second same-source key; use duplicate amount group via another occurrence date conflict -> invalid
  entries['PRIVATE_CURRENT_SENTINEL__2026-01-16'].validated=false;
  entries['PRIVATE_OLD_SENTINEL__2026-01-23'].actualAmount=null;
  entries['PRIVATE_OLD_SENTINEL__2026-01-30'].historicalReview={source:{evidence:' '}};
  const r=analyze(f,selection);
  assert.equal(r.comparison.conflictingDates,1); assert.equal(r.comparison.equalDateMismatchedAmountEntries,2);
  assert.equal(r.counts.unvalidatedEntries,1); assert.equal(r.counts.invalidEntries,3); assert.equal(r.counts.malformedEvidenceEntries,1);
});
test('offline: alias consistency, duplicate IDs, versions, dates and limits fail closed; legacy alias is accepted', () => {
  const f=reconciliationFixture(); f.data.planner={entries:structuredClone(f.data.plannerEntries)};
  assert.deepEqual(analyze(f,selection),analyze(reconciliationFixture(),selection));
  delete f.data.plannerEntries; assert.equal(analyze(f,selection).counts.contributionEntries,47);
  f.data.plannerEntries={}; assert.throws(()=>analyze(f,selection));
  for(const change of [g=>g.exportVersion=2,g=>g.data.accounts.push(g.data.accounts[0]),g=>g.data.settings.payFrequencyDays=0,g=>g.data.plannerEntries=Object.fromEntries(Array.from({length:5001},(_,i)=>[String(i),{}]))]) {
    const g=reconciliationFixture();change(g);assert.throws(()=>analyze(g,selection));
  }
  assert.throws(()=>analyze(reconciliationFixture(),{...selection,from:'2026-02-30'}));
  assert.throws(()=>analyze(reconciliationFixture(),{...selection,from:'2026-02-01',to:'2026-01-01'}));
});
test('offline: sibling fallback and malformed ID-bearing snapshot do not equate diagnostic orphan with exclusion', () => {
  const f=reconciliationFixture(); f.data.plannerEntries[oldKey].scheduledItemSnapshot={id:selection.orphanSource,type:'transfer',bucketId:'PRIVATE_BUCKET',active:false};
  let r=analyze(f,selection);assert.equal(r.representation.orphanCohort.diagnosticOrphans,24);assert.equal(r.representation.orphanCohort.siblingSeeded,24);assert.equal(r.representation.orphanCohort.validatedSavingsEffects,25);
  f.data.plannerEntries[oldKey].scheduledItemSnapshot.type='bad';r=analyze(f,selection);
  assert.equal(r.representation.orphanCohort.malformedSeeded,25);assert.equal(r.representation.orphanCohort.projectedSavingsEffects,0);
  assert.equal(r.counts.excludedExpenseEntries,0); // unknown type remains uncertain; never certified as transfer
});
test('offline: deleted/disabled sources retain snapshots, windows filter comparison but preserve full calculation context', () => {
  const f=reconciliationFixture(); f.data.scheduledItems[0].active=false;
  let r=analyze(f,{...selection,from:'2026-01-09',to:'2026-01-09'});assert.equal(r.comparison.uniqueOneToOneValuePairs,1);assert.equal(r.representation.currentCohort.validatedSavingsEffects,1);
  f.data.settings.payPeriodAnchorDate='2026-03-01';r=analyze(f,selection);
  assert.equal(r.representation.currentCohort.validatedSavingsEffects,22);assert.ok(r.representation.currentCohort.reportPeriodAmountEffects<22);
});
test('offline: bills are excluded even when explicitly selected and equal to savings contributions', () => {
  const r=analyze(reconciliationFixture(),{...selection,orphanSource:'PRIVATE_BILL'});
  assert.equal(r.counts.excludedExpenseEntries,2);assert.equal(r.comparison.candidateEdges,0);
});
test('offline: manual contributions, withdrawals/bills and adjustments warn, never collapse legitimate flows', () => {
  const f=reconciliationFixture();const d='2026-01-02';
  f.data.transfers=[{id:'in',transferType:'to_savings_bucket',bucketId:'PRIVATE_BUCKET',fromAccountId:'c',toAccountId:'s',payPeriodDate:d,date:d,amount:100,validated:true},
    {id:'out',transferType:'from_savings_bucket',bucketId:'PRIVATE_BUCKET',fromAccountId:'s',toAccountId:'c',payPeriodDate:d,date:d,amount:100,validated:true}];
  f.data.savingsBucketAdjustments=[{id:'a',bucketId:'PRIVATE_BUCKET',payPeriodDate:d,amount:-100}];
  const r=analyze(f,selection);assert.equal(r.overlaps.manualContributionCandidateEdges,2);assert.equal(r.overlaps.withdrawalBillCandidateEdges,1);assert.equal(r.overlaps.withdrawalAdjustmentCandidateEdges,1);assert.equal(r.overlaps.contributionAdjustmentCandidateEdges,2);assert.equal(r.counts.allSavedExpenseEntries,2);
});
test('offline: raw malformed entries report invalidity, calculation unavailability never masquerades as zero inclusion', () => {
  const f=reconciliationFixture();f.data.plannerEntries[oldKey]=null;
  const r=analyze(f,selection);assert.equal(r.counts.invalidEntries,1);assert.equal(r.representationAvailable,false);assert.equal(r.representation.currentCohort.validatedSavingsEffects,null);
});
test('offline synthetic-only impact illustration uses unchanged shared calculators, never real-data repair scenarios', () => {
  const original=reconciliationFixture(); const before=JSON.stringify(original);
  const summarize=(f)=>{const p=buildPlannerRows(f.data);const d='2026-06-19';return {s:p.projectionRows.find(r=>r.id==='validated-savings').amountsByPeriod[d],b:buildSavingsBucketProjection({...f.data,...p,today:d})[0].currentValidatedBalance,e:buildReportRowsFromPlannerData(p).reduce((s,r)=>s+r.expenses,0)};};
  const represented=structuredClone(original);
  for(const entry of Object.values(represented.data.plannerEntries).filter(e=>e.scheduledItemId===selection.orphanSource)) entry.scheduledItemSnapshot={id:selection.orphanSource,type:'transfer',bucketId:'PRIVATE_BUCKET',active:false};
  assert.deepEqual(summarize(original),{s:2200,b:2200,e:200});assert.deepEqual(summarize(represented),{s:4700,b:4700,e:200});assert.equal(JSON.stringify(original),before);
});

test('offline: explicit multi-source cohorts expose ambiguous components without greedy pairing; unequal currencies never match', () => {
  const f=reconciliationFixture();const entry=f.data.plannerEntries[oldKey];
  f.data.plannerEntries['additional__2026-01-02']={...entry,entryKey:'additional__2026-01-02',scheduledItemId:'additional'};
  let r=analyze(f,{...selection,orphanSource:[selection.orphanSource,'additional']});
  assert.equal(r.comparison.ambiguousComponents,1);assert.equal(r.comparison.ambiguousEntries,3);assert.equal(r.comparison.candidateEdges,23);assert.equal(r.comparison.uniqueOneToOneValuePairs,21);
  f.data.plannerEntries[currentKey].currency='USD';r=analyze(f,selection);assert.equal(r.counts.currencyConflictEntries,1);assert.equal(r.comparison.candidateEdges,21);
  f.data.settings.currency='JPY';assert.throws(()=>analyze(f,selection));
});
test('offline: missing bucket allocation, future entry and conflicting snapshot identity produce distinct representation counts', () => {
  const f=reconciliationFixture();f.data.scheduledItems[0].bucketId='unknown';
  let r=analyze(f,selection);assert.equal(r.representation.currentCohort.validatedSavingsEffects,22);assert.equal(r.representation.currentCohort.validatedBucketEffects,0);
  f.data.settings.projectionMonths=3;r=analyze(f,selection);assert.ok(r.representation.currentCohort.outsideCalculationWindow>0);
  f.data.plannerEntries[currentKey].scheduledItemSnapshot={id:'other',type:'transfer'};
  r=analyze(f,selection);assert.equal(r.representation.currentCohort.uncertainAttribution,1);
});
test('offline: malformed unselected data suppresses calculation claims; prototype-like IDs never become output keys', () => {
  const f=reconciliationFixture();f.data.plannerEntries['__proto____2026-01-02']={scheduledItemId:'__proto__',plannedAmount:100,useActual:false,validated:true};
  const report=analyze(f,{...selection,orphanSource:'__proto__'});assert.equal(report.counts.orphanCohortEntries,1);assert.doesNotMatch(JSON.stringify(report),/__proto__/);
  f.data.plannerEntries[oldKey].lineItems='bad';const r=analyze(f,selection);assert.equal(r.counts.invalidEntries,1);
});
test('offline: account-only funding withdrawal and direct-payment adjustment are potential overlaps, not contribution duplicates', () => {
  const f=reconciliationFixture();const d='2026-01-02';f.data.transfers=[{id:'funding',transferType:'account_transfer',fromAccountId:'s',toAccountId:'c',amount:100,payPeriodDate:d}];
  f.data.savingsBucketAdjustments=[{id:'release',amount:-100,bucketId:'PRIVATE_BUCKET',payPeriodDate:d}];
  const r=analyze(f,selection);assert.equal(r.overlaps.withdrawalBillCandidateEdges,1);assert.equal(r.overlaps.billAdjustmentCandidateEdges,1);assert.equal(r.overlaps.manualContributionCandidateEdges,0);assert.equal(r.comparison.candidateEdges,22);
});

test('offline: malformed keys are still inventoried via explicit stored source identity, without rewriting identity', () => {
  const f=reconciliationFixture();const bad={...f.data.plannerEntries[oldKey],entryKey:'malformed'};
  f.data.plannerEntries.malformed=bad;
  const r=analyze(f,selection);assert.equal(r.counts.selectedEntries,48);assert.equal(r.counts.invalidEntries,1);assert.equal(r.counts.allInvalidEntries,1);assert.equal(r.comparison.candidateEdges,22);
  assert.equal(f.data.plannerEntries.malformed.entryKey,'malformed');
});
