/* Read-only, source-mapped template scenarios; exact amounts at 36 places. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 const R=typeof module!=='undefined'?require('./region-domain.js'):TrackerRegions;
 const T=typeof module!=='undefined'?require('./target-domain.js'):TrackerTargets;
 const S=10n**36n,W=10n**24n;
 function units(s){
  if(typeof s!=='string'||!/^\d+(\.\d{1,36})?$/.test(s))D.fail('Ungültiger Szenariowert.');
  const [a,b='']=s.split('.');return BigInt(a)*S+BigInt(b.padEnd(36,'0'));
 }
 function str(n){const sign=n<0n?'-':'';if(n<0n)n=-n;const f=(n%S).toString().padStart(36,'0').replace(/0+$/,'');return sign+(n/S)+(f?'.'+f:'');}
 function calculate(p,asOf,plan,funding,records){
  const deposit=D.number(funding.deposit,'Neue Einzahlung'),released=D.number(funding.cash,'Freigegebenes Cash'),costs=D.number(funding.costs,'Geschätzte Gesamtkosten');
  if(!['allow','block'].includes(funding.sales))D.fail('Verkaufsregel ausdrücklich wählen.');
  if(plan.mode==='deposit'&&D.dec(deposit)!==D.dec(plan.amount))D.fail('Neue Einzahlung muss dem Betrag der Sollbasis entsprechen.');
  const d=R.distribution(p,asOf),comparison=T.compare(d,plan),o=D.overview(p,asOf);
  if(!comparison.complete)D.fail('Kurse zum Stichtag fehlen. Keine vollständige Vorschau möglich.');
  if(D.dec(o.cash)<0n)D.fail('Cash-Bestand ist negativ. Buchungen zuerst prüfen.');
  if(D.dec(released)>D.dec(o.cash))D.fail('Freigegebenes Cash übersteigt den Cash-Bestand am Stichtag.');
  const expected=['Neutral USA','Neutral EU','Neutral EM','Neutral Asien/Pazifik','Neutral FTSE','Small cap USA','Small cap EU','Small cap EM','Value USA','Value EU','Value EM','Quality USA','Quality EU','Quality EM','Momentum USA','Momentum EU','Multi-Faktor EM'];
  const mapped=new Map(),used=new Set();
  for(const name of expected){
   const source=records.filter(r=>r.source.sheet===name);
   if(source.length!==1)D.fail('Vorlagenzuordnung fehlt oder ist mehrdeutig: '+name);
   const positions=o.positions.filter(i=>i.isin===source[0].isin);
   if(positions.length!==1)D.fail('Wertpapier der Vorlage fehlt oder ist mehrdeutig: '+name);
   const i=positions[0];
   if(i.category!==source[0].source_category)D.fail('Strategiezuordnung weicht von der Vorlage ab: '+i.name);
   if(!i.quote)D.fail('Kurs zum Stichtag fehlt: '+i.name);
   if(used.has(i.id))D.fail('Mehrdeutige Vorlagenzuordnung.');
   used.add(i.id);mapped.set(name,i);
  }
  if(o.positions.some(i=>!used.has(i.id)&&D.dec(i.quantity)!==0n))D.fail('Bestand außerhalb der 17 Vorlagen-ETFs. Für dieses Depot ist die Vorlagenvorschau nicht vollständig definiert.');
  const basis=units(comparison.basis),ftse=mapped.get('Neutral FTSE');
  const ftsePosition=d.positions.find(i=>i.instrument_id===ftse.id);
  if(D.dec(ftse.quantity)>0n&&!ftsePosition?.snapshot_id)D.fail('Regionalgewichte für den gehaltenen FTSE fehlen am Stichtag.');
  const budget=new Map(),conflicts=[];
  const neutral={};
  for(const [key,weight] of Object.entries(T.REGIONS)){
   const desired=basis*D.dec(T.CATEGORIES.Neutral)*D.dec(weight)/(W*W);
   const fixed=ftsePosition?units(ftsePosition.regions[key]):0n;
   const rest=desired-fixed;
   if(rest<0n)conflicts.push({region:key,excess:str(-rest)});
   neutral[key]=rest;
  }
  if(conflicts.length)return {valid:false,conflicts,as_of:asOf,basis:comparison.basis};
  budget.set('Neutral USA',neutral.north_america);budget.set('Neutral EU',neutral.europe);
  budget.set('Neutral EM',neutral.asia_pacific*4n/10n);budget.set('Neutral Asien/Pazifik',neutral.asia_pacific-neutral.asia_pacific*4n/10n);
  for(const category of ['Small cap','Value','Quality','Momentum'])for(const [region,suffix] of [['north_america','USA'],['europe','EU'],['asia_pacific','EM']]){
   const name=category==='Momentum'&&suffix==='EM'?'Multi-Faktor EM':category+' '+suffix;
   budget.set(name,basis*D.dec(T.CATEGORIES[category])*D.dec(T.REGIONS[region])/(W*W));
  }
  let buys=0n,sells=0n;const orders=[];
  for(const [name,i] of mapped){
   const fixed=name==='Neutral FTSE',price=units(i.quote.price),current=D.dec(i.quantity),desired=fixed?units(i.value):budget.get(name);
   const whole=desired/price+(desired%price*2n>=price?1n:0n);
   const target=fixed?current:whole*W,delta=target-current;
   const signedAmount=delta*price/W;
   if(delta>0n)buys+=signedAmount;else sells-=signedAmount;
   orders.push({instrument_id:i.id,name:i.name,isin:i.isin,role:name,category:i.category,current:i.quantity,target:D.str(target),quantity:D.str(delta),amount:str(signedAmount),price:i.quote.price,quote_date:i.quote.date,quote_source:i.quote.source,fixed,desired:str(desired)});
  }
  const remaining=units(deposit)+units(released)+sells-buys-units(costs);
  const salesBlocked=funding.sales==='block'&&orders.some(r=>D.dec(r.quantity)<0n);
  // Synthetic transactions exist only in a cloned portfolio for after-view calculation.
  const simulated=structuredClone(p);
  for(const row of orders){
   const q=D.dec(row.quantity);if(q===0n)continue;
   simulated.transactions.push({type:q<0n?'sell':'buy',date:asOf,instrument_id:row.instrument_id,quantity:D.str(q<0n?-q:q),amount:row.amount.startsWith('-')?row.amount.slice(1):row.amount,fee:'0',tax:'0',void:false});
  }
  const after=R.distribution(simulated,asOf);
  const regionalUncertainty=[...d.warnings,...after.warnings].some(w=>w.code==='missing_weights'||w.code==='unknown_composition_date');
  return {valid:true,as_of:asOf,basis:comparison.basis,deposit,released,costs,buys:str(buys),sells:str(sells),remaining:str(remaining),shortfall:str(remaining<0n?-remaining:0n),salesBlocked,financed:remaining>=0n&&!salesBlocked,
   unreleased_cash:D.str(D.dec(o.cash)-D.dec(released)),orders,after,regionalUncertainty,warnings:o.warnings,
   unrounded_total:str([...budget.values()].reduce((s,v)=>s+v,units(ftse.value))),target_total:after.value};
 }
 const api=Object.freeze({calculate});globalThis.TrackerScenarios=api;if(typeof module!=='undefined')module.exports=api;
})();
