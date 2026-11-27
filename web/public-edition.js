/* Static public edition: no embedded portfolios, source snapshots or server access. */
(()=>{
 if(!globalThis.TRACKER_PUBLIC_EDITION)return;
 document.documentElement.classList.add('public-edition');
 const emptyCopy=new Map([
  ['Dein Depot beginnt hier','Erfasse eigene Wertpapiere und Buchungen oder lies unter „Daten & Sicherung“ eine eigene JSON-Sicherung ein.'],
  ['Noch keine Wertpapiere','Lege unter „Wertpapiere & Kurse“ eigene Wertpapiere an oder importiere unter „Daten & Sicherung“ einen eigenen Depotexport.'],
  ['Noch keine Positionshistorie','Erfasse eigene Wertpapierbuchungen. Auch vollständig verkaufte Positionen bleiben danach sichtbar.'],
  ['Noch keine gemeldeten Sektoren','Erfasse Sektorstände bei deinen Wertpapieren oder importiere einen eigenen Depotexport mit Sektorständen.'],
  ['Noch keine Unternehmensdaten','Erfasse Unternehmensstände bei deinen Wertpapieren oder importiere einen eigenen Depotexport mit Unternehmensständen.'],
  ['Eigene Register beginnen leer','Lege über „Eigenes Register anlegen“ dein erstes depotübergreifendes Register an.']
 ]);
 const emptyOriginal=empty;empty=function(title,body){return emptyOriginal(title,emptyCopy.get(title)||body);};
 const notice=document.createElement('p');notice.className='notice';notice.textContent='Webausgabe ohne Vorlagendaten. Deine Depotdaten bleiben in diesem Browser. Für einen Gerätewechsel eine vollständige JSON-Sicherung verwenden.';document.querySelector('.toolbar').after(notice);
 const demo=document.querySelector('#template')?.closest('.panel');if(demo)demo.hidden=true;
 for(const id of ['template','region-template','country-template','sector-template','company-template','al-template','md-template']){const el=document.getElementById(id);if(el){el.hidden=true;el.disabled=true;}}
 // These fixed-trade previews depend on the deliberately excluded source mapping.
 for(const id of ['scenarios','pt-panel','tr-panel','tl-panel']){const panel=document.getElementById(id);if(panel)panel.hidden=true;}
 for(const link of document.querySelectorAll('.section-index a')){const id=link.hash.split('/')[1],el=id&&document.getElementById(id);if(el?.hidden)link.remove();}
 const planning=document.querySelector('#planning');const p=document.createElement('p');p.className='muted';p.textContent='Eigene Zielgewichte und Vergleiche sind verfügbar. Feste Handelsvorschauen der Tabellen-Vorlage sind in dieser datenfreien Webausgabe nicht enthalten.';planning?.prepend(p);
 const warning=document.querySelector('#gdp>.panel>.notice');if(warning)warning.textContent='Diese Webausgabe enthält keine BIP-Vorlagendaten. Eigene Datensätze können lokal erfasst oder aus einer eigenen Sicherung übernommen werden.';
 const text=(selector,value)=>{const el=document.querySelector(selector);if(el)el.textContent=value;};
 text('#distribution>.panel>p','Regionaldaten gelten für den jeweils erfassten Quellenstand. Sie werden nicht automatisch aktualisiert.');
 text('#countries>.panel>p','Zusammensetzung und Klassifikation richten sich nach deinen erfassten Quellen und deren Datum. Fehlende Angaben bleiben unbekannt; keine automatische Aktualisierung.');
 text('#sector-basis option[value="reported"]','Gemeldete Sektorwerte des ausgewählten Schemas');
 text('#company-basis option[value="reported"]','Gemeldete Werte des ausgewählten Schemas');
 text('#gdp-basis option[value="world"]','Weltbasis der Quelle / gesamter Wertpapierwert');
 text('#targets>p','Feste Beispielziele aus der Tabellen-Vorlage, keine persönlichen Zielvorgaben. Eigene Gewichte kannst du unter „Eigene Zielgewichte“ festlegen. Zielband: ±10 % relativ zum Zielgewicht, einschließlich der Grenzen.');
 text('#sy-panel h2','Speicherung & Gerätewechsel');
 text('#sy-panel p','Diese Website synchronisiert deine Daten nicht automatisch zwischen Geräten. Lade unter „Vollständige Sicherung“ eine JSON-Datei herunter und lies sie auf dem anderen Gerät wieder ein. Eingaben und Importe bleiben im jeweiligen Browser.');
 text('#data-path + p','Deine Daten bleiben auf diesem Gerät in diesem Browser. Bewahre zusätzlich eine vollständige JSON-Sicherung auf einem zweiten Medium auf.');
 // Keep the existing controls and event handlers; only clarify scope and layout.
 const grid=document.querySelector('#data>.data-grid');grid.classList.add('public-backup-grid');
 for(const step of grid.querySelectorAll('.step'))step.remove();
 const backup=document.querySelector('#backup'),backupCard=backup.closest('.panel');
 grid.prepend(backupCard);
 text('#backup','Vollständige Sicherung herunterladen');
 backupCard.querySelector('h2').textContent='Vollständige Sicherung';
 backupCard.querySelector('p').textContent='Alle Depots, Freistellungsregister, BIP-Daten und das Änderungsprotokoll gemeinsam sichern. Empfohlen vor einem Gerätewechsel. Die JSON-Datei zusätzlich auf einem zweiten Medium aufbewahren.';
 document.querySelector('#export').closest('.panel').querySelector('h2').textContent='Einzelnes Depot exportieren';
 document.querySelector('#export').closest('.panel').querySelector('p').textContent='Nur das ausgewählte Depot mit seinen Daten exportieren. Depotübergreifende Freistellungsregister und eigene BIP-Datensätze sind nicht enthalten. Für einen Gerätewechsel die vollständige Sicherung verwenden.';
 const index=document.querySelector('#data>.section-index');
 if(index){for(const panel of document.querySelectorAll('#data .panel')){const link=[...index.querySelectorAll('a')].find(a=>a.hash===`#data/${panel.id}`);if(link){link.textContent=panel.querySelector('h2').textContent;index.append(link);}}}
 const originalNavigate=navigate;
 function updatePageAction(){
  const button=document.querySelector('#new-transaction');
  const actions={overview:['+ Buchung erfassen',()=>openEditor('transaction_add')],journal:['+ Buchung erfassen',()=>openEditor('transaction_add')],securities:['+ Wertpapier anlegen',()=>document.querySelector('#new-instrument').click()],data:['Vollständig sichern',()=>backup.click()],planning:['Eigene Ziele bearbeiten',()=>{location.hash='#planning/ct-panel';}],allowances:['+ Register anlegen',()=>document.querySelector('#al-new').click()]};
  const entry=actions[page];button.hidden=!entry;
  button.onclick=entry?entry[1]:null;
  if(entry)button.textContent=entry[0];
  if(page==='data')text('#subtitle','Daten sichern, wieder einlesen und die Darstellung anpassen.');
 }
 navigate=function(next){originalNavigate(next);updatePageAction();};
 updatePageAction();
 const originalAPI=TrackerLocal.api;TrackerLocal.api=function(route,body){if(route==='import/preview'&&body?.source==='template')return Promise.reject(Error('Diese Webausgabe enthält keine Vorlagendaten.'));return originalAPI.call(this,route,body);};
})();
