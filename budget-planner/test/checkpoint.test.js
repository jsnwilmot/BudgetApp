import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateCheckpoint,previewCheckpoint} from '../experimental/checkpoint/ledger.js';
const cp=()=>({id:'synthetic-checkpoint',date:'2026-12-30',timeZone:'America/Edmonton',originalAnchor:'2026-12-16',frequencyDays:14,currency:'CAD',verified:true,basis:'posted',evidenceRef:'synthetic-statement',accounts:[
  {id:'C',type:'chequing',currency:'CAD',openingMinor:'200000',verified:true,evidenceRef:'c'},
  {id:'C2',type:'chequing',currency:'CAD',openingMinor:'50000',active:false,verified:true,evidenceRef:'c2'},
  {id:'S',type:'savings',currency:'CAD',openingMinor:'300000',verified:true,evidenceRef:'s'},
  {id:'S2',type:'savings',currency:'CAD',openingMinor:'10000',verified:true,evidenceRef:'s2'}],
  buckets:[{id:'tax',accountId:'S',openingMinor:'120000',verified:true,evidenceRef:'t'},{id:'emergency',accountId:'S',openingMinor:'150000',verified:true,evidenceRef:'e'},{id:'other',accountId:'S2',openingMinor:'5000',verified:true,evidenceRef:'o'}],unallocated:[{accountId:'S',amountMinor:'30000'},{accountId:'S2',amountMinor:'5000'}]});
const event=(id,kind,amountMinor,fields={})=>{
 const value={id,kind,amountMinor,origin:{kind:'scheduled',id,revision:'v1'},currency:'CAD',accountingDate:'2026-12-30',assignedDate:'2026-12-30',validated:true,settlement:'posted',sequence:0,...fields};
 if(value.origin.kind==='scheduled') value.origin.occurrenceId=`${value.origin.id}__${value.assignedDate}`;
 return value;
};
const fixture=()=>({checkpoint:cp(),throughDate:'2027-01-13',legacyContext:{validated:true,notes:'retain',marker:'old-key',audit:[{evidence:'old'}]},events:[
 event('old','contribution','999',{accountingDate:'2026-12-16',assignedDate:'2026-12-16'}),
 event('salary','income','100000',{toAccountId:'C',sequence:1}),
 event('save','contribution','10000',{fromAccountId:'C',toAccountId:'S',bucketId:'tax',sequence:2}),
 event('fund','withdrawal','60000',{accountingDate:'2026-12-31',fromAccountId:'S',toAccountId:'C',bucketId:'tax'}),
 event('bill','expense','60000',{accountingDate:'2027-01-02',fromAccountId:'C'}),
 event('future','contribution','15000',{accountingDate:'2027-01-13',fromAccountId:'C',toAccountId:'S',bucketId:'tax',validated:false,settlement:'forecast'})]});
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
const result=f=>{const r=calculateCheckpoint(f);assert.equal(r.ok,true,JSON.stringify(r));return r;};
const blocked=(f,code)=>{const r=calculateCheckpoint(f);assert.equal(r.ok,false);assert.equal(r.diagnostics[0].code,code);assert.equal(r.validated,undefined);assert.equal(r.ledger,undefined);};

