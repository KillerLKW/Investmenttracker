/* Pure reported-sector projection of explicit values; no prices or journal entries fabricated. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain,S=typeof module!=='undefined'?require('./sector-domain.js'):TrackerSectors;
 const S24=10n**24n,S36=10n**36n,snapshots=S.snapshots,summary=S.coverage,selectionDate=r=>r.effective_date||r.observed_date,newer=(a,b)=>!b||selectionDate(a)>selectionDate(b)||(selectionDate(a)===selectionDate(b)&&a.sequence>b.sequence);
 function decimal(v,label){if(typeof v!=='string'||!/^\d{1,60}(\.\d{1,24})?$/.test(v))D.fail(label+': nicht negativer Dezimalwert mit höchstens 24 Nachkommastellen erwartet.');return D.dec(v);}
 function explicit(p,values){if(!Array.isArray(values)||values.length!==p.instruments.length||values.length>100)D.fail('Genau ein Positionswert je Depotinstrument (höchstens 100) erforderlich.');const ids=new Set(p.instruments.map(i=>i.id)),byId=new Map();for(const r of values){if(!r||typeof r!=='object'||Array.isArray(r)||Object.keys(r).length!==3||!['instrument_id','quantity','value'].every(k=>Object.hasOwn(r,k))||!ids.has(r.instrument_id)||byId.has(r.instrument_id))D.fail('Eindeutige Depot-ID, quantity und value je Positionswert erforderlich.');const quantity=decimal(r.quantity,'Stückzahl'),value=r.value===null?null:decimal(r.value,'Positionswert');if(quantity===0n&&value!==0n)D.fail('Nullbestand benötigt Positionswert null Euro.');byId.set(r.instrument_id,{quantity:D.str(quantity),value:value===null?null:D.str(value)});}return {positions:p.instruments.map(i=>({...i,...byId.get(i.id)})),invested:values.some(r=>r.value===null)?null:'0'};}

 function str36(n){const f=(n%S36).toString().padStart(36,'0').replace(/0+$/,'');return String(n/S36)+(f?'.'+f:'');}
 const ratio=(n,base)=>base===0n?null:D.str(n*S24/base),share=(n,base)=>({value:str36(n),weight:ratio(n,base)});
  function project(portfolio, asOf, values) {
    const p=D.portfolio(portfolio),overview=explicit(p,values);
    D.day(asOf);
    const rows = snapshots(portfolio.sector_snapshots, new Set(p.instruments.map(i => i.id)));
    const selected = new Map(), latestWeight = new Map();
    for (const row of rows) if (!row.void && selectionDate(row) <= asOf) {
      if (newer(row, latestWeight.get(row.instrument_id))) latestWeight.set(row.instrument_id, row);
      if (selectionDate(row.taxonomy) <= asOf && newer(row, selected.get(row.instrument_id))) selected.set(row.instrument_id, row);
    }
    const positions = [], warnings = [], taxonomies = new Map(), sectors = new Map(), aliases = new Map();
    let base = 0n, reported = 0n, unknown = 0n, over = 0n, hasOvercoverage = false;
    for (const position of overview.positions) {
      if (D.dec(position.quantity) === 0n) continue;
      const chosen = selected.get(position.id) || null, pending = latestWeight.get(position.id);
      const unavailable = pending && selectionDate(pending.taxonomy) > asOf ? pending : null;
      const totals = chosen ? summary(chosen.allocations) : {weight_sum: null, unreported_weight: null, overreported_weight: null, status: 'missing'};
      const info = {instrument_id: position.id, snapshot_id: chosen?.id || null, ...totals,
        effective_date: chosen?.effective_date || null, observed_date: chosen?.observed_date || null,
        selection_date: chosen ? selectionDate(chosen) : null, source: chosen?.source || null, taxonomy: chosen?.taxonomy || null,
        composition_date_unknown: !!chosen && chosen.effective_date === null, taxonomy_date_unknown: !!chosen && chosen.taxonomy.effective_date === null,
        age_days: chosen ? (Date.parse(asOf) - Date.parse(selectionDate(chosen))) / 86400000 : null,
        pending_taxonomy: unavailable ? {snapshot_id: unavailable.id, source: unavailable.source, taxonomy: unavailable.taxonomy, effective_date: unavailable.effective_date, observed_date: unavailable.observed_date} : null};
      if (!chosen) warnings.push({code: 'missing_weights', instrument_id: position.id});
      if (unavailable) warnings.push({code: 'future_taxonomy', instrument_id: position.id, snapshot_id: unavailable.id});
      if (chosen) {
        if (!chosen.effective_date) warnings.push({code: 'unknown_composition_date', instrument_id: position.id});
        if (!chosen.taxonomy.effective_date) warnings.push({code: 'unknown_taxonomy_date', instrument_id: position.id});
        if (totals.status !== 'complete') warnings.push({code: totals.status, instrument_id: position.id, weight_sum: totals.weight_sum});
        if (totals.status === 'overreported') hasOvercoverage = true;
      }
      const value = position.value === null ? null : D.dec(position.value) * 10n ** 12n;
      if (value === null) warnings.push({code: 'missing_price', instrument_id: position.id}); else base += value;
      let tax = null;
      if (chosen) {
        const t = chosen.taxonomy;
        if (!taxonomies.has(t.id)) taxonomies.set(t.id, {reported: 0n, value: 0n, unknown: 0n, over: 0n, variants: new Map(), instruments: new Set()});
        tax = taxonomies.get(t.id); tax.instruments.add(position.id);
        const tk = JSON.stringify(t);
        if (!tax.variants.has(tk)) tax.variants.set(tk, {...t, instrument_ids: new Set()});
        tax.variants.get(tk).instrument_ids.add(position.id);
      }
      let r = 0n;
      const values = (chosen?.allocations || []).map(a => {
        const amount = value === null ? null : value * D.dec(a.weight) / S24, key = JSON.stringify([chosen.taxonomy.id, a.sector_id]);
        if (!sectors.has(key)) sectors.set(key, {taxonomy_id: chosen.taxonomy.id, sector_id: a.sector_id, value: 0n, variants: new Map(), instruments: new Set()});
        const entry = sectors.get(key); entry.instruments.add(position.id);
        if (!entry.variants.has(a.label)) entry.variants.set(a.label, new Set()); entry.variants.get(a.label).add(position.id);
        const ak = JSON.stringify([chosen.taxonomy.id, a.label]);
        if (!aliases.has(ak)) aliases.set(ak, new Map());
        const ids = aliases.get(ak); if (!ids.has(a.sector_id)) ids.set(a.sector_id, new Set()); ids.get(a.sector_id).add(position.id);
        if (amount !== null) {entry.value += amount; r += amount;}
        return {...a, value: amount === null ? null : str36(amount)};
      });
      const u = value === null ? null : value > r ? value - r : 0n;
      const o = value === null ? null : r > value ? r - value : 0n;
      if (value !== null) {
        reported += r; unknown += u; over += o;
        if (tax) {tax.value += value; tax.reported += r; tax.unknown += u; tax.over += o;}
      }
      positions.push({...info, value: value === null ? null : str36(value), allocations: values,
        reported: value === null ? null : share(r, value), unknown: value === null ? null : share(u, value), overreported: value === null ? null : share(o, value)});
    }
    let taxonomyConflict = false;
    for (const [id, tax] of taxonomies) {
      tax.conflict = new Set([...tax.variants.values()].map(v => v.label)).size > 1;
      if (tax.conflict) {taxonomyConflict = true; for (const instrument_id of tax.instruments) warnings.push({code: 'taxonomy_conflict', taxonomy_id: id, instrument_id});}
    }
    for (const entry of sectors.values()) if (entry.variants.size > 1) for (const instrument_id of entry.instruments) warnings.push({code: 'sector_conflict', taxonomy_id: entry.taxonomy_id, sector_id: entry.sector_id, instrument_id});
    for (const [key, ids] of aliases) if (ids.size > 1) {
      const [taxonomy_id, label] = JSON.parse(key);
      for (const instrument_id of new Set([...ids.values()].flatMap(v => [...v]))) warnings.push({code: 'sector_alias_conflict', taxonomy_id, label, sector_ids: [...ids.keys()].sort(), instrument_id});
    }
    if (taxonomies.size > 1) for (const [taxonomy_id, tax] of taxonomies) for (const instrument_id of tax.instruments) warnings.push({code: 'mixed_taxonomies', taxonomy_id, instrument_id});
    const complete = overview.invested !== null, singleTaxonomy = taxonomies.size === 1;
    const normalizedAvailable = complete && singleTaxonomy && !taxonomyConflict && reported > 0n;
    return {as_of: asOf, complete, basis: 'securities_excluding_cash', value: complete ? str36(base) : null, known_value: str36(base),
      reported: complete ? share(reported, base) : null, unknown: complete ? share(unknown, base) : null, overreported: complete ? share(over, base) : null,
      partition_valid: complete ? over === 0n : null, has_overcoverage: hasOvercoverage,
      single_taxonomy: singleTaxonomy, normalized_reported_basis_available: normalizedAvailable,
      sectors: complete ? [...sectors.values()].sort((a, b) => JSON.stringify([a.taxonomy_id, a.sector_id]).localeCompare(JSON.stringify([b.taxonomy_id, b.sector_id]))).map(e => ({taxonomy_id: e.taxonomy_id, sector_id: e.sector_id, labels: [...e.variants.keys()].sort(), value: str36(e.value), weight_total_securities: ratio(e.value, base), weight_reported_values: normalizedAvailable ? ratio(e.value, reported) : null, weight_reported_in_taxonomy: taxonomies.get(e.taxonomy_id).conflict ? null : ratio(e.value, taxonomies.get(e.taxonomy_id).reported), variants: [...e.variants].map(([label, ids]) => ({label, instrument_ids: [...ids].sort()}))})) : null,
      taxonomies: complete ? [...taxonomies].sort(([a], [b]) => a.localeCompare(b)).map(([id, tax]) => ({taxonomy_id: id, labels: [...new Set([...tax.variants.values()].map(v => v.label))].sort(), value: str36(tax.value), weight_total_securities: ratio(tax.value, base), reported: share(tax.reported, tax.value), unknown: share(tax.unknown, tax.value), overreported: share(tax.over, tax.value), conflict: tax.conflict, variants: [...tax.variants.values()].map(v => ({...v, instrument_ids: [...v.instrument_ids].sort()}))})) : null,
      positions, warnings};
  }

 const api=Object.freeze({project});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerSectorValues=api;
})();
