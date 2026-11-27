/* Task-oriented navigation. Existing form nodes and their listeners are retained. */
(()=>{
 const groups=[
  ['Mein Depot',[['overview','Übersicht'],['securities','Wertpapiere & Kurse'],['journal','Buchungen & Cash']]],
  ['Auswertung',[['distribution','Verteilung'],['returns','Ergebnis & Rendite'],['countries','Länder & IL/EM'],['sectors','Branchen & Sektoren'],['companies','Unternehmen & Top-10'],['gdp','BIP-Vergleich']]],
  ['Planung',[['planning','Ziele & Rebalancing'],['valuation','Kursannahmen'],['sales','Verkäufe planen']]],
  ['Verwaltung',[['allowances','Freistellung'],['data','Daten & Sicherung']]]
 ];
 const makePage=(id,ids)=>{const section=document.createElement('section');section.id=id;section.className='page';section.hidden=true;for(const child of ids)section.append(document.getElementById(child));document.querySelector('main').append(section);};
 makePage('planning',['targets','scenarios','ct-panel','planning-profiles']);
 makePage('sales',['sale-scenario-panel','shared-gain-panel']);
 document.querySelector('main').append(document.querySelector('main>footer'));
 const nav=document.querySelector('.sidebar nav');nav.replaceChildren();
 for(const [label,items]of groups){const group=document.createElement('div');group.className='nav-group';const h=document.createElement('h3');h.className='nav-group-title';h.textContent=label;group.append(h);for(const [id,label]of items){const b=document.createElement('button');b.type='button';b.className='nav';b.dataset.page=id;b.textContent=label;b.setAttribute('aria-controls',id);group.append(b);}nav.append(group);}
 document.querySelector('.sidebar-title').textContent='Navigation';
 const routes=new Map(groups.flatMap(([,items])=>items));
 const customTitles={planning:['Ziele & Rebalancing','Soll und Ist vergleichen, Einzahlungen planen und Profile verwalten.'],sales:['Verkäufe planen','Gewinnziele für ein oder mehrere Wertpapiere simulieren.'],valuation:['Kursannahmen','Bewertung, Verteilung und Handelsplanung mit eigenen Kursannahmen vergleichen.'],journal:['Buchungen & Cash','Bewegungen, Liquidität und offene Zuordnungen nachvollziehen.']};
 for(const [id,label]of routes){
  const section=document.getElementById(id),panels=[...section.querySelectorAll(':scope > .panel, :scope > .data-grid > .panel, :scope > .overview-grid > .panel')];
  if(panels.length<2)continue;
  const index=document.createElement('nav');index.className='section-index';index.setAttribute('aria-label','Abschnitte: '+label);
  const title=document.createElement('span');title.className='section-index-label';title.textContent='Direkt zu';index.append(title);
  panels.forEach((panel,i)=>{const h=panel.querySelector('h2');if(!h)return;if(!panel.id)panel.id=`section-${id}-${i+1}`;panel.classList.add('navigation-target');const a=document.createElement('a');a.href=`#${id}/${panel.id}`;a.textContent=h.textContent;index.append(a);});
  section.prepend(index);
 }
 const targetExplanation=document.querySelector('#targets>p:nth-of-type(2)');if(targetExplanation)targetExplanation.textContent=targetExplanation.textContent.replace('Benannte Profile lassen sich oben ausdrücklich speichern und später laden.','Benannte Profile lassen sich unter „Gespeicherte Planungsprofile“ ausdrücklich speichern und später laden.');
 const original=navigate;let restoring=false;
 navigate=function(next){
  if(!routes.has(next))return;
  if(customTitles[next]){page=next;for(const el of document.querySelectorAll('.page'))el.hidden=el.id!==page;document.querySelector('#page-title').textContent=customTitles[next][0];document.querySelector('#subtitle').textContent=customTitles[next][1];}else original(next);
  for(const b of nav.querySelectorAll('[data-page]')){const active=b.dataset.page===next;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');}
  if(!restoring&&location.hash!==`#${next}`)history.pushState(null,'',`#${next}`);
  window.scrollTo({top:0,behavior:'instant'});
 };
 function restore(){const [raw,anchor]=location.hash.slice(1).split('/'),id=raw||'overview';if(!routes.has(id))return;restoring=true;try{navigate(id);if(anchor){const el=document.getElementById(anchor);if(el&&document.getElementById(id).contains(el)){el.scrollIntoView({block:'start'});el.tabIndex=-1;el.focus({preventScroll:true});}}}finally{restoring=false;}}
 window.addEventListener('popstate',restore);window.addEventListener('hashchange',restore);
 document.querySelector('.brand').addEventListener('click',e=>{e.preventDefault();navigate('overview');});
 if(routes.has(location.hash.slice(1).split('/')[0]))restore();else{restoring=true;navigate('overview');restoring=false;}
})();
