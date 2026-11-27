/* Isolated reported-sector model. Not loaded by the app or its packager. */
(function () {
  const D = typeof module !== 'undefined' ? require('./local-domain.js') : globalThis.TrackerDomain;
  const C = typeof module !== 'undefined' ? require('./country-domain.js') : globalThis.TrackerCountries;
  const S24 = 10n ** 24n, S36 = 10n ** 36n;
  const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  function fields(raw, required, optional, label) {
    if (!object(raw) || required.some(k => !Object.hasOwn(raw, k)) || Object.keys(raw).some(k => !required.includes(k) && !optional.includes(k))) D.fail(label + ': fehlende oder unbekannte Felder.');
  }
  function source(raw) {
    fields(raw, ['kind', 'label'], ['url', 'sheet', 'range', 'snapshot_sha256'], 'Sektorquelle');
    if (!['manual', 'spreadsheet_snapshot'].includes(raw.kind)) D.fail('Ungültige Sektorquelle.');
    const out = {kind: raw.kind, label: D.text(raw.label, 'Quellenbezeichnung', 240)};
    for (const k of ['url', 'sheet', 'range', 'snapshot_sha256']) if (Object.hasOwn(raw, k)) out[k] = D.text(raw[k], 'Quellfeld ' + k, k === 'url' ? 2000 : 160);
    if (out.url) {
      let url; try { url = new URL(out.url); } catch { D.fail('Ungültige Quellenadresse.'); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) D.fail('Unzulässige Quellenadresse.');
    }
    if (out.snapshot_sha256 && !/^[a-f0-9]{64}$/.test(out.snapshot_sha256)) D.fail('Ungültiger Quellhash.');
    if (out.kind === 'spreadsheet_snapshot' && ['sheet', 'range', 'snapshot_sha256'].some(k => !out[k])) D.fail('Tabellenquelle benötigt Blatt, Bereich und Quellhash.');
    return out;
  }
  function dates(raw) {
    const observed = D.day(raw.observed_date), effective = raw.effective_date === null ? null : D.day(raw.effective_date);
    if (effective && effective > observed) D.fail('Gültigkeitsdatum liegt nach dem Quellenabruf.');
    return {effective_date: effective, observed_date: observed};
  }
  function allocation(raw) {
    fields(raw, ['sector_id', 'label', 'weight'], [], 'Sektorgewicht');
    const weight = D.number(raw.weight, 'Sektorgewicht');
    if (D.dec(weight) > S24) D.fail('Einzelnes Sektorgewicht überschreitet 100 %.');
    return {sector_id: D.text(raw.sector_id, 'Sektor-ID', 160), label: D.text(raw.label, 'Sektorbezeichnung', 160), weight};
  }
  function allocations(raw) {
    if (!Array.isArray(raw) || raw.length > 100) D.fail('Höchstens 100 Sektorgewichte je Stand erwartet.');
    const rows = raw.map(allocation);
    if (new Set(rows.map(a => a.sector_id)).size !== rows.length) D.fail('Doppelte Sektor-ID innerhalb eines Stands.');
    return rows; // The sum is deliberately not capped or normalized.
  }
  function summary(rows) {
    const sum = rows.reduce((s, a) => s + D.dec(a.weight), 0n);
    return {weight_sum: D.str(sum), unreported_weight: D.str(sum < S24 ? S24 - sum : 0n), overreported_weight: D.str(sum > S24 ? sum - S24 : 0n), status: sum > S24 ? 'overreported' : sum < S24 ? 'underreported' : 'complete'};
  }
  const coverage = raw => summary(allocations(raw));
  function snapshot(raw, instrumentIds) {
    fields(raw, ['id', 'instrument_id', 'sequence', 'effective_date', 'observed_date', 'taxonomy', 'allocations', 'source', 'void'], ['void_reason'], 'Sektorstand');
    if (!instrumentIds.has(raw.instrument_id)) D.fail('Sektorstand verweist auf unbekanntes Wertpapier.');
    if (!Number.isSafeInteger(raw.sequence) || raw.sequence < 1) D.fail('Ungültige Sektorstand-Sequenz.');
    if (typeof raw.void !== 'boolean') D.fail('Ungültiger Sektor-Stornostatus.');
    fields(raw.taxonomy, ['id', 'label', 'effective_date', 'observed_date', 'source'], [], 'Sektortaxonomie');
    const taxonomy = {id: D.text(raw.taxonomy.id, 'Taxonomie-ID', 160), label: D.text(raw.taxonomy.label, 'Taxonomiebezeichnung', 160), ...dates(raw.taxonomy), source: source(raw.taxonomy.source)};
    const out = {id: D.text(raw.id, 'Sektorstand-ID', 160), instrument_id: raw.instrument_id, sequence: raw.sequence, ...dates(raw), taxonomy, allocations: allocations(raw.allocations), source: source(raw.source), void: raw.void};
    if (raw.void) out.void_reason = D.text(raw.void_reason, 'Sektor-Stornogrund', 500);
    else if (Object.hasOwn(raw, 'void_reason')) D.fail('Stornogrund ohne Sektorstorno.');
    return out;
  }
  function snapshots(raw, instrumentIds) {
    if (!Array.isArray(raw) || raw.length > 50000) D.fail('Ungültige Sektorstand-Liste.');
    const ids = new Set(), sequences = new Set();
    return raw.map(value => {
      const row = snapshot(value, instrumentIds);
      if (ids.has(row.id) || sequences.has(row.sequence)) D.fail('Doppelte Sektorstand-ID oder Sequenz.');
      ids.add(row.id); sequences.add(row.sequence); return row;
    });
  }
  // Import normalization only. Raw-state migration must preserve the original records.
  function portfolio(raw, version) {
    if (![1, 2, 3, 4].includes(version)) D.fail('Unbekannte Depotversion.');
    if (version < 4 && Object.hasOwn(raw || {}, 'sector_snapshots')) D.fail('Sektorstände benötigen Depotversion 4.');
    const p = C.portfolio(raw, version === 4 ? 3 : version);
    p.sector_snapshots = version === 4 ? snapshots(raw.sector_snapshots, new Set(p.instruments.map(i => i.id))) : [];
    return p;
  }
  const selectionDate = row => row.effective_date || row.observed_date;
  const newer = (a, b) => !b || selectionDate(a) > selectionDate(b) || (selectionDate(a) === selectionDate(b) && a.sequence > b.sequence);
  // Selection helper accepts already validated records.
  function select(rows, instrumentId, asOf) {
    D.day(asOf); let chosen = null;
    for (const row of rows) if (row.instrument_id === instrumentId && !row.void && selectionDate(row) <= asOf && selectionDate(row.taxonomy) <= asOf && newer(row, chosen)) chosen = row;
    return chosen;
  }
  function str36(n) {
    const f = (n % S36).toString().padStart(36, '0').replace(/0+$/, '');
    return (n / S36).toString() + (f ? '.' + f : '');
  }
  const ratio = (n, base) => base === 0n ? null : D.str(n * S24 / base);
  const share = (n, base) => ({value: str36(n), weight: ratio(n, base)});
  function distribution(p, asOf) {
    D.day(asOf);
    const rows = snapshots(p.sector_snapshots, new Set(p.instruments.map(i => i.id)));
    const selected = new Map(), latestWeight = new Map();
    for (const row of rows) if (!row.void && selectionDate(row) <= asOf) {
      if (newer(row, latestWeight.get(row.instrument_id))) latestWeight.set(row.instrument_id, row);
      if (selectionDate(row.taxonomy) <= asOf && newer(row, selected.get(row.instrument_id))) selected.set(row.instrument_id, row);
    }
    const overview = D.overview(p, asOf), positions = [], warnings = [], taxonomies = new Map(), sectors = new Map(), aliases = new Map();
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
  const api = Object.freeze({source, allocation, coverage, snapshot, snapshots, portfolio, select, distribution});
  if (typeof module !== 'undefined') module.exports = api; else globalThis.TrackerSectors = api;
})();
