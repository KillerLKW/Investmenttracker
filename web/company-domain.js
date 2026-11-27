/* Isolated company-name-group model. Not bundled in the active application. */
(function () {
  const D = typeof module !== 'undefined' ? require('./local-domain.js') : globalThis.TrackerDomain;
  const S = typeof module !== 'undefined' ? require('./sector-domain.js') : globalThis.TrackerSectors;
  const S24 = 10n ** 24n, S36 = 10n ** 36n;
  const source = S.source;
  const lookupKey = name => name.replace(/^ +| +$/g, '').replace(/ +/g, ' ').toLowerCase();
  function fields(raw, required, optional, label) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || required.some(k => !Object.hasOwn(raw, k)) || Object.keys(raw).some(k => !required.includes(k) && !optional.includes(k))) D.fail(label + ': fehlende oder unbekannte Felder.');
  }
  function dates(raw) {
    const observed_date = D.day(raw.observed_date), effective_date = raw.effective_date === null ? null : D.day(raw.effective_date);
    if (effective_date && effective_date > observed_date) D.fail('Gültigkeitsdatum liegt nach dem Quellenabruf.');
    return {effective_date, observed_date};
  }
  function mapping(raw) {
    fields(raw, ['id', 'label', 'effective_date', 'observed_date', 'source'], [], 'Unternehmenszuordnung');
    return {id: D.text(raw.id, 'Mapping-ID', 160), label: D.text(raw.label, 'Mappingbezeichnung', 160), ...dates(raw), source: source(raw.source)};
  }
  function allocation(raw) {
    fields(raw, ['holding_id', 'reported_name', 'weight', 'company_id', 'company_label'], [], 'Unternehmensgewicht');
    const weight = D.number(raw.weight, 'Unternehmensgewicht');
    if (D.dec(weight) > S24) D.fail('Einzelnes Unternehmensgewicht überschreitet 100 %.');
    if ((raw.company_id === null) !== (raw.company_label === null)) D.fail('Gruppenkennung und Bezeichnung müssen gemeinsam fehlen oder vorhanden sein.');
    D.text(raw.reported_name, 'Gemeldeter Name', 240); // Validate, but preserve the source spelling verbatim.
    return {holding_id: D.text(raw.holding_id, 'Quellzeilen-ID', 160), reported_name: raw.reported_name, weight,
      company_id: raw.company_id === null ? null : D.text(raw.company_id, 'Unternehmensgruppen-ID', 160),
      company_label: raw.company_label === null ? null : D.text(raw.company_label, 'Unternehmensgruppenbezeichnung', 160)};
  }
  function allocations(raw) {
    if (!Array.isArray(raw) || raw.length > 1000) D.fail('Höchstens 1.000 Unternehmensgewichte je Teilliste erwartet.');
    const rows = raw.map(allocation);
    if (new Set(rows.map(r => r.holding_id)).size !== rows.length) D.fail('Doppelte Quellzeilen-ID innerhalb eines Stands.');
    return rows;
  }
  function summary(rows) {
    const sum = rows.reduce((v, a) => v + D.dec(a.weight), 0n);
    return {weight_sum: D.str(sum), unreported_weight: D.str(sum < S24 ? S24 - sum : 0n), overreported_weight: D.str(sum > S24 ? sum - S24 : 0n), status: sum > S24 ? 'overreported' : sum < S24 ? 'underreported' : 'complete'};
  }
  const coverage = raw => summary(allocations(raw));
  function snapshot(raw, ids) {
    fields(raw, ['id', 'instrument_id', 'sequence', 'effective_date', 'observed_date', 'disclosure_scope', 'mapping', 'allocations', 'source', 'void'], ['void_reason'], 'Unternehmensstand');
    if (!ids.has(raw.instrument_id)) D.fail('Unternehmensstand verweist auf unbekanntes Wertpapier.');
    if (!Number.isSafeInteger(raw.sequence) || raw.sequence < 1) D.fail('Ungültige Unternehmensstand-Sequenz.');
    if (typeof raw.void !== 'boolean') D.fail('Ungültiger Unternehmens-Stornostatus.');
    if (!['top10', 'partial'].includes(raw.disclosure_scope)) D.fail('Unbekannter Umfang der Unternehmensliste.');
    const rows = allocations(raw.allocations);
    if (raw.disclosure_scope === 'top10' && rows.length > 10) D.fail('Eine Top-10-Liste darf höchstens zehn Zeilen enthalten.');
    const out = {id: D.text(raw.id, 'Unternehmensstand-ID', 160), instrument_id: raw.instrument_id, sequence: raw.sequence,
      ...dates(raw), disclosure_scope: raw.disclosure_scope, mapping: mapping(raw.mapping), allocations: rows, source: source(raw.source), void: raw.void};
    if (raw.void) out.void_reason = D.text(raw.void_reason, 'Unternehmens-Stornogrund', 500);
    else if (Object.hasOwn(raw, 'void_reason')) D.fail('Stornogrund ohne Unternehmensstorno.');
    return out;
  }
  function snapshots(raw, ids) {
    if (!Array.isArray(raw) || raw.length > 50000) D.fail('Ungültige Unternehmensstand-Liste.');
    const seen = new Set(), sequences = new Set();
    return raw.map(r => {const a = snapshot(r, ids);if (seen.has(a.id) || sequences.has(a.sequence)) D.fail('Doppelte Unternehmensstand-ID oder Sequenz.');seen.add(a.id);sequences.add(a.sequence);return a;});
  }
  // Import normalization, not a raw-state migration or storage implementation.
  function portfolio(raw, version) {
    if (![1, 2, 3, 4, 5].includes(version)) D.fail('Unbekannte Depotversion.');
    if (version < 5 && Object.hasOwn(raw || {}, 'company_snapshots')) D.fail('Unternehmensstände benötigen Depotversion 5.');
    const p = S.portfolio(raw, version === 5 ? 4 : version);
    p.company_snapshots = version === 5 ? snapshots(raw.company_snapshots, new Set(p.instruments.map(i => i.id))) : [];
    return p;
  }
  const selectionDate = row => row.effective_date || row.observed_date;
  function select(rows, instrumentId, asOf) {
    D.day(asOf);let chosen = null;
    for (const row of rows) if (row.instrument_id === instrumentId && !row.void && selectionDate(row) <= asOf && (!chosen || selectionDate(row) > selectionDate(chosen) || (selectionDate(row) === selectionDate(chosen) && row.sequence > chosen.sequence))) chosen = row;
    return chosen;
  }
  function str36(n) {const f = (n % S36).toString().padStart(36, '0').replace(/0+$/, '');return (n / S36).toString() + (f ? '.' + f : '');}
  const ratio = (n, base) => base === 0n ? null : D.str(n * S24 / base);
  const share = (n, base) => ({value: str36(n), weight: ratio(n, base)});
  const add = (map, k, v) => map.set(k, (map.get(k) || 0n) + v);
  function distribution(p, asOf) {
    D.day(asOf);
    const rows = snapshots(p.company_snapshots, new Set(p.instruments.map(i => i.id))), overview = D.overview(p, asOf);
    const held = overview.positions.filter(r => D.dec(r.quantity) > 0n).sort((a, b) => a.id.localeCompare(b.id));
    const selected = new Map(held.map(i => [i.id, select(rows, i.id, asOf)]));
    const schemes = new Map(), groups = new Map(), rawAliases = new Map(), labelAliases = new Map(), warnings = [];
    // Detect conflicts only among selected, usable mappings. Historical/void data stays frozen.
    for (const i of held) {
      const r = selected.get(i.id);if (!r || selectionDate(r.mapping) > asOf) continue;
      const m = r.mapping;
      if (!schemes.has(m.id)) schemes.set(m.id, {variants: new Map(), labels: new Set(), instruments: new Set(), conflict: false});
      const scheme = schemes.get(m.id), key = JSON.stringify(m);
      if (!scheme.variants.has(key)) scheme.variants.set(key, {...m, instrument_ids: new Set()});
      scheme.variants.get(key).instrument_ids.add(i.id);scheme.labels.add(m.label);scheme.instruments.add(i.id);
      for (const a of r.allocations) if (a.company_id !== null) {
        const gkey = JSON.stringify([m.id, a.company_id]);
        if (!groups.has(gkey)) groups.set(gkey, {mapping_id: m.id, company_id: a.company_id, labels: new Set(), instruments: new Set(), value: 0n, resolved_rows: 0, contributions: new Map()});
        groups.get(gkey).labels.add(a.company_label);groups.get(gkey).instruments.add(i.id);
        for (const [map, name] of [[rawAliases, lookupKey(a.reported_name)], [labelAliases, a.company_label]]) {
          const k = JSON.stringify([m.id, name]);if (!map.has(k)) map.set(k, new Set());map.get(k).add(a.company_id);
        }
      }
    }
    function warnScheme(id, code, extra = {}) {const m = schemes.get(id);m.conflict = true;for (const instrument_id of m.instruments) warnings.push({code, mapping_id: id, instrument_id, ...extra});}
    for (const [id, m] of schemes) if (m.labels.size > 1) warnScheme(id, 'mapping_conflict');
    for (const g of groups.values()) if (g.labels.size > 1) warnScheme(g.mapping_id, 'company_conflict', {company_id: g.company_id});
    for (const [k, ids] of labelAliases) if (ids.size > 1) {const [id, label] = JSON.parse(k);warnScheme(id, 'company_alias_conflict', {label, company_ids: [...ids].sort()});}
    for (const [k, ids] of rawAliases) if (ids.size > 1) {const [id, name] = JSON.parse(k);warnScheme(id, 'mapping_alias_conflict', {lookup_key: name, company_ids: [...ids].sort()});}
    let base = 0n, reported = 0n, resolved = 0n, unresolved = 0n, undisclosed = 0n, over = 0n;
    const positions = [], pairData = [], mappingAmounts = new Map();
    for (const i of held) {
      const r = selected.get(i.id), available = !!r && selectionDate(r.mapping) <= asOf;
      const cov = r ? summary(r.allocations) : {weight_sum: null, unreported_weight: null, overreported_weight: null, status: 'missing'};
      const value = i.value === null ? null : D.dec(i.value) * 10n ** 12n;
      if (value !== null) base += value;else warnings.push({code: 'missing_price', instrument_id: i.id});
      if (!r) warnings.push({code: 'missing_weights', instrument_id: i.id});
      if (r) {
        if (!r.effective_date) warnings.push({code: 'unknown_composition_date', instrument_id: i.id});
        if (!r.mapping.effective_date) warnings.push({code: 'unknown_mapping_date', instrument_id: i.id});
        if (!available) warnings.push({code: 'future_mapping', instrument_id: i.id});
        if (cov.status !== 'complete') warnings.push({code: cov.status, instrument_id: i.id});
      }
      let rv = 0n, cv = 0n;const weights = new Map();
      const allocations = (r?.allocations || []).map(a => {
        const ambiguous = a.company_id !== null && available && rawAliases.get(JSON.stringify([r.mapping.id, lookupKey(a.reported_name)]))?.size > 1;
        const assigned = a.company_id !== null && available && !ambiguous;
        const amount = value === null ? null : value * D.dec(a.weight) / S24;
        if (assigned) {
          add(weights, a.company_id, D.dec(a.weight));
          const group = groups.get(JSON.stringify([r.mapping.id, a.company_id]));
          group.resolved_rows++;
          if (amount !== null) {group.value += amount;cv += amount;}
          if (D.dec(a.weight) > 0n) {
            if (!group.contributions.has(i.id)) group.contributions.set(i.id, {weight: 0n, value: value === null ? null : 0n});
            const c = group.contributions.get(i.id);c.weight += D.dec(a.weight);if (amount !== null) c.value += amount;
          }
        }
        if (amount !== null) rv += amount;
        return {...a, resolved: assigned, unresolved_reason: assigned ? null : !available ? 'mapping_unavailable' : ambiguous ? 'mapping_alias_conflict' : 'unmapped', value: amount === null ? null : str36(amount)};
      });
      if (r && allocations.some(a => !a.resolved && D.dec(a.weight) > 0n)) warnings.push({code: 'unresolved_mapping', instrument_id: i.id});
      const xv = rv - cv, uv = value === null ? null : value > rv ? value - rv : 0n, ov = value === null ? null : rv > value ? rv - value : 0n;
      if (value !== null) {
        reported += rv;resolved += cv;unresolved += xv;undisclosed += uv;over += ov;
        if (r) {if (!mappingAmounts.has(r.mapping.id)) mappingAmounts.set(r.mapping.id, {value: 0n, reported: 0n, resolved: 0n, unresolved: 0n});const m = mappingAmounts.get(r.mapping.id);m.value += value;m.reported += rv;m.resolved += cv;m.unresolved += xv;}
      }
      positions.push({instrument_id: i.id, snapshot_id: r?.id || null, ...cov, disclosure_scope: r?.disclosure_scope || null,
        effective_date: r?.effective_date || null, observed_date: r?.observed_date || null, selection_date: r ? selectionDate(r) : null,
        age_days: r ? (Date.parse(asOf) - Date.parse(selectionDate(r))) / 86400000 : null,
        source: r?.source || null, mapping: r?.mapping || null, mapping_available: available,
        value: value === null ? null : str36(value), allocations,
        reported: value === null ? null : share(rv, value), resolved: value === null ? null : share(cv, value), unresolved: value === null ? null : share(xv, value),
        undisclosed: value === null ? null : share(uv, value), overreported: value === null ? null : share(ov, value)});
      pairData.push({instrument_id: i.id, row: r, available, weights, status: cov.status, unresolved_names: allocations.some(a => !a.resolved && D.dec(a.weight) > 0n)});
    }
    const pairs = [];
    for (let a = 0; a < pairData.length; a++) for (let b = a + 1; b < pairData.length; b++) {
      const x = pairData[a], y = pairData[b];
      const reason = !x.row || !y.row ? 'missing_weights' : !x.available || !y.available ? 'mapping_unavailable' : x.row.mapping.id !== y.row.mapping.id ? 'different_mappings' : schemes.get(x.row.mapping.id).conflict ? 'identity_conflict' : x.status === 'overreported' || y.status === 'overreported' ? 'overreported' : null;
      const comparable = reason === null || reason === 'overreported';
      const ids = !comparable ? null : [...x.weights.keys()].filter(k => x.weights.get(k) > 0n && (y.weights.get(k) || 0n) > 0n).sort();
      const min = ids?.reduce((s, k) => s + (x.weights.get(k) < y.weights.get(k) ? x.weights.get(k) : y.weights.get(k)), 0n);
      pairs.push({left_instrument_id: x.instrument_id, right_instrument_id: y.instrument_id, mapping_id: comparable ? x.row.mapping.id : null,
        basis: 'reported_fund_weights', scope: 'observed_partial_lists', reason,
        has_unresolved_names: x.unresolved_names || y.unresolved_names,
        shared_company_ids: ids, shared_company_count: ids === null ? null : ids.length, observed_min_weight_sum: reason ? null : D.str(min)});
    }
    const complete = overview.invested !== null;
    const usedMappings = new Set(positions.filter(r => r.mapping_available).map(r => r.mapping.id));
    if (usedMappings.size > 1) for (const p of positions.filter(r => r.mapping_available)) warnings.push({code: 'mixed_mappings', instrument_id: p.instrument_id, mapping_id: p.mapping.id});
    const normalized = complete && usedMappings.size === 1 && !schemes.get([...usedMappings][0]).conflict && reported > 0n && positions.every(p => !p.mapping || p.mapping_available);
    const companyRows = [...groups.values()].filter(g => g.resolved_rows > 0).sort((a, b) => JSON.stringify([a.mapping_id, a.company_id]).localeCompare(JSON.stringify([b.mapping_id, b.company_id])));
    return {as_of: asOf, complete, basis: 'securities_excluding_cash', identity_basis: 'source_name_groups', scope: 'observed_partial_lists',
      value: complete ? str36(base) : null, known_value: str36(base),
      reported: complete ? share(reported, base) : null, resolved: complete ? share(resolved, base) : null, unresolved: complete ? share(unresolved, base) : null,
      undisclosed: complete ? share(undisclosed, base) : null, overreported: complete ? share(over, base) : null,
      partition_valid: complete ? over === 0n : null, has_overcoverage: positions.some(r => r.status === 'overreported'),
      normalized_reported_basis_available: normalized,
      unresolved_weight_reported_values: normalized ? ratio(unresolved, reported) : null,
      companies: complete ? companyRows.map(g => ({mapping_id: g.mapping_id, company_id: g.company_id, labels: [...g.labels].sort(),
        value: str36(g.value), weight_total_securities: ratio(g.value, base), weight_reported_values: normalized ? ratio(g.value, reported) : null,
        weight_reported_in_mapping: schemes.get(g.mapping_id).conflict ? null : ratio(g.value, mappingAmounts.get(g.mapping_id)?.reported || 0n),
        conflict: schemes.get(g.mapping_id).conflict, contributing_etf_count: g.contributions.size,
        contributions: [...g.contributions].sort(([a], [b]) => a.localeCompare(b)).map(([instrument_id, c]) => ({instrument_id, weight: D.str(c.weight), value: c.value === null ? null : str36(c.value)}))})) : null,
      mappings: complete ? [...schemes].sort(([a], [b]) => a.localeCompare(b)).map(([mapping_id, s]) => {const m = mappingAmounts.get(mapping_id) || {value: 0n, reported: 0n, resolved: 0n, unresolved: 0n};return {mapping_id, labels: [...s.labels].sort(), conflict: s.conflict, value: str36(m.value), reported: share(m.reported, m.value), resolved: share(m.resolved, m.value), unresolved: share(m.unresolved, m.value), unresolved_weight_reported_values: s.conflict ? null : ratio(m.unresolved, m.reported), variants: [...s.variants.values()].map(v => ({...v, instrument_ids: [...v.instrument_ids].sort()}))};}) : null,
      pairs, positions, warnings};
  }
  const api = Object.freeze({source, lookupKey, mapping, allocation, coverage, snapshot, snapshots, portfolio, select, distribution});
  if (typeof module !== 'undefined') module.exports = api;else globalThis.TrackerCompanies = api;
})();