test('checkpoint: independent multi-account ledger, tax funding and actual bill, exact reserves and forecast',()=>{
 const f=freeze(fixture()),before=JSON.stringify(f),r=result(f);
 assert.deepEqual(r.validated.accounts,{C:'290000',C2:'50000',S:'250000',S2:'10000'});
 assert.deepEqual(r.projected.accounts,{C:'275000',C2:'50000',S:'265000',S2:'10000'});
 assert.deepEqual(r.validated.buckets,{tax:'70000',emergency:'150000',other:'5000'});
 assert.deepEqual(r.projected.buckets,{tax:'85000',emergency:'150000',other:'5000'});
 assert.deepEqual(r.validated.unallocated,{S:'30000',S2:'5000'});
 assert.deepEqual(r.validated.aggregate,{chequing:'340000',savings:'260000',cash:'600000'});
 assert.equal(r.monthlyReports.find(m=>m.month==='2027-01').validated.expense,'60000');
 assert.equal(r.monthlyReports[0].partialPeriod,true);assert.equal(r.excluded[0].reason,'legacy');
 assert.equal(JSON.stringify(f),before);assert.deepEqual(result(f),r);
 const reference={validated:r.validated,projected:r.projected};reference.projected.accounts.C='274999';
 const preview=previewCheckpoint(f,reference);assert.equal(preview.differences.projected.accounts.C,'1');
});
test('checkpoint: opening is not income, assets exclude bucket duplication; input order does not change explicit sequence',()=>{
 const f=fixture();f.events=[];const r=result(f);assert.equal(r.validated.aggregate.cash,'560000');assert.deepEqual(r.monthlyReports,[]);
 const g=fixture();const baseline=result(g);g.events.reverse();assert.deepEqual(result(g).validated,baseline.validated);
});
test('checkpoint: T-1/T/T+1 and explicit carry/already-opening decisions preserve original dates and validation',()=>{
 const f=fixture();f.events=[event('carry','expense','100',{assignedDate:'2026-12-16',accountingDate:'2026-12-31',fromAccountId:'C'})];
 blocked(f,'BOUNDARY_DECISION_REQUIRED');f.boundaryDecisions=[{eventId:'carry',revision:'v1',kind:'carry-forward',evidenceRef:'s'}];assert.equal(result(f).validated.accounts.C,'199900');
 f.events=[event('included','income','100',{accountingDate:'2026-12-29',toAccountId:'C'})];f.boundaryDecisions=[];blocked(f,'BOUNDARY_DECISION_REQUIRED');
 f.boundaryDecisions=[{eventId:'included',revision:'v1',kind:'already-in-opening',evidenceRef:'s'}];assert.equal(result(f).ledger.length,0);
 f.boundaryDecisions[0].revision='stale';blocked(f,'INVALID_BOUNDARY_DECISION');
});
test('checkpoint: scheduled/manual same-value candidates require explicit evidence, never merge bill expenses',()=>{
 const f=fixture();const a=f.events[2];const b={...a,id:'manual',origin:{kind:'manual',id:'manual',revision:'v1'},sequence:3};f.events.push(b);blocked(f,'REPRESENTATION_DECISION_REQUIRED');
 f.representationPolicies=[{eventIds:['save','manual'],decision:'distinct',evidenceRef:'two bank movements'}];assert.equal(result(f).validated.accounts.S,'260000');
 f.representationPolicies=[{eventIds:['save','manual'],decision:'representative',representativeId:'manual',evidenceRef:'same movement'}];assert.equal(result(f).validated.accounts.S,'250000');assert.equal(result(f).excluded.at(-1).id,'save');
 b.kind='expense';b.fromAccountId='C';delete b.toAccountId;delete b.bucketId;f.representationPolicies=[];assert.equal(result(f).monthlyReports[0].validated.expense,'10000');
});
test('checkpoint: shared movement claims, overlapping/invalid policy and duplicate identity block',()=>{
 const f=fixture();f.events[1].movementId='bank1';f.events[2].movementId='bank1';blocked(f,'REPRESENTATION_DECISION_REQUIRED');
 f.representationPolicies=[{eventIds:['salary','save'],decision:'representative',representativeId:'save',evidenceRef:'s'}];blocked(f,'INCOMPATIBLE_REPRESENTATION');
 const g=fixture();g.events.push({...g.events[1],id:'other'});blocked(g,'DUPLICATE_ORIGIN');
 const h=fixture();h.events.push(h.events[1]);blocked(h,'DUPLICATE_OR_INVALID_ID');
});
test('checkpoint: direct savings bill releases allocation once, release/reallocation never move bank cash',()=>{
 const f=fixture();f.events=[event('direct','expense','60000',{fromAccountId:'S',bucketId:'tax'}),event('release','release','1000',{bucketId:'tax',sequence:1}),event('allocate','allocation','500',{bucketId:'tax',sequence:2}),event('reclass','reallocation','500',{bucketId:'tax',toBucketId:'emergency',sequence:3})];
 const r=result(f);assert.equal(r.validated.accounts.S,'240000');assert.equal(r.validated.buckets.tax,'59000');assert.equal(r.validated.buckets.emergency,'150500');assert.equal(r.validated.unallocated.S,'30500');
 assert.equal(r.ledger[1].legs.bank.length,0);assert.equal(r.monthlyReports[0].validated.expense,'60000');
});
test('checkpoint: cross-account bucket routing and unknown post-T references block',()=>{
 for(const fields of [{toAccountId:'missing'},{bucketId:'other'},{fromAccountId:'S'}]){const f=fixture();Object.assign(f.events[2],fields);blocked(f,fields.bucketId?'INVALID_EVENT_BUCKET':'INVALID_EVENT_ACCOUNT');}
 const f=fixture();f.checkpoint.buckets[0].accountId='C';blocked(f,'INVALID_BUCKET');
});
test('checkpoint: exact integer money rejects floats, exponents, mixed currency, null, partial settlement and unverified opening',()=>{
 for(const value of [1,'1.1','1e2','01',null,'-0']){const f=fixture();f.events[1].amountMinor=value;blocked(f,'INVALID_EVENT_MONEY_OR_KIND');}
 const f=fixture();f.events[1].currency='USD';blocked(f,'INVALID_EVENT_MONEY_OR_KIND');
 const g=fixture();g.events[1].settlement='partial';blocked(g,'UNKNOWN_SETTLEMENT');
 const h=fixture();h.checkpoint.verified=false;blocked(h,'UNVERIFIED_CHECKPOINT');
});
test('checkpoint: opening allocation mismatch, zero and negative policies fail closed',()=>{
 const f=fixture();f.checkpoint.unallocated[0].amountMinor='0';blocked(f,'ALLOCATION_MISMATCH');
 const g=fixture();g.checkpoint.accounts[0].openingMinor='-1';blocked(g,'NEGATIVE_ACCOUNT');g.checkpoint.accounts[0].allowOverdraft=true;g.events=[];assert.equal(result(g).validated.accounts.C,'-1');
 const h=fixture();h.events=[event('too much','withdrawal','120001',{fromAccountId:'S',toAccountId:'C',bucketId:'tax'})];blocked(h,'NEGATIVE_BUCKET');
});
test('checkpoint: cadence, IANA zone, original IDs and 2026/2027/2028/DST/off-grid report dates',()=>{
 const f=fixture();f.throughDate='2028-12-30';f.events.push(event('leap','income','1',{accountingDate:'2028-02-29',toAccountId:'C'}),event('dst','income','1',{accountingDate:'2027-03-14',toAccountId:'C'}));const r=result(f);assert.equal(r.validated.accounts.C,'290002');assert.equal(r.monthlyReports.find(m=>m.month==='2028-02').validated.income,'1');assert.deepEqual(r.cadence,{originalAnchor:'2026-12-16',frequencyDays:14,timeZone:'America/Edmonton'});
 const g=fixture();g.checkpoint.date='2026-12-31';blocked(g,'OFF_CADENCE_CHECKPOINT');g.checkpoint.date='2026-12-30';g.checkpoint.timeZone='bad';blocked(g,'INVALID_ZONE');
});
test('checkpoint: no implicit intraday ordering, future incomplete routing blocks and strict reference preview',()=>{
 const f=fixture();f.events[2].sequence=1;blocked(f,'AMBIGUOUS_EVENT_ORDER');delete f.events[2].sequence;blocked(f,'EXPLICIT_SEQUENCE_REQUIRED');
 const g=fixture();g.events[5].accountingDate='2029-01-01';g.events[5].toAccountId='unknown';blocked(g,'INVALID_EVENT_ACCOUNT');
 assert.equal(previewCheckpoint(fixture(),{}).ok,false);
});

