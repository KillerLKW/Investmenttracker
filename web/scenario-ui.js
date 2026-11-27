let scenarioGeneration=0;
function clearScenario(){
 scenarioGeneration++;
 $('#scenario-result').innerHTML='';$('#scenario-error').textContent='';
}
function renderScenarioForm(p){
 clearScenario();$('#scenario-cash-available').textContent=money(p.overview.cash);
 const plan=targetPlans.get(p.id)||{mode:'current',amount:'270'};
 $('#scenario-deposit').readOnly=plan.mode==='deposit';
 $('#scenario-deposit').value=plan.mode==='deposit'?plan.amount:'';
 $('#scenario-cash').value='';$('#scenario-costs').value='';
}
function scenarioTable(rows){
 const labels=['Wertpapier','Istbestand','Zielbestand','Änderung (Stück)','Handelswert','Kursdatum'];
 return `<div class="table-wrap"><table class="comparison-table"><thead><tr>${labels.map(x=>`<th>${x}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>{
  const q=TrackerDomain.dec(r.quantity),pieces=n=>new Intl.NumberFormat('de-DE',{maximumFractionDigits:12}).format(Number(n));
  const cells=[`<strong>${esc(r.role)}</strong><small>${esc(r.name)} · ${esc(r.isin)}</small>`,pieces(r.current),pieces(r.target),r.fixed?'Festgehalten':(q>0n?'Kauf ':q<0n?'Verkauf ':'Unverändert ')+pieces(TrackerDomain.str(q<0n?-q:q)),money(r.amount),date(r.quote_date)];
  return `<tr>${cells.map((v,n)=>`<td data-label="${labels[n]}">${v}</td>`).join('')}</tr>`;
 }).join('')}</tbody></table></div>`;
}
$('#scenario-form').addEventListener('submit',async event=>{
 event.preventDefault();clearScenario();
 const generation=scenarioGeneration,portfolioId=selected,asOf=$('#as-of').value;
 try{
  const plan=targetPlans.get(portfolioId)||{mode:'current',amount:'270'};
  const basis={mode:plan.mode,amount:decimal(plan.amount)},funding={deposit:decimal($('#scenario-deposit').value),cash:decimal($('#scenario-cash').value),costs:decimal($('#scenario-costs').value),sales:$('#scenario-sales').value};
  const snapshot=await api('state?as_of='+encodeURIComponent(asOf));
  if(generation!==scenarioGeneration||selected!==portfolioId||$('#as-of').value!==asOf)return;
  const p=snapshot.portfolios.find(p=>p.id===portfolioId);if(!p)throw Error('Depot nicht mehr vorhanden. Ansicht aktualisieren.');
  const r=TrackerScenarios.calculate(p,asOf,basis,funding,TRACKER_REGIONS.records);
  if(!r.valid){$('#scenario-result').innerHTML=`<div class="notice warning"><strong>Mit festgehaltenem FTSE nicht erreichbar.</strong><p>Der FTSE-Anteil überschreitet mindestens ein neutrales Regionalziel. Es werden keine negativen Zielbestände vorgeschlagen.</p><ul>${r.conflicts.map(c=>`<li>${esc(regionNames[c.region])}: ${money(c.excess)} über dem Soll.</li>`).join('')}</ul></div>`;return;}
  $('#scenario-result').innerHTML=`<div class="notice ${r.financed?'':'warning'}"><strong>${r.financed?'Unter den eingegebenen Annahmen finanziert':'Szenario nicht finanziert oder nicht freigegeben'}</strong><p>${r.salesBlocked?'Verkäufe sind gesperrt; die angezeigten Zielbestände würden Verkäufe erfordern. ':''}${r.shortfall!=='0'?'Zusätzlicher Finanzierungsbedarf: '+money(r.shortfall)+'. ':''}Dies ist eine Simulation mit den erfassten Kursen und geschätzten Kosten. Sie erzeugt keine Buchungen.</p></div><div class="stat"><span>Neue Einzahlung + freigegebenes Cash</span><strong>${money(TrackerDomain.str(TrackerDomain.dec(r.deposit)+TrackerDomain.dec(r.released)))}</strong></div><div class="stat"><span>Käufe / Verkaufserlöse vor Kosten</span><strong>${money(r.buys)} / ${money(r.sells)}</strong></div><div class="stat"><span>Zusätzliche Kosten und Steuerabzüge (Schätzung)</span><strong>${money(r.costs)}</strong></div><div class="stat"><span>Verbleibendes freigegebenes Budget</span><strong>${money(r.remaining)}</strong></div><p class="muted">Nicht freigegebenes vorhandenes Cash: ${money(r.unreleased_cash)}. Die Sollbasis bleibt ${money(r.basis)}; freigegebenes Cash vergrößert das Budget, nicht automatisch die Sollbasis.</p>${r.warnings.length?`<div class="notice warning"><ul>${r.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:''}<h3>Zielbestände und simulierte Änderungen</h3><p class="muted">Ganze Zielbestände wie in der Vorlage; Handelsmengen können Bruchstücke enthalten. Positive Handelswerte bedeuten Käufe, negative Werte Verkaufserlöse. Der FTSE bleibt unverändert.</p>${scenarioTable(r.orders)}<details><summary>Verteilung nach dem Szenario</summary><p class="muted">Erneute geografische Durchschau mit denselben Quellen zum Stichtag; keine Live-Fondsdaten. ${r.regionalUncertainty?'Regionale Abdeckung oder Zusammensetzungsdaten sind unvollständig.':''}</p>${allocationRows(Object.entries(r.after.regions).map(([key,v])=>({name:regionNames[key],...v})))}<h3>Strategien nach dem Szenario</h3>${allocationRows(r.after.categories)}</details><p class="muted">Ungerundete Gesamtziele inklusive fixiertem FTSE: ${money(r.unrounded_total)}. Wertpapierwert nach Stückrundung: ${money(r.target_total)}. Abweichung von der Sollbasis: ${money(TrackerDomain.str(TrackerDomain.dec(r.target_total)-TrackerDomain.dec(r.basis)))}. Die Vorlagenregel garantiert wegen FTSE-Restanteilen und Rundung weder genaue Zielgewichte noch die Einhaltung des Budgets.</p>`;
 }catch(e){if(generation===scenarioGeneration&&selected===portfolioId&&$('#as-of').value===asOf)$('#scenario-error').textContent=e.message;}
});
$('#scenario-form').addEventListener('input',clearScenario);
$('#scenario-discard').addEventListener('click',clearScenario);
$('#scenario-form').addEventListener('change',clearScenario);
for(const id of ['#target-basis','#target-amount'])$(id).addEventListener('change',()=>renderScenarioForm(current()));
