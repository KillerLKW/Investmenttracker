/* Planning-profile payload model. Pure validation without clock, storage or network. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 const RULESET='template-v1';
 function fields(raw,keys,label){if(!raw||typeof raw!=='object'||Array.isArray(raw)||keys.some(k=>!Object.hasOwn(raw,k))||Object.keys(raw).some(k=>!keys.includes(k)))D.fail(label+': fehlende oder unbekannte Felder.');}
 function plan(raw){
  fields(raw,['mode','amount'],'Zielbasis');if(!['current','deposit','manual'].includes(raw.mode))D.fail('Unbekannte Zielbasis.');
  if(raw.mode==='current'){if(raw.amount!==null)D.fail('Aktuelle Zielbasis hat keinen festen Betrag.');return {mode:'current',amount:null};}
  return {mode:raw.mode,amount:D.number(raw.amount,'Planungsbetrag',raw.mode==='deposit')};
 }
 function funding(raw,basis){
  fields(raw,['deposit','cash','costs','sales'],'Finanzierungsannahmen');
  const deposit=D.number(raw.deposit,'Neue Einzahlung'),cash=D.number(raw.cash,'Freigegebenes Cash'),costs=D.number(raw.costs,'Geschätzte Gesamtkosten');
  if(!['allow','block'].includes(raw.sales))D.fail('Verkaufsregel ausdrücklich wählen.');
  if(basis.mode==='deposit'&&deposit!==basis.amount)D.fail('Neue Einzahlung muss der Einzahlungsbasis entsprechen.');
  return {deposit,cash,costs,sales:raw.sales};
 }
 function profile(raw){
  fields(raw,['profile_version','ruleset','kind','name','plan','funding'],'Planungsprofil');
  if(raw.profile_version!==1)D.fail('Unbekannte Profilversion.');if(raw.ruleset!==RULESET)D.fail('Unbekannte Vorlagenregel.');
  if(!['target','scenario'].includes(raw.kind))D.fail('Unbekannte Profilart.');
  const name=D.text(raw.name,'Profilname',80),basis=plan(raw.plan);let assumptions=null;
  if(raw.kind==='target'){if(raw.funding!==null)D.fail('Ein Zielprofil enthält keine Finanzierungsannahmen.');}
  else assumptions=funding(raw.funding,basis);
  return {profile_version:1,ruleset:RULESET,kind:raw.kind,name,plan:basis,funding:assumptions};
 }
 function inputs(raw){const p=profile(raw);return {plan:{mode:p.plan.mode,amount:p.plan.amount===null?'0':p.plan.amount},funding:p.funding===null?null:{...p.funding}};}
 const api=Object.freeze({RULESET,profile,inputs});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerPlanningProfiles=api;
})();
