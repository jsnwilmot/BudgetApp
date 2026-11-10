// Stage 1 only: no app imports or side effects. Runtime contract: CONTRACT.md.
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.trim().length > 0;
const money = v => typeof v === 'string' && /^(0|-?[1-9]\d{0,29})$/.test(v);
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v;
const fail = (code, ref) => { throw { code, ...(ref ? { ref } : {}) }; };
const requireThat = (condition, code, ref) => { if (!condition) fail(code, ref); };
const list = v => { requireThat(Array.isArray(v), 'INVALID_COLLECTION'); return v; };
const unique = (items, key) => { const map = new Map(); for (const x of items) { requireThat(object(x) && text(key(x)) && !map.has(key(x)), 'DUPLICATE_OR_INVALID_ID'); map.set(key(x), x); } return map; };
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const kinds = ['income','expense','contribution','withdrawal','allocation','release','reallocation'];
function snapshot(state, cp) {
  const accounts = Object.fromEntries([...state.accounts].map(([k,v]) => [k,String(v)]));
  const buckets = Object.fromEntries([...state.buckets].map(([k,v]) => [k,String(v)]));
  const unallocated = Object.fromEntries([...state.unallocated].map(([k,v]) => [k,String(v)]));
  const total = type => cp.accounts.filter(a=>a.type===type).reduce((n,a)=>n+state.accounts.get(a.id),0n);
  return {accounts,buckets,unallocated,aggregate:{chequing:String(total('chequing')),savings:String(total('savings')),cash:String(total('chequing')+total('savings'))}};
}
function stateOf(cp) {return {accounts:new Map(cp.accounts.map(a=>[a.id,BigInt(a.openingMinor)])),buckets:new Map(cp.buckets.map(b=>[b.id,BigInt(b.openingMinor)])),unallocated:new Map(cp.unallocated.map(u=>[u.accountId,BigInt(u.amountMinor)]))};}
function invariant(state, cp) {
  for(const a of cp.accounts) {
    const cash=state.accounts.get(a.id);
    requireThat(cash>=0n || (a.type==='chequing' && a.allowOverdraft===true),'NEGATIVE_ACCOUNT',a.id);
    if(a.type==='savings') {
      const reserved=cp.buckets.filter(b=>b.accountId===a.id).reduce((s,b)=>s+state.buckets.get(b.id),0n);
      requireThat(state.unallocated.get(a.id)>=0n && reserved+state.unallocated.get(a.id)===cash,'ALLOCATION_MISMATCH',a.id);
    }
  }
  for(const [id,n] of state.buckets) requireThat(n>=0n,'NEGATIVE_BUCKET',id);
}
function validate(cp) {
  requireThat(object(cp) && text(cp.id) && cp.verified===true && cp.basis==='posted' && text(cp.evidenceRef),'UNVERIFIED_CHECKPOINT');
  requireThat(date(cp.date) && date(cp.originalAnchor) && [7,14,28,30].includes(cp.frequencyDays),'INVALID_CADENCE');
  requireThat((Date.parse(cp.date)-Date.parse(cp.originalAnchor)) / 86400000 % cp.frequencyDays===0,'OFF_CADENCE_CHECKPOINT');
  requireThat(text(cp.timeZone),'INVALID_ZONE');try {new Intl.DateTimeFormat('en',{timeZone:cp.timeZone});}catch{fail('INVALID_ZONE');}
  requireThat(['CAD','USD','EUR','GBP','AUD','NZD','CHF'].includes(cp.currency),'UNSUPPORTED_CURRENCY');
  const accounts=unique(list(cp.accounts),a=>a.id);requireThat(accounts.size>0,'NO_ACCOUNTS');
  for(const a of cp.accounts) requireThat(['chequing','savings'].includes(a.type) && a.currency===cp.currency && money(a.openingMinor) && a.verified===true && text(a.evidenceRef),'INVALID_ACCOUNT',a.id);
  const buckets=unique(list(cp.buckets),b=>b.id);
  for(const b of cp.buckets) requireThat(accounts.get(b.accountId)?.type==='savings' && money(b.openingMinor) && BigInt(b.openingMinor)>=0n && b.verified===true && text(b.evidenceRef),'INVALID_BUCKET',b.id);
  const unallocated=unique(list(cp.unallocated),u=>u.accountId);
  requireThat(unallocated.size===cp.accounts.filter(a=>a.type==='savings').length,'MISSING_UNALLOCATED');
  for(const u of cp.unallocated) requireThat(accounts.get(u.accountId)?.type==='savings' && money(u.amountMinor) && BigInt(u.amountMinor)>=0n,'INVALID_UNALLOCATED',u.accountId);
  invariant(stateOf(cp),cp);return {accounts,buckets};
}
function eventLegs(e, refs) {
  const bank=[],reserve=[]; const n=BigInt(e.amountMinor);
  const account=(id,type)=>{requireThat(refs.accounts.has(id) && (!type || refs.accounts.get(id).type===type),'INVALID_EVENT_ACCOUNT',e.id);return id;};
  const bucket=(id,accountId)=>{requireThat(refs.buckets.has(id) && (!accountId || refs.buckets.get(id).accountId===accountId),'INVALID_EVENT_BUCKET',e.id);return refs.buckets.get(id);};
  const leg=(target,id,value)=>target.push({id,amountMinor:String(value)});
  if(e.kind==='income') leg(bank,account(e.toAccountId),n);
  if(e.kind==='expense') {
    leg(bank,account(e.fromAccountId),-n);
    if(e.bucketId) {account(e.fromAccountId,'savings');bucket(e.bucketId,e.fromAccountId);leg(reserve,e.bucketId,-n);}
  }
  if(e.kind==='contribution') {account(e.fromAccountId,'chequing');account(e.toAccountId,'savings');bucket(e.bucketId,e.toAccountId);leg(bank,e.fromAccountId,-n);leg(bank,e.toAccountId,n);leg(reserve,e.bucketId,n);}
  if(e.kind==='withdrawal') {account(e.fromAccountId,'savings');account(e.toAccountId,'chequing');bucket(e.bucketId,e.fromAccountId);leg(bank,e.fromAccountId,-n);leg(bank,e.toAccountId,n);leg(reserve,e.bucketId,-n);}
  if(['allocation','release','reallocation'].includes(e.kind)) {
    const b=bucket(e.bucketId);if(e.fromAccountId || e.toAccountId) fail('ALLOCATION_HAS_BANK_ROUTING',e.id);
    leg(reserve,b.id,e.kind==='allocation'?n:-n);
    if(e.kind==='reallocation') {const target=bucket(e.toBucketId,b.accountId);requireThat(target.id!==b.id,'SAME_BUCKET',e.id);leg(reserve,target.id,n);}
  }
  // Reject irrelevant routing rather than silently accepting a conflicting source claim.
  const allowed={income:['toAccountId'],expense:['fromAccountId','bucketId'],contribution:['fromAccountId','toAccountId','bucketId'],withdrawal:['fromAccountId','toAccountId','bucketId'],allocation:['bucketId'],release:['bucketId'],reallocation:['bucketId','toBucketId']}[e.kind];
  for(const key of ['fromAccountId','toAccountId','bucketId','toBucketId']) requireThat(e[key]===undefined || allowed.includes(key),'EXTRANEOUS_ROUTING',e.id);
  return {bank,reserve};
}
function apply(state, legs, cp) {
  for(const l of legs.bank) state.accounts.set(l.id,state.accounts.get(l.id)+BigInt(l.amountMinor));
  for(const l of legs.reserve) state.buckets.set(l.id,state.buckets.get(l.id)+BigInt(l.amountMinor));
  for(const a of cp.accounts.filter(a=>a.type==='savings')) state.unallocated.set(a.id,state.accounts.get(a.id)-cp.buckets.filter(b=>b.accountId===a.id).reduce((s,b)=>s+state.buckets.get(b.id),0n));
  invariant(state,cp);
}
const signature = e => JSON.stringify([e.kind,e.accountingDate,e.assignedDate,e.amountMinor,e.currency,e.fromAccountId,e.toAccountId,e.bucketId,e.toBucketId,e.validated,e.settlement]);
function run(input) {
  requireThat(object(input),'INVALID_INPUT');const cp=input.checkpoint;const refs=validate(cp);
  requireThat(date(input.throughDate) && input.throughDate>=cp.date,'INVALID_WINDOW');
  const events=list(input.events);requireThat(events.length<=10000,'WORK_LIMIT');const byId=unique(events,e=>e.id);
  const origins=new Set();
  for(const e of events) {requireThat(object(e.origin) && ['scheduled','manual','adjustment'].includes(e.origin.kind) && text(e.origin.id) && text(e.origin.revision),'INVALID_ORIGIN',e.id);const key=JSON.stringify([e.origin.kind,e.origin.id]);requireThat(!origins.has(key),'DUPLICATE_ORIGIN',e.id);origins.add(key);requireThat(date(e.accountingDate) && date(e.assignedDate),'UNKNOWN_EVENT_DATE',e.id);}
  const decisions=unique(list(input.boundaryDecisions??[]),d=>d.eventId);const excluded=[],eligible=[];
  for(const d of decisions.values()) requireThat(byId.has(d.eventId) && d.revision===byId.get(d.eventId).origin.revision && text(d.evidenceRef) && ['carry-forward','already-in-opening'].includes(d.kind),'INVALID_BOUNDARY_DECISION',d.eventId);
  for(const e of events) {
    const d=decisions.get(e.id), crossing=e.assignedDate<cp.date && e.accountingDate>=cp.date;
    requireThat(['posted','forecast'].includes(e.settlement) && typeof e.validated==='boolean' && (!e.validated || e.settlement==='posted'),'UNKNOWN_SETTLEMENT',e.id);
    if(e.accountingDate>=cp.date || e.assignedDate>=cp.date || d) {
      requireThat(kinds.includes(e.kind) && money(e.amountMinor) && BigInt(e.amountMinor)>0n && e.currency===cp.currency && (e.movementId===undefined || text(e.movementId)),'INVALID_EVENT_MONEY_OR_KIND',e.id);
      eventLegs(e,refs);
    }
    if(d?.kind==='already-in-opening') {requireThat(e.settlement==='posted','OPENING_NOT_POSTED',e.id);excluded.push({id:e.id,reason:'already-in-opening'});continue;}
    if(e.accountingDate<cp.date) {requireThat(!d && e.assignedDate<cp.date,'BOUNDARY_DECISION_REQUIRED',e.id);excluded.push({id:e.id,reason:'legacy'});continue;}
    requireThat(crossing ? d?.kind==='carry-forward' : !d,'BOUNDARY_DECISION_REQUIRED',e.id);
    requireThat(kinds.includes(e.kind) && money(e.amountMinor) && BigInt(e.amountMinor)>0n && e.currency===cp.currency,'INVALID_EVENT_MONEY_OR_KIND',e.id);
    requireThat(Number.isSafeInteger(e.sequence) && e.sequence>=0,'EXPLICIT_SEQUENCE_REQUIRED',e.id);
    eventLegs(e,refs); // Validate even future events; incomplete prospective routing blocks preview.
    if(e.accountingDate>input.throughDate) {excluded.push({id:e.id,reason:'after-window'});continue;}
    eligible.push(e);
  }
  for(const e of eligible) for(const x of events.filter(x=>excluded.some(r=>r.id===x.id && ['legacy','already-in-opening'].includes(r.reason)))) {
    requireThat(!(text(e.movementId) && e.movementId===x.movementId) && signature(e)!==signature(x),'OPENING_REPRESENTATION_CONFLICT',e.id);
  }
  const policies=list(input.representationPolicies??[]), policyFor=new Map();
  for(const p of policies) {
    requireThat(object(p) && text(p.evidenceRef) && ['distinct','representative'].includes(p.decision) && Array.isArray(p.eventIds) && p.eventIds.length>=2 && new Set(p.eventIds).size===p.eventIds.length,'INVALID_REPRESENTATION_POLICY');
    for(const id of p.eventIds) {requireThat(eligible.some(e=>e.id===id) && !policyFor.has(id),'INVALID_REPRESENTATION_MEMBER',id);policyFor.set(id,p);}
    const members=p.eventIds.map(id=>byId.get(id));
    requireThat(members.every(e=>signature(e)===signature(members[0])),'INCOMPATIBLE_REPRESENTATION');
    if(p.decision==='representative') requireThat(p.eventIds.includes(p.representativeId),'INVALID_REPRESENTATIVE');
    else requireThat(new Set(members.filter(e=>e.movementId).map(e=>e.movementId)).size===members.filter(e=>e.movementId).length,'CONFLICTING_MOVEMENT_CLAIM');
  }
  const candidates=[];
  for(let i=0;i<eligible.length;i++) for(let j=i+1;j<eligible.length;j++) {
    const a=eligible[i],b=eligible[j];
    const shared=text(a.movementId) && a.movementId===b.movementId;
    const coincidence=['contribution','withdrawal'].includes(a.kind) && a.kind===b.kind && a.accountingDate===b.accountingDate && a.amountMinor===b.amountMinor && a.fromAccountId===b.fromAccountId && a.toAccountId===b.toAccountId && a.bucketId===b.bucketId;
    if(shared || coincidence) {candidates.push([a.id,b.id]);requireThat(policyFor.has(a.id) && policyFor.get(a.id)===policyFor.get(b.id),'REPRESENTATION_DECISION_REQUIRED',a.id);}
  }
  const accepted=eligible.filter(e=>{const p=policyFor.get(e.id);if(p?.decision==='representative' && p.representativeId!==e.id){excluded.push({id:e.id,reason:'represented-by-policy'});return false;}return true;});
  const orders=new Set();
  for(const e of accepted) {const key=JSON.stringify([e.accountingDate,e.sequence]);requireThat(!orders.has(key),'AMBIGUOUS_EVENT_ORDER',e.id);orders.add(key);}
  // Explicit within-day sequence: no guessed bank ordering or machine clock.
  accepted.sort((a,b)=>a.accountingDate<b.accountingDate?-1:a.accountingDate>b.accountingDate?1:a.sequence-b.sequence);
  const validated=stateOf(cp),projected=stateOf(cp),opening=snapshot(validated,cp),ledger=[],months=new Map();
  for(const e of accepted) {
    const legs=eventLegs(e,refs);apply(projected,legs,cp);if(e.validated)apply(validated,legs,cp);
    const month=e.accountingDate.slice(0,7);
    if(!months.has(month)) months.set(month,{month,partialPeriod:month===cp.date.slice(0,7) && cp.date.slice(8)!=='01',validated:{},projected:{}});
    for(const track of ['projected',...(e.validated?['validated']:[])]) {const m=months.get(month)[track];m[e.kind]=String(BigInt(m[e.kind]??'0')+BigInt(e.amountMinor));}
    ledger.push({eventId:e.id,origin:{...e.origin},accountingDate:e.accountingDate,assignedDate:e.assignedDate,kind:e.kind,validated:e.validated,legs,validatedBalance:snapshot(validated,cp),projectedBalance:snapshot(projected,cp)});
  }
  return {ok:true,diagnostics:[],opening,ledger,excluded,candidates,monthlyReports:[...months.values()],validated:snapshot(validated,cp),projected:snapshot(projected,cp),legacyStatus:'unreconciled',cadence:{originalAnchor:cp.originalAnchor,frequencyDays:cp.frequencyDays,timeZone:cp.timeZone}};
}
export function calculateCheckpoint(input) {
  try{return run(input);}catch(error){return {ok:false,diagnostics:[{code:error?.code??'INVALID_INPUT',...(error?.ref?{ref:error.ref}:{})}]};}
}
export function previewCheckpoint(input, reference) {
  const result=calculateCheckpoint(input);if(!result.ok)return result;
  try{
    const differences={};
    for(const track of ['validated','projected']) {
      differences[track]={};for(const group of ['accounts','buckets','unallocated','aggregate']) {
        requireThat(object(reference?.[track]?.[group]) && same(Object.keys(reference[track][group]).sort(),Object.keys(result[track][group]).sort()),'INVALID_REFERENCE');
        differences[track][group]=Object.fromEntries(Object.entries(result[track][group]).map(([id,value])=>{requireThat(money(reference[track][group][id]),'INVALID_REFERENCE');return [id,String(BigInt(value)-BigInt(reference[track][group][id]))];}));
      }
    }
    return {...result,differences};
  }catch{return {ok:false,diagnostics:[{code:'INVALID_REFERENCE'}]};}
}
