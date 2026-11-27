/* Explicit shared simulation targets. No optimizer, allowance, clock, storage or orders. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain,Single=typeof module!=='undefined'?require('./sale-scenario-domain.js'):TrackerSaleScenario,S=10n**24n,DISPLAY=10n**36n;
 const statuses=new Set(['target_reached','below_target_after_step_rounding']);
 function fields(raw,keys,label){if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==keys.length||keys.some(k=>!Object.hasOwn(raw,k)))D.fail(label+': alle Angaben ausdrücklich angeben; unbekannte Felder sind nicht erlaubt.');}
 function id(v){if(typeof v!=='string'||!v||v.trim()!==v||v.length>160)D.fail('Gültige ausdrückliche Wertpapier-ID erforderlich.');return v;}
 function payload(raw){
  fields(raw,['plan_version','valuation_date','target_gain_total','rows'],'Gemeinsames Gewinnziel');if(raw.plan_version!==1)D.fail('Unbekannte gemeinsame Gewinnzielversion.');
  const valuation_date=D.day(raw.valuation_date),target_gain_total=D.number(raw.target_gain_total,'Positives Gesamtgewinnziel',false);
  if(!Array.isArray(raw.rows)||!raw.rows.length||raw.rows.length>17)D.fail('Eine bis 17 ausdrücklich gewählte Wertpapierzeilen erwartet.');const ids=new Set();
  const rows=raw.rows.map(r=>{fields(r,['instrument_id','ordering','purchase_cost_basis','target_gain','quantity_step','estimated_sale_fee','estimated_sale_tax'],'Gewinnzielzeile');const instrument_id=id(r.instrument_id);if(ids.has(instrument_id))D.fail('Ein Wertpapier darf nur einmal im gemeinsamen Gewinnziel vorkommen.');ids.add(instrument_id);
   if(r.ordering!=='date_sequence_fifo')D.fail('FIFO nach Datum und Buchungssequenz ausdrücklich als Annahme wählen.');if(!['trade_amount','including_embedded_costs'].includes(r.purchase_cost_basis))D.fail('Anschaffungsbasis der Simulation ausdrücklich wählen.');
   return {instrument_id,ordering:r.ordering,purchase_cost_basis:r.purchase_cost_basis,target_gain:D.number(r.target_gain,'Positives Teilgewinnziel',false),quantity_step:D.number(r.quantity_step,'Positive Stückelung',false),estimated_sale_fee:D.number(r.estimated_sale_fee,'Geschätzte Verkaufsgebühr'),estimated_sale_tax:D.number(r.estimated_sale_tax,'Geschätzter Verkaufssteuerabzug')};
  });
  if(rows.reduce((n,r)=>n+D.dec(r.target_gain),0n)>D.dec(target_gain_total))D.fail('Die Summe der Teilgewinnziele überschreitet das gemeinsame Gesamtziel. Keine automatische Verteilung oder Kürzung.');
  return {plan_version:1,valuation_date,target_gain_total,rows};
 }
 function gcd(a,b){if(a<0n)a=-a;while(b){const r=a%b;a=b;b=r;}return a||1n;}
 function rat(n,d=1n){if(d<=0n)D.fail('Ungültiger Gewinnbruch.');const g=gcd(n,d);return {n:n/g,d:d/g};}
 const add=(a,b)=>rat(a.n*b.d+b.n*a.d,a.d*b.d),sub=(a,b)=>rat(a.n*b.d-b.n*a.d,a.d*b.d),cmp=(a,b)=>a.n*b.d-b.n*a.d;
 const money=s=>rat(D.dec(s),S),exact=r=>({numerator:String(r.n),denominator:String(r.d)});
 function fraction(r){if(!r||typeof r.numerator!=='string'||typeof r.denominator!=='string'||! /^-?\d+$/.test(r.numerator)||! /^\d+$/.test(r.denominator))D.fail('Exakter Einzelgewinnbruch fehlt.');return rat(BigInt(r.numerator),BigInt(r.denominator));}
 function decimal(r){const v=r.n*DISPLAY/r.d,negative=v<0n,n=negative?-v:v,f=(n%DISPLAY).toString().padStart(36,'0').replace(/0+$/,'');return (negative?'-':'')+(n/DISPLAY)+(f?'.'+f:'');}
 function calculate(portfolio,input){
  const plan=payload(input),p=D.portfolio(portfolio),ids=new Set(p.instruments.map(i=>i.id));for(const r of plan.rows)if(!ids.has(r.instrument_id))D.fail('Wertpapier gehört nicht zu diesem Depot.');
  const allocated=plan.rows.reduce((n,r)=>n+D.dec(r.target_gain),0n),unallocated=D.dec(plan.target_gain_total)-allocated;
  const rows=plan.rows.map(r=>Single.calculate(portfolio,{...r,valuation_date:plan.valuation_date}));
  const blocked_rows=rows.filter(r=>!statuses.has(r.status)||!r.simulation).map(r=>({instrument_id:r.instrument_id,status:r.status}));
  const base={plan:structuredClone(plan),currency:'EUR',valuation_date:plan.valuation_date,target_gain_total:plan.target_gain_total,allocated_target:D.str(allocated),unallocated_target:D.str(unallocated),complete:blocked_rows.length===0,status:blocked_rows.length?'incomplete':'complete',rows,blocked_rows,totals:null,decimal_precision:36,decimal_rounding:'toward_zero; exact EUR fractions also supplied',warnings:['manual_partial_targets_not_automatically_redistributed','simulation_not_verified_tax_gain','no_allowance_or_tax_factor_applied'],note:'Reine gemeinsame Gewinnziel-Simulation. Teilziele manuell vergeben, keine automatische Verteilung, steuerlich bestätigten Lose, Orders oder Registeränderungen.'};
  if(blocked_rows.length)return base;
  const keys=['proceeds','cost_basis','gross_gain','net_cash','net_gain'],totals=Object.fromEntries([...keys,'sale_fee','sale_tax','allocated_shortfall','remaining_target'].map(k=>[k,rat(0n)]));
  for(let n=0;n<rows.length;n++){
   const r=rows[n],s=r.simulation,target=money(plan.rows[n].target_gain);for(const k of keys)totals[k]=add(totals[k],fraction(s.exact[k]));
   const gain=fraction(s.exact.gross_gain);if(gain.n<=0n||cmp(gain,target)>0n)D.fail('Einzelsimulation verletzt das positive Teilgewinnziel.');
   totals.sale_fee=add(totals.sale_fee,money(r.estimated_sale_fee));totals.sale_tax=add(totals.sale_tax,money(r.estimated_sale_tax));
  }
  const target=money(plan.target_gain_total),assigned=rat(allocated,S);totals.allocated_shortfall=sub(assigned,totals.gross_gain);totals.remaining_target=sub(target,totals.gross_gain);
  if(cmp(totals.gross_gain,assigned)>0n||cmp(assigned,target)>0n||cmp(totals.remaining_target,add(rat(unallocated,S),totals.allocated_shortfall))!==0n)D.fail('Gemeinsame Gewinnzielgrenze verletzt.');
  if(cmp(sub(totals.proceeds,totals.cost_basis),totals.gross_gain)!==0n||cmp(sub(sub(totals.proceeds,totals.sale_fee),totals.sale_tax),totals.net_cash)!==0n||cmp(sub(sub(totals.gross_gain,totals.sale_fee),totals.sale_tax),totals.net_gain)!==0n)D.fail('Gemeinsame Kosten-/Gewinnabstimmung verletzt.');
  return {...base,totals:{...Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,decimal(v)])),exact:Object.fromEntries(Object.entries(totals).map(([k,v])=>[k,exact(v)]))}};
 }
 const api=Object.freeze({payload,calculate});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerSharedGain=api;
})();
