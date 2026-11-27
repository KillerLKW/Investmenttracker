/* Explicit price assumptions, separate from stored quotes. No clock, persistence or trading. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 function payload(raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==2||!['mode','price'].every(k=>Object.hasOwn(raw,k)))D.fail('Kursmodus und Preis ausdrücklich angeben; unbekannte Felder sind nicht erlaubt.');
  if(!['stored_quote','manual_scenario'].includes(raw.mode))D.fail('Gespeicherten Kurs oder hypothetischen Szenariokurs ausdrücklich wählen.');
  if(raw.mode==='stored_quote'){if(raw.price!==null)D.fail('Gespeicherter Kurs benötigt price:null; keinen versteckten manuellen Wert mitführen.');return {mode:raw.mode,price:null};}
  return {mode:raw.mode,price:D.number(raw.price,'Positiver hypothetischer EUR-Kurs',false)};
 }
 function resolve(portfolio,instrument_id,valuation_date,input){
  const assumption=payload(input),asOf=D.day(valuation_date);if(typeof instrument_id!=='string'||!instrument_id||instrument_id.trim()!==instrument_id||instrument_id.length>160)D.fail('Wertpapier ausdrücklich mit gültiger ID wählen.');
  const p=D.portfolio(portfolio),instrument=p.instruments.find(i=>i.id===instrument_id);if(!instrument)D.fail('Wertpapier gehört nicht zu diesem Depot.');
  const eligible=p.quotes.map((q,n)=>({...q,sequence:portfolio.quotes[n].sequence??null})).filter(q=>q.instrument_id===instrument_id&&q.date<=asOf);
  let stored_quote=null;
  if(eligible.length){const latestDate=eligible.reduce((date,q)=>q.date>date?q.date:date,''),latest=eligible.filter(q=>q.date===latestDate),sequences=new Set();
   for(const q of latest){if(q.sequence!==null&&(!Number.isSafeInteger(q.sequence)||q.sequence<1))D.fail('Ungültige Sequenz des gespeicherten Vergleichskurses.');if(latest.length>1&&(q.sequence===null||sequences.has(q.sequence)))D.fail('Kurse gleichen Datums ohne eindeutige Sequenz sind mehrdeutig; Vergleichskurs zuerst klären.');sequences.add(q.sequence);}
   stored_quote=latest.reduce((chosen,q)=>!chosen||(q.sequence??0)>(chosen.sequence??0)?q:chosen,null);
  }
  const hypothetical=assumption.mode==='manual_scenario',effective_price=hypothetical?assumption.price:stored_quote?.price??null,stored_quote_age_days=stored_quote?(Date.parse(asOf)-Date.parse(stored_quote.date))/86400000:null,warnings=[];
  if(hypothetical)warnings.push('hypothetical_price_not_a_market_quote');
  if(!stored_quote)warnings.push('stored_comparison_quote_missing');
  if(stored_quote_age_days!==null&&stored_quote_age_days>7)warnings.push('stored_comparison_quote_older_than_seven_days');
  return {price_assumption:structuredClone(assumption),instrument:structuredClone(instrument),currency:'EUR',valuation_date:asOf,mode:assumption.mode,hypothetical,effective_price,price_status:effective_price===null?'missing_stored_quote':'resolved',stored_quote_status:stored_quote?'available':'missing',stored_quote:stored_quote?structuredClone(stored_quote):null,stored_quote_age_days,warnings,note:hypothetical?'Ausdrücklich angenommener hypothetischer EUR-Kurs. Kein gespeicherter Marktkurs, neues Beobachtungsdatum oder bestätigter Depotwert.':'Erfasster eindeutiger Stichtagskurs; keine Live-Abfrage oder Bestätigung aktueller Marktdaten.'};
 }
 const api=Object.freeze({payload,resolve});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerScenarioPrice=api;
})();
