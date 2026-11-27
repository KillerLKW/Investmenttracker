/* Standalone file mode: no fetch, server, imports or third-party scripts. */
globalThis.TrackerLocal = (() => {
  const D=TrackerDomain, previews=new Map();
  const clone=value=>structuredClone(value), uid=()=>crypto.randomUUID();
  let database;
  function fresh(){return {schema_version:1,revision:0,sequence:0,portfolios:[{id:uid(),name:'Mein Depot',mode:'live',instruments:[],transactions:[],quotes:[]}],requests:{},imports:{},audit:[]};}
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      if(!globalThis.indexedDB){reject(Error('Browserspeicher nicht verfügbar. Bitte die Datei in Edge oder Chrome öffnen.'));return;}
      const request=indexedDB.open('investmenttracker-standalone-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('state');
      request.onerror=()=>reject(Error('Browserspeicher konnte nicht geöffnet werden. Keine Daten gespeichert.'));
      request.onblocked=()=>reject(Error('Bitte andere Fenster dieser Anwendung schließen und erneut öffnen.'));
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>db.close();resolve(db);};
    });return database;
  }
  async function transact(write,fn){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state',write?'readwrite':'readonly'), store=tx.objectStore('state'), request=store.get('main');
      let result,problem;
      request.onsuccess=()=>{
        try{
          const s=request.result;
          if(!s) {if(!write)D.fail('Speicher noch nicht initialisiert.');}
          else if(s.schema_version!==1)D.fail('Unbekannte Datenversion. Bestehende Daten bleiben unverändert.');
          const state=s||fresh();result=fn(state);
          if(write)store.put(state,'main');
        }catch(e){problem=e;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result);
      tx.onabort=tx.onerror=()=>reject(problem||Error('Speichern fehlgeschlagen. Browser-Speicherplatz und Berechtigungen prüfen; Eingabe bleibt erhalten.'));
    });
  }
  const ready=()=>transact(true,()=>true);
  function record(s,p,key,item){const result={...item,id:uid(),sequence:++s.sequence};p[key].push(result);return result.id;}
  function apply(s,action,data){
    if(action==='portfolio_create'){
      if(!['live','example'].includes(data.mode))D.fail('Ungültiger Depotmodus.');
      const p={id:uid(),name:D.text(data.name,'Depotname',80),mode:data.mode,instruments:[],transactions:[],quotes:[]};s.portfolios.push(p);return {portfolio_id:p.id};
    }
    if(action==='import'){
      if(Object.hasOwn(s.imports,data.digest))D.fail('Dieser Datenstand wurde bereits importiert.',409);
      let first;
      for(const raw of data.portfolios){
        const normalized=D.portfolio(raw), p={...normalized,id:uid(),instruments:[],transactions:[],quotes:[]}, ids=new Map();
        for(const i of normalized.instruments)ids.set(i.id,record(s,p,'instruments',D.instrument(i)));
        for(const t of normalized.transactions)record(s,p,'transactions',{...t,instrument_id:ids.get(t.instrument_id)||null});
        for(const q of normalized.quotes)record(s,p,'quotes',{...q,instrument_id:ids.get(q.instrument_id)});
        s.portfolios.push(p);first??=p.id;
      }
      s.imports[data.digest]=first;
      if(data.history?.length)s.audit.push({created:new Date().toISOString(),action:'imported_history',history:data.history});
      return {portfolio_id:first};
    }
    const p=s.portfolios.find(p=>p.id===data.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
    const ids=new Set(p.instruments.map(i=>i.id));let id;
    if(action==='instrument_add'){
      const item=D.instrument(data);if(p.instruments.some(i=>i.isin===item.isin))D.fail('Diese ISIN ist bereits vorhanden.',409);id=record(s,p,'instruments',item);
    }else if(action==='transaction_add'){
      const item=D.transaction(data,ids);D.holdings([...p.transactions,item]);id=record(s,p,'transactions',item);
    }else if(action==='transaction_void'){
      const t=p.transactions.find(t=>t.id===data.id&&!t.void);if(!t)D.fail('Aktive Buchung nicht gefunden.',404);
      t.void=true;t.void_reason=D.text(data.reason,'Stornogrund',500);D.holdings(p.transactions);id=t.id;
    }else if(action==='quote_add'){
      if(!ids.has(data.instrument_id))D.fail('Wertpapier nicht gefunden.');id=record(s,p,'quotes',{instrument_id:data.instrument_id,price:D.number(data.price,'Kurs',false),date:D.day(data.date),source:D.text(data.source,'Quelle',120),currency:'EUR'});
    }else D.fail('Unbekannte Aktion.');
    return {portfolio_id:p.id,id};
  }
  async function command(b){
    if(typeof b.key!=='string'||! /^[a-zA-Z0-9-]{8,100}$/.test(b.key))D.fail('Ungültige Wiederholungskennung.');
    const signature=JSON.stringify({action:b.action,data:b.data});
    return transact(true,s=>{
      const previous=s.requests[b.key];
      if(previous){if(previous.signature!==signature)D.fail('Wiederholungskennung gehört zu einer anderen Aktion.',409);return previous.result;}
      if(b.revision!==s.revision)D.fail('Daten wurden zwischenzeitlich geändert. Ansicht aktualisieren und Eingabe prüfen.',412);
      const result=apply(s,b.action,b.data);s.revision++;result.revision=s.revision;
      s.requests[b.key]={signature,result};s.audit.push({created:new Date().toISOString(),action:b.action,data:clone(b.data)});return result;
    });
  }
  function download(value,name){
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function exportDepot(pid){const s=await transact(false,clone),p=s.portfolios.find(p=>p.id===pid);if(!p)D.fail('Depot nicht gefunden.');download({schema_version:1,portfolio:p},'investmenttracker-depot.json');}
  async function backup(){const s=await transact(false,clone);download({schema_version:1,format:'investmenttracker-backup',portfolios:s.portfolios,audit:s.audit},'investmenttracker-sicherung-'+new Date().toISOString().slice(0,10)+'.json');return {message:'Sicherung zum Herunterladen bereitgestellt. Bitte die JSON-Datei aufbewahren.',path:''};}
  async function preview(b){
    let raw,history=[],warnings=[];
    if(b.source==='template'){
      raw=[clone(globalThis.TRACKER_TEMPLATE)];warnings=['Nur Beispielwerte, keine Aussage über aktuell verfügbare Mittel.','Kurse: abgelesener Tabellenstand 17.11.2026, tatsächliches Kursdatum unbekannt.','Sonstiger Kauf über 10,10 EUR bleibt ungeklärt; Ergebnis und Rendite bleiben bis zur Zuordnung offen.'];
    }else{
      const f=b.file;if(!f||f.schema_version!==1)D.fail('Investmenttracker-JSON (Version 1) erwartet.');
      if(f.portfolio)raw=[f.portfolio];else if(f.format==='investmenttracker-backup'&&Array.isArray(f.portfolios)&&f.portfolios.length<=100){raw=f.portfolios;history=Array.isArray(f.audit)?f.audit:[];}else D.fail('Ungültige Depotdatei oder Sicherung.');
      if(!raw.length)D.fail('Die Datei enthält kein Depot.');warnings=['Alle enthaltenen Depots werden separat angelegt. Bestehende Daten bleiben erhalten.'];
    }
    const portfolios=raw.map(D.portfolio),bytes=new TextEncoder().encode(JSON.stringify(portfolios));
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const id=uid();if(previews.size>=20)previews.delete(previews.keys().next().value);previews.set(id,{portfolios,digest,history,time:Date.now()});
    const summary={name:portfolios.length===1?portfolios[0].name:portfolios.length+' Depots aus Sicherung',mode:portfolios.every(p=>p.mode==='example')?'example':'live'};
    for(const key of ['instruments','transactions','quotes'])summary[key]=portfolios.reduce((n,p)=>n+p[key].length,0);
    return {preview_id:id,summary,warnings};
  }
  async function api(path,b){
    if(path.startsWith('state?')){
      await ready();const s=await transact(false,clone), asOf=new URLSearchParams(path.split('?')[1]).get('as_of');
      for(const p of s.portfolios){p.overview=D.overview(p,asOf);for(const t of p.transactions){t.cash_effect=D.str(D.cash(t));t.charges=D.str(D.dec(t.fee)+D.dec(t.tax));}}
      return {schema_version:1,revision:s.revision,portfolios:s.portfolios,data_path:'In diesem Browserprofil gespeichert (IndexedDB). Die HTML-Datei enthält die Anwendung, nicht deine eingegebenen Daten. Vor Browserwechsel oder Löschen der Browserdaten eine JSON-Sicherung herunterladen.'};
    }
    if(path==='command')return command(b);
    if(path==='import/preview')return preview(b);
    if(path==='import/commit'){
      const item=previews.get(b.preview_id);if(!item||Date.now()-item.time>1800000)D.fail('Importvorschau abgelaufen. Bitte erneut prüfen.');
      const {time,...data}=item;return command({key:b.key,revision:b.revision,action:'import',data});
    }
    if(path==='backup')return backup();
    D.fail('Unbekannte Aktion.');
  }
  return {api,exportDepot,backup};
})();
