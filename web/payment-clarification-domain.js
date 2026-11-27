/* Isolated manual clarification history and read-only projection. No clock/storage/network. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 const P=typeof module!=='undefined'?require('./performance-domain.js'):TrackerPerformance;
 const ELIGIBLE=new Set(['dividend','interest','fee','tax','refund','unclassified_out']);
 const PORTFOLIO=new Set(['interest','fee','tax','refund','withdrawal']);
 const BASIS=['type','date','instrument_id','amount','quantity','fee','tax','note'];
 function fields(r,required,label,optional=[]){if(!r||typeof r!=='object'||Array.isArray(r)||required.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!required.includes(k)&&!optional.includes(k)))D.fail(label+': fehlende oder unbekannte Felder.');}
 function id(v,label){const value=D.text(v,label,160);if(v!==value)D.fail(label+': nicht kanonische Kennung.');return value;}
 function basis(raw,ids){
  fields(raw,BASIS,'Buchungsbasis');if(!ELIGIBLE.has(raw.type))D.fail('Nur nicht gehandelte Zahlungsarten können geklärt werden.');
  if(raw.instrument_id!==null)id(raw.instrument_id,'Wertpapier-ID');
  if(typeof raw.note!=='string'||raw.note.length>500)D.fail('Ungültige Buchungsnotiz.');
  const t=D.transaction(raw,ids);return Object.fromEntries(BASIS.map(k=>[k,t[k]]));
 }
 function transactionBasis(t,ids){return basis(Object.fromEntries(BASIS.map(k=>[k,k==='instrument_id'?t[k]??null:k==='quantity'||k==='fee'||k==='tax'?t[k]??'0':k==='note'?t[k]??'':t[k]])),ids);}
 function decision(raw,ids){
  fields(raw,['clarification_version','transaction_id','basis','scope','resolved_type','instrument_id','observed_date','reason','evidence'],'Zahlungsklärung');
  if(raw.clarification_version!==1)D.fail('Unbekannte Klärungsversion.');
  const original=basis(raw.basis,ids),observed_date=D.day(raw.observed_date);if(observed_date<original.date)D.fail('Klärungsbeobachtung liegt vor dem Zahlungstag.');
  if(!['instrument','portfolio','unresolved'].includes(raw.scope))D.fail('Klärungsbereich ausdrücklich wählen.');
  let instrument_id=null;
  if(raw.scope==='unresolved'){
   if(raw.instrument_id!==null||raw.resolved_type!==original.type)D.fail('Ungeklärte Zahlung darf weder Typ noch Ziel bestätigen.');
  }else{
   const allowed=original.type==='unclassified_out'?['fee','tax','withdrawal']:[original.type];
   if(!allowed.includes(raw.resolved_type))D.fail('Zahlungsart darf nicht ohne zulässige Artklärung geändert werden.');
   if(raw.scope==='instrument'){
    instrument_id=id(raw.instrument_id,'Zielwertpapier-ID');if(!ids.has(instrument_id))D.fail('Zielwertpapier gehört nicht zu diesem Depot.');
    if(raw.resolved_type==='withdrawal')D.fail('Auszahlungen sind kein Positionsaufwand.');
   }else if(raw.instrument_id!==null||!PORTFOLIO.has(raw.resolved_type))D.fail('Diese Zahlung benötigt eine Wertpapierzuordnung oder bleibt ungeklärt.');
  }
  fields(raw.evidence,['label','reference'],'Belegangabe');
  const evidence={label:D.text(raw.evidence.label,'Belegbezeichnung',240),reference:raw.evidence.reference===null?null:D.text(raw.evidence.reference,'Belegreferenz',240)};
  // Explicit declaration does not verify the actual receipt. The storage/UI must request it.
  return {clarification_version:1,transaction_id:id(raw.transaction_id,'Buchungs-ID'),basis:original,scope:raw.scope,resolved_type:raw.resolved_type,instrument_id,observed_date,reason:D.text(raw.reason,'Klärungsgrund',500),evidence};
 }
 function record(raw,ids,transactionIds){
  const keys=['id','sequence','void','clarification_version','transaction_id','basis','scope','resolved_type','instrument_id','observed_date','reason','evidence'];fields(raw,keys,'Klärungsstand',['void_reason']);
  const {id:rid,sequence,void:isVoid,void_reason,...payload}=raw,out={id:id(rid,'Klärungs-ID'),sequence,void:isVoid,...decision(payload,ids)};
  if(!Number.isSafeInteger(sequence)||sequence<1||typeof isVoid!=='boolean')D.fail('Ungültige Klärungssequenz oder Stornostatus.');
  if(!transactionIds.has(out.transaction_id))D.fail('Klärung verweist auf unbekannte Buchung.');
  if(isVoid)out.void_reason=D.text(void_reason,'Klärungs-Stornogrund',500);else if(Object.hasOwn(raw,'void_reason'))D.fail('Klärungs-Stornogrund ohne Storno.');return out;
 }
 function records(raw,ids,transactionIds){
  if(!Array.isArray(raw)||raw.length>50000)D.fail('Ungültige Klärungshistorie.');const seen=new Set(),seq=new Set();return raw.map(r=>{const v=record(r,ids,transactionIds);if(seen.has(v.id)||seq.has(v.sequence))D.fail('Doppelte Klärungs-ID oder Sequenz.');seen.add(v.id);seq.add(v.sequence);return v;});
 }
 function project(p,options){
  fields(options,['valuation_date','knowledge_date'],'Klärungsstichtage');const valuation_date=D.day(options.valuation_date),knowledge_date=D.day(options.knowledge_date);
  D.portfolio(p);const ids=new Set(p.instruments.map(i=>i.id)),txids=new Set();for(const t of p.transactions){id(t.id,'Buchungs-ID');if(txids.has(t.id))D.fail('Doppelte Buchungs-ID.');txids.add(t.id);}
  const history=records(p.payment_clarifications,ids,txids),chosen=new Map();
  for(const r of history)if(!r.void&&r.observed_date<=knowledge_date){const old=chosen.get(r.transaction_id);if(!old||r.observed_date>old.observed_date||r.observed_date===old.observed_date&&r.sequence>old.sequence)chosen.set(r.transaction_id,r);}
  const view=structuredClone(p),applied=[],portfolio_payments=[],warnings=[],review=[];
  for(const t of view.transactions){
   const r=chosen.get(t.id);if(!r)continue;
   if(t.void){warnings.push({transaction_id:t.id,clarification_id:r.id,code:'source_transaction_void'});continue;}
   if(t.date>valuation_date)continue;
   let current;try{current=transactionBasis(t,ids);}catch{current=null;}
   if(current===null||JSON.stringify(current)!==JSON.stringify(r.basis)){warnings.push({transaction_id:t.id,clarification_id:r.id,code:'clarification_basis_changed'});review.push(t.id);continue;}
   const cashBefore=D.cash(t);
   t.type=r.resolved_type;t.instrument_id=r.scope==='instrument'?r.instrument_id:null;
   const validated=D.transaction(t,ids);if(D.cash(validated)!==cashBefore||D.dec(validated.quantity)!==D.dec(current.quantity)||validated.date!==current.date)D.fail('Klärung verändert Geldfluss, Stückzahl oder Datum.');
   applied.push({transaction_id:t.id,clarification_id:r.id,scope:r.scope,resolved_type:r.resolved_type,instrument_id:t.instrument_id,evidence:structuredClone(r.evidence)});
   if(r.scope==='unresolved'){review.push(t.id);warnings.push({transaction_id:t.id,clarification_id:r.id,code:'explicitly_unresolved'});}
   if(r.scope==='portfolio')portfolio_payments.push({transaction_id:t.id,type:t.type,date:t.date,amount:t.amount,fee:t.fee??'0',tax:t.tax??'0',cash_effect:D.str(cashBefore),clarification_id:r.id});
  }
  // Trades are never eligible. Check the complete projected history rather than only totals.
  D.holdings(view.transactions);for(let n=0;n<p.transactions.length;n++)if(D.cash(p.transactions[n])!==D.cash(view.transactions[n]))D.fail('Cash-Invariante verletzt.');
  return {valuation_date,knowledge_date,portfolio:view,applied,portfolio_payments,review_transaction_ids:review,warnings};
 }
 function calculate(p,options){
  const result=project(p,options),overview=D.overview(result.portfolio,result.valuation_date),excluded=new Set(result.portfolio_payments.map(r=>r.transaction_id));
  // Private argument copy for the position-only calculator. Full cash/overview stays intact.
  const securityView={...result.portfolio,transactions:result.portfolio.transactions.filter(t=>!excluded.has(t.id))},performance=P.calculate(securityView,result.valuation_date);
  const review=new Set(result.review_transaction_ids);
  for(const transaction_id of review)if(!performance.blockers.some(r=>r.id===transaction_id)){const t=result.portfolio.transactions.find(t=>t.id===transaction_id);performance.blockers.push({id:t.id,date:t.date,type:t.type,amount:t.amount,cash_effect:D.str(D.cash(t)),note:t.note||'',reason:'clarification_requires_review'});}
  if(review.size){for(const r of [...performance.positions,...performance.categories]){r.complete=false;r.result=null;r.xirr=null;r.xirr_note='Manuelle Zahlungsklärung unvollständig oder Buchungsbasis geändert.';r.notes.push(r.xirr_note);}overview.warnings.push('Manuelle Positions-/Strategiezuordnung zuerst prüfen.');}
  const portfolio_cash=result.portfolio_payments.reduce((s,r)=>s+D.dec(r.cash_effect),0n);
  return {...result,overview,performance,portfolio_payment_cash:D.str(portfolio_cash),positions_scope:'assigned_security_flows_excluding_confirmed_portfolio_payments'};
 }
 const api=Object.freeze({basis,transactionBasis,decision,record,records,project,calculate});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerPaymentClarification=api;
})();
