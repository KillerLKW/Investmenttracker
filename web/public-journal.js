/* Journal views reuse existing panels, controls and drafts. No finance writes. */
(()=>{
 if(!globalThis.TRACKER_PUBLIC_EDITION)return;
 const journal=document.getElementById('journal');
 const entries=[
  ['Buchungen',document.getElementById('transactions').closest('.panel')],
  ['Cash-Abgleich',document.getElementById('liquidity-panel')],
  ['Zahlungen klären',document.getElementById('pc-panel')]
 ];
 journal.querySelector('.page-sections')?.remove();
 const tabs=document.createElement('div');tabs.className='journal-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Buchungen und Cash');
 journal.prepend(tabs);
 let selectedPanel=entries[0][1].id;
 function show(id){
  selectedPanel=id;
  for(const [,panel,button]of entries){const active=panel.id===id;panel.hidden=!active;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
 }
 function fromHash(){
  const [route,anchor]=location.hash.slice(1).split('/');
  const target=route==='journal'&&anchor?document.getElementById(anchor):null;
  return entries.find(([,panel])=>target&&(panel===target||panel.contains(target)))?.[1].id;
 }
 for(const entry of entries){
  const [label,panel]=entry,button=document.createElement('button');
  button.id='tab-'+panel.id;button.type='button';button.textContent=label;button.setAttribute('role','tab');button.setAttribute('aria-controls',panel.id);
  panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',button.id);panel.tabIndex=0;
  entry.push(button);tabs.append(button);journal.append(panel);
  button.addEventListener('click',()=>{show(panel.id);const hash=`#journal/${panel.id}`;if(location.hash!==hash)history.pushState(null,'',hash);});
 }
 tabs.addEventListener('keydown',event=>{
  const index=entries.findIndex(([,panel,button])=>button===event.target);if(index<0)return;
  const keys={ArrowRight:(index+1)%entries.length,ArrowLeft:(index+entries.length-1)%entries.length,Home:0,End:entries.length-1};
  if(!(event.key in keys))return;event.preventDefault();const button=entries[keys[event.key]][2];button.focus();button.click();
 });
 const original=navigate;
 navigate=function(next){original(next);if(next==='journal')show(fromHash()||selectedPanel);};
 show(fromHash()||selectedPanel);
})();
