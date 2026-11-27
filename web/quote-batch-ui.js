/* Manual EUR quotes: explicit selection, retained per-depot drafts, preview before commit. */
const qbDrafts=new Map();let qbPortfolio,qbPreview,qbKey,qbBusy=false;
const qbButton=document.createElement('button');qbButton.id='quote-batch-open';qbButton.className='secondary';qbButton.textContent='Mehrere Kurse erfassen';
$('#securities .panel-heading').after(qbButton);
const qbDialog=document.createElement('dialog');qbDialog.id='quote-batch';qbDialog.setAttribute('aria-labelledby','qb-title');
qbDialog.innerHTML=`<form id="qb-form" novalidate><div class="dialog-heading"><h2 id="qb-title">Mehrere Kurse erfassen</h2><button type="button" id="qb-close" class="icon-button" aria-label="Kurseingabe schließen">×</button></div><p id="qb-depot"></p><div id="qb-edit"><p class="muted">Wähle die gewünschten Wertpapiere aus und trage EUR-Kurs, tatsächliches Kursdatum und Quelle ein. Vorhandene Kurse werden nicht vorbefüllt. Der Entwurf bleibt beim Schließen bis zum Neuladen in diesem Tab erhalten.</p><div class="qb-common"><label class="field">Gemeinsames Kursdatum<input id="qb-common-date" type="date" min="1900-01-01" max="2200-12-31"></label><label class="field">Gemeinsame Quelle<input id="qb-common-source" maxlength="120"></label><button id="qb-apply" type="button" class="secondary">Auf ausgewählte Zeilen anwenden</button></div><p class="muted">Nur ausgefüllte gemeinsame Felder werden auf ausgewählte Zeilen übertragen.</p><button id="qb-select-all" type="button" class="text-button">Alle auswählen</button><div id="qb-rows"></div></div><div id="qb-preview" hidden></div><p id="qb-error" class="form-error" role="alert"></p><div class="dialog-actions"><button id="qb-cancel" type="button" class="secondary">Schließen</button><button id="qb-back" type="button" class="secondary" hidden>Eingaben ändern</button><button id="qb-check" type="submit" class="primary">Vorschau prüfen</button><button id="qb-commit" type="button" class="primary" hidden>Kurse übernehmen</button></div></form>`;
document.body.append(qbDialog);
function renderQuoteBatchButton(){qbButton.hidden=!globalThis.TrackerLocal||!globalThis.TrackerQuoteBatch;qbButton.disabled=!current()?.instruments.length;}
function qbRemember(){const draft=qbDrafts.get(qbPortfolio);if(!draft)return;for(const row of $('#qb-rows').children){const r=draft.rows.find(r=>r.instrument_id===row.dataset.instrument);r.selected=row.querySelector('[data-qb=selected]').checked;for(const k of ['price','date','source'])r[k]=row.querySelector(`[data-qb=${k}]`).value;}draft.common_date=$('#qb-common-date').value;draft.common_source=$('#qb-common-source').value;}
function qbEdit(){qbPreview=null;$('#qb-edit').hidden=false;$('#qb-preview').hidden=true;$('#qb-back').hidden=true;$('#qb-commit').hidden=true;$('#qb-check').hidden=false;$('#qb-error').textContent='';}
function qbLock(busy){qbBusy=busy;for(const b of qbDialog.querySelectorAll('button,input'))b.disabled=busy;}
function qbClose(){if(qbBusy)return;qbRemember();qbDialog.close();}
qbButton.onclick=()=>{
 const p=current();if(!p?.instruments.length)return;qbPortfolio=p.id;
 let draft=qbDrafts.get(p.id);if(!draft){draft={rows:[],common_date:'',common_source:''};qbDrafts.set(p.id,draft);}
 for(const i of p.instruments)if(!draft.rows.some(r=>r.instrument_id===i.id))draft.rows.push({instrument_id:i.id,selected:false,price:'',date:'',source:''});
 $('#qb-depot').textContent=p.name+(p.mode==='example'?' · Beispielportfolio':' · Eigenes Depot');
 $('#qb-common-date').value=draft.common_date;$('#qb-common-source').value=draft.common_source;
 $('#qb-rows').innerHTML=p.instruments.map((i,n)=>{const r=draft.rows.find(r=>r.instrument_id===i.id),q=p.overview.positions.find(v=>v.id===i.id)?.quote;return `<article class="qb-row" data-instrument="${esc(i.id)}"><label class="qb-selection"><input type="checkbox" data-qb="selected" ${r.selected?'checked':''}><span>${esc(i.name)}<small>${esc(i.isin)}</small></span></label><p class="muted">Bisher zum Stichtag: ${q?`${esc(q.price)} EUR · ${date(q.date)} · ${esc(q.source)}`:'Kein Kurs'}</p><div class="qb-fields"><label class="field" for="qb-price-${n}">Kurs in EUR<input id="qb-price-${n}" data-qb="price" aria-label="Kurs in EUR für ${esc(i.name)}" inputmode="decimal" value="${esc(r.price)}"></label><label class="field" for="qb-date-${n}">Kursdatum<input id="qb-date-${n}" data-qb="date" aria-label="Kursdatum für ${esc(i.name)}" type="date" min="1900-01-01" max="2200-12-31" value="${esc(r.date)}"></label><label class="field" for="qb-source-${n}">Quelle<input id="qb-source-${n}" data-qb="source" aria-label="Quelle für ${esc(i.name)}" maxlength="120" value="${esc(r.source)}"></label></div></article>`;}).join('');
 qbEdit();qbLock(false);qbDialog.showModal();
};
$('#qb-close').onclick=$('#qb-cancel').onclick=qbClose;
qbDialog.addEventListener('cancel',e=>{e.preventDefault();qbClose();});
$('#qb-form').addEventListener('input',()=>{qbRemember();qbPreview=null;});
$('#qb-select-all').onclick=()=>{const boxes=[...$('#qb-rows').querySelectorAll('[data-qb=selected]')],select=boxes.some(b=>!b.checked);for(const b of boxes)b.checked=select;qbRemember();};
$('#qb-apply').onclick=()=>{const d=$('#qb-common-date').value,s=$('#qb-common-source').value;for(const row of $('#qb-rows').children)if(row.querySelector('[data-qb=selected]').checked){if(d)row.querySelector('[data-qb=date]').value=d;if(s.trim())row.querySelector('[data-qb=source]').value=s;}qbRemember();};
$('#qb-back').onclick=qbEdit;
const qbQuoteText=q=>q?`${esc(q.price)} EUR · ${date(q.date)} · ${esc(q.source)}`:'Kein Kurs';
const qbWarnings={future_date:'Kursdatum liegt in der Zukunft.',older_than_valuation_quote:'Historischer Kurs: Ein neuerer Kurs bleibt am Stichtag maßgeblich.',after_valuation_date:'Nach dem Bewertungsstichtag: dort noch nicht verwendet.',different_same_day_price:'Abweichender Kurs am gleichen Tag: zusätzliche Meldung, bisheriger Kurs bleibt erhalten.',different_same_day_source:'Andere Quelle am gleichen Tag: zusätzliche Meldung, bisheriger Kurs bleibt erhalten.'};
$('#qb-form').onsubmit=async e=>{
 e.preventDefault();if(qbBusy||!$('#qb-preview').hidden)return;qbRemember();qbLock(true);$('#qb-error').textContent='';
 try{
  const draft=qbDrafts.get(qbPortfolio),rows=draft.rows.filter(r=>r.selected).map(r=>({instrument_id:r.instrument_id,price:decimal(r.price),date:r.date,source:r.source,currency:'EUR'}));
  if(!rows.length)throw Error('Bitte mindestens ein Wertpapier ausdrücklich auswählen.');
  const ids=new Set(current().instruments.map(i=>i.id));
  for(const r of rows)try{TrackerQuoteBatch.quote(r,ids);}catch(err){const el=[...$('#qb-rows').children].find(el=>el.dataset.instrument===r.instrument_id);el.querySelector('[data-qb=price]').focus();throw Error((current().instruments.find(i=>i.id===r.instrument_id)?.name||'Wertpapier')+': '+err.message);}
  qbPreview=await api('quotes/preview',{portfolio_id:qbPortfolio,rows,reference_day:localDay(),valuation_date:$('#as-of').value});qbKey=crypto.randomUUID();const p=qbPreview;
  $('#qb-preview').innerHTML=`<h3>Übernahme prüfen</h3><p><strong>${p.added_count} neue Kursmeldungen</strong> · ${p.existing_count} bereits identisch vorhanden · ${p.selected_count} ausgewählt</p><p class="muted">Bewertungsstichtag: ${date(p.valuation_date)} · Heute: ${date(p.reference_day)}. Nur neue Meldungen werden gemeinsam gespeichert. Frühere Meldungen bleiben erhalten.</p>${p.rows.map(r=>`<article class="qb-row"><strong>${esc(r.name)}</strong><small>${esc(r.isin)}</small><p><strong>${r.status==='existing'?'Bereits vorhanden – wird übersprungen':'Neu zu speichern'}:</strong> ${qbQuoteText(r.quote)}</p><p class="muted">Bisher am selben Kurstag: ${qbQuoteText(r.same_date_quote)}<br>Bisher zum Bewertungsstichtag: ${qbQuoteText(r.valuation_quote)}</p><p>${r.changes_current_valuation?'Wird am Bewertungsstichtag verwendet.':'Ändert die Kursauswahl am Bewertungsstichtag nicht.'}</p>${r.warnings.length?`<ul class="notice warning">${r.warnings.map(w=>`<li>${esc(qbWarnings[w]||w)}</li>`).join('')}</ul>`:''}</article>`).join('')}`;
  $('#qb-edit').hidden=true;$('#qb-preview').hidden=false;$('#qb-back').hidden=false;$('#qb-check').hidden=true;$('#qb-commit').hidden=false;$('#qb-commit').textContent=`${p.added_count} Kurs${p.added_count===1?'':'e'} übernehmen`;
 }catch(err){$('#qb-error').textContent=err.message;}
 finally{qbLock(false);if(qbPreview)$('#qb-commit').disabled=!qbPreview.can_commit;}
};
$('#qb-commit').onclick=async()=>{
 if(qbBusy||!qbPreview?.can_commit)return;qbLock(true);$('#qb-error').textContent='';
 try{
  const result=await api('quotes/commit',{preview_id:qbPreview.preview_id,revision:qbPreview.revision,key:qbKey});
  qbDrafts.delete(qbPortfolio);selected=result.portfolio_id;qbDialog.close();qbPreview=null;
  await refresh();toast(`${result.added} neue Kurs${result.added===1?'meldung':'meldungen'} gespeichert. ${result.existing} identische übersprungen.`);
 }catch(err){
  if(err.status===412||/abgelaufen/.test(err.message)){qbEdit();await refresh().catch(()=>{});$('#qb-error').textContent='Der Datenstand oder die Vorschau hat sich geändert. Eingaben bleiben erhalten. Bitte die Vorschau erneut prüfen.';}
  else $('#qb-error').textContent=err.message;
 }finally{qbLock(false);if(qbPreview)$('#qb-commit').disabled=!qbPreview.can_commit;}
};
