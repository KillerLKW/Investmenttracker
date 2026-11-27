const regionNames={north_america:'Nordamerika',europe:'Europa',asia_pacific:'Asien/Pazifik',other:'Sonstige Regionen',unknown:'Nicht zugeordnet'};
function allocationRows(rows){
  return rows.map(r=>`<div class="allocation-row"><div class="position-head"><strong>${esc(r.name)}</strong><span>${percent(r.weight)} · ${money(r.value)}</span></div><progress max="1" value="${Number(r.weight)||0}" aria-label="${esc(r.name)}"></progress></div>`).join('');
}
function renderDistribution(p){
  const d=p.distribution;
  if(!d)return;
  renderTargets(p);
  renderScenarioForm(p);
  renderPlanningProfiles(p);
  const uncertain=d.warnings.filter(w=>w.code==='unknown_composition_date').length;
  $('#distribution-summary').innerHTML=!d.complete?'<div class="notice warning">Kurse fehlen. Die vollständige Verteilung kann nicht berechnet werden. Ergänze Kurse unter „Wertpapiere & Kurse“.</div>':
    `<div class="stat"><span>Wertpapierwert am ${date(d.as_of)}</span><strong>${money(d.value)}</strong></div><div class="stat"><span>Nicht zugeordnete Regionen</span><strong>${money(d.regions.unknown.value)} · ${percent(d.regions.unknown.weight)}</strong></div>`;
  if(uncertain)$('#distribution-summary').innerHTML+=`<div class="notice warning">Für ${uncertain} gehaltene Position(en) ist das Zusammensetzungsdatum unbekannt. Verwendet wird der angegebene Beobachtungsstand, keine gesicherte historische Zusammensetzung.</div>`;
  $('#region-values').innerHTML=d.complete?allocationRows(Object.entries(d.regions).map(([key,v])=>({name:regionNames[key],...v}))):empty('Bewertung unvollständig','Fehlende Kurse zuerst ergänzen.');
  $('#category-values').innerHTML=d.complete?(d.categories.length?allocationRows(d.categories):empty('Noch keine Bestände','Kategorien erscheinen mit den gehaltenen Wertpapieren.')):empty('Bewertung unvollständig','Keine Normalisierung auf nur bekannte Positionen.');
  $('#region-sources').innerHTML=p.instruments.length?`<div class="table-wrap"><table><thead><tr><th>Wertpapier</th><th>Abdeckung</th><th>Stand / Quelle</th><th>Pflege</th></tr></thead><tbody>${p.instruments.map(i=>{
    const pos=d.positions.find(x=>x.instrument_id===i.id),chosen=p.region_snapshots.find(r=>r.id===pos?.snapshot_id);
    const coverage=chosen?TrackerDomain.str(Object.values(chosen.weights).reduce((sum,w)=>sum+TrackerDomain.dec(w),0n)):null;
    return `<tr><td>${esc(i.name)}<small>${esc(i.isin)}</small></td><td>${coverage===null?'—':percent(coverage)}<small>${!pos?'Kein Bestand':!chosen?'Keine Gewichte zum Stichtag':pos.value===null?'Kurs fehlt':'Bekannte Regionen'}</small></td><td>${chosen?`${chosen.effective_date?date(chosen.effective_date):'Zusammensetzungsdatum unbekannt'}<small>Beobachtet: ${date(chosen.observed_date)} · ${pos.age_days} Tage seit Auswahlstand</small><small>${esc(chosen.source.label)}${chosen.source.sheet?' · '+esc(chosen.source.sheet):''}</small>`:'Keine verwendete Quelle'}</td><td><button class="row-action" data-region="${esc(i.id)}">Erfassen</button>${chosen?` <button class="row-action" data-region-void="${esc(chosen.id)}">Stornieren</button>`:''}</td></tr>`;
  }).join('')}</tbody></table></div>`:empty('Noch keine Wertpapiere','Erfasse Wertpapiere oder importiere das Beispieldepot.');
}
function regionFields(id){
  return `<input type="hidden" name="instrument_id" value="${esc(id)}"><p><strong>${esc(current().instruments.find(i=>i.id===id)?.name)}</strong></p><p class="muted">Gewichte in Prozent. Nicht abgedeckte Anteile bleiben unbekannt; die Summe darf 100 % nicht übersteigen.</p><div class="form-grid">${Object.entries(regionNames).filter(([k])=>k!=='unknown').map(([k,n])=>field(n+' (%)',k,'text','0','required inputmode="decimal"')).join('')}</div>${field('Zusammensetzung vom (leer, wenn unbekannt)','effective_date','date')}${field('Beobachtet am','observed_date','date',localDay(),'required')}${field('Quelle','source_label','text','','required maxlength="240"')}`;
}
function prepareRegionInput(data){
  const weights={};
  for(const k of TrackerRegions.KEYS){const n=TrackerDomain.number(decimal(data[k]),'Prozentwert');if(TrackerDomain.dec(n)>TrackerDomain.dec('100'))throw Error('Gewichte dürfen 100 % nicht übersteigen.');weights[k]=TrackerDomain.str(TrackerDomain.dec(n)/100n);delete data[k];}
  data.weights=weights;data.effective_date=data.effective_date||null;data.source={kind:'manual',label:data.source_label};delete data.source_label;
}
function importRegionSummary(result){
  const rows=result.regional_coverage||[];
  return `<div class="stat"><span>Regionalstände</span><strong>${result.summary.region_snapshots||0}</strong></div>`+(rows.length?`<details><summary>Abdeckung und Quellen prüfen</summary><ul class="muted">${rows.map(r=>`<li>${esc(r.isin)}: ${percent(r.coverage)} abgedeckt; ${percent(r.unknown)} unbekannt${r.void?' · storniert':''}. ${r.effective_date?date(r.effective_date):'Zusammensetzungsdatum unbekannt'}, beobachtet ${date(r.observed_date)}. ${esc(r.source.label)}</li>`).join('')}</ul></details>`:'');
}
$('#region-template').onclick=async()=>{
  const b=$('#region-template');b.disabled=true;
  try{
    const r=await api('regions/preview',{portfolio_id:selected});previewMode='regions';previewId=r.preview_id;previewRevision=r.revision;importKey=crypto.randomUUID();
    const labels={new:'Wird ergänzt',existing:'Vorhandene Daten bleiben erhalten',missing:'Keine passende Vorlagen-ISIN'};
    $('#preview-content').innerHTML=`<p><strong>${esc(r.name)}</strong> · ${r.added} neue Regionalstände</p><div class="notice warning">Tabellenstand 17.11.2026; tatsächliches Zusammensetzungsdatum unbekannt. Dies sind keine aktuellen Fondsdaten. Es werden nur Gewichte ergänzt – keine Buchungen, Kurse oder Kategorien.</div>${r.mode==='live'?'<p>Du ergänzt Quellen aus der Beispielvorlage in deinem eigenen Depot. Prüfe den Datenstand vor der Übernahme.</p>':''}<ul class="region-match-list">${r.matches.map(m=>`<li><strong>${esc(m.name)}</strong><small>${esc(m.isin)} · ${esc(labels[m.status])}${m.coverage!==null?' · Abdeckung '+percent(m.coverage):''}</small></li>`).join('')}</ul>`;
    $('#preview-error').textContent='';$('#commit').textContent='Regionaldaten ergänzen';$('#commit').disabled=r.added===0;$('#preview').showModal();
  }catch(e){error(e.message)}finally{b.disabled=false}
};
