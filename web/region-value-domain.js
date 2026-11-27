/* Pure regional projection of explicit values. Does not create or resolve quotes. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain,R=typeof module!=='undefined'?require('./region-domain.js'):TrackerRegions,S=10n**24n,S36=10n**36n;
 function decimal(v,label){if(typeof v!=='string'||!/^\d{1,60}(\.\d{1,24})?$/.test(v))D.fail(label+': nicht negativer Dezimalwert mit höchstens 24 Nachkommastellen erwartet.');return D.dec(v);}
 function str(v){const f=(v%S36).toString().padStart(36,'0').replace(/0+$/,'');return String(v/S36)+(f?'.'+f:'');}
 function project(portfolio,asOf,values){
  D.day(asOf);const p=D.portfolio(portfolio),ids=new Set(p.instruments.map(i=>i.id)),snapshots=R.snapshots(portfolio.region_snapshots,ids);
  if(!Array.isArray(values)||values.length!==ids.size||values.length>100)D.fail('Genau ein Positionswert je Depotinstrument (höchstens 100) erforderlich.');
  const byId=new Map();for(const r of values){if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==3||!['instrument_id','quantity','value'].every(k=>Object.hasOwn(r,k))||!ids.has(r.instrument_id)||byId.has(r.instrument_id))D.fail('Positionswerte benötigen eindeutige Depot-ID, quantity und value.');const quantity=decimal(r.quantity,'Stückzahl'),value=r.value===null?null:decimal(r.value,'Positionswert');if(quantity===0n&&value!==0n)D.fail('Nullbestand benötigt Positionswert null Euro.');byId.set(r.instrument_id,{quantity,value});}
  const amounts=Object.fromEntries([...R.KEYS,'unknown'].map(k=>[k,0n])),categories=new Map(),positions=[],warnings=[];let base=0n,complete=true;
  for(const i of p.instruments){const row=byId.get(i.id);if(row.quantity===0n)continue;const selectionDate=r=>r.effective_date||r.observed_date,chosen=snapshots.filter(r=>r.instrument_id===i.id&&!r.void&&selectionDate(r)<=asOf).sort((a,b)=>selectionDate(b).localeCompare(selectionDate(a))||b.sequence-a.sequence)[0]||null;
   const info={instrument_id:i.id,snapshot_id:chosen?.id||null,effective_date:chosen?.effective_date||null,observed_date:chosen?.observed_date||null,selection_date:chosen?selectionDate(chosen):null,source:chosen?structuredClone(chosen.source):null,composition_date_unknown:!!chosen&&chosen.effective_date===null,age_days:chosen?(Date.parse(asOf)-Date.parse(selectionDate(chosen)))/86400000:null};
   if(!chosen)warnings.push({code:'missing_weights',instrument_id:i.id});else if(chosen.effective_date===null)warnings.push({code:'unknown_composition_date',instrument_id:i.id});
   if(row.value===null){complete=false;warnings.push({code:'missing_price',instrument_id:i.id});positions.push({...info,value:null,regions:null});continue;}
   const value=row.value*10n**12n,parts=Object.fromEntries(R.KEYS.map(k=>[k,chosen?value*D.dec(chosen.weights[k])/S:0n]));parts.unknown=value-Object.values(parts).reduce((a,b)=>a+b,0n);base+=value;
   for(const k of Object.keys(amounts))amounts[k]+=parts[k];const category=i.category||'Ohne Zuordnung';categories.set(category,(categories.get(category)||0n)+value);positions.push({...info,value:str(value),regions:Object.fromEntries(Object.entries(parts).map(([k,v])=>[k,str(v)]))});
  }
  const weight=v=>base===0n?null:D.str(v*S/base);
  return {as_of:asOf,complete,basis:'securities_excluding_cash',value:complete?str(base):null,known_value:str(base),regions:complete?Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,{value:str(v),weight:weight(v)}])):null,categories:complete?[...categories].map(([name,v])=>({name,value:str(v),weight:weight(v)})):null,positions,warnings};
 }
 const api=Object.freeze({project});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerRegionValues=api;
})();
