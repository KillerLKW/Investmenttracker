/* Compact public-website context; retain the original date inputs and handlers. */
(()=>{
 if(!globalThis.TRACKER_PUBLIC_EDITION)return;
 const toolbar=document.querySelector('.toolbar');
 const context=document.createElement('div');context.className='view-context';
 const valuation=document.createElement('details');valuation.id='valuation-details';
 const summary=document.createElement('summary');summary.append('Bewertungsdetails');
 const activeDate=document.createElement('span');activeDate.className='context-date';summary.append(activeDate);
 valuation.append(summary);
 const content=document.createElement('div');content.className='context-content';
 content.append(document.querySelector('#pc-knowledge').closest('label'),document.querySelector('#pc-date-note'));
 valuation.append(content);
 const storage=document.createElement('details');storage.id='storage-details';
 const storageSummary=document.createElement('summary');storageSummary.textContent='Auf diesem Gerät · keine Synchronisierung';
 const storageCopy=document.createElement('p');storageCopy.textContent='Deine Depotdaten bleiben in diesem Browser. Für einen Gerätewechsel eine vollständige JSON-Sicherung herunterladen und auf dem anderen Gerät einlesen. Browserdaten können gelöscht werden; bewahre Sicherungen zusätzlich auf einem zweiten Medium auf.';
 const backupLink=document.createElement('button');backupLink.type='button';backupLink.className='text-button';backupLink.dataset.go='data';backupLink.textContent='Zu Daten & Sicherung →';
 const storageContent=document.createElement('div');storageContent.className='context-content';storageContent.append(storageCopy,backupLink);
 storage.append(storageSummary,storageContent);context.append(valuation,storage);
 // Replace only the public-edition notice, leaving all warnings/errors intact.
 const publicNotice=toolbar.nextElementSibling;
 if(publicNotice?.classList.contains('notice'))publicNotice.remove();
 toolbar.after(context);
 function updateContext(){
  const value=document.querySelector('#pc-knowledge').value,asOf=document.querySelector('#as-of').value;
  activeDate.textContent=value&&value!==asOf?` · Klärungen bis ${date(value)}`:'';
  valuation.classList.toggle('has-custom-date',!!value&&value!==asOf);
 }
 for(const id of ['pc-knowledge','as-of'])document.getElementById(id).addEventListener('change',updateContext);
 updateContext();
 // On narrow displays the section list is available without filling the screen.
 const mobile=matchMedia('(max-width:650px)'),sectionMenus=[];
 for(const index of document.querySelectorAll('.section-index')){
  const menu=document.createElement('details');menu.className='page-sections';
  const heading=document.createElement('summary');heading.textContent='Abschnitte dieser Seite';
  index.before(menu);menu.append(heading,index);sectionMenus.push(menu);
  index.addEventListener('click',e=>{if(mobile.matches&&e.target.closest('a'))menu.open=false;});
 }
 function layout(){for(const menu of sectionMenus)menu.open=!mobile.matches;}
 mobile.addEventListener('change',layout);layout();
})();
