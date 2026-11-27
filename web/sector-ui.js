const sectorMessages={missing_weights:'Kein verwendbarer Sektorstand',future_taxonomy:'Eine neuere Taxonomie ist zum Stichtag noch nicht verwendbar',unknown_composition_date:'Zusammensetzungsdatum unbekannt',unknown_taxonomy_date:'Gültigkeitsdatum der Taxonomie unbekannt',underreported:'Nicht alle Anteile gemeldet',overreported:'Gewichtssumme über 100 %; unverändert übernommen',missing_price:'Kurs fehlt',mixed_taxonomies:'Mehrere Klassifikationsschemata; getrennte Identitäten',taxonomy_conflict:'Widersprüchliche Angaben zur Taxonomie',sector_conflict:'Widersprüchliche Sektorbezeichnungen',sector_alias_conflict:'Gleiche Bezeichnung mit unterschiedlichen Sektor-IDs'};
const sectorViews=new Map();
function sectorView(){if(!sectorViews.has(selected))sectorViews.set(selected,{basis:'total',taxonomy:''});return sectorViews.get(selected);}
const sectorTable=(headers,rows)=>`<div class="table-wrap"><table class="comparison-table"><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const sectorCells=(headers,cells)=>cells.map((v,n)=>`<td data-label="${esc(headers[n])}">${v}</td>`).join('');
function sectorMetadata(r){return `${r.effective_date?'Zusammensetzung: '+date(r.effective_date):'Zusammensetzungsdatum unbekannt'}<small>Gewichte beobachtet: ${date(r.observed_date)}</small>${countrySource(r.source)}<small>Schema: ${esc(r.taxonomy.label)} · ID ${esc(r.taxonomy.id)}<br>${r.taxonomy.effective_date?'Gültig ab '+date(r.taxonomy.effective_date):'Gültigkeitsdatum unbekannt'} · beobachtet ${date(r.taxonomy.observed_date)}</small>${countrySource(r.taxonomy.source)}`;}
function renderSectors(p){
  const d=p.sector_distribution;if(!d)return;const v=sectorView();
  $('#sector-summary').innerHTML=d.complete?[
    ['Wertpapierwert ohne Cash (V)',money(d.value)],['Gemeldete Sektorwerte (R)',money(d.reported.value)],['Nicht gemeldete Anteile (U)',money(d.unknown.value)+' · '+percent(d.unknown.weight)],['Überdeckung (O)',money(d.overreported.value)+' · '+percent(d.overreported.weight)]
  ].map(([a,b])=>`<div class="stat"><span>${a}</span><strong>${b}</strong></div>`).join('')+'<p class="muted">Abgleich vor Rundung: R + U − O = V. Lücken und Überdeckungen werden je Position ermittelt und getrennt aufsummiert.</p>':'<div class="notice warning">Kurse fehlen. Vollständige Sektorsummen und Prozentanteile werden nicht ausgegeben. Bewertbare Einzelpositionen stehen unten als Teilbewertung.</div>';
  const messages=new Map();for(const w of d.warnings){const name=p.instruments.find(i=>i.id===w.instrument_id)?.name||'Gesamtdepot';if(!messages.has(name))messages.set(name,new Set());messages.get(name).add(sectorMessages[w.code]||w.code);}
  $('#sector-warnings').innerHTML=(d.has_overcoverage?'<div class="notice warning">Gemeldete Gewichte überschreiten bei mindestens einer Position 100 %. Rohwerte bleiben erhalten. Überdeckung ist kein zusätzlicher Depotwert; eine Kreisaufteilung wäre hier irreführend.</div>':'')+(messages.size?`<details><summary>Quellen- und Abdeckungshinweise</summary><ul>${[...messages].map(([name,m])=>`<li><strong>${esc(name)}</strong>: ${esc([...m].join('; '))}</li>`).join('')}</ul></details>`:'');
  $('#sector-basis').value=v.basis;$('#sector-taxonomy-field').hidden=v.basis!=='reported';
  const taxonomies=d.taxonomies||[];
  if(v.basis==='reported'&&!v.taxonomy&&taxonomies.length===1)v.taxonomy=taxonomies[0].taxonomy_id;
  $('#sector-taxonomy').innerHTML='<option value="">Schema auswählen</option>'+taxonomies.map(t=>`<option value="${esc(t.taxonomy_id)}">${esc(t.labels.join(' / '))} · ${esc(t.taxonomy_id)}</option>`).join('');
  $('#sector-taxonomy').value=v.taxonomy;
  const chosen=taxonomies.find(t=>t.taxonomy_id===v.taxonomy),conflict=chosen?.conflict||d.warnings.some(w=>w.taxonomy_id===v.taxonomy&&['sector_conflict','sector_alias_conflict'].includes(w.code)),blocked=v.basis==='reported'&&(!chosen||conflict);
  $('#sector-basis-note').textContent=v.basis==='total'?'Hauptansicht: Anteil am gesamten Wertpapierwert ohne Cash. Gleiche Namen aus verschiedenen Schemata bleiben getrennt.':!chosen?'Bitte ein Klassifikationsschema auswählen. Es gibt keine gemeinsame Normierung verschiedener Schemata.':conflict?'Widersprüchliche Schema-/Sektoridentitäten: Anteile innerhalb dieses Schemas werden nicht ausgegeben.':'Vorlagenbasis: Anteil innerhalb gemeldeter Sektorwerte des ausgewählten Schemas. Bezugswert R = '+money(chosen.reported.value)+'. Lücken und Überdeckung bleiben oben sichtbar; Rohgewichte werden nicht verändert.';
  const headers=['Sektor','Klassifikationsschema','Gemeldeter Wert',v.basis==='total'?'Anteil am Wertpapierwert':'Anteil innerhalb gemeldeter Sektorwerte'];
  const rows=(d.sectors||[]).filter(r=>v.basis==='total'||r.taxonomy_id===v.taxonomy).sort((a,b)=>countryUnits(a.value)===countryUnits(b.value)?a.labels.join('/').localeCompare(b.labels.join('/')):countryUnits(a.value)>countryUnits(b.value)?-1:1);
  $('#sector-values').innerHTML=!d.complete?empty('Bewertung unvollständig','Fehlende Kurse ergänzen.'):blocked?empty('Schema auswählen oder Quellenkonflikt klären','Die Hauptansicht am Wertpapierwert bleibt verfügbar.'):rows.length?sectorTable(headers,rows.map(r=>`<tr data-sector-id="${esc(r.sector_id)}" data-taxonomy-id="${esc(r.taxonomy_id)}">${sectorCells(headers,[esc(r.labels.join(' / ')),`${esc(taxonomies.find(t=>t.taxonomy_id===r.taxonomy_id)?.labels.join(' / '))}<small>${esc(r.taxonomy_id)}</small>`,money(r.value),percent(v.basis==='total'?r.weight_total_securities:r.weight_reported_in_taxonomy)])}</tr>`)):empty('Noch keine gemeldeten Sektoren','Sektorstände manuell erfassen oder Vorlagenquellen prüfen.');
  const sourceHeaders=['Wertpapier','Gemeldete Gewichte & Werte','Verwendete Quelle & Schema','Pflege & Historie'];
  $('#sector-sources').innerHTML=p.instruments.length?sectorTable(sourceHeaders,p.instruments.map(i=>{
    const pos=d.positions.find(r=>r.instrument_id===i.id),history=p.sector_snapshots.filter(r=>r.instrument_id===i.id).sort((a,b)=>b.sequence-a.sequence),r=history.find(r=>r.id===pos?.snapshot_id);
    const status={missing:'Kein verwendbarer Stand',underreported:'Nicht vollständig gemeldet',complete:'Vollständig gemeldet',overreported:'Überdeckung'};
    const coverage=pos?`${percent(pos.weight_sum)}<small>${pos.value===null?'Kurs fehlt; Teilbewertung':money(pos.value)} · ${esc(status[pos.status]||pos.status)}</small><small>Gemeldet: ${money(pos.reported?.value)}<br>Nicht gemeldet: ${money(pos.unknown?.value)}<br>Überdeckung: ${money(pos.overreported?.value)}</small>`:'Kein Bestand zum Stichtag';
    return `<tr>${sectorCells(sourceHeaders,[`<strong>${esc(i.name)}</strong><small>${esc(i.isin)}</small>`,coverage,(r?sectorMetadata(r):'Kein verwendbarer Sektorstand')+(pos?.pending_taxonomy?'<details><summary>Später belegtes Schema</summary>'+sectorMetadata(pos.pending_taxonomy)+'</details>':''),`<button class="row-action" data-sector="${esc(i.id)}">Erfassen</button>${history.length?`<details><summary>${history.length} Stand/Stände</summary>${history.map(h=>`<section class="sector-history"><strong>${h.void?'Storniert: '+esc(h.void_reason):'Aktiv'} · ${percent(TrackerSectors.coverage(h.allocations).weight_sum)}</strong><small>Stand-ID ${esc(h.id)}</small>${sectorMetadata(h)}${h.void?'':`<button class="row-action" data-sector-void="${esc(h.id)}">Stornieren</button>`}</section>`).join('')}</details>`:''}`])}</tr>`;
  })):empty('Noch keine Wertpapiere','Ein Depot erfassen oder ein separates Beispieldepot importieren.');
}
$('#sector-basis').onchange=()=>{sectorView().basis=$('#sector-basis').value;renderSectors(current());};
$('#sector-taxonomy').onchange=()=>{sectorView().taxonomy=$('#sector-taxonomy').value;renderSectors(current());};
function importSectorSummary(r){const rows=r.sector_coverage||[];return `<div class="stat"><span>Sektorstände</span><strong>${r.summary.sector_snapshots||0}</strong></div>`+(rows.length?`<details><summary>Sektorquellen &amp; Überdeckungen prüfen</summary><ul>${rows.map(x=>`<li>${esc(x.isin)} · Summe ${percent(x.weight_sum)}, nicht gemeldet ${percent(x.unreported_weight)}, überdeckt ${percent(x.overreported_weight)}${x.void?' · storniert':''}. ${sectorMetadata(x)}</li>`).join('')}</ul></details>`:'');}
$('#sector-template').onclick=async()=>{
  const b=$('#sector-template');b.disabled=true;
  try{const r=await api('sectors/preview',{portfolio_id:selected});previewMode='sectors';previewId=r.preview_id;previewRevision=r.revision;importKey=crypto.randomUUID();
    const labels={new:'Wird ergänzt',existing:'Vorhandene Sektorhistorie bleibt erhalten',missing:'Keine passende Vorlagen-ISIN'};
    $('#preview-content').innerHTML=`<p><strong>${esc(r.name)}</strong> · ${r.added} neue Sektorstände</p><div class="notice warning">Tabellenstand 17.11.2026, kein Live-Datenstand. Zusammensetzungs- und Taxonomiedatum unbekannt. Die Sektorbezeichnungen der Vorlage sind keinem verifizierten GICS-/ICB-Schema zugeordnet. Drei ETFs melden 100,1 %; diese Werte werden unverändert übernommen. Leere Quellzellen werden nicht als bestätigte Nullwerte ergänzt.</div>${r.mode==='live'?'<p>Du übernimmst Beispielquellen in dein eigenes Depot. Prüfe Quelle und Datenstand vor der Übernahme.</p>':''}<ul class="region-match-list">${r.matches.map(m=>`<li><strong>${esc(m.name)}</strong><small>${esc(m.isin)} · ${labels[m.status]}</small>${m.source?`<small>Summe ${percent(m.weight_sum)} · nicht gemeldet ${percent(m.unreported_weight)} · überdeckt ${percent(m.overreported_weight)}</small>${sectorMetadata(m)}`:''}</li>`).join('')}</ul>`;
    $('#preview-error').textContent='';$('#commit').textContent='Sektordaten ergänzen';$('#commit').disabled=r.added===0;$('#preview').showModal();
  }catch(e){error(e.message)}finally{b.disabled=false}
};
let sectorTaxonomies=[],sectorOptions=[],sectorInstrument,sectorRevision,sectorKey,sectorNewTaxonomy;
function selectedSectorTaxonomy(){const value=$('#sector-schema').value;return /^\d+$/.test(value)?sectorTaxonomies[Number(value)]:undefined;}
function updateSectorOptions(){
  const t=selectedSectorTaxonomy(),seen=new Set(),p=current();
  sectorOptions=[...(t?.id===TRACKER_SECTORS.taxonomy_id?TRACKER_SECTORS.catalog:[]),...p.sector_snapshots.filter(r=>r.taxonomy.id===t?.id).flatMap(r=>r.allocations)].filter(a=>{const key=JSON.stringify([a.sector_id,a.label]);if(seen.has(key))return false;seen.add(key);return true;}).sort((a,b)=>a.label.localeCompare(b.label));
}
function sectorRowChoices(){return '<option value="">Sektor auswählen</option>'+sectorOptions.map((a,n)=>`<option value="known:${n}">${esc(a.label)}</option>`).join('')+'<option value="new">Eigener Sektor</option>';}
function draftSectorSum(){
  try{const sum=[...$('#sector-rows').children].reduce((s,row)=>s+TrackerDomain.dec(TrackerDomain.number(decimal(row.querySelector('[data-sector-key=weight]').value),'Gewicht')),0n),hundred=TrackerDomain.dec('100');$('#sector-draft').textContent='Gemeldete Summe: '+qty(TrackerDomain.str(sum))+' %'+(sum>hundred?' · Überdeckung: '+qty(TrackerDomain.str(sum-hundred))+' Prozentpunkte. Die Werte werden unverändert gespeichert.':sum<hundred?' · Nicht gemeldet: '+qty(TrackerDomain.str(hundred-sum))+' Prozentpunkte.':'');}catch{$('#sector-draft').textContent='Gewichte als nichtnegative Dezimalzahlen eingeben.';}
}
function addSectorRow(){
  if($('#sector-rows').children.length>=100){$('#sector-editor-error').textContent='Höchstens 100 Sektorzeilen je Stand.';return;}
  const row=document.createElement('section');row.className='sector-row';row.dataset.newId=crypto.randomUUID();
  row.innerHTML=`<label class="field">Sektor<select data-sector-key="choice" required>${sectorRowChoices()}</select></label><label class="field" data-sector-label-field hidden>Eigene Bezeichnung<input data-sector-key="label" maxlength="160"></label><label class="field">Gewicht (%)<input data-sector-key="weight" type="text" inputmode="decimal" value="0" required></label><button class="text-button" type="button" data-remove-sector>Zeile entfernen</button>`;
  row.querySelector('select').onchange=e=>{const custom=e.target.value==='new';row.querySelector('[data-sector-label-field]').hidden=!custom;row.querySelector('[data-sector-key=label]').required=custom;};
  row.querySelector('[data-remove-sector]').onclick=()=>{row.remove();sectorKey=crypto.randomUUID();draftSectorSum();};$('#sector-rows').append(row);draftSectorSum();
}
function changeSectorSchema(){
  const form=$('#sector-editor-form'),t=selectedSectorTaxonomy(),set=(n,v)=>form.elements.namedItem(n).value=v||'';
  set('sector_taxonomy_label',t?.label);set('sector_taxonomy_effective_date',t?.effective_date);set('sector_taxonomy_observed_date',t?.observed_date||localDay());set('sector_taxonomy_source_label',t?.source.label);
  updateSectorOptions();for(const row of $('#sector-rows').children){row.querySelector('select').innerHTML=sectorRowChoices();row.querySelector('[data-sector-label-field]').hidden=true;row.querySelector('[data-sector-key=label]').required=false;row.dataset.newId=crypto.randomUUID();}
  sectorKey=crypto.randomUUID();$('#sector-editor-error').textContent='';
}
function openSectorEditor(id){
  const p=current(),seen=new Set();sectorInstrument=id;sectorRevision=state.revision;sectorKey=crypto.randomUUID();sectorNewTaxonomy=crypto.randomUUID();
  sectorTaxonomies=[TRACKER_SECTORS.records[0].taxonomy,...p.sector_snapshots.map(r=>r.taxonomy)].filter(t=>{const key=JSON.stringify(t);if(seen.has(key))return false;seen.add(key);return true;});
  $('#sector-editor-form').reset();$('#sector-rows').innerHTML='';$('#sector-editor-error').textContent='';$('#sector-editor-name').textContent=p.instruments.find(i=>i.id===id).name;
  $('#sector-schema').innerHTML='<option value="">Schema auswählen</option>'+sectorTaxonomies.map((t,n)=>`<option value="${n}">${esc(t.label)} · beobachtet ${date(t.observed_date)}</option>`).join('')+'<option value="new">Neues eigenes Schema</option>';
  $('#sector-editor-form [name=sector_observed_date]').value=localDay();$('#sector-editor-form [name=sector_taxonomy_observed_date]').value=localDay();sectorOptions=[];addSectorRow();$('#sector-editor').showModal();
}
$('#sector-schema').onchange=changeSectorSchema;
$('#sector-add-row').onclick=()=>{addSectorRow();sectorKey=crypto.randomUUID();};
$('#sector-editor-close').onclick=$('#sector-editor-cancel').onclick=()=>$('#sector-editor').close();
$('#sector-editor-form').addEventListener('input',()=>{sectorKey=crypto.randomUUID();draftSectorSum();});
$('#sector-editor-form').addEventListener('submit',async e=>{
  e.preventDefault();const b=$('#sector-editor-save');b.disabled=true;$('#sector-editor-error').textContent='';
  try{
    const data=Object.fromEntries(new FormData(e.target)),existing=selectedSectorTaxonomy();if(!existing&&$('#sector-schema').value!=='new')throw Error('Klassifikationsschema auswählen.');
    const allocations=[...$('#sector-rows').children].map(row=>{
      const get=k=>row.querySelector('[data-sector-key='+k+']').value,choice=get('choice');if(choice!=='new'&&!/^known:\d+$/.test(choice))throw Error('Sektor auswählen.');
      const sector=choice==='new'?{sector_id:row.dataset.newId,label:get('label')}:sectorOptions[Number(choice.slice(6))];if(!sector)throw Error('Sektor auswählen.');
      const pct=decimal(get('weight'));if((pct.split('.')[1]||'').length>10)throw Error('Prozentgewichte dürfen höchstens zehn Nachkommastellen haben.');const weight=TrackerDomain.number(pct,'Prozentgewicht');if(TrackerDomain.dec(weight)>TrackerDomain.dec('100'))throw Error('Ein einzelnes Sektorgewicht darf 100 % nicht übersteigen.');
      return {sector_id:sector.sector_id,label:sector.label,weight:TrackerDomain.str(TrackerDomain.dec(weight)/100n)};
    });
    const taxSource=existing&&existing.source.label===data.sector_taxonomy_source_label&&existing.label===data.sector_taxonomy_label&&existing.effective_date===(data.sector_taxonomy_effective_date||null)&&existing.observed_date===data.sector_taxonomy_observed_date?existing.source:{kind:'manual',label:data.sector_taxonomy_source_label};
    const result=await api('command',{key:sectorKey,revision:sectorRevision,action:'sector_add',data:{portfolio_id:selected,instrument_id:sectorInstrument,effective_date:data.sector_effective_date||null,observed_date:data.sector_observed_date,source:{kind:'manual',label:data.sector_source_label},taxonomy:{id:existing?.id||sectorNewTaxonomy,label:data.sector_taxonomy_label,effective_date:data.sector_taxonomy_effective_date||null,observed_date:data.sector_taxonomy_observed_date,source:taxSource},allocations}});
    selected=result.portfolio_id;await refresh();$('#sector-editor').close();toast('Sektorstand gespeichert. Gemeldete Gewichte unverändert.');
  }catch(e){$('#sector-editor-error').textContent=e.message;if(e.status===412){await refresh().catch(()=>{});sectorRevision=state.revision;sectorKey=crypto.randomUUID();$('#sector-editor-error').textContent='Aktueller Stand geladen. Eingaben prüfen und erneut speichern.';}}
  finally{b.disabled=false;}
});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(b?.dataset.sector)openSectorEditor(b.dataset.sector);if(b?.dataset.sectorVoid)openEditor('sector_void',b.dataset.sectorVoid);});
