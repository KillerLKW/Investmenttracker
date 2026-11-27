/* Pure regional model. Not yet loaded by the application or its packager. */
(function () {
  const D = typeof module !== 'undefined' ? require('./local-domain.js') : globalThis.TrackerDomain;
  const KEYS = Object.freeze(['north_america', 'europe', 'asia_pacific', 'other']);
  const S24 = 10n ** 24n, S36 = 10n ** 36n;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function exactKeys(value, keys, label) {
    if (!object(value) || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) D.fail(label + ': unvollständige oder unbekannte Felder.');
  }
  function source(raw) {
    if (!object(raw) || !['manual', 'spreadsheet_snapshot'].includes(raw.kind)) D.fail('Ungültige Regionalquelle.');
    const out = {kind: raw.kind, label: D.text(raw.label, 'Quellenbezeichnung', 240)};
    for (const key of ['url', 'sheet', 'range', 'snapshot_sha256']) {
      if (raw[key] === undefined) continue;
      out[key] = D.text(raw[key], 'Quellfeld ' + key, key === 'url' ? 2000 : 160);
    }
    if (out.url) {
      let url;
      try { url = new URL(out.url); } catch { D.fail('Ungültige Quellenadresse.'); }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) D.fail('Unzulässige Quellenadresse.');
    }
    if (out.snapshot_sha256 && !/^[a-f0-9]{64}$/.test(out.snapshot_sha256)) D.fail('Ungültiger Snapshot-Hash.');
    if (out.kind === 'spreadsheet_snapshot' && ['sheet', 'range', 'snapshot_sha256'].some(k => !out[k])) D.fail('Tabellenquelle benötigt Blatt, Bereich und Snapshot-Hash.');
    return out;
  }
  function snapshot(raw, instrumentIds) {
    if (!object(raw) || !instrumentIds.has(raw.instrument_id)) D.fail('Regionalstand verweist auf unbekanntes Wertpapier.');
    const id = D.text(raw.id, 'Regionalstand-ID', 160);
    if (!Number.isSafeInteger(raw.sequence) || raw.sequence < 1) D.fail('Ungültige Regionalstand-Sequenz.');
    const observed = D.day(raw.observed_date);
    const effective = raw.effective_date === null ? null : D.day(raw.effective_date);
    if (effective && effective > observed) D.fail('Zusammensetzungsdatum liegt nach dem Quellenabruf.');
    exactKeys(raw.weights, KEYS, 'Regionalgewichte');
    const weights = Object.fromEntries(KEYS.map(k => [k, D.number(raw.weights[k], 'Gewicht ' + k)]));
    if (Object.values(weights).some(w => D.dec(w) > S24) || Object.values(weights).reduce((s, w) => s + D.dec(w), 0n) > S24) D.fail('Regionalgewichte überschreiten 100 %.');
    if (typeof raw.void !== 'boolean') D.fail('Regionaler Stornostatus fehlt oder ist ungültig.');
    const result = {id, instrument_id: raw.instrument_id, sequence: raw.sequence, effective_date: effective, observed_date: observed, weights, source: source(raw.source), void: raw.void};
    if (raw.void) result.void_reason = D.text(raw.void_reason, 'Regionaler Stornogrund', 500);
    return result;
  }
  function snapshots(rows, instrumentIds) {
    if (!Array.isArray(rows) || rows.length > 50000) D.fail('Ungültige Regionalstand-Liste.');
    const ids = new Set(), sequences = new Set();
    return rows.map(raw => {
      const row = snapshot(raw, instrumentIds);
      if (ids.has(row.id) || sequences.has(row.sequence)) D.fail('Doppelte Regionalstand-ID oder Sequenz.');
      ids.add(row.id); sequences.add(row.sequence);
      return row;
    });
  }
  // Import normalization only. Never use to migrate the stored raw state:
  // the legacy normalizer intentionally recreates transaction/quote records.
  function portfolio(raw, version) {
    if (version !== 1 && version !== 2) D.fail('Unbekannte Depotversion.');
    if (version === 1 && raw?.region_snapshots !== undefined) D.fail('Regionaldaten benötigen Depotversion 2.');
    const p = D.portfolio(raw);
    p.region_snapshots = version === 1 ? [] : snapshots(raw.region_snapshots, new Set(p.instruments.map(i => i.id)));
    return p;
  }
  const selectionDate = row => row.effective_date || row.observed_date;
  function select(rows, instrumentId, asOf) {
    return rows.filter(r => r.instrument_id === instrumentId && !r.void && selectionDate(r) <= asOf)
      .sort((a, b) => selectionDate(b).localeCompare(selectionDate(a)) || b.sequence - a.sequence)[0] || null;
  }
  function str36(value) {
    const fraction = (value % S36).toString().padStart(36, '0').replace(/0+$/, '');
    return (value / S36).toString() + (fraction ? '.' + fraction : '');
  }
  const ratio = (value, base) => base === 0n ? null : D.str(value * S24 / base);
  function distribution(p, asOf) {
    D.day(asOf);
    const rows = snapshots(p.region_snapshots, new Set(p.instruments.map(i => i.id)));
    const overview = D.overview(p, asOf);
    const amounts = Object.fromEntries([...KEYS, 'unknown'].map(k => [k, 0n]));
    const categories = new Map(), positions = [], warnings = [];
    let base = 0n;
    for (const position of overview.positions) {
      if (D.dec(position.quantity) === 0n) continue;
      const chosen = select(rows, position.id, asOf);
      const info = {instrument_id: position.id, snapshot_id: chosen?.id || null,
        effective_date: chosen?.effective_date || null, observed_date: chosen?.observed_date || null,
        selection_date: chosen ? selectionDate(chosen) : null, source: chosen?.source || null,
        composition_date_unknown: !!chosen && chosen.effective_date === null,
        age_days: chosen ? (Date.parse(asOf) - Date.parse(selectionDate(chosen))) / 86400000 : null};
      if (!chosen) warnings.push({code: 'missing_weights', instrument_id: position.id});
      else if (chosen.effective_date === null) warnings.push({code: 'unknown_composition_date', instrument_id: position.id});
      if (position.value === null) {
        warnings.push({code: 'missing_price', instrument_id: position.id});
        positions.push({...info, value: null, regions: null});
        continue;
      }
      // Position values have up to 24 decimal places; weights up to 12.
      // Keep their product at 36 places instead of losing tiny allocations.
      const value = D.dec(position.value) * 10n ** 12n;
      base += value;
      const parts = Object.fromEntries(KEYS.map(k => [k, chosen ? value * D.dec(chosen.weights[k]) / S24 : 0n]));
      parts.unknown = value - Object.values(parts).reduce((sum, v) => sum + v, 0n);
      for (const k of Object.keys(amounts)) amounts[k] += parts[k];
      const category = position.category || 'Ohne Zuordnung';
      categories.set(category, (categories.get(category) || 0n) + value);
      positions.push({...info, value: str36(value), regions: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, str36(v)]))});
    }
    const complete = overview.invested !== null;
    // Aggregate fields deliberately null when valuation is incomplete;
    // known position rows remain available for an explicitly partial view.
    return {as_of: asOf, complete, basis: 'securities_excluding_cash',
      value: complete ? str36(base) : null, known_value: str36(base),
      regions: complete ? Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, {value: str36(v), weight: ratio(v, base)}])) : null,
      categories: complete ? [...categories].map(([name, value]) => ({name, value: str36(value), weight: ratio(value, base)})) : null,
      positions, warnings};
  }
  const api = {KEYS, snapshot, snapshots, portfolio, distribution};
  if (typeof module !== 'undefined') module.exports = api;
  else globalThis.TrackerRegions = api;
})();
