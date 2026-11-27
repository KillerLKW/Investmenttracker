// Isolated V2 storage; not yet included in the user HTML.
/* Standalone file mode: no fetch, server, imports or third-party scripts. */
globalThis.TrackerLocalV2 = (() => {
  const D=TrackerDomain, R=TrackerRegions, previews=new Map(), regionalPreviews=new Map();
  const clone=value=>structuredClone(value), uid=()=>crypto.randomUUID();
  let database;
  function fresh(){return {schema_version:2,revision:0,sequence:0,portfolios:[{id:uid(),name:'Mein Depot',mode:'live',instruments:[],transactions:[],quotes:[],region_snapshots:[]}],requests:{},imports:{},audit:[]};}
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
  async function transact(write,fn,versions=[2]){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state',write?'readwrite':'readonly'), store=tx.objectStore('state'), request=store.get('main');
      let result,problem;
      request.onsuccess=()=>{
        try{
          const s=request.result;
          if(!s) {if(!write)D.fail('Speicher noch nicht initialisiert.');}
          else if(!versions.includes(s.schema_version))D.fail(s.schema_version===1?'Bitte zuerst Sicherung und Datenumstellung öffnen.':'Unbekannte Datenversion. Bestehende Daten bleiben unverändert.',s.schema_version===1?428:422);
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
      const p={id:uid(),name:D.text(data.name,'Depotname',80),mode:data.mode,instruments:[],transactions:[],quotes:[],region_snapshots:[]};s.portfolios.push(p);return {portfolio_id:p.id};
    }
    if(action==='import'){
      if([data.digest,data.legacy_digest].filter(Boolean).some(d=>Object.hasOwn(s.imports,d)))D.fail('Dieser Datenstand wurde bereits importiert.',409);
      let first;
      for(const raw of data.portfolios){
        const normalized=R.portfolio(raw,2), p={...normalized,id:uid(),instruments:[],transactions:[],quotes:[],region_snapshots:[]}, ids=new Map();
        for(const i of normalized.instruments)ids.set(i.id,record(s,p,'instruments',D.instrument(i)));
        for(const t of normalized.transactions)record(s,p,'transactions',{...t,instrument_id:ids.get(t.instrument_id)||null});
        for(const q of normalized.quotes)record(s,p,'quotes',{...q,instrument_id:ids.get(q.instrument_id)});
        for(const r of normalized.region_snapshots)record(s,p,'region_snapshots',{...r,instrument_id:ids.get(r.instrument_id)});
        s.portfolios.push(p);first??=p.id;
      }
      s.imports[data.digest]=first;if(data.legacy_digest)s.imports[data.legacy_digest]=first;
      if(data.history?.length)s.audit.push({created:new Date().toISOString(),action:'imported_history',history:data.history});
      return {portfolio_id:first};
    }
    const p=s.portfolios.find(p=>p.id===data.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
    const ids=new Set(p.instruments.map(i=>i.id));let id;
    if(action==='region_enrich'){
      if(!Array.isArray(data.rows)||!data.rows.length)D.fail('Keine neuen Regionalstände ausgewählt.');
      const seen=new Set();
      for(const raw of data.rows){
        const item=R.snapshot({...raw,id:uid(),sequence:s.sequence+1,void:false},ids);
        if(seen.has(item.instrument_id)||p.region_snapshots.some(r=>r.instrument_id===item.instrument_id))D.fail('Regionaldaten wurden inzwischen ergänzt. Bitte erneut prüfen.',409);
        seen.add(item.instrument_id);record(s,p,'region_snapshots',item);
      }
      return {portfolio_id:p.id,added:data.rows.length};
    }
    if(action==='instrument_add'){
      const item=D.instrument(data);if(p.instruments.some(i=>i.isin===item.isin))D.fail('Diese ISIN ist bereits vorhanden.',409);id=record(s,p,'instruments',item);
    }else if(action==='transaction_add'){
      const item=D.transaction(data,ids);D.holdings([...p.transactions,item]);id=record(s,p,'transactions',item);
    }else if(action==='transaction_void'){
      const t=p.transactions.find(t=>t.id===data.id&&!t.void);if(!t)D.fail('Aktive Buchung nicht gefunden.',404);
      t.void=true;t.void_reason=D.text(data.reason,'Stornogrund',500);D.holdings(p.transactions);id=t.id;
    }else if(action==='quote_add'){
      if(!ids.has(data.instrument_id))D.fail('Wertpapier nicht gefunden.');id=record(s,p,'quotes',{instrument_id:data.instrument_id,price:D.number(data.price,'Kurs',false),date:D.day(data.date),source:D.text(data.source,'Quelle',120),currency:'EUR'});
    }else if(action==='region_add'){
      const item=R.snapshot({...data,id:uid(),sequence:s.sequence+1,void:false},ids);
      const same=r=>JSON.stringify({instrument_id:r.instrument_id,effective_date:r.effective_date,observed_date:r.observed_date,weights:r.weights,source:r.source});
      if(p.region_snapshots.some(r=>!r.void&&same(r)===same(item)))D.fail('Dieser Regionalstand ist bereits vorhanden.',409);
      id=record(s,p,'region_snapshots',item);
    }else if(action==='region_void'){
      const row=p.region_snapshots.find(r=>r.id===data.id&&!r.void);
      if(!row)D.fail('Aktiver Regionalstand nicht gefunden.',404);
      row.void=true;row.void_reason=D.text(data.reason,'Stornogrund',500);id=row.id;
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
  async function exportDepot(pid){const s=await transact(false,clone),p=s.portfolios.find(p=>p.id===pid);if(!p)D.fail('Depot nicht gefunden.');download({schema_version:2,portfolio:p},'investmenttracker-depot.json');}
  async function backup(){const s=await transact(false,clone);download({schema_version:2,format:'investmenttracker-backup',portfolios:s.portfolios,audit:s.audit},'investmenttracker-sicherung-'+new Date().toISOString().slice(0,10)+'.json');return {message:'Sicherung zum Herunterladen bereitgestellt. Bitte die JSON-Datei aufbewahren.',path:''};}
  async function preview(b){
    let raw,version=1,history=[],warnings=[];
    if(b.source==='template'){
      raw=[clone(globalThis.TRACKER_TEMPLATE)];warnings=['Nur Beispielwerte, keine Aussage über aktuell verfügbare Mittel.','Kurse: abgelesener Tabellenstand 17.11.2026, tatsächliches Kursdatum unbekannt.','Sonstiger Kauf über 10,10 EUR bleibt ungeklärt; Ergebnis und Rendite bleiben bis zur Zuordnung offen.'];
    }else{
      const f=b.file;if(!f||![1,2].includes(f.schema_version))D.fail('Investmenttracker-JSON (Version 1 oder 2) erwartet.');version=f.schema_version;
      if(f.portfolio)raw=[f.portfolio];else if(f.format==='investmenttracker-backup'&&Array.isArray(f.portfolios)&&f.portfolios.length<=100){raw=f.portfolios;history=Array.isArray(f.audit)?f.audit:[];}else D.fail('Ungültige Depotdatei oder Sicherung.');
      if(!raw.length)D.fail('Die Datei enthält kein Depot.');warnings=['Alle enthaltenen Depots werden separat angelegt. Bestehende Daten bleiben erhalten.'];
    }
    const portfolios=raw.map(p=>R.portfolio(p,version));
    const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
    const digest=await hash(portfolios);
    const legacy_digest=portfolios.every(p=>p.region_snapshots.length===0)?await hash(raw.map(D.portfolio)):null;
    if(version===1)warnings.push('Version 1 enthält keine Regionaldaten.');
    const uncertain=portfolios.flatMap(p=>p.region_snapshots).filter(r=>!r.void&&r.effective_date===null).length;
    if(uncertain)warnings.push(uncertain+' Regionalstand/-stände ohne bekanntes Zusammensetzungsdatum.');
    const id=uid();if(previews.size>=20)previews.delete(previews.keys().next().value);previews.set(id,{portfolios,digest,legacy_digest,history,time:Date.now()});
    const summary={name:portfolios.length===1?portfolios[0].name:portfolios.length+' Depots aus Sicherung',mode:portfolios.every(p=>p.mode==='example')?'example':'live'};
    for(const key of ['instruments','transactions','quotes','region_snapshots'])summary[key]=portfolios.reduce((n,p)=>n+p[key].length,0);
    const regional_coverage=portfolios.flatMap(p=>p.region_snapshots.map(r=>{
      const covered=Object.values(r.weights).reduce((sum,w)=>sum+D.dec(w),0n);
      return {portfolio:p.name,instrument_id:r.instrument_id,isin:p.instruments.find(i=>i.id===r.instrument_id).isin,
        snapshot_id:r.id,coverage:D.str(covered),unknown:D.str(D.dec('1')-covered),
        effective_date:r.effective_date,observed_date:r.observed_date,source:r.source,void:r.void};
    }));
    return {preview_id:id,summary,warnings,regional_coverage};
  }

  // Validation only: never replace a stored object with an import-normalized copy.
  function validateState(s){
    if(!Number.isSafeInteger(s.revision)||s.revision<0||!Number.isSafeInteger(s.sequence)||s.sequence<0||!Array.isArray(s.portfolios)||!s.portfolios.length||!Array.isArray(s.audit))D.fail('Ungültiger gespeicherter Zustand.');
    for(const key of ['requests','imports'])if(!s[key]||typeof s[key]!=='object'||Array.isArray(s[key]))D.fail('Ungültige gespeicherte Kennungen.');
    const ids=new Set(),sequences=new Set();
    for(const p of s.portfolios){
      D.text(p.id,'Depot-ID',160);if(ids.has(p.id))D.fail('Doppelte Depot-ID.');ids.add(p.id);
      R.portfolio(p,s.schema_version);
      for(const row of [...p.instruments,...p.transactions,...p.quotes,...(p.region_snapshots||[])]){
        D.text(row.id,'Datensatz-ID',160);
        if(ids.has(row.id)||!Number.isSafeInteger(row.sequence)||row.sequence<1||row.sequence>s.sequence||sequences.has(row.sequence))D.fail('Ungültige gespeicherte ID oder Sequenz.');
        ids.add(row.id);sequences.add(row.sequence);
      }
    }
  }
  async function migrationStatus(){
    return transact(true,s=>{validateState(s);return {schema_version:s.schema_version,revision:s.revision,required:s.schema_version===1};},[1,2]);
  }
  async function migrationBackup(){
    const s=await transact(false,s=>{validateState(s);return clone(s);},[1,2]);
    download({schema_version:s.schema_version,format:'investmenttracker-backup',portfolios:s.portfolios,audit:s.audit,raw_state:s},'investmenttracker-vor-umstellung.json');
    return {revision:s.revision,message:'Sicherung bereitgestellt. Den Download vor der Umstellung aufbewahren.'};
  }
  async function migrate(b){
    return transact(true,s=>{
      validateState(s);
      if(s.schema_version===2)return {schema_version:2,revision:s.revision,already_migrated:true};
      if(b?.revision!==s.revision)D.fail('Daten wurden geändert. Neue Sicherung erstellen und erneut prüfen.',412);
      for(const p of s.portfolios)p.region_snapshots=[];
      s.schema_version=2;s.revision++;
      s.audit.push({created:new Date().toISOString(),action:'schema_migration',from:1,to:2});
      validateState(s);
      return {schema_version:2,revision:s.revision};
    },[1,2]);
  }

  async function api(path,b){
    if(path==='regions/preview'){
      const s=await transact(false,clone),p=s.portfolios.find(p=>p.id===b.portfolio_id);
      if(!p)D.fail('Depot nicht gefunden.',404);
      const fixture=globalThis.TRACKER_REGIONS?.records;if(!Array.isArray(fixture))D.fail('Regionalvorlage fehlt.');
      const rows=[],matches=[];
      for(const i of p.instruments){
        const candidates=fixture.filter(f=>f.isin===i.isin);
        if(candidates.length>1)D.fail('Mehrdeutige Vorlagen-ISIN.');
        const f=candidates[0],existing=p.region_snapshots.some(r=>r.instrument_id===i.id);
        const status=existing?'existing':f?'new':'missing';
        let coverage=null;
        if(f){
          const row=R.snapshot({...f,instrument_id:i.id,id:'preview',sequence:1,void:false},new Set([i.id]));
          coverage=D.str(Object.values(row.weights).reduce((sum,w)=>sum+D.dec(w),0n));
          if(status==='new')rows.push(row);
        }
        matches.push({name:i.name,isin:i.isin,status,coverage,source:f?.source||null,observed_date:f?.observed_date||null});
      }
      const id=uid();if(regionalPreviews.size>=20)regionalPreviews.delete(regionalPreviews.keys().next().value);
      regionalPreviews.set(id,{portfolio_id:p.id,rows,revision:s.revision,time:Date.now()});
      return {preview_id:id,revision:s.revision,name:p.name,mode:p.mode,matches,added:rows.length};
    }
    if(path==='regions/commit'){
      const item=regionalPreviews.get(b.preview_id);
      if(!item||Date.now()-item.time>1800000)D.fail('Vorschau abgelaufen. Bitte erneut prüfen.');
      if(b.revision!==item.revision)D.fail('Ansicht wurde verändert. Regionalvorschau erneut öffnen.',412);
      return command({key:b.key,revision:item.revision,action:'region_enrich',data:{portfolio_id:item.portfolio_id,rows:item.rows}});
    }
    if(path==='migration/status')return migrationStatus();
    if(path==='migration/backup')return migrationBackup();
    if(path==='migration/commit')return migrate(b);
    if(path.startsWith('state?')){
      await ready();const s=await transact(false,clone), asOf=new URLSearchParams(path.split('?')[1]).get('as_of');
      for(const p of s.portfolios){p.overview=D.overview(p,asOf);p.distribution=R.distribution(p,asOf);for(const t of p.transactions){t.cash_effect=D.str(D.cash(t));t.charges=D.str(D.dec(t.fee)+D.dec(t.tax));}}
      return {schema_version:2,revision:s.revision,portfolios:s.portfolios,data_path:'In diesem Browserprofil gespeichert (IndexedDB). Die HTML-Datei enthält die Anwendung, nicht deine eingegebenen Daten. Vor Browserwechsel oder Löschen der Browserdaten eine JSON-Sicherung herunterladen.'};
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
