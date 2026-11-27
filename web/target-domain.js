/* Template targets and read-only comparisons. No trades or storage changes. */
(function () {
  const D = typeof module !== 'undefined' ? require('./local-domain.js') : globalThis.TrackerDomain;
  const S = 10n ** 36n, W = 10n ** 24n;
  const REGIONS = Object.freeze({north_america:'0.43',europe:'0.23',asia_pacific:'0.34'});
  const CATEGORIES = Object.freeze({Neutral:'0.25','Small cap':'0.25',Value:'0.2',Quality:'0.2',Momentum:'0.1'});
  function units(s) {
    if(typeof s !== 'string' || !/^-?\d+(\.\d{1,36})?$/.test(s)) D.fail('Ungültiger Vergleichswert.');
    const negative=s.startsWith('-'),[a,b='']=(negative?s.slice(1):s).split('.');
    return (BigInt(a)*S+BigInt(b.padEnd(36,'0')))*(negative?-1n:1n);
  }
  function str(n) {
    const sign=n<0n?'-':'';if(n<0n)n=-n;
    const fraction=(n%S).toString().padStart(36,'0').replace(/0+$/,'');
    return sign+(n/S)+(fraction?'.'+fraction:'');
  }
  function row(name,actual,target,value,basis) {
    const t=D.dec(target), delta=actual*W-value*t;
    let status='unavailable';
    if(value>0n) status=t===0n?(actual===0n?'within':'unassigned'):
      delta*10n < -value*t?'under':delta*10n > value*t?'over':'within';
    return {name,target,actual:str(actual),weight:value>0n?D.str(actual*W/value):null,
      percentage_points:value>0n?D.str((actual*W/value-t)*100n):null,
      relative_deviation:value>0n&&t>0n?D.str(delta*W/(value*t)):null,
      desired:str(basis*t/W),difference:str(basis*t/W-actual),status};
  }
  function compare(d,plan={mode:'current'}) {
    if(!['current','deposit','manual'].includes(plan.mode))D.fail('Unbekannte Planungsbasis.');
    const input=plan.mode==='current'?'0':D.number(plan.amount,'Planungsbetrag',plan.mode==='deposit');
    if(!d.complete)return {complete:false};
    const value=units(d.value), basis=plan.mode==='current'?value:plan.mode==='deposit'?value+units(input):units(input);
    const actual=k=>units(d.regions[k].value);
    const regions=Object.entries(REGIONS).map(([k,t])=>row(k,actual(k),t,value,basis));
    for(const k of ['other','unknown'])regions.push(row(k,actual(k),'0',value,basis));
    const templateRegions=Object.entries(REGIONS).map(([k,t])=>row(k,k==='asia_pacific'?actual(k)+actual('other')+actual('unknown'):actual(k),t,value,basis));
    const categories=Object.entries(CATEGORIES).map(([k,t])=>row(k,units(d.categories.find(c=>c.name===k)?.value||'0'),t,value,basis));
    for(const c of d.categories)if(!Object.hasOwn(CATEGORIES,c.name))categories.push(row(c.name,units(c.value),'0',value,basis));
    const matrix=Object.entries(CATEGORIES).flatMap(([category,c])=>Object.entries(REGIONS).map(([region,r])=>({category,region,target:D.str(D.dec(c)*D.dec(r)/W),desired:str(basis*D.dec(c)*D.dec(r)/(W*W))})));
    return {complete:true,value:d.value,basis:str(basis),mode:plan.mode,regions,templateRegions,categories,matrix};
  }
  const api=Object.freeze({REGIONS,CATEGORIES,compare});
  globalThis.TrackerTargets=api;
  if(typeof module!=='undefined')module.exports=api;
})();
