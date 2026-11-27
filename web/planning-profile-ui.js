/* Explicit per-depot profile management; loading never runs or books a scenario. */
const ppChoices=new Map();let ppDepot,ppId,ppKind,ppAction,ppRevision,ppKey,ppBusy=false;
const ppPanel=document.createElement('section');ppPanel.id='planning-profiles';ppPanel.className='panel';
ppPanel.innerHTML=`<h2>Gespeicherte Planungsprofile</h2><p class="muted">Speichere Zielbasis oder Szenarioannahmen bewusst je Depot. Die Vorlagengewichte bleiben fest. Ein Profil lädt Eingaben; Ergebnisse werden erst mit den dann gültigen Depotdaten neu berechnet.</p><div class="profile-actions"><button id="pp-new-target" class="secondary">Zielbasis speichern</button><button id="pp-new-scenario" class="secondary">Szenarioannahmen speichern</button></div><label class="field">Gespeichertes Profil auswählen<select id="pp-select"></select></label><div id="pp-summary"></div><div class="profile-actions"><button id="pp-load" class="primary">Profil laden</button><button id="pp-edit" class="secondary">Profil ändern</button><button id="pp-delete" class="secondary">Profil entfernen</button></div><p id="pp-message" class="muted" role="status"></p>`;
$('#targets').before(ppPanel);
const ppDialog=document.createElement('dialog');ppDialog.id='pp-editor';ppDialog.setAttribute('aria-labelledby','pp-title');
ppDialog.innerHTML='<form id="pp-form" novalidate><div class="dialog-heading"><h2 id="pp-title"></h2><button id="pp-close" type="button" class="icon-button" aria-label="Profilbearbeitung schließen">×</button></div><p id="pp-depot"></p><div id="pp-fields"></div><p id="pp-error" role="alert" class="form-error"></p><div class="dialog-actions"><button id="pp-cancel" type="button" class="secondary">Abbrechen</button><button id="pp-save" type="submit" class="primary">Profil speichern</button></div></form>';
document.body.append(ppDialog);
const ppSelected=()=>current()?.planning_profiles?.find(r=>r.id===$('#pp-select').value);
function ppPayload(row){const {id,sequence,...payload}=row;return TrackerPlanningProfiles.profile(payload);}
const ppBasisText=plan=>plan.mode==='current'?'Aktueller Wertpapierwert':plan.mode==='deposit'?`Wertpapierwert + ${plan.amount} EUR Einzahlung`:`Manueller Zielwert ${plan.amount} EUR`;
function ppSummary(p){return `<p><strong>${esc(p.name)}</strong> · ${p.kind==='target'?'Zielprofil':'Szenarioprofil'}</p><p>${esc(ppBasisText(p.plan))}</p>${p.funding?`<p class="muted">Neue Einzahlung: ${esc(p.funding.deposit)} EUR · Cash-Freigabe: ${esc(p.funding.cash)} EUR · Kostenschätzung: ${esc(p.funding.costs)} EUR · Verkäufe ${p.funding.sales==='allow'?'zugelassen':'gesperrt'}. Diese Annahmen sind keine Bestätigung des aktuellen Budgets.</p>`:'<p class="muted">Keine Finanzierungsannahmen gespeichert.</p>'}<p class="muted">Feste Vorlagenregeln: Regionen 43/23/34 %, Strategien 25/25/20/20/10 %. FTSE bleibt im Szenario fest; Zielbestände werden auf ganze Stücke gerundet.</p>`;}
function ppRenderChoice(){const row=ppSelected();$('#pp-summary').innerHTML=row?ppSummary(ppPayload(row)):'<p class="muted">Noch kein Profil in diesem Depot gespeichert. Temporäre Planungseingaben werden nicht automatisch gespeichert.</p>';for(const id of ['#pp-load','#pp-edit','#pp-delete'])$(id).disabled=!row;}
function renderPlanningProfiles(p){
 ppPanel.hidden=!globalThis.TrackerLocal||!globalThis.TrackerPlanningProfiles;if(ppPanel.hidden)return;
 const list=p.planning_profiles||[];$('#pp-select').innerHTML=list.length?list.map((r,n)=>`<option value="${esc(r.id)}">${esc(r.name)} · ${r.kind==='target'?'Ziel':'Szenario'} (${n+1})</option>`).join(''):'<option value="">Noch keine Profile</option>';
 if(list.some(r=>r.id===ppChoices.get(p.id)))$('#pp-select').value=ppChoices.get(p.id);ppChoices.set(p.id,$('#pp-select').value);$('#pp-message').textContent='';ppRenderChoice();
}
$('#pp-select').onchange=()=>{ppChoices.set(selected,$('#pp-select').value);$('#pp-message').textContent='';ppRenderChoice();};
$('#pp-load').onclick=()=>{
 try{const p=current(),row=ppSelected();if(!row)return;const input=TrackerPlanningProfiles.inputs(ppPayload(row));targetPlans.set(p.id,{mode:input.plan.mode,amount:input.plan.mode==='current'?'270':input.plan.amount});renderTargets(p);renderScenarioForm(p);
  if(input.funding){$('#scenario-deposit').value=input.funding.deposit;$('#scenario-cash').value=input.funding.cash;$('#scenario-costs').value=input.funding.costs;$('#scenario-sales').value=input.funding.sales;}
  else $('#scenario-sales').value='';
  $('#pp-message').textContent='Profil geladen. Frühere Szenarioergebnisse sind verworfen. Annahmen prüfen und das Szenario ausdrücklich neu berechnen.';
 }catch(e){$('#pp-message').textContent=e.message;}
};
function ppCurrent(kind){const mode=$('#target-basis').value;return {profile_version:1,ruleset:'template-v1',kind,name:'',plan:{mode,amount:mode==='current'?null:$('#target-amount').value},funding:kind==='scenario'?{deposit:$('#scenario-deposit').value,cash:$('#scenario-cash').value,costs:$('#scenario-costs').value,sales:$('#scenario-sales').value}:null};}
function ppSync(){const mode=$('#pp-fields [name=mode]').value;$('#pp-amount-field').hidden=mode==='current';$('#pp-amount-label').textContent=mode==='manual'?'Manueller Zielwert (€)':'Geplante Einzahlung (€)';const dep=$('#pp-fields [name=deposit]');if(dep){dep.readOnly=mode==='deposit';if(dep.readOnly)dep.value=$('#pp-fields [name=amount]').value;}}
function ppOpen(action,kind){
 const p=current(),row=ppSelected();if(action!=='profile_add'&&!row)return;const value=action==='profile_add'?ppCurrent(kind):ppPayload(row);
 ppAction=action;ppKind=value.kind;ppDepot=p.id;ppId=row?.id;ppRevision=state.revision;ppKey=crypto.randomUUID();$('#pp-error').textContent='';$('#pp-depot').textContent=p.name+(p.mode==='example'?' · Beispielportfolio':' · Eigenes Depot');
 $('#pp-title').textContent=action==='profile_delete'?'Profil entfernen':action==='profile_update'?'Profil ändern':kind==='target'?'Zielbasis als Profil speichern':'Szenarioannahmen als Profil speichern';$('#pp-save').textContent=action==='profile_delete'?'Profil endgültig entfernen':'Profil speichern';
 if(action==='profile_delete')$('#pp-fields').innerHTML=ppSummary(value)+'<p>Dieses gespeicherte Profil wird entfernt. Depotbuchungen, Kurse und Register bleiben erhalten.</p><label class="backup-confirm"><input id="pp-delete-confirm" type="checkbox"> Ich möchte dieses Profil entfernen.</label>';
 else{
  $('#pp-fields').innerHTML=`${field('Profilname','name','text',value.name,'maxlength="80"')}<p class="muted">${value.kind==='target'?'Zielprofil ohne Finanzierung':'Szenarioprofil mit Finanzierungsannahmen'}. Gespeichert werden die folgenden Eingaben, keine Ergebnisse oder Orders.</p><label class="field">Sollbasis<select name="mode"><option value="current">Aktueller Wertpapierwert</option><option value="deposit">Wertpapierwert + geplante Einzahlung</option><option value="manual">Manueller Zielwert</option></select></label><label class="field" id="pp-amount-field"><span id="pp-amount-label"></span><input name="amount" inputmode="decimal" value="${esc(value.plan.amount??'')}"></label>${value.funding?`<div class="form-grid">${field('Neue Einzahlung (€)','deposit','text',value.funding.deposit,'inputmode="decimal"')}${field('Vorhandenes Cash freigeben (€)','cash','text',value.funding.cash,'inputmode="decimal"')}${field('Gesamtkosten / Steuerabzüge, Schätzung (€)','costs','text',value.funding.costs,'inputmode="decimal"')}<label class="field">Verkäufe<select name="sales"><option value="allow">Käufe und Verkäufe wie Vorlage</option><option value="block">Verkäufe sperren</option></select></label></div><p class="muted">Einzahlung, Cash-Freigabe und Kosten ausdrücklich eingeben, auch bei 0. Gespeicherte Annahmen können veralten; ein Profil bestätigt keine Finanzierung.</p>`:''}`;
  $('#pp-fields [name=mode]').value=value.plan.mode;if(value.funding)$('#pp-fields [name=sales]').value=value.funding.sales;ppSync();
 }
 ppDialog.showModal();
}
$('#pp-new-target').onclick=()=>ppOpen('profile_add','target');$('#pp-new-scenario').onclick=()=>ppOpen('profile_add','scenario');$('#pp-edit').onclick=()=>ppOpen('profile_update');$('#pp-delete').onclick=()=>ppOpen('profile_delete');
function ppClose(){if(!ppBusy)ppDialog.close();}$('#pp-cancel').onclick=$('#pp-close').onclick=ppClose;ppDialog.addEventListener('cancel',e=>{if(ppBusy)e.preventDefault();});
$('#pp-form').addEventListener('input',()=>{ppKey=crypto.randomUUID();if(ppAction!=='profile_delete')ppSync();});$('#pp-form').addEventListener('change',()=>{ppKey=crypto.randomUUID();if(ppAction!=='profile_delete')ppSync();});
$('#pp-form').onsubmit=async event=>{
 event.preventDefault();if(ppBusy)return;$('#pp-error').textContent='';
 try{
  let data={portfolio_id:ppDepot};if(ppAction!=='profile_add')data.id=ppId;
  if(ppAction==='profile_delete'){if(!$('#pp-delete-confirm').checked)throw Error('Bitte die Entfernung ausdrücklich bestätigen.');}
  else{const f=Object.fromEntries(new FormData(event.target)),plan={mode:f.mode,amount:f.mode==='current'?null:decimal(f.amount)};data.profile=TrackerPlanningProfiles.profile({profile_version:1,ruleset:'template-v1',kind:ppKind,name:f.name,plan,funding:ppKind==='target'?null:{deposit:decimal(f.deposit),cash:decimal(f.cash),costs:decimal(f.costs),sales:f.sales}});}
  ppBusy=true;for(const el of ppDialog.querySelectorAll('button,input,select'))el.disabled=true;
  const result=await api('command',{action:ppAction,data,key:ppKey,revision:ppRevision});if(ppAction==='profile_delete')ppChoices.delete(ppDepot);else ppChoices.set(ppDepot,result.id);selected=ppDepot;await refresh();ppDialog.close();toast(ppAction==='profile_delete'?'Profil entfernt.':'Profil gespeichert.');
 }catch(e){
  $('#pp-error').textContent=e.message;
  if(e.status===412){await refresh().catch(()=>{});ppRevision=state.revision;ppKey=crypto.randomUUID();if(ppAction==='profile_delete'){ppDialog.close();toast('Daten geändert. Bitte das aktuelle Profil prüfen und die Entfernung erneut öffnen.');}else $('#pp-error').textContent='Aktueller Stand geladen. Deine Eingaben bleiben erhalten. Prüfe sie vor dem erneuten Speichern.';}
 }finally{ppBusy=false;for(const el of ppDialog.querySelectorAll('button,input,select'))el.disabled=false;}
};
function importPlanningProfileSummary(result){return `<div class="stat"><span>Gespeicherte Planungsprofile</span><strong>${result.summary.planning_profiles||0}</strong></div><p class="muted">Profile enthalten Annahmen, keine aktuellen Ergebnisse oder Handelsfreigabe. Nach dem Laden neu prüfen und berechnen.</p>`;}
