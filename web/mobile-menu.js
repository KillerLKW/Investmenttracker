/* Same modal left-hand menu and breakpoint as TaskTracker 2. */
(()=>{
 const menu=document.querySelector('#side-menu'),toggle=document.querySelector('#menu-toggle'),close=document.querySelector('#menu-close'),mobile=matchMedia('(width < 1000px)');
 // The wrapping header has an intrinsic height; keep the content below it.
 const header=document.querySelector('.app-header');
 const syncHeaderHeight=()=>document.documentElement.style.setProperty('--app-header-height',header.getBoundingClientRect().height+'px');
 new ResizeObserver(syncHeaderHeight).observe(header);syncHeaderHeight();
 let pointerStartedOutside=false;
 function closeMenu(){
  if(!mobile.matches||!menu.open)return;
  menu.close();toggle.setAttribute('aria-expanded','false');pointerStartedOutside=false;toggle.focus({preventScroll:true});
 }
 toggle.addEventListener('click',()=>{
  if(!mobile.matches||menu.open)return;
  menu.showModal();toggle.setAttribute('aria-expanded','true');close.focus({preventScroll:true});
 });
 close.addEventListener('click',closeMenu);
 menu.addEventListener('cancel',e=>{e.preventDefault();closeMenu();});
 const outside=e=>{const r=menu.getBoundingClientRect();return e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom;};
 menu.addEventListener('pointerdown',e=>{pointerStartedOutside=e.target===menu&&outside(e);});
 menu.addEventListener('pointercancel',()=>{pointerStartedOutside=false;});
 menu.addEventListener('click',e=>{if(pointerStartedOutside&&e.target===menu&&outside(e))closeMenu();pointerStartedOutside=false;});
 // Close before an action opens its own modal editor, so the editor receives focus.
 menu.addEventListener('click',e=>{if(e.target.closest('[data-page],#new-portfolio'))closeMenu();},true);
 document.querySelector('#portfolio').addEventListener('change',closeMenu);
 function updateLayout(){
  const focusIn=menu.contains(document.activeElement),focusToggle=document.activeElement===toggle;
  if(menu.open)menu.close();toggle.setAttribute('aria-expanded','false');pointerStartedOutside=false;
  if(!mobile.matches){menu.setAttribute('open','');if(focusIn||focusToggle)menu.querySelector('[aria-current=page]')?.focus({preventScroll:true});}
  else if(focusIn)toggle.focus({preventScroll:true});
 }
 mobile.addEventListener('change',updateLayout);updateLayout();
})();
