const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = n => n === null || n === undefined ? '—' : new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(n));
const qty = n => new Intl.NumberFormat('de-DE',{maximumFractionDigits:8}).format(Number(n));
const percent = n => n == null ? '—' : new Intl.NumberFormat('de-DE',{style:'percent',maximumFractionDigits:2}).format(Number(n));
const localDay = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
const date = s => s ? s.split('-').reverse().join('.') : '—';
const names = {deposit:'Einzahlung',withdrawal:'Auszahlung',buy:'Kauf',sell:'Verkauf',dividend:'Ausschüttung',interest:'Zinsen',fee:'Gebühr',tax:'Steuer',refund:'Steuererstattung',unclassified_out:'Ungeklärter Cash-Abgang'};
let state, selected, page='overview', action, formKey, previewId, importKey, timer, previewMode='import', previewRevision;
$('#as-of').value=localDay();
const current = () => state?.portfolios.find(p=>p.id===selected);
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('#toast').hidden=true,6500);}
function error(message){$('#error').textContent=message;$('#error').hidden=!message;}
async function api(path, data){
  if(globalThis.TrackerLocal)return TrackerLocal.api(path,data);
  const options=data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':state?.token||''},body:JSON.stringify(data)};
  let response;try{response=await fetch('/api/'+path,options);}catch{throw Error('Lokaler Server nicht erreichbar. Eingaben bleiben erhalten. Bitte den Starter prüfen.');}
  const body=await response.json();if(!response.ok){const e=Error(body.error||'Die Aktion konnte nicht abgeschlossen werden.');e.status=response.status;throw e;}return body;
}
async function refresh(){
  try{state=await api('state?as_of='+encodeURIComponent($('#as-of').value));if(!state.portfolios.some(p=>p.id===selected))selected=state.portfolios[0]?.id;render();error('');$('#save-state').textContent=globalThis.TrackerLocal?'Im Browser gespeichert':'Verbunden · lokal gespeichert';}
  catch(e){error(e.message);$('#save-state').textContent='Speicher prüfen';throw e;}
}
function empty(title,body){return `<div class="empty"><strong>${esc(title)}</strong>${esc(body)}</div>`;}
function metric(label,value,detail){return `<article class="metric"><div class="metric-label">${label}</div><div class="metric-value">${value}</div><small>${detail}</small></article>`;}
function render(){
  const original=current();if(!original)return;
  let clarification;try{clarification=pcCalculation(original);}catch(e){error(e.message);return;}
  const p={...original,overview:clarification.overview};
  $('#portfolio').innerHTML=state.portfolios.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');$('#portfolio').value=selected;
  $('#mode').textContent=p.mode==='example'?'Beispielportfolio':'Eigenes Depot';$('#example').hidden=p.mode!=='example';
  const o=p.overview;
  $('#metrics').innerHTML=metric('Gesamtwert',money(o.total),o.total===null?'Bewertung unvollständig':'Wertpapiere + Cash')+metric('Wertpapiere',money(o.invested),`${o.positions.filter(p=>Number(p.quantity)!==0).length} gehaltene Positionen`)+metric('Verfügbares Depot-Cash',money(o.cash),'Aus deinen erfassten Buchungen')+metric('Gesamtergebnis',money(o.gain),'Gesamtwert − Nettoeinzahlungen');
  $('#warnings').innerHTML=o.warnings.length?`<div class="notice warning"><strong>Datenqualität prüfen</strong><ul>${o.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:'';
  const positions=o.positions.filter(i=>Number(i.quantity)>0).sort((a,b)=>Number(b.value)-Number(a.value));
  $('#positions').innerHTML=positions.length?positions.map(i=>`<div class="position"><div class="position-head"><span class="position-name">${esc(i.name)}<small>${esc(i.category)} · ${qty(i.quantity)} Stück</small></span><strong>${money(i.value)}</strong></div><progress max="100" value="${o.invested&&i.value?Number(i.value)/Number(o.invested)*100:0}" aria-label="Anteil ${esc(i.name)}"></progress></div>`).join(''):empty('Dein Depot beginnt hier','Erfasse ein Wertpapier, eine Einzahlung und deinen ersten Kauf. Oder probiere die Vorlage unter Daten & Sicherung aus.');
  $('#performance').innerHTML=`<div class="stat"><span>Nettoeinzahlungen</span><strong>${money(o.contributions)}</strong></div><div class="stat"><span>Gesamtergebnis</span><strong class="${Number(o.gain)<0?'negative':'positive'}">${money(o.gain)}</strong></div><div class="stat"><span>Geldgewichtete Rendite p. a.</span><strong>${percent(o.xirr)}</strong></div>${o.xirr_note?`<p class="muted">${esc(o.xirr_note)}</p>`:'<p class="muted">Gesamtdepot-XIRR einschließlich Cash, Gebühren und Steuern aus den erfassten Buchungen.</p>'}`;
  $('#recent').innerHTML=txTable(p.transactions.filter(t=>!t.void).sort((a,b)=>b.date.localeCompare(a.date)||b.sequence-a.sequence).slice(0,5),false);
  renderJournal();
  $('#instruments').innerHTML=p.instruments.length?`<div class="table-wrap"><table><thead><tr><th>Wertpapier</th><th class="numeric">Bestand</th><th class="numeric">Kurs zum Stichtag</th><th>Stand / Quelle</th><th></th></tr></thead><tbody>${o.positions.map(i=>`<tr><td>${esc(i.name)}<small>${esc(i.isin)} · ${esc(i.category)}</small></td><td class="numeric">${qty(i.quantity)}</td><td class="numeric">${i.quote?money(i.quote.price):'—'}</td><td>${i.quote?date(i.quote.date):'Kein Kurs'}<small>${esc(i.quote?.source||'Manuell erfassen')}</small></td><td><button class="row-action" data-quote="${esc(i.id)}">Kurs erfassen</button></td></tr>`).join('')}</tbody></table></div>`:empty('Noch keine Wertpapiere','Lege dein erstes Wertpapier über „+ Wertpapier“ an.');
  renderDistribution(p);
  renderCustomTargets(p);
  renderPerformance(p,clarification.performance);
  renderClarifications(original,clarification);
  renderCountries(p);
  renderSectors(p);
  renderCompanies(p);
  renderGDP(p);
  renderAllowances();
  renderQuoteBatchButton();
  renderMetadata(p);
  renderLiquidity(original);
  renderSaleScenario(original);
  renderSharedGain(original);
  renderPortfolioPrice(original);
  $('#export').href=globalThis.TrackerLocal?'#':'/api/export/'+selected;$('#data-path').textContent=state.data_path;
}
function txTable(rows,actions=true){
  if(!rows.length)return empty('Noch keine Buchungen','Einzahlungen, Käufe und Erträge erscheinen hier.');
  const p=current();
  return `<div class="table-wrap"><table><thead><tr><th>Datum</th><th>Buchung</th><th>Wertpapier / Notiz</th><th class="numeric">Stück</th><th class="numeric">Cash-Effekt</th>${actions?'<th></th>':''}</tr></thead><tbody>${rows.map(t=>{
    const effect=t.cash_effect;
    return `<tr class="${t.void?'void':''}"><td>${date(t.date)}${t.date>$('#as-of').value?'<small>nach Stichtag</small>':''}</td><td><span class="tag">${esc(names[t.type])}</span>${t.void?'<small>Storniert</small>':''}${p.payment_clarifications?.some(r=>r.transaction_id===t.id)?'<small>Klärungshistorie vorhanden · Originalbuchung</small>':''}</td><td>${esc(p.instruments.find(i=>i.id===t.instrument_id)?.name||'Depot-Cash')}<small>${esc(t.note)}${t.void?' · '+esc(t.void_reason):''}</small></td><td class="numeric">${Number(t.quantity)?qty(t.quantity):'—'}</td><td class="numeric ${Number(effect)<0?'negative':'positive'}">${money(effect)}${Number(t.charges)?`<small>inkl. ${money(t.charges)} Abzüge</small>`:''}</td>${actions?`<td>${!t.void?`<button class="row-action" data-void="${esc(t.id)}">Stornieren</button>`:''}</td>`:''}</tr>`;
  }).join('')}</tbody></table></div>`;
}
function renderJournal(){const query=$('#search').value.toLowerCase();const p=current();$('#transactions').innerHTML=txTable([...p.transactions].filter(t=>(names[t.type]+' '+t.note+' '+(p.instruments.find(i=>i.id===t.instrument_id)?.name||'')).toLowerCase().includes(query)).sort((a,b)=>b.date.localeCompare(a.date)||b.sequence-a.sequence));}
function navigate(next){page=next;for(const el of document.querySelectorAll('.page'))el.hidden=el.id!==page;for(const el of document.querySelectorAll('.nav'))el.classList.toggle('active',el.dataset.page===page);const titles={valuation:['Portfolio-Wertvergleich','Gespeicherte Werte und eigene Kursannahmen vergleichen.'],overview:['Übersicht','Bestände, Cash und Entwicklung an einem Ort.'],distribution:['Verteilung','Regionen, Strategien und Datenabdeckung im Blick.'],allowances:['Freistellungsübersicht','Register und gemeldete Jahreswerte unabhängig vom Depot.'],gdp:['BIP-Vergleich','Länderanteile und ausgewählte BIP-Vergleichsbasis.'],companies:['Unternehmen & Top-10','Gemeldete Namensgruppen und beobachtete Überschneidungen.'],sectors:['Branchen & Sektoren','Gemeldete Sektorwerte, Lücken und Quellen.'],countries:['Länder & IL/EM','Ländergewichte, Klassifikation und unbekannte Anteile.'],returns:['Ergebnis & Rendite','Zugeordnete Zahlungen, Ergebnis und Jahresrendite.'],journal:['Buchungen','Deine Bewegungen. Vollständig und nachvollziehbar.'],securities:['Wertpapiere & Kurse','Die Grundlage für eine verlässliche Bewertung.'],data:['Daten & Sicherung','Ausprobieren, mitnehmen und sicher aufbewahren.']};$('#page-title').textContent=titles[page][0];$('#subtitle').textContent=titles[page][1];}
function field(label,name,type='text',value='',extra=''){return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;}
function options(){return current().instruments.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');}
function openEditor(kind,id){
  if(!state)return;action=kind;formKey=crypto.randomUUID();$('#form-error').textContent='';$('#submit').disabled=false;
  const titles={company_void:'Unternehmensstand stornieren',sector_void:'Sektorstand stornieren',country_void:'Länderstand stornieren',region_add:'Regionaldaten erfassen',region_void:'Regionalstand stornieren',transaction_add:'Buchung erfassen',instrument_add:'Wertpapier hinzufügen',quote_add:'Kurs erfassen',transaction_void:'Buchung stornieren',portfolio_create:'Neues Depot'};$('#dialog-title').textContent=titles[kind];
  let html='';
  if(kind==='transaction_add')html=`<label class="field">Buchungstyp<select name="type">${Object.entries(names).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label>${field('Datum','date','date',localDay(),'required')}<label class="field" id="instrument-field">Wertpapier<select name="instrument_id"><option value="">Ohne Zuordnung</option>${options()}</select></label><div class="form-grid">${field('Betrag / Handelswert (€)','amount','text','','required inputmode="decimal" placeholder="z. B. 150,00"')}${field('Stückzahl','quantity','text','0','inputmode="decimal"')}</div><p class="muted">Beträge immer positiv eingeben. Bei Kauf/Verkauf Handelswert vor zusätzlichen Gebühren und Steuern. Der Buchungstyp bestimmt das Vorzeichen.</p><div class="form-grid">${field('Zusätzliche Gebühren (€)','fee','text','0','inputmode="decimal"')}${field('Zusätzliche Steuern (€)','tax','text','0','inputmode="decimal"')}</div>${field('Notiz (optional)','note','text','','maxlength="500"')}`;
  if(kind==='instrument_add')html=field('Name','name','text','','required maxlength="160"')+field('ISIN','isin','text','','required minlength="12" maxlength="12" placeholder="z. B. IE00BK5BQV03"')+field('Strategie / Kategorie','category','text','Ohne Zuordnung','required maxlength="60"')+'<p class="muted">Handelswerte werden in EUR erfasst. Die Fondswährung kann davon abweichen.</p>';
  if(kind==='quote_add')html=`<label class="field">Wertpapier<select name="instrument_id" required>${options()}</select></label>${field('Kursdatum','date','date',localDay(),'required')}${field('Kurs in EUR','price','text','','required inputmode="decimal"')}${field('Quelle','source','text','Manuell','required maxlength="120"')}`;
  if(kind==='transaction_void')html=`<input name="id" type="hidden" value="${esc(id)}"><p>Die Buchung bleibt im Journal erhalten, zählt aber nicht mehr für Bestand und Cash. Abhängige Verkäufe können ein Storno verhindern.</p>${field('Grund','reason','text','','required maxlength="500"')}`;
  if(kind==='portfolio_create')html=field('Depotname','name','text','','required maxlength="80"')+'<label class="field">Verwendung<select name="mode"><option value="example">Beispiel / ausprobieren</option><option value="live">Eigenes Depot</option></select></label>';
  if(kind==='company_void')html=`<input name="id" type="hidden" value="${esc(id)}"><p>Der Stand bleibt in der Historie erhalten. Ein älterer Stand kann danach gelten.</p>${field('Grund','reason','text','','required maxlength="500"')}`;
  if(kind==='sector_void')html=`<input name="id" type="hidden" value="${esc(id)}"><p>Der Sektorstand bleibt in der Historie erhalten. Ein älterer verwendbarer Stand kann danach gelten.</p>${field('Grund','reason','text','','required maxlength="500"')}`;
  if(kind==='country_void')html=`<input name="id" type="hidden" value="${esc(id)}"><p>Der Länderstand bleibt erhalten, wird aber nicht mehr verwendet. Ein früherer Stand kann danach gelten.</p>${field('Grund','reason','text','','required maxlength="500"')}`;
  if(kind==='region_add')html=regionFields(id);
  if(kind==='region_void')html=`<input name="id" type="hidden" value="${esc(id)}"><p>Dieser Stand wird von der Berechnung ausgenommen. Ein älterer Stand kann danach wieder gelten.</p>${field('Grund','reason','text','','required maxlength="500"')}`;
  $('#fields').innerHTML=html;
  if(kind==='quote_add'&&id)$('#fields [name=instrument_id]').value=id;
  if(kind==='transaction_add'){toggleType();$('#fields [name=type]').addEventListener('change',toggleType);}
  $('#editor').showModal();
}
function toggleType(){const type=$('#fields [name=type]').value,trade=['buy','sell'].includes(type),costs=[...['buy','sell','dividend','interest']].includes(type);for(const n of ['quantity','fee','tax']){const input=$(`#fields [name=${n}]`);input.closest('.field').hidden=n==='quantity'?!trade:!costs;if(input.closest('.field').hidden)input.value='0';}$('#fields [name=instrument_id]').required=trade;}
function decimal(value){value=value.trim();if(value.includes(','))value=value.replaceAll('.','').replace(',','.');return value;}
$('#editor-form').addEventListener('input',()=>formKey=crypto.randomUUID());
$('#editor-form').addEventListener('submit',async event=>{event.preventDefault();$('#submit').disabled=true;$('#form-error').textContent='';const data=Object.fromEntries(new FormData(event.target));for(const key of ['amount','quantity','fee','tax','price'])if(key in data)data[key]=decimal(data[key]);data.portfolio_id=selected;try{if(action==='region_add')prepareRegionInput(data);const result=await api('command',{action,data,key:formKey,revision:state.revision});selected=result.portfolio_id;$('#editor').close();await refresh();toast('Gespeichert.');}catch(e){$('#form-error').textContent=e.message;if(e.status===412){await refresh().catch(()=>{});$('#form-error').textContent='Aktueller Stand geladen. Bitte Eingaben prüfen und erneut speichern.';}}finally{$('#submit').disabled=false;}});
async function showPreview(data){try{previewMode='import';$('#commit').textContent='Als separates Depot importieren';$('#commit').disabled=false;const result=await api('import/preview',data);previewId=result.preview_id;importKey=crypto.randomUUID();const s=result.summary;$('#preview-content').innerHTML=`<p><strong>${esc(s.name)}</strong> · ${s.mode==='example'?'Beispiel':'Eigenes Depot'}</p><div class="stat"><span>Wertpapiere</span><strong>${s.instruments}</strong></div><div class="stat"><span>Buchungen</span><strong>${s.transactions}</strong></div><div class="stat"><span>Kurse</span><strong>${s.quotes}</strong></div><ul class="muted">${result.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul>`;$('#preview-content').innerHTML+=importRegionSummary(result)+importCountrySummary(result)+importSectorSummary(result)+importCompanySummary(result)+importAllowanceSummary(result)+importPlanningProfileSummary(result)+importMetadataSummary(result)+importClarificationSummary(result)+importGDPSummary(result)+importCustomTargetSummary(result);$('#preview-error').textContent='';$('#preview').showModal();}catch(e){error(e.message);}}
$('#commit').addEventListener('click',async()=>{const button=$('#commit');button.disabled=true;try{const result=await api(previewMode==='companies'?'companies/commit':previewMode==='sectors'?'sectors/commit':previewMode==='regions'?'regions/commit':previewMode==='countries'?'countries/commit':'import/commit',{preview_id:previewId,key:importKey,revision:['regions','countries','sectors','companies'].includes(previewMode)?previewRevision:state.revision});selected=result.portfolio_id;await refresh();$('#preview').close();navigate(previewMode==='companies'?'companies':previewMode==='sectors'?'sectors':previewMode==='regions'?'distribution':previewMode==='countries'?'countries':'overview');toast(previewMode==='companies'?'Unternehmensstände ergänzt.':previewMode==='sectors'?'Sektordaten ergänzt. Gewichte unverändert.':previewMode==='regions'?'Regionaldaten ergänzt. Buchungen unverändert.':previewMode==='countries'?'Länderdaten ergänzt. Buchungen und Regionalstände unverändert.':'Import abgeschlossen. Separates Depot angelegt.');}catch(e){$('#preview-error').textContent=e.message;}finally{button.disabled=false;}});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.page)navigate(b.dataset.page);if(b.dataset.go)navigate(b.dataset.go);if(b.dataset.quote)openEditor('quote_add',b.dataset.quote);if(b.dataset.region)openEditor('region_add',b.dataset.region);if(b.dataset.regionVoid)openEditor('region_void',b.dataset.regionVoid);if(b.dataset.void)openEditor('transaction_void',b.dataset.void);});
$('#new-transaction').onclick=()=>openEditor('transaction_add');$('#new-instrument').onclick=()=>openEditor('instrument_add');$('#new-portfolio').onclick=()=>openEditor('portfolio_create');
$('#close-dialog').onclick=$('#cancel').onclick=()=>$('#editor').close();$('#close-preview').onclick=$('#cancel-preview').onclick=()=>$('#preview').close();
$('#portfolio').onchange=()=>{selected=$('#portfolio').value;render();};$('#refresh').onclick=()=>refresh().catch(()=>{});$('#as-of').onchange=()=>refresh().catch(()=>{});$('#search').oninput=renderJournal;
$('#template').onclick=async()=>{const b=$('#template');b.disabled=true;await showPreview({source:'template'});b.disabled=false;};
$('#import-file').onchange=async event=>{const f=event.target.files[0];if(!f)return;try{if(f.size>8_000_000)throw Error('Datei ist zu groß (max. 8 MB).');await showPreview({file:JSON.parse(await f.text())});}catch(e){error('Import nicht möglich: '+e.message);}event.target.value='';};
$('#backup').onclick=async()=>{const b=$('#backup');b.disabled=true;try{const result=await api('backup',{});toast(result.message+' '+result.path);}catch(e){error(e.message);}finally{b.disabled=false;}};
$('#export').addEventListener('click',async e=>{if(globalThis.TrackerLocal){e.preventDefault();try{await TrackerLocal.exportDepot(selected);}catch(err){error(err.message);}}});
