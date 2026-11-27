const marketNames={IL:'Industrieländer (IL)',EM:'Schwellenländer (EM)',unknown:'Unbekannte Klassifikation'};
const countryMessages={missing_weights:'Kein Länderstand zum Stichtag',unknown_composition_date:'Zusammensetzungsdatum unbekannt',unknown_classification_date:'Gültigkeitsdatum der Klassifikation unbekannt',future_classification:'Klassifikation erst später belegt; Regionen und IL/EM zählen als unbekannt',missing_price:'Kurs zum Stichtag fehlt',country_conflict:'Abweichende Bezeichnungen oder Klassifikationen für dieselbe Länder-ID',country_alias_conflict:'Gleiche Bezeichnung mit unterschiedlichen Länder-IDs'};
function countrySource(s){
  if(!s)return 'Keine verwendete Quelle';
  return `${esc(s.label)}${s.sheet?' · '+esc(s.sheet):''}${s.range?' · '+esc(s.range):''}${s.snapshot_sha256?'<small>Quellhash: '+esc(s.snapshot_sha256.slice(0,16))+'…</small>':''}${s.url?' <a href="'+esc(s.url)+'" target="_blank" rel="noopener noreferrer">Quelle öffnen</a>':''}`;
}
const countryUnits=s=>{const [a,b='']=s.split('.');return BigInt(a)*10n**36n+BigInt(b.padEnd(36,'0'));};
function renderCountries(p){
  const d=p.country_distribution;if(!d)return;
  $('#country-summary').innerHTML=d.complete?`<div class="stat"><span>Wertpapierwert am ${date(d.as_of)}</span><strong>${money(d.value)}</strong></div><div class="stat"><span>Bekannten Ländern zugeordnet</span><strong>${money(d.known_country_value)}</strong></div><div class="stat"><span>Unbekannte Länderanteile</span><strong>${money(d.unknown_country.value)} · ${percent(d.unknown_country.weight)}</strong></div>`:'<div class="notice warning">Kurse fehlen. Vollständige Länderwerte und Anteile werden nicht ausgegeben. Bewertbare Einzelpositionen bleiben unten als Teilbewertung sichtbar.</div>';
  const warnings=new Map();for(const w of d.warnings){if(!warnings.has(w.instrument_id))warnings.set(w.instrument_id,new Set());warnings.get(w.instrument_id).add(countryMessages[w.code]||w.code);}
  $('#country-warnings').innerHTML=warnings.size?`<details><summary>Quellenhinweise für ${warnings.size} Position(en)</summary><ul>${[...warnings].map(([id,m])=>`<li><strong>${esc(p.instruments.find(i=>i.id===id)?.name||id)}</strong>: ${esc([...m].join('; '))}</li>`).join('')}</ul></details>`:'';
  const cols=['Land','Region laut Quelle','IL/EM laut Quelle','Wert','Anteil am Wertpapierwert'];
  const countries=d.complete?[...d.countries].sort((a,b)=>{const x=countryUnits(a.value),y=countryUnits(b.value);return x===y?a.labels.join('/').localeCompare(b.labels.join('/')):x>y?-1:1;}):[];
  $('#country-values').innerHTML=!d.complete?empty('Bewertung unvollständig','Fehlende Kurse ergänzen; keine Normierung auf nur bekannte Positionen.'):
    countries.length?`<div class="table-wrap"><table class="comparison-table"><thead><tr>${cols.map(t=>`<th>${t}</th>`).join('')}</tr></thead><tbody>${countries.map(r=>{
      const cells=[`${esc(r.labels.join(' / '))}${r.labels.length>1?'<small>Bezeichnungskonflikt</small>':''}`,esc([...new Set(r.variants.map(v=>regionNames[v.region]))].join(' / ')),esc([...new Set(r.variants.map(v=>marketNames[v.market_class]))].join(' / ')),money(r.value),percent(r.weight)];
      return `<tr>${cells.map((v,n)=>`<td data-label="${cols[n]}">${v}</td>`).join('')}</tr>`;
    }).join('')}<tr>${['Unbekannte Länder','—','—',money(d.unknown_country.value),percent(d.unknown_country.weight)].map((v,n)=>`<td data-label="${cols[n]}">${v}</td>`).join('')}</tr></tbody></table></div>`:empty('Noch keine bekannten Länder',d.value==='0'?'Noch keine bewerteten Bestände.':'Ländergewichte ergänzen; derzeit bleibt die Länderzuordnung unbekannt.');
  $('#country-markets').innerHTML=d.complete?allocationRows(Object.entries(d.market_classes).map(([k,v])=>({name:marketNames[k],...v}))):empty('Bewertung unvollständig','Keine vollständige IL/EM-Aufteilung.');
  $('#country-regions').innerHTML=d.complete?allocationRows(Object.entries(d.regions).map(([k,v])=>({name:regionNames[k],...v}))):empty('Bewertung unvollständig','Keine vollständige Regionsaufteilung.');
  $('#country-asia').innerHTML=d.complete?allocationRows(Object.entries(d.asia_pacific).map(([k,v])=>({name:'Asien/Pazifik · '+marketNames[k],...v}))):'';
  const mismatch=d.complete&&p.distribution?.complete&&Object.keys(d.regions).some(k=>d.regions[k].value!==p.distribution.regions[k].value);
  $('#country-comparison').innerHTML=mismatch?'<div class="notice">Die aus Ländern berechneten Regionen weichen von deinen separat gepflegten Regionalständen ab. Quellen und Abdeckung können unterschiedlich sein. Zielvergleich und Handelsszenario verwenden weiterhin die Regionalstände unter „Verteilung“.</div>':'';
  $('#country-sources').innerHTML=p.instruments.length?`<div class="table-wrap"><table class="comparison-table"><thead><tr><th>Wertpapier</th><th>Länderabdeckung</th><th>Gewichtsquelle</th><th>Klassifikation</th><th>Pflege &amp; Historie</th></tr></thead><tbody>${p.instruments.map(i=>{
    const pos=d.positions.find(r=>r.instrument_id===i.id),chosen=p.country_snapshots.find(r=>r.id===pos?.snapshot_id),history=p.country_snapshots.filter(r=>r.instrument_id===i.id).sort((a,b)=>b.sequence-a.sequence);
    const coverage=chosen?TrackerDomain.str(chosen.allocations.reduce((s,a)=>s+TrackerDomain.dec(a.weight),0n)):null;
    const cells=[`<strong>${esc(i.name)}</strong><small>${esc(i.isin)}</small>`,`${percent(coverage)}<small>${!pos?'Kein Bestand':pos.value===null?'Kurs fehlt':money(pos.value)}${pos?.unknown_country_value!==null&&pos?.unknown_country_value!==undefined?' · Länderrest '+money(pos.unknown_country_value):''}</small>`,chosen?`${chosen.effective_date?date(chosen.effective_date):'Zusammensetzungsdatum unbekannt'}<small>Beobachtet: ${date(chosen.observed_date)} · ${pos.age_days} Tage seit Auswahlstand</small>${countrySource(chosen.source)}`:'Kein Länderstand zum Stichtag',chosen?`${esc(chosen.classification.scheme)}<small>${chosen.classification.effective_date?date(chosen.classification.effective_date):'Gültigkeitsdatum unbekannt'} · beobachtet ${date(chosen.classification.observed_date)}</small>${countrySource(chosen.classification.source)}${!pos.classification_available?'<small>Zum Stichtag noch nicht verwendbar</small>':''}`:'—',`<button class="row-action" data-country="${esc(i.id)}">Erfassen</button>${history.length?`<details><summary>${history.length} Stand/Stände</summary><ul>${history.map(r=>`<li>${date(r.effective_date||r.observed_date)} · ${r.void?'storniert: '+esc(r.void_reason):'aktiv'} · ${esc(r.source.label)}${!r.void?' <button class="row-action" data-country-void="'+esc(r.id)+'">Stornieren</button>':''}</li>`).join('')}</ul></details>`:''}`];
    return `<tr>${cells.map((v,n)=>`<td data-label="${['Wertpapier','Abdeckung','Gewichtsquelle','Klassifikation','Pflege'][n]}">${v}</td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div>`:empty('Noch keine Wertpapiere','Wertpapiere erfassen oder ein separates Beispieldepot importieren.');
}
function importCountrySummary(r){
  const rows=r.country_coverage||[];
  return `<div class="stat"><span>Länderstände</span><strong>${r.summary.country_snapshots||0}</strong></div>`+(rows.length?`<details><summary>Länderquellen &amp; Klassifikation prüfen</summary><ul>${rows.map(x=>`<li>${esc(x.isin)}: ${percent(x.coverage)} abgedeckt, ${percent(x.unknown)} unbekannt${x.void?' · storniert':''}. ${x.effective_date?date(x.effective_date):'Zusammensetzungsdatum unbekannt'}, beobachtet ${date(x.observed_date)}. ${countrySource(x.source)}<small>${esc(x.classification.scheme)} · ${x.classification.effective_date?date(x.classification.effective_date):'Klassifikationsdatum unbekannt'}, beobachtet ${date(x.classification.observed_date)} · ${countrySource(x.classification.source)}</small></li>`).join('')}</ul></details>`:'');
}
$('#country-template').onclick=async()=>{
  const b=$('#country-template');b.disabled=true;
  try{
    const r=await api('countries/preview',{portfolio_id:selected});previewMode='countries';previewId=r.preview_id;previewRevision=r.revision;importKey=crypto.randomUUID();
    const labels={new:'Wird ergänzt',existing:'Länderhistorie bleibt erhalten',missing:'Keine passende Vorlagen-ISIN'};
    $('#preview-content').innerHTML=`<p><strong>${esc(r.name)}</strong> · ${r.added} neue Länderstände</p><div class="notice warning">Vorlagenstand 17.11.2026. Zusammensetzungs- und Klassifikationsdatum unbekannt; keine aktuellen MSCI-/FTSE-Klassifikationen. Nur fehlende Länderhistorien werden ergänzt. Buchungen, Kurse und Regionalstände bleiben erhalten.</div>${r.mode==='live'?'<p>Du übernimmst Quellen aus der Beispielvorlage in dein eigenes Depot. Prüfe Quelle und Datenstand vor der Übernahme.</p>':''}<ul class="region-match-list">${r.matches.map(m=>`<li><strong>${esc(m.name)}</strong><small>${esc(m.isin)} · ${labels[m.status]}${m.coverage===null?'':' · Abdeckung '+percent(m.coverage)}</small>${m.classification?'<small>'+esc(m.classification.scheme)+' · beobachtet '+date(m.classification.observed_date)+'</small>':''}</li>`).join('')}</ul>`;
    $('#preview-error').textContent='';$('#commit').textContent='Länderdaten ergänzen';$('#commit').disabled=r.added===0;$('#preview').showModal();
  }catch(e){error(e.message)}finally{b.disabled=false}
};
let countryOptions=[],countryInstrument=null,countryRevision=null,countryKey=null;
function addCountryRow(){
  const row=document.createElement('section');row.className='country-row';row.dataset.newId=crypto.randomUUID();
  row.innerHTML=`<label class="field">Land<select data-country-key="choice" required><option value="">Land auswählen</option>${countryOptions.map((a,n)=>`<option value="known:${n}">${esc(a.label)}</option>`).join('')}<option value="new">Eigenes Land / eigene Bezeichnung</option></select></label><label class="field" data-label-field hidden>Eigene Bezeichnung<input data-country-key="label" maxlength="160"></label><label class="field">Gewicht (%)<input data-country-key="weight" type="text" inputmode="decimal" value="0" required></label><label class="field">Region<select data-country-key="region">${TrackerCountries.REGIONS.map(k=>`<option value="${k}"${k==='unknown'?' selected':''}>${esc(regionNames[k])}</option>`).join('')}</select></label><label class="field">IL/EM<select data-country-key="market_class">${TrackerCountries.MARKETS.map(k=>`<option value="${k}"${k==='unknown'?' selected':''}>${esc(marketNames[k])}</option>`).join('')}</select></label><button class="text-button" type="button" data-remove-country>Zeile entfernen</button>`;
  row.querySelector('select').onchange=e=>{const custom=e.target.value==='new';row.querySelector('[data-label-field]').hidden=!custom;row.querySelector('[data-country-key=label]').required=custom;};
  row.querySelector('[data-remove-country]').onclick=()=>{row.remove();countryKey=crypto.randomUUID();};$('#country-rows').append(row);
}
function openCountryEditor(id){
  const p=current();countryInstrument=id;countryRevision=state.revision;countryKey=crypto.randomUUID();
  const options=[...TRACKER_COUNTRIES.catalog,...p.country_snapshots.flatMap(r=>r.allocations)],seen=new Set();countryOptions=options.filter(a=>{const key=JSON.stringify([a.country_id,a.label]);if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.label.localeCompare(b.label));
  $('#country-editor-form').reset();$('#country-rows').innerHTML='';$('#country-editor-error').textContent='';$('#country-editor-name').textContent=p.instruments.find(i=>i.id===id).name;
  for(const name of ['observed_date','classification_observed_date'])$('#country-editor-form [name='+name+']').value=localDay();
  addCountryRow();$('#country-editor').showModal();
}
$('#country-add-row').onclick=()=>{addCountryRow();countryKey=crypto.randomUUID();};
$('#country-editor-close').onclick=$('#country-editor-cancel').onclick=()=>$('#country-editor').close();
$('#country-editor-form').addEventListener('input',()=>countryKey=crypto.randomUUID());
$('#country-editor-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('#country-editor-save');b.disabled=true;$('#country-editor-error').textContent='';
  try{
    const data=Object.fromEntries(new FormData(e.target)),allocations=[...$('#country-rows').children].map(row=>{
      const get=k=>row.querySelector('[data-country-key='+k+']').value,choice=get('choice');
      if(choice!=='new'&&!/^known:\d+$/.test(choice))throw Error('Land auswählen.');
      const country=choice==='new'?{country_id:row.dataset.newId,label:get('label')}:countryOptions[Number(choice.slice(6))];if(!country)throw Error('Land auswählen.');
      const pct=decimal(get('weight'));if((pct.split('.')[1]||'').length>10)throw Error('Prozentgewichte dürfen höchstens zehn Nachkommastellen haben.');
      const weight=TrackerDomain.number(pct,'Prozentgewicht');if(TrackerDomain.dec(weight)>TrackerDomain.dec('100'))throw Error('Ein Ländergewicht darf 100 % nicht übersteigen.');
      return {country_id:country.country_id,label:country.label,weight:TrackerDomain.str(TrackerDomain.dec(weight)/100n),region:get('region'),market_class:get('market_class')};
    });
    const result=await api('command',{key:countryKey,revision:countryRevision,action:'country_add',data:{portfolio_id:selected,instrument_id:countryInstrument,effective_date:data.effective_date||null,observed_date:data.observed_date,allocations,source:{kind:'manual',label:data.source_label},classification:{scheme:data.scheme,effective_date:data.classification_effective_date||null,observed_date:data.classification_observed_date,source:{kind:'manual',label:data.classification_source_label}}}});
    selected=result.portfolio_id;await refresh();$('#country-editor').close();toast('Länderstand gespeichert.');
  }catch(e){$('#country-editor-error').textContent=e.message;if(e.status===412){await refresh().catch(()=>{});countryRevision=state.revision;countryKey=crypto.randomUUID();$('#country-editor-error').textContent='Aktueller Stand geladen. Eingaben prüfen und erneut speichern.';}}
  finally{b.disabled=false;}
});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.country)openCountryEditor(b.dataset.country);if(b?.dataset.countryVoid)openEditor('country_void',b.dataset.countryVoid);});
