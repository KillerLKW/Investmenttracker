/* Separate price-aware simulations. Old payloads/models remain unchanged. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain,Single=typeof module!=='undefined'?require('./sale-scenario-domain.js'):TrackerSaleScenario,Shared=typeof module!=='undefined'?require('./shared-gain-domain.js'):TrackerSharedGain,Price=typeof module!=='undefined'?require('./scenario-price-domain.js'):TrackerScenarioPrice;
 function fields(r,keys,label){if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==keys.length||keys.some(k=>!Object.hasOwn(r,k)))D.fail(label+': vollständige ausdrückliche Angaben erforderlich, keine unbekannten Felder.');}
 function singlePayload(raw){
  fields(raw,['options','price_assumption'],'Simulation mit Kursannahme');const r=raw.options;
  fields(r,['instrument_id','valuation_date','ordering','purchase_cost_basis','target_gain','quantity_step','estimated_sale_fee','estimated_sale_tax'],'Einzelsimulation');
  // Reuse the shared validator for precisely the existing single-row assumptions.
  const {valuation_date,...row}=r,p=Shared.payload({plan_version:1,valuation_date,target_gain_total:r.target_gain,rows:[row]});
  return {options:{...p.rows[0],valuation_date:p.valuation_date},price_assumption:Price.payload(raw.price_assumption)};
 }
 function sharedPayload(raw){
  fields(raw,['plan','price_assumptions'],'Gemeinsame Simulation mit Kursannahmen');const plan=Shared.payload(raw.plan);
  if(!Array.isArray(raw.price_assumptions)||raw.price_assumptions.length!==plan.rows.length)D.fail('Genau eine Kursannahme je gewähltem Wertpapier erforderlich.');
  const selected=new Set(plan.rows.map(r=>r.instrument_id)),byId=new Map();for(const r of raw.price_assumptions){fields(r,['instrument_id','assumption'],'Wertpapier-Kursannahme');if(!selected.has(r.instrument_id)||byId.has(r.instrument_id))D.fail('Fehlende, fremde oder doppelte Instrument-Kursannahme.');byId.set(r.instrument_id,Price.payload(r.assumption));}
  return {plan,price_assumptions:plan.rows.map(r=>({instrument_id:r.instrument_id,assumption:byId.get(r.instrument_id)}))};
 }
 function priceView(raw,contexts){
  const view=structuredClone(raw);for(const c of contexts){if(!c.hypothetical)continue;
   // Private numerical bridge to the unchanged engine: no record ID, persistence or returned quote.
   // The date is only the engine's valuation cutoff. It is never an observed date of the assumption.
   view.quotes=view.quotes.filter(q=>q.instrument_id!==c.instrument.id);
   view.quotes.push({instrument_id:c.instrument.id,date:c.valuation_date,price:c.effective_price,source:'Private hypothetical calculation input',currency:'EUR',sequence:1});
  }return view;
 }
 function annotate(result,context){return {...result,quote:context.hypothetical?null:result.quote,hypothetical:context.hypothetical,price_context:structuredClone(context),warnings:context.hypothetical?[...result.warnings,...context.warnings]:result.warnings,note:context.hypothetical?'Hypothetische Verkaufssimulation mit ausdrücklich angenommener Kursbasis. Keine gespeicherte Marktquote, steuerlich bestätigten Lose, Orders oder Registeränderungen.':result.note};}
 function calculateSingle(portfolio,raw){const input=singlePayload(raw),c=Price.resolve(portfolio,input.options.instrument_id,input.options.valuation_date,input.price_assumption);return annotate(Single.calculate(priceView(portfolio,[c]),input.options),c);}
 function calculateShared(portfolio,raw){
  const input=sharedPayload(raw),contexts=input.plan.rows.map((r,n)=>Price.resolve(portfolio,r.instrument_id,input.plan.valuation_date,input.price_assumptions[n].assumption)),r=Shared.calculate(priceView(portfolio,contexts),input.plan),hypothetical=contexts.some(c=>c.hypothetical);
  return {...r,rows:r.rows.map((row,n)=>annotate(row,contexts[n])),hypothetical,price_contexts:contexts.map(c=>({instrument_id:c.instrument.id,...structuredClone(c)})),note:hypothetical?'Gemeinsame hypothetische Gewinnziel-Simulation mit ausdrücklichen Kursannahmen je Instrument. Keine bestätigte Markt-/Steuerbewertung, Orders oder Registeränderungen.':r.note};
 }
 const api=Object.freeze({singlePayload,sharedPayload,calculateSingle,calculateShared});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerScenarioSale=api;
})();