test('checkpoint: covered opening and forward record cannot both claim the same movement',()=>{
 const f=fixture();const a={...f.events[2],id:'covered',origin:{kind:'manual',id:'covered',revision:'v1'},accountingDate:'2026-12-29',movementId:'one'};f.events[2].movementId='one';f.events.push(a);
 f.boundaryDecisions=[{eventId:'covered',revision:'v1',kind:'already-in-opening',evidenceRef:'s'}];blocked(f,'OPENING_REPRESENTATION_CONFLICT');
 f.boundaryDecisions.push({eventId:'save',revision:'v1',kind:'already-in-opening',evidenceRef:'s'});blocked(f,'OPENING_DATE_CONFLICT');f.events[2].accountingDate='2026-12-29';assert.equal(result(f).validated.accounts.S,'240000');
});
test('checkpoint: original prospective source revisions remain untouched; inactive accounts and tiny money remain exact',()=>{
 const f=fixture();f.events=[event('tiny','income','1',{toAccountId:'C2'})];const before=JSON.stringify(f);assert.equal(result(f).validated.accounts.C2,'50001');assert.equal(JSON.stringify(f),before);
 f.events[0].origin.revision='future-explicit-v2';assert.equal(result(f).ledger[0].origin.revision,'future-explicit-v2');
});

