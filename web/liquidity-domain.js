/* Read-only, exact payment totals. No storage, clock, quotes, market data or returns. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 const C=typeof module!=='undefined'?require('./payment-clarification-domain.js'):TrackerPaymentClarification;
 const TYPES=['deposit','withdrawal','buy','sell','dividend','interest','fee','tax','refund','unclassified_out'];
 const POSITIVE=new Set(['deposit','sell','dividend','interest','refund']);
 function bucket(){return {count:0,amount:0n,signed_amount:0n,embedded_fees:0n,embedded_taxes:0n,cash_effect:0n};}
 function add(b,t){b.count++;b.amount+=D.dec(t.amount);b.signed_amount+=D.dec(t.amount)*(POSITIVE.has(t.type)?1n:-1n);b.embedded_fees+=D.dec(t.fee);b.embedded_taxes+=D.dec(t.tax);b.cash_effect+=D.cash(t);}
 function output(b){return Object.fromEntries(Object.entries(b).map(([k,v])=>[k,typeof v==='bigint'?D.str(v):v]));}
 function calculate(raw,options){
  if(!options||typeof options!=='object'||Array.isArray(options)||Object.keys(options).length!==3||!['basis','valuation_date','knowledge_date'].every(k=>Object.hasOwn(options,k)))D.fail('Summenbasis und beide Stichtagsfelder ausdrücklich angeben.');
  const valuation_date=D.day(options.valuation_date),basis=options.basis;if(!['original','clarified'].includes(basis))D.fail('Original- oder erklärte Summenbasis wählen.');
  if(basis==='original'&&options.knowledge_date!==null)D.fail('Originalsummen verwenden keinen Klärungskenntnisstand; null angeben.');
  const knowledge_date=basis==='clarified'?D.day(options.knowledge_date):null;
  const normalized=D.portfolio(raw);let projected=null,rows=normalized.transactions;
  if(basis==='clarified'){projected=C.project(raw,{valuation_date,knowledge_date});const ids=new Set(normalized.instruments.map(i=>i.id));rows=projected.portfolio.transactions.map(t=>({...D.transaction(t,ids),id:t.id,void:t.void||false}));}
  const active=rows.filter(t=>!t.void&&t.date<=valuation_date),byType=Object.fromEntries(TYPES.map(t=>[t,bucket()])),all=bucket(),scopes=Object.fromEntries(['financing','trades','instrument_payment','confirmed_portfolio_payment','unassigned_payment'].map(k=>[k,bucket()]));
  const confirmed=new Set(projected?.portfolio_payments.map(t=>t.transaction_id)||[]),forcedReview=new Set(projected?.review_transaction_ids||[]);let open=0,unassignedInterest=0n;
  for(const t of active){
   add(byType[t.type],t);add(all,t);
   // Scope is one complete partition. The type/funding/cost tables are other views of these same rows.
   const scope=confirmed.has(t.id)?'confirmed_portfolio_payment':['deposit','withdrawal'].includes(t.type)?'financing':['buy','sell'].includes(t.type)?'trades':t.instrument_id?'instrument_payment':'unassigned_payment';add(scopes[scope],t);
   if(forcedReview.has(t.id)||t.type==='unclassified_out'||!t.instrument_id&&!confirmed.has(t.id)&&['dividend','fee','tax','refund'].includes(t.type))open++;
   if(t.type==='interest'&&!t.instrument_id&&!confirmed.has(t.id))unassignedInterest+=D.cash(t);
  }
  const b=byType,embeddedFees=all.embedded_fees,embeddedTaxes=all.embedded_taxes;
  const funding=b.deposit.cash_effect+b.withdrawal.cash_effect,trade=b.buy.cash_effect+b.sell.cash_effect,other=all.cash_effect-funding-trade;
  const typeSum=Object.values(b).reduce((s,r)=>s+r.cash_effect,0n),scopeSum=Object.values(scopes).reduce((s,r)=>s+r.cash_effect,0n);
  if(typeSum!==all.cash_effect||scopeSum!==all.cash_effect||all.signed_amount-embeddedFees-embeddedTaxes!==all.cash_effect)D.fail('Liquiditätssummen stimmen nicht überein.');
  // Check original cash independently even when an explanation changes payment type/funding.
  const originalCash=normalized.transactions.filter(t=>!t.void&&t.date<=valuation_date).reduce((s,t)=>s+D.cash(t),0n);
  if(originalCash!==all.cash_effect)D.fail('Erklärte Summen verändern den ursprünglichen Geldfluss.');
  return {basis,valuation_date,knowledge_date,currency:'EUR',included_count:active.length,excluded_void_count:rows.filter(t=>t.void).length,excluded_future_count:rows.filter(t=>!t.void&&t.date>valuation_date).length,
   by_type:Object.fromEntries(TYPES.map(t=>[t,output(b[t])])),totals:output(all),
   funding:{gross_deposits:D.str(b.deposit.amount),gross_withdrawals:D.str(b.withdrawal.amount),net:D.str(funding)},
   trading:{purchases:D.str(b.buy.amount),sales:D.str(b.sell.amount),principal_cash:D.str(b.sell.amount-b.buy.amount),embedded_fees:D.str(b.buy.embedded_fees+b.sell.embedded_fees),embedded_taxes:D.str(b.buy.embedded_taxes+b.sell.embedded_taxes),cash_effect:D.str(trade)},
   costs:{standalone_fees:D.str(b.fee.amount),embedded_fees:D.str(embeddedFees),total_fees:D.str(b.fee.amount+embeddedFees),standalone_taxes:D.str(b.tax.amount),embedded_taxes:D.str(embeddedTaxes),total_taxes:D.str(b.tax.amount+embeddedTaxes),refunds:D.str(b.refund.amount)},
   reconciliation:{funding_cash:D.str(funding),trade_cash:D.str(trade),other_cash:D.str(other),cash:D.str(all.cash_effect),original_cash:D.str(originalCash)},
   scope_totals:Object.fromEntries(Object.entries(scopes).map(([k,v])=>[k,output(v)])),
   review:{open_position_assignment_count:open,unclassified_out_count:b.unclassified_out.count,unassigned_interest_cash:D.str(unassignedInterest),applied_clarification_count:projected?.applied.length||0,warnings:structuredClone(projected?.warnings||[])},
   note:'Summen und Teilmengen derselben Originalzahlungen; Art-/Kosten-/Bereichstabellen nicht nochmals zum Cash addieren. Keine Gewinn-, Rendite- oder Belegbestätigung.'};
 }
 const api=Object.freeze({calculate});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerLiquidity=api;
})();
