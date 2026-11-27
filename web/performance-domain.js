/* Read-only results and money-weighted returns for assigned security flows. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 const included=new Set(['buy','sell','dividend','interest','fee','tax','refund']);
 const needsAssignment=new Set(['dividend','fee','tax','refund']);
 function calculate(p,asOf){
  const overview=D.overview(p,asOf),active=p.transactions.filter(t=>!t.void&&t.date<=asOf);
  const blockers=active.filter(t=>t.type==='unclassified_out'||(!t.instrument_id&&needsAssignment.has(t.type))).map(t=>({id:t.id||null,date:t.date,type:t.type,amount:t.amount,cash_effect:D.str(D.cash(t)),note:t.note||''}));
  const cashInterest=active.filter(t=>t.type==='interest'&&!t.instrument_id).reduce((s,t)=>s+D.cash(t),0n);
  function summarize(name,positions){
   const ids=new Set(positions.map(i=>i.id));
   const rows=active.filter(t=>ids.has(t.instrument_id)&&included.has(t.type));
   const sum=predicate=>rows.filter(predicate).reduce((s,t)=>s+D.dec(t.amount),0n);
   const purchases=sum(t=>t.type==='buy'),sales=sum(t=>t.type==='sell');
   const income=sum(t=>['dividend','interest'].includes(t.type)),refunds=sum(t=>t.type==='refund');
   const fees=sum(t=>t.type==='fee')+rows.reduce((s,t)=>s+D.dec(t.fee),0n);
   const taxes=sum(t=>t.type==='tax')+rows.reduce((s,t)=>s+D.dec(t.tax),0n);
   const cashNet=rows.reduce((s,t)=>s+D.cash(t),0n);
   const value=positions.some(i=>i.value===null)?null:positions.reduce((s,i)=>s+D.dec(i.value),0n);
   const notes=[];
   if(blockers.length)notes.push('Buchungszuordnung unvollständig. Ungeklärte Zahlungen zuerst prüfen.');
   if(value===null)notes.push('Kurs für mindestens eine gehaltene Position fehlt.');
   const complete=notes.length===0;
   const flows=rows.map(t=>[t.date,D.cash(t)]);
   const [xirr,xirrNote]=complete?D.xirr([...flows,[asOf,value]]):[null,notes.join(' ')];
   return {name,position_ids:[...ids],transaction_count:rows.length,start_date:rows.map(t=>t.date).sort()[0]||null,as_of:asOf,
    value:value===null?null:D.str(value),purchases:D.str(purchases),sales:D.str(sales),income:D.str(income),fees:D.str(fees),taxes:D.str(taxes),refunds:D.str(refunds),cash_net:D.str(cashNet),
    trading_difference:value===null?null:D.str(value-purchases+sales),result:complete?D.str(value+cashNet):null,complete,xirr,xirr_note:xirrNote,notes};
  }
  const positions=overview.positions.filter(i=>D.dec(i.quantity)!==0n||active.some(t=>t.instrument_id===i.id&&included.has(t.type))).map(i=>({...summarize(i.name,[i]),id:i.id,isin:i.isin,category:i.category,quantity:i.quantity,quote:i.quote}));
  const groups=[...new Set(positions.map(i=>i.category))];
  const categories=groups.map(c=>summarize(c,overview.positions.filter(i=>i.category===c)));
  return {as_of:asOf,positions,categories,blockers,unassigned_interest:D.str(cashInterest)};
 }
 const api=Object.freeze({calculate});globalThis.TrackerPerformance=api;if(typeof module!=='undefined')module.exports=api;
})();
