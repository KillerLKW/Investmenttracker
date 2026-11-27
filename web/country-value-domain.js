/* Pure country projection of explicit values. No quote or journal fabrication. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain,C=typeof module!=='undefined'?require('./country-domain.js'):TrackerCountries;
 const REGIONS=C.REGIONS,MARKETS=C.MARKETS,S24=10n**24n,S36=10n**36n,snapshots=C.snapshots,selectionDate=r=>r.effective_date||r.observed_date;
 function decimal(v,label){if(typeof v!=='string'||!/^\d{1,60}(\.\d{1,24})?$/.test(v))D.fail(label+': nicht negativer Dezimalwert mit höchstens 24 Nachkommastellen erwartet.');return D.dec(v);}
 function explicit(p,values){if(!Array.isArray(values)||values.length!==p.instruments.length||values.length>100)D.fail('Genau ein Positionswert je Depotinstrument (höchstens 100) erforderlich.');const ids=new Set(p.instruments.map(i=>i.id)),byId=new Map();for(const r of values){if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==3||!['instrument_id','quantity','value'].every(k=>Object.hasOwn(r,k))||!ids.has(r.instrument_id)||byId.has(r.instrument_id))D.fail('Eindeutige Depot-ID, quantity und value je Positionswert erforderlich.');const quantity=decimal(r.quantity,'Stückzahl'),value=r.value===null?null:decimal(r.value,'Positionswert');if(quantity===0n&&value!==0n)D.fail('Nullbestand benötigt Positionswert null Euro.');byId.set(r.instrument_id,{quantity:D.str(quantity),value:value===null?null:D.str(value)});}return {positions:p.instruments.map(i=>({...i,...byId.get(i.id)})),invested:values.some(r=>r.value===null)?null:'0'};}
 function str36(n){const f=(n%S36).toString().padStart(36,'0').replace(/0+$/,'');return String(n/S36)+(f?'.'+f:'');}
 const zeroes=keys=>Object.fromEntries(keys.map(k=>[k,0n])),ratio=(value,base)=>base===0n?null:D.str(value*S24/base),shares=(amounts,base)=>Object.fromEntries(Object.entries(amounts).map(([k,v])=>[k,{value:str36(v),weight:ratio(v,base)}]));
  function project(portfolio, asOf, values) {
    const p=D.portfolio(portfolio),overview=explicit(p,values);
    D.day(asOf);
    const rows = snapshots(portfolio.country_snapshots, new Set(p.instruments.map(i => i.id)));
    const regions = zeroes(REGIONS), markets = zeroes(MARKETS), asia = zeroes(MARKETS);
    const countries = new Map(), labels = new Map(), warnings = [], positions = [];
    let base = 0n, unknown = 0n;
    for (const position of overview.positions) {
      if (D.dec(position.quantity) === 0n) continue;
      const chosen = C.select(rows,position.id,asOf);
      const available = !!chosen && selectionDate(chosen.classification) <= asOf;
      const info = {instrument_id: position.id, snapshot_id: chosen?.id || null,
        effective_date: chosen?.effective_date || null, observed_date: chosen?.observed_date || null,
        selection_date: chosen ? selectionDate(chosen) : null, source: chosen?.source || null,
        classification: chosen?.classification || null, classification_available: available,
        composition_date_unknown: !!chosen && chosen.effective_date === null,
        classification_date_unknown: !!chosen && chosen.classification.effective_date === null,
        age_days: chosen ? (Date.parse(asOf) - Date.parse(selectionDate(chosen))) / 86400000 : null};
      if (!chosen) warnings.push({code: 'missing_weights', instrument_id: position.id});
      else {
        if (!chosen.effective_date) warnings.push({code: 'unknown_composition_date', instrument_id: position.id});
        if (!available) warnings.push({code: 'future_classification', instrument_id: position.id});
        else if (!chosen.classification.effective_date) warnings.push({code: 'unknown_classification_date', instrument_id: position.id});
      }
      const value = position.value === null ? null : D.dec(position.value) * 10n ** 12n;
      if (value === null) warnings.push({code: 'missing_price', instrument_id: position.id});
      else base += value;
      const pr = zeroes(REGIONS), pm = zeroes(MARKETS), pa = zeroes(MARKETS);
      let allocated = 0n;
      const allocations = (chosen?.allocations || []).map(a => {
        const amount = value === null ? null : value * D.dec(a.weight) / S24;
        const region = available ? a.region : 'unknown', market = available ? a.market_class : 'unknown';
        if (!countries.has(a.country_id)) countries.set(a.country_id, {value: 0n, variants: new Map(), instruments: new Set()});
        const entry = countries.get(a.country_id), variantKey = JSON.stringify([a.label, region, market, chosen.classification.scheme]);
        if (!entry.variants.has(variantKey)) entry.variants.set(variantKey, {label: a.label, region, market_class: market, scheme: chosen.classification.scheme, instrument_ids: new Set()});
        entry.variants.get(variantKey).instrument_ids.add(position.id); entry.instruments.add(position.id);
        if (!labels.has(a.label)) labels.set(a.label, new Map());
        const ids = labels.get(a.label); if (!ids.has(a.country_id)) ids.set(a.country_id, new Set()); ids.get(a.country_id).add(position.id);
        if (amount !== null) {
          entry.value += amount; allocated += amount; pr[region] += amount; pm[market] += amount;
          if (region === 'asia_pacific') pa[market] += amount;
        }
        return {...a, region, market_class: market, declared_region: a.region, declared_market_class: a.market_class, value: amount === null ? null : str36(amount)};
      });
      const rest = value === null ? null : value - allocated;
      if (rest !== null) {
        unknown += rest; pr.unknown += rest; pm.unknown += rest;
        for (const k of REGIONS) regions[k] += pr[k];
        for (const k of MARKETS) {markets[k] += pm[k]; asia[k] += pa[k];}
      }
      positions.push({...info, value: value === null ? null : str36(value), known_country_value: value === null ? null : str36(allocated), unknown_country_value: rest === null ? null : str36(rest), allocations,
        regions: value === null ? null : shares(pr, value), market_classes: value === null ? null : shares(pm, value), asia_pacific: value === null ? null : shares(pa, value)});
    }
    for (const [id, entry] of countries) {
      const variants = [...entry.variants.values()];
      if (['label', 'region', 'market_class'].some(k => new Set(variants.map(v => v[k])).size > 1)) {
        for (const instrument_id of entry.instruments) warnings.push({code: 'country_conflict', country_id: id, instrument_id});
      }
    }
    for (const [label, ids] of labels) if (ids.size > 1) for (const instrument_id of new Set([...ids.values()].flatMap(v => [...v]))) warnings.push({code: 'country_alias_conflict', label, country_ids: [...ids.keys()].sort(), instrument_id});
    const complete = overview.invested !== null;
    return {as_of: asOf, complete, basis: 'securities_excluding_cash', value: complete ? str36(base) : null, known_value: str36(base),
      known_country_value: complete ? str36(base - unknown) : null, unknown_country: complete ? {value: str36(unknown), weight: ratio(unknown, base)} : null,
      countries: complete ? [...countries].sort(([a], [b]) => a.localeCompare(b)).map(([id, entry]) => ({country_id: id, labels: [...new Set([...entry.variants.values()].map(v => v.label))].sort(), value: str36(entry.value), weight: ratio(entry.value, base), variants: [...entry.variants.values()].map(v => ({...v, instrument_ids: [...v.instrument_ids].sort()}))})) : null,
      regions: complete ? shares(regions, base) : null, market_classes: complete ? shares(markets, base) : null, asia_pacific: complete ? shares(asia, base) : null,
      positions, warnings};
  }
 const api=Object.freeze({project});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerCountryValues=api;
})();
