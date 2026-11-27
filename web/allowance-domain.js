/* Isolated arithmetic for manually reported allowance registers. No tax rules. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 const C=typeof module!=='undefined'?require('./country-domain.js'):TrackerCountries;
 const source=C.source;
 function fields(r,required,optional,label){if(!r||typeof r!=='object'||Array.isArray(r)||required.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!required.includes(k)&&!optional.includes(k)))D.fail(label+': fehlende oder unbekannte Felder.');}
 function year(v){if(!Number.isSafeInteger(v)||v<1900||v>2200)D.fail('Ungültiges Berichtsjahr.');return v;}
 function amount(v){if(v===null)return null;if(typeof v!=='string'||!/^\d{1,15}(\.\d{1,2})?$/.test(v))D.fail('EUR-Betrag mit höchstens zwei Nachkommastellen oder ausdrücklich null erwartet.');return D.number(v,'EUR-Betrag');}
 function institution(raw){fields(raw,['id','label'],[],'Institut');return {id:D.text(raw.id,'Instituts-ID',160),label:D.text(raw.label,'Institutsname',160)};}
 function common(raw){
  if(!Number.isSafeInteger(raw.sequence)||raw.sequence<1)D.fail('Ungültige Stand-Sequenz.');if(raw.currency!=='EUR')D.fail('Nur EUR unterstützt.');if(typeof raw.void!=='boolean')D.fail('Ungültiger Stornostatus.');
  const out={id:D.text(raw.id,'Stand-ID',160),sequence:raw.sequence,year:year(raw.year),currency:'EUR',observed_date:D.day(raw.observed_date),source:source(raw.source),void:raw.void};
  if(raw.void)out.void_reason=D.text(raw.void_reason,'Stornogrund',500);else if(Object.hasOwn(raw,'void_reason'))D.fail('Stornogrund ohne Storno.');return out;
 }
 function snapshot(raw,ids){
  fields(raw,['id','sequence','institution_id','year','currency','allocated_amount','used_amount','used_origin','observed_date','used_as_of','source','void'],['void_reason'],'Institutsstand');
  const out=common(raw);if(!ids.has(raw.institution_id))D.fail('Unbekannte Instituts-ID.');if(!['manual_report','source_entry','source_aggregate'].includes(raw.used_origin))D.fail('Ungültige Verbrauchsherkunft.');
  const used_as_of=raw.used_as_of===null?null:D.day(raw.used_as_of);if(used_as_of&&(Number(used_as_of.slice(0,4))!==out.year||used_as_of>out.observed_date))D.fail('Verbrauchsstichtag muss im Berichtsjahr und spätestens am Beobachtungsdatum liegen.');
  return {...out,institution_id:raw.institution_id,allocated_amount:amount(raw.allocated_amount),used_amount:amount(raw.used_amount),used_origin:raw.used_origin,used_as_of};
 }
 function budget(raw){fields(raw,['id','sequence','year','currency','amount','observed_date','source','void'],['void_reason'],'Jahresbudget');return {...common(raw),amount:amount(raw.amount)};}
 function ledger(raw){
  fields(raw,['id','name','mode','institutions','snapshots','budgets'],[],'Freistellungsregister');if(!['live','example'].includes(raw.mode))D.fail('Ungültiger Registermodus.');
  if(!Array.isArray(raw.institutions)||raw.institutions.length>1000||!Array.isArray(raw.snapshots)||raw.snapshots.length>50000||!Array.isArray(raw.budgets)||raw.budgets.length>1000)D.fail('Ungültige Registerlisten oder Größenlimit überschritten.');
  const institutions=raw.institutions.map(institution),ids=new Set(institutions.map(i=>i.id));if(ids.size!==institutions.length)D.fail('Doppelte Instituts-ID.');
  const snapshots=raw.snapshots.map(r=>snapshot(r,ids)),budgets=raw.budgets.map(budget),seen=new Set(ids),sequences=new Set();
  for(const r of [...snapshots,...budgets]){if(seen.has(r.id)||sequences.has(r.sequence))D.fail('Doppelte Register-Datensatz-ID oder Sequenz.');seen.add(r.id);sequences.add(r.sequence);}
  const id=D.text(raw.id,'Register-ID',160);if(seen.has(id))D.fail('Register-ID kollidiert mit einer Datensatz-ID.');
  return {id,name:D.text(raw.name,'Registername',80),mode:raw.mode,institutions,snapshots,budgets};
 }
 // Selection accepts validated records. Unknown entries supersede older known values.
 function select(rows,reportYear,asOf,institutionId){year(reportYear);D.day(asOf);let chosen=null;for(const r of rows)if(r.year===reportYear&&!r.void&&r.observed_date<=asOf&&(institutionId===undefined||r.institution_id===institutionId)&&(!chosen||r.observed_date>chosen.observed_date||(r.observed_date===chosen.observed_date&&r.sequence>chosen.sequence)))chosen=r;return chosen;}
 function summary(raw,reportYear,asOf){
  const l=ledger(raw);year(reportYear);D.day(asOf);const warnings=[],labels=new Map();for(const i of l.institutions){if(!labels.has(i.label))labels.set(i.label,[]);labels.get(i.label).push(i.id);}for(const [label,ids]of labels)if(ids.length>1)warnings.push({code:'institution_label_conflict',label,institution_ids:ids});
  let allocated=0n,used=0n,remaining=0n,missingAllocated=0,missingUsed=0,missingRemaining=0;
  const rows=l.institutions.map(i=>{
   const r=select(l.snapshots,reportYear,asOf,i.id),a=r?.allocated_amount??null,u=r?.used_amount??null;
   if(a===null)missingAllocated++;else allocated+=D.dec(a);if(u===null)missingUsed++;else used+=D.dec(u);
   const rest=a===null||u===null?null:D.dec(a)-D.dec(u);if(rest===null)missingRemaining++;else remaining+=rest;
   if(!r)warnings.push({code:'missing_statement',institution_id:i.id});else{if(a===null||u===null)warnings.push({code:'incomplete_statement',institution_id:i.id});if(r.used_as_of===null)warnings.push({code:'unknown_usage_date',institution_id:i.id});if(r.used_origin==='source_aggregate')warnings.push({code:'source_aggregate_not_bank_confirmation',institution_id:i.id});}
   if(rest!==null&&rest<0n)warnings.push({code:'overused',institution_id:i.id});
   return {institution_id:i.id,label:i.label,snapshot_id:r?.id||null,statement:r,allocated_amount:a,used_amount:u,remaining:rest===null?null:D.str(rest),remaining_positive:rest===null?null:D.str(rest>0n?rest:0n),overused:rest===null?null:D.str(rest<0n?-rest:0n)};
  });
  const count=rows.length,aComplete=count>0&&missingAllocated===0,uComplete=count>0&&missingUsed===0,rComplete=count>0&&missingRemaining===0;
  const b=select(l.budgets,reportYear,asOf),bAmount=b?.amount??null;
  const unallocated=bAmount===null||!aComplete?null:D.dec(bAmount)-allocated,bRemaining=bAmount===null||!uComplete?null:D.dec(bAmount)-used;
  if(count===0)warnings.push({code:'empty_register'});if(bAmount===null)warnings.push({code:'unknown_budget'});if(unallocated!==null&&unallocated<0n)warnings.push({code:'overallocated'});if(bRemaining!==null&&bRemaining<0n)warnings.push({code:'budget_overused'});
  return {ledger_id:l.id,mode:l.mode,year:reportYear,as_of:asOf,scope:'recorded_institutions_only',institution_count:count,complete:rComplete,budget_statement:b,budget_amount:bAmount,
   allocated_complete:aComplete,used_complete:uComplete,remaining_complete:rComplete,
   allocated_amount:aComplete?D.str(allocated):null,used_amount:uComplete?D.str(used):null,remaining:rComplete?D.str(remaining):null,
   known_allocated_amount:D.str(allocated),known_used_amount:D.str(used),known_remaining:D.str(remaining),
   missing_allocated_count:missingAllocated,missing_used_count:missingUsed,missing_remaining_count:missingRemaining,
   unallocated:unallocated===null?null:D.str(unallocated),overallocated:unallocated===null?null:D.str(unallocated<0n?-unallocated:0n),budget_remaining:bRemaining===null?null:D.str(bRemaining),rows,warnings};
 }
 const api=Object.freeze({source,year,amount,institution,snapshot,budget,ledger,select,summary});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerAllowance=api;
})();
