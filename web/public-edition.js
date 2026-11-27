/* Static public edition: no embedded portfolios, source snapshots or server access. */
(()=>{
 if(!globalThis.TRACKER_PUBLIC_EDITION)return;
 const emptyOriginal=empty;empty=function(title,body){return emptyOriginal(title,title==='Dein Depot beginnt hier'?'Erfasse eigene Wertpapiere und Buchungen oder lies unter „Daten & Sicherung“ eine eigene JSON-Sicherung ein.':body);};
 const notice=document.createElement('p');notice.className='notice';notice.textContent='Webausgabe ohne Vorlagendaten. Deine Depotdaten bleiben in diesem Browser. Für einen Gerätewechsel eine vollständige JSON-Sicherung verwenden.';document.querySelector('.toolbar').after(notice);
 const demo=document.querySelector('#template')?.closest('.panel');if(demo)demo.hidden=true;
 for(const id of ['template','region-template','country-template','sector-template','company-template','al-template','md-template']){const el=document.getElementById(id);if(el){el.hidden=true;el.disabled=true;}}
 // These fixed-trade previews depend on the deliberately excluded source mapping.
 for(const id of ['scenarios','pt-panel','tr-panel','tl-panel']){const panel=document.getElementById(id);if(panel)panel.hidden=true;}
 for(const link of document.querySelectorAll('.section-index a')){const id=link.hash.split('/')[1],el=id&&document.getElementById(id);if(el?.hidden)link.remove();}
 const planning=document.querySelector('#planning');const p=document.createElement('p');p.className='muted';p.textContent='Eigene Zielgewichte und Vergleiche sind verfügbar. Feste Handelsvorschauen der Tabellen-Vorlage sind in dieser datenfreien Webausgabe nicht enthalten.';planning?.prepend(p);
 const warning=document.querySelector('#gdp>.panel>.notice');if(warning)warning.textContent='Diese Webausgabe enthält keine BIP-Vorlagendaten. Eigene Datensätze können lokal erfasst oder aus einer eigenen Sicherung übernommen werden.';
 const sync=document.querySelector('#sy-panel p');if(sync)sync.textContent='GitHub Pages stellt die Anwendung bereit. Es gibt keinen automatischen Abgleich deiner Depotdaten zwischen Geräten. Deine Eingaben und Sicherungsimporte werden lokal in diesem Browser verarbeitet.';
 const originalAPI=TrackerLocal.api;TrackerLocal.api=function(route,body){if(route==='import/preview'&&body?.source==='template')return Promise.reject(Error('Diese Webausgabe enthält keine Vorlagendaten.'));return originalAPI.call(this,route,body);};
})();
