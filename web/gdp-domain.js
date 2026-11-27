/* Isolated GDP comparison; no storage, network or application integration. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 const C=typeof module!=='undefined'?require('./country-domain.js'):TrackerCountries;
 const SCALE=10n**24n, MONEY=10n**36n;
 function fields(r,required,label){if(!r||typeof r!=='object'||Array.isArray(r)||required.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!required.includes(k)))D.fail(label+': fehlende oder unbekannte Felder.');}
 function dataset(raw){
  fields(raw,['id','method','claimed_reference_year','verified_reference_year','observed_date','unit','provider','source','world_total','records'],'BIP-Datensatz');
  if(!['nominal','ppp'].includes(raw.method))D.fail('Unbekannte BIP-Methode.');
  const year=v=>{if(v!==null&&(!Number.isSafeInteger(v)||v<1900||v>2200))D.fail('Ungültiges BIP-Bezugsjahr.');return v;};
  const claimed=year(raw.claimed_reference_year),verified=year(raw.verified_reference_year),observed=D.day(raw.observed_date);
  if((claimed!==null&&claimed>Number(observed.slice(0,4)))||(verified!==null&&verified>Number(observed.slice(0,4))))D.fail('BIP-Bezugsjahr liegt nach Beobachtungsjahr.');
  if(!Array.isArray(raw.records)||raw.records.length>1000)D.fail('Höchstens 1.000 BIP-Zeilen erwartet.');
  const ids=new Set(),labels=new Set(),records=raw.records.map(r=>{fields(r,['country_id','label','value'],'BIP-Zeile');const label=D.text(r.label,'Länderbezeichnung',160),id=r.country_id===null?null:D.text(r.country_id,'Länder-ID',160);if(labels.has(label)||(id!==null&&ids.has(id)))D.fail('Doppelte BIP-Länderkennung oder Bezeichnung.');labels.add(label);if(id!==null)ids.add(id);return {country_id:id,label,value:D.number(r.value,'BIP-Wert')};});
  return {id:D.text(raw.id,'BIP-ID',160),method:raw.method,claimed_reference_year:claimed,verified_reference_year:verified,observed_date:observed,
   unit:raw.unit===null?null:D.text(raw.unit,'BIP-Einheit',160),provider:raw.provider===null?null:D.text(raw.provider,'BIP-Herausgeber',240),source:C.source(raw.source),world_total:D.number(raw.world_total,'BIP-Weltbasis',false),records};
 }
 const sum=rows=>rows.reduce((s,r)=>s+D.dec(r.value),0n);
 const ratio=(n,b)=>b===0n?null:D.str(n*SCALE/b);
 const money=s=>{const [a,b='']=s.split('.');return BigInt(a)*MONEY+BigInt(b.padEnd(36,'0'));};
 const strMoney=n=>{const f=(n%MONEY).toString().padStart(36,'0').replace(/0+$/,'');return String(n/MONEY)+(f?'.'+f:'');};
 function metrics(pn,pd,qn,qd){
  if(pd===0n||qd===0n)return {actual_weight:null,target_weight:null,difference:null,relative_target:null,relative_actual:null,status:null};
  const delta=pn*qd-qn*pd;
  return {actual_weight:ratio(pn,pd),target_weight:ratio(qn,qd),difference:ratio(delta,pd*qd),relative_target:qn===0n?null:ratio(delta,qn*pd),relative_actual:pn===0n?null:ratio(delta,pn*qd),
   status:qn===0n?(pn===0n?'both_zero':'target_zero'):pn*qd*10n<qn*pd*7n?'underweight':pn*qd*10n>qn*pd*13n?'overweight':'in_band'};
 }
 function deviation(actual,target){const a=D.dec(D.number(actual,'Istanteil')),b=D.dec(D.number(target,'BIP-Anteil'));if(a>SCALE||b>SCALE)D.fail('Einzelanteil darf 100 % nicht übersteigen.');return metrics(a,SCALE,b,SCALE);}
 function compare(portfolio,raw,asOf,options={basis:'world'}){
  const g=dataset(raw);D.day(asOf);fields(options,options.basis==='common'?['basis','country_ids']:['basis'],'BIP-Vergleichsbasis');if(!['world','common'].includes(options.basis))D.fail('Unbekannte BIP-Vergleichsbasis.');
  const d=C.distribution(portfolio,asOf),world=D.dec(g.world_total),selected=sum(g.records),over=selected>world,available=g.observed_date<=asOf;
  const warnings=[...d.warnings],reasons=[];
  if(!d.complete)reasons.push('missing_price');if(!available)reasons.push('future_dataset');if(over)reasons.push('gdp_overcoverage');
  if(g.verified_reference_year===null)warnings.push({code:'unverified_reference_year'});if(g.unit===null||g.provider===null)warnings.push({code:'unverified_provenance'});
  const conflicts=new Set();for(const w of d.warnings){if(w.code==='country_conflict')conflicts.add(w.country_id);if(w.code==='country_alias_conflict')for(const id of w.country_ids)conflicts.add(id);}
  if(conflicts.size)reasons.push('country_identity_conflict');
  const countries=new Map((d.countries||[]).map(r=>[r.country_id,r])),targets=new Map(g.records.filter(r=>r.country_id!==null).map(r=>[r.country_id,r]));
  let chosen=null;if(options.basis==='common'){
   if(!Array.isArray(options.country_ids)||!options.country_ids.length||options.country_ids.length>1000||new Set(options.country_ids).size!==options.country_ids.length)D.fail('Gemeinsame Auswahl benötigt eindeutige Länder-IDs.');
   chosen=new Set(options.country_ids.map(id=>D.text(id,'Auswahl-Länder-ID',160)));
   if(chosen.size!==options.country_ids.length)D.fail('Doppelte Auswahl-Länder-ID.');
   for(const id of chosen)if(!targets.has(id)||(d.complete&&!countries.has(id)))D.fail('Ausgewähltes Land ist nicht auf beiden Seiten vorhanden.');
  }
  let matched=0n,unmatched=0n,portfolioBase=0n,gdpBase=0n;
  for(const c of countries.values()){const v=money(c.value);if(targets.has(c.country_id)&&!conflicts.has(c.country_id))matched+=v;else unmatched+=v;}
  if(options.basis==='world'){portfolioBase=d.complete?money(d.value):0n;gdpBase=world;}else for(const id of chosen){if(countries.has(id))portfolioBase+=money(countries.get(id).value);gdpBase+=D.dec(targets.get(id).value);}
  if(portfolioBase===0n||gdpBase===0n)reasons.push('zero_basis');const comparable=reasons.length===0;
  const rowIds=chosen?[...chosen]:[...new Set([...countries.keys(),...targets.keys()])];
  const rows=rowIds.sort().map(id=>{
   const c=countries.get(id),t=targets.get(id),v=c?money(c.value):0n;
   const usable=comparable&&!!t&&!conflicts.has(id),m=usable?metrics(v,portfolioBase,D.dec(t.value),gdpBase):{actual_weight:null,target_weight:null,difference:null,relative_target:null,relative_actual:null,status:null};
   return {country_id:id,portfolio_labels:c?.labels||[],benchmark_label:t?.label||null,portfolio_value:d.complete?strMoney(v):null,gdp_value:t?.value||null,observed_portfolio_row:!!c,...m,reason:!t?'missing_gdp_counterpart':conflicts.has(id)?'country_identity_conflict':!comparable?reasons[0]:null};
  });
  return {as_of:asOf,basis:options.basis,complete:d.complete,comparable,reasons,dataset:g,
   portfolio_value:d.value,known_portfolio_value:d.known_value,matched_value:d.complete?strMoney(matched):null,unmatched_value:d.complete?strMoney(unmatched):null,unknown_country_value:d.complete?d.unknown_country.value:null,
   portfolio_basis:d.complete?strMoney(portfolioBase):null,gdp_basis:D.str(gdpBase),portfolio_outside_selection:d.complete?strMoney(money(d.value)-portfolioBase):null,
   gdp_selected_total:D.str(selected),gdp_unlisted_residual:D.str(selected<world?world-selected:0n),gdp_overreported:D.str(over?selected-world:0n),gdp_selected_world_weight:over?null:ratio(selected,world),
   gdp_without_country_id:D.str(sum(g.records.filter(r=>r.country_id===null))),gdp_outside_selection:chosen?D.str(selected-gdpBase):'0',
   positions:d.positions,rows,warnings};
 }
 const api=Object.freeze({dataset,deviation,compare});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerGDP=api;
})();