test('checkpoint: already-in-opening decisions cannot conceal invalid post-boundary routing or unknown money',()=>{
 const f=fixture();f.boundaryDecisions=[{eventId:'save',revision:'v1',kind:'already-in-opening',evidenceRef:'s'}];f.events[2].toAccountId='missing';blocked(f,'INVALID_EVENT_ACCOUNT');
 const g=fixture();g.events[1].movementId=42;blocked(g,'INVALID_EVENT_MONEY_OR_KIND');
 const h=fixture();h.checkpoint.unallocated=[];blocked(h,'MISSING_UNALLOCATED');
 const i=fixture();i.events[1].validated=true;i.events[1].settlement='forecast';blocked(i,'UNKNOWN_SETTLEMENT');
 const j=fixture();j.events[5].accountingDate='2028-02-30';blocked(j,'UNKNOWN_EVENT_DATE');
});

test('F1: neutral transfers C→C2, S→S2, C→S and S→C follow independent exact bank ledger without reserve changes',()=>{
 const f=fixture();f.events=[
  event('cc','account_transfer','10000',{fromAccountId:'C',toAccountId:'C2',sequence:0}),
  event('ss','account_transfer','2000',{fromAccountId:'S',toAccountId:'S2',sequence:1}),
  event('cs','account_transfer','3000',{fromAccountId:'C',toAccountId:'S',sequence:2}),
  event('sc','account_transfer','1000',{fromAccountId:'S2',toAccountId:'C',sequence:3})];
 const before=JSON.stringify(f),r=result(f);
 assert.deepEqual(r.validated.accounts,{C:'188000',C2:'60000',S:'301000',S2:'11000'});
 assert.deepEqual(r.validated.buckets,{tax:'120000',emergency:'150000',other:'5000'});
 assert.deepEqual(r.validated.unallocated,{S:'31000',S2:'6000'});
 assert.equal(r.validated.aggregate.cash,'560000');assert.deepEqual(r.projected,r.validated);
 for(const row of r.ledger){assert.equal(row.legs.bank.length,2);assert.equal(BigInt(row.legs.bank[0].amountMinor)+BigInt(row.legs.bank[1].amountMinor),0n);assert.deepEqual(row.legs.reserve,[]);}
 assert.deepEqual(r.monthlyReports[0].validated,{account_transfer:'16000'});assert.equal(JSON.stringify(f),before);
});
test('F1: transfers reject self/unknown/bucket routes and cannot spend reserved savings or an overdraft facility',()=>{
 for(const [from,to,amount,code] of [['C','C','1','SELF_TRANSFER'],['missing','S','1','INVALID_EVENT_ACCOUNT'],['S','missing','1','INVALID_EVENT_ACCOUNT'],['S','C','30001','INSUFFICIENT_TRANSFER_FUNDS'],['S2','S','5001','INSUFFICIENT_TRANSFER_FUNDS'],['C','C2','200001','INSUFFICIENT_TRANSFER_FUNDS']]) {
  const f=fixture();f.checkpoint.accounts[0].allowOverdraft=true;f.events=[event('transfer','account_transfer',amount,{fromAccountId:from,toAccountId:to})];blocked(f,code);
 }
 const f=fixture();f.events=[event('transfer','account_transfer','1',{fromAccountId:'C',toAccountId:'S',bucketId:'tax'})];blocked(f,'EXTRANEOUS_ROUTING');
});
test('F1: transfer forecasts stay projected; confirmed transfer cannot depend on unconfirmed available funds',()=>{
 const f=fixture();f.events=[event('forecast','account_transfer','1',{fromAccountId:'C',toAccountId:'S',validated:false,settlement:'forecast'})];
 const r=result(f);assert.equal(r.projected.accounts.S,'300001');assert.equal(r.validated.accounts.S,'300000');assert.equal(r.projected.buckets.tax,'120000');
 f.events=[event('deposit','income','1000',{toAccountId:'S',validated:false,settlement:'forecast'}),event('transfer','account_transfer','30001',{fromAccountId:'S',toAccountId:'C',sequence:1})];blocked(f,'INSUFFICIENT_TRANSFER_FUNDS');
});
test('F1: duplicate manual/scheduled neutral transfers require explicit representation decisions',()=>{
 const f=fixture();const a=event('scheduled','account_transfer','100',{fromAccountId:'C',toAccountId:'S'});const b={...a,id:'manual',origin:{kind:'manual',id:'m',revision:'v1'},sequence:1};f.events=[a,b];blocked(f,'REPRESENTATION_DECISION_REQUIRED');
 f.representationPolicies=[{eventIds:['scheduled','manual'],decision:'representative',representativeId:'scheduled',evidenceRef:'same bank movement'}];assert.equal(result(f).validated.accounts.C,'199900');
});
test('F2: one stable recurring source spans 2026/2027/2028 with unique original occurrence keys and revisions',()=>{
 const f=fixture();f.throughDate='2028-12-31';const source='salary__stable';
 f.events=['2026-12-30','2027-01-13','2027-12-29','2028-01-12'].map((d,i)=>event(`event-${i}`,'income','100',{assignedDate:d,accountingDate:d,toAccountId:'C',origin:{kind:'scheduled',id:source,revision:i<2?'v1':'v2'}}));
 const before=JSON.stringify(f),r=result(f);assert.equal(r.validated.accounts.C,'200400');assert.equal(r.ledger.length,4);
 assert.deepEqual(r.ledger.map(x=>x.origin.id),Array(4).fill(source));
 assert.deepEqual(r.ledger.map(x=>x.origin.occurrenceId),f.events.map(x=>`${source}__${x.assignedDate}`));assert.equal(JSON.stringify(f),before);
 // Different event ID, posting date and revision cannot replay the same original occurrence.
 f.events.push({...f.events[0],id:'duplicate',accountingDate:'2027-02-01',origin:{...f.events[0].origin,revision:'v3'}});blocked(f,'DUPLICATE_ORIGIN');
});
test('F2: missing/mismatched occurrence identity rejects without rekeying; non-scheduled identities remain record-specific',()=>{
 const f=fixture();delete f.events[1].origin.occurrenceId;blocked(f,'INVALID_OCCURRENCE');
 f.events[1].origin.occurrenceId='other__2026-12-30';blocked(f,'INVALID_OCCURRENCE');
 const g=fixture();g.events=[event('manual1','income','1',{toAccountId:'C',origin:{kind:'manual',id:'record',revision:'v1'}}),event('manual2','income','1',{toAccountId:'C',sequence:1,origin:{kind:'manual',id:'record',revision:'v2'}})];blocked(g,'DUPLICATE_ORIGIN');
});
test('F3: pre-anchor aligned/unaligned checkpoints reject, equal anchor and later cadence boundaries remain valid',()=>{
 const f=fixture();f.events=[];
 for(const d of ['2026-12-02','2026-12-15']){f.checkpoint.date=d;blocked(f,'CHECKPOINT_BEFORE_ANCHOR');}
 for(const d of ['2026-12-16','2026-12-30','2027-01-13']){f.checkpoint.date=d;assert.deepEqual(result(f).cadence,{originalAnchor:'2026-12-16',frequencyDays:14,timeZone:'America/Edmonton'});}
 f.checkpoint.date='2027-01-12';blocked(f,'OFF_CADENCE_CHECKPOINT');
});
