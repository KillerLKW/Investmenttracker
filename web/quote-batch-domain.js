/* Pure quote-batch validation/planning. No storage or clock/network access. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 function fields(r,keys,label){if(!r||typeof r!=='object'||Array.isArray(r)||keys.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!keys.includes(k)))D.fail(label+': fehlende oder unbekannte Felder.');}
 function quote(raw,ids){fields(raw,['instrument_id','price','date','source','currency'],'Kurszeile');const instrument_id=D.text(raw.instrument_id,'Wertpapier-ID',160);if(!ids.has(instrument_id))D.fail('Kurszeile verweist auf unbekanntes Wertpapier.');if(raw.currency!=='EUR')D.fail('Nur EUR-Kurse unterstützt.');return {instrument_id,price:D.number(raw.price,'Kurs',false),date:D.day(raw.date),source:D.text(raw.source,'Kursquelle',120),currency:'EUR'};}
 function rows(raw,ids){if(!Array.isArray(raw)||!raw.length||raw.length>1000)D.fail('Zwischen einer und 1.000 Kurszeilen erwartet.');const seen=new Set();return raw.map((r,n)=>{let item;try{item=quote(r,ids);}catch(e){e.message='Zeile '+(n+1)+': '+e.message;throw e;}const key=JSON.stringify([item.instrument_id,item.date]);if(seen.has(key))D.fail('Zeile '+(n+1)+': Wertpapier und Datum mehrfach im Paket.');seen.add(key);return item;});}
 const newest=(a,b)=>!b||a.date>b.date||(a.date===b.date&&a.sequence>b.sequence);
 const view=r=>r?{id:r.id??null,sequence:r.sequence,instrument_id:r.instrument_id,price:r.price,date:r.date,source:r.source,currency:'EUR'}:null;
 function plan(portfolio,raw,options){
  fields(options,['reference_day','valuation_date'],'Vorschaudaten');const reference_day=D.day(options.reference_day),valuation_date=D.day(options.valuation_date);
  D.portfolio(portfolio); // Validation only; preserve stored source sequence for same-day selection.
  const instruments=new Map(portfolio.instruments.map(i=>[i.id,i])),ids=new Set(instruments.keys()),sequences=new Set();
  const existing=portfolio.quotes.map(r=>{const q=quote({instrument_id:r.instrument_id,price:r.price,date:r.date,source:r.source,currency:Object.hasOwn(r,'currency')?r.currency:'EUR'},ids);if(!Number.isSafeInteger(r.sequence)||r.sequence<1||sequences.has(r.sequence))D.fail('Ungültige oder doppelte gespeicherte Kurssequenz.');sequences.add(r.sequence);return {...q,id:r.id===undefined?null:D.text(r.id,'Gespeicherte Kurs-ID',160),sequence:r.sequence};});
  const selected=rows(raw,ids),details=selected.map(q=>{
   const i=instruments.get(q.instrument_id);let sameDate=null,used=null;for(const r of existing)if(r.instrument_id===q.instrument_id){if(r.date===q.date&&newest(r,sameDate))sameDate=r;if(r.date<=valuation_date&&newest(r,used))used=r;}
   const duplicate=existing.some(r=>r.instrument_id===q.instrument_id&&r.date===q.date&&r.price===q.price&&r.source===q.source);
   const warnings=[];if(q.date>reference_day)warnings.push('future_date');if(used&&q.date<used.date)warnings.push('older_than_valuation_quote');if(q.date>valuation_date)warnings.push('after_valuation_date');
   if(sameDate&&!duplicate)warnings.push(sameDate.price!==q.price?'different_same_day_price':'different_same_day_source');
   return {quote:q,name:i.name,isin:i.isin,status:duplicate?'existing':'new',same_date_quote:view(sameDate),valuation_quote:view(used),changes_current_valuation:!duplicate&&q.date<=valuation_date&&(!used||q.date>=used.date),warnings};
  });
  const additions=details.filter(r=>r.status==='new').map(r=>r.quote);
  // Multiple dates for one instrument may enter together. Name the actual winning row,
  // not every candidate that would replace the old state in isolation.
  const winners=new Map();for(const q of additions)if(q.date<=valuation_date){const prev=winners.get(q.instrument_id);if(!prev||q.date>prev.date)winners.set(q.instrument_id,q);}
  for(const d of details)if(d.status==='new')d.changes_current_valuation=d.changes_current_valuation&&winners.get(d.quote.instrument_id)===d.quote;
  return {reference_day,valuation_date,selected_count:details.length,added_count:additions.length,existing_count:details.length-additions.length,can_commit:additions.length>0,rows:details,additions};
 }
 const api=Object.freeze({quote,rows,plan});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerQuoteBatch=api;
})();
