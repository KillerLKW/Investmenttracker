const targetPlans=new Map();
const targetStatus={within:'Im Zielband',under:'Untergewichtet',over:'Übergewichtet',unassigned:'Ohne Zielzuweisung',unavailable:'Nicht berechenbar'};
function targetTable(rows,literalNames=false){
  return `<div class="table-wrap"><table class="comparison-table"><thead><tr><th>Gruppe</th><th>Ist</th><th>Ziel</th><th>Abweichung (Prozentpunkte)</th><th>Relativ zum Ziel</th><th>Sollbetrag</th><th>Soll minus Ist</th><th>Status</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(!literalNames&&Object.hasOwn(regionNames,r.name)?regionNames[r.name]:r.name)}</td><td>${percent(r.weight)}<small>${money(r.actual)}</small></td><td>${percent(r.target)}</td><td>${r.percentage_points===null?'—':new Intl.NumberFormat('de-DE',{maximumFractionDigits:2,signDisplay:'exceptZero'}).format(Number(r.percentage_points))}</td><td>${percent(r.relative_deviation)}</td><td>${money(r.desired)}</td><td>${money(r.difference)}</td><td>${targetStatus[r.status]}</td></tr>`).join('')}</tbody></table></div>`;
}
function renderTargets(p){
  if(!p.distribution)return;
  const plan=targetPlans.get(p.id)||{mode:'current',amount:'270'};
  $('#target-basis').value=plan.mode;$('#target-amount').value=plan.amount;
  $('#target-amount-field').hidden=plan.mode==='current';
  $('#target-amount-label').textContent=plan.mode==='manual'?'Manueller Zielwert (€)':'Geplante Einzahlung (€)';
  try{
    const result=TrackerTargets.compare(p.distribution,{mode:plan.mode,amount:decimal(plan.amount)});
    $('#target-error').textContent='';
    if(!result.complete){$('#target-results').innerHTML=empty('Bewertung unvollständig','Für den Soll-Ist-Vergleich zuerst die fehlenden Kurse ergänzen.');return;}
    $('#target-results').innerHTML=`<p class="muted">Wertpapierwert: ${money(result.value)} · Sollbasis: <strong>${money(result.basis)}</strong>. Depot-Cash ist nicht enthalten. Istanteile beziehen sich immer auf den aktuellen Wertpapierwert.</p><h3>Regionaltöpfe der Vorlage</h3><p class="muted">Nordamerika 43 %, Europa 23 %, Asien/Pazifik 34 %. Im dritten Topf werden wie in der Vorlage Asien/Pazifik, sonstige Regionen und unbekannte Anteile gemeinsam verglichen. Das ist keine rein geografische Verteilung.</p><div id="target-template-regions">${targetTable(result.templateRegions.map(r=>({...r,name:r.name==='asia_pacific'?'Asien/Pazifik + Sonstige + unbekannt':r.name})))}</div><h3>Strategien der Vorlage</h3><div id="target-categories">${targetTable(result.categories)}</div><details><summary>Geografischen Vergleich separat anzeigen</summary><p class="muted">Sonstige und unbekannte Anteile bleiben getrennt und haben in der Vorlage kein eigenes Zielgewicht.</p>${targetTable(result.regions)}</details><details><summary>Region × Strategie: Sollbeträge der Vorlage</summary><p class="muted">Sollbasis × Regionsziel × Strategieziel. Dies sind Gruppenziele; daraus werden noch keine ETF-Handelsmengen abgeleitet.</p><div class="table-wrap"><table><thead><tr><th>Strategie</th>${Object.keys(TrackerTargets.REGIONS).map(k=>`<th>${esc(regionNames[k])}</th>`).join('')}</tr></thead><tbody>${Object.keys(TrackerTargets.CATEGORIES).map(c=>`<tr><td>${esc(c)}</td>${result.matrix.filter(r=>r.category===c).map(r=>`<td>${money(r.desired)}<small>${percent(r.target)}</small></td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }catch(e){$('#target-error').textContent=e.message;$('#target-results').innerHTML='';}
}
for(const id of ['#target-basis','#target-amount'])$(id).addEventListener('change',()=>{
  const p=current();if(!p)return;
  targetPlans.set(p.id,{mode:$('#target-basis').value,amount:$('#target-amount').value});renderTargets(p);
});
