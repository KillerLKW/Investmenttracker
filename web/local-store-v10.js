// Isolated V10 global own-GDP catalog store; not bundled in the active app.
/* Standalone file mode: no fetch, server, imports or third-party scripts. */
globalThis.TrackerLocalV10 = (() => {
  const D=TrackerDomain, R=TrackerRegions, C=TrackerCountries, S=TrackerSectors, U=TrackerCompanies, A=TrackerAllowance, Q=TrackerQuoteBatch, P=TrackerPlanningProfiles, M=TrackerInstrumentMetadata, K=TrackerPaymentClarification, GC=TrackerGDPCatalog, gdpPreviews=new Map(), clarificationPreviews=new Map(), metadataPreviews=new Map(), previews=new Map(), regionalPreviews=new Map(), countryPreviews=new Map(), sectorPreviews=new Map(), companyPreviews=new Map(), allowancePreviews=new Map(), quotePreviews=new Map();
  const clone=value=>structuredClone(value), uid=()=>crypto.randomUUID();
  let database, backupTicket;
  function fresh(){return {schema_version:10,revision:0,sequence:0,portfolios:[{id:uid(),name:'Mein Depot',mode:'live',instruments:[],transactions:[],quotes:[],region_snapshots:[],country_snapshots:[],sector_snapshots:[],company_snapshots:[],planning_profiles:[],instrument_metadata_snapshots:[],payment_clarifications:[]}],allowance_ledgers:[],gdp_datasets:[],requests:{},imports:{},audit:[]};}
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
  async function transact(write,fn,versions=[10]){
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('state',write?'readwrite':'readonly'), store=tx.objectStore('state'), request=store.get('main');
      let result,problem;
      request.onsuccess=()=>{
        try{
          const s=request.result;
          if(!s) {if(!write)D.fail('Speicher noch nicht initialisiert.');}
          else if(!versions.includes(s.schema_version))D.fail([1,2,3,4].includes(s.schema_version)?'Bitte zuerst den bisherigen Bestand über die geprüften Schritte auf V5 umstellen.':[5,6,7,8,9].includes(s.schema_version)?'Bitte zuerst Sicherung und die bisherige Datenumstellung öffnen.':'Unbekannte Datenversion. Bestehende Daten bleiben unverändert.',[1,2,3,4,5,6,7,8,9].includes(s.schema_version)?428:422);
          const state=s||fresh();result=fn(state);
          if(write)store.put(state,'main');
        }catch(e){problem=e;tx.abort();}
      };
      tx.oncomplete=()=>resolve(result);
      tx.onabort=tx.onerror=()=>reject(problem||Error('Speichern fehlgeschlagen. Browser-Speicherplatz und Berechtigungen prüfen; Eingabe bleibt erhalten.'));
    });
  }
  const ready=()=>transact(true,s=>{validateState(s);return true;});
  // Portable files may reorder arrays; preserve explicit same-day tie order.
  // Legacy fingerprints below still use the original input for compatibility.
  function importedPortfolio(raw,version){
    if(raw&&Object.hasOwn(raw,'gdp_datasets'))D.fail('Eigene BIP-Stände gehören außerhalb der Depots.');
    if(raw&&Object.hasOwn(raw,'allowance_ledgers'))D.fail('Freistellungsregister gehören außerhalb der Depots.');
    const v9=version>=9,v8=version>=8,v7=version>=7;
    if(!v9&&Object.hasOwn(raw||{},'payment_clarifications'))D.fail('Zahlungsklärungen benötigen Version 9.');
    if(!v8&&Object.hasOwn(raw||{},'instrument_metadata_snapshots'))D.fail('Produktmetadaten benötigen Version 8.');
    if(!v7&&Object.hasOwn(raw||{},'planning_profiles'))D.fail('Planungsprofile benötigen Version 7.');
    version=version>=6?5:version;
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return U.portfolio(raw,version);
    const input={...raw};
    for(const key of ['transactions','quotes','region_snapshots','country_snapshots','sector_snapshots','company_snapshots']){
      const rows=raw[key];
      if(Array.isArray(rows)&&rows.every(r=>r&&Number.isSafeInteger(r.sequence)&&r.sequence>0))input[key]=[...rows].sort((a,b)=>a.sequence-b.sequence);
    }
    const result=U.portfolio(input,version);
    result.planning_profiles=v7?profileRows(raw.planning_profiles):[];
    const existingIds=new Set([raw.id,...['instruments','transactions','quotes','region_snapshots','country_snapshots','sector_snapshots','company_snapshots'].flatMap(k=>(raw[k]||[]).map(r=>r.id))].filter(Boolean));
    if(result.planning_profiles.some(r=>existingIds.has(r.id)))D.fail('Profil-ID kollidiert mit einem Depotdatensatz.');
    result.instrument_metadata_snapshots=v8?M.snapshots(raw.instrument_metadata_snapshots,new Set(result.instruments.map(i=>i.id))).sort((a,b)=>a.sequence-b.sequence):[];
    for(const r of result.planning_profiles)existingIds.add(r.id);
    const existingSequences=new Set(['instruments','transactions','quotes','region_snapshots','country_snapshots','sector_snapshots','company_snapshots','planning_profiles'].flatMap(k=>(raw[k]||[]).map(r=>r.sequence)).filter(Number.isSafeInteger));
    if(result.instrument_metadata_snapshots.some(r=>existingIds.has(r.id)||existingSequences.has(r.sequence)))D.fail('Metadaten-ID oder Sequenz kollidiert mit einem Depotdatensatz.');
    // Preserve transaction identity before the legacy normalizer loses it.
    const otherRows=['instruments','quotes','region_snapshots','country_snapshots','sector_snapshots','company_snapshots','planning_profiles','instrument_metadata_snapshots'].flatMap(k=>raw[k]||[]);
    const usedIds=new Set([raw.id,...otherRows.map(r=>r.id)].filter(Boolean)),usedSequences=new Set(otherRows.map(r=>r.sequence).filter(Number.isSafeInteger));
    let nextSequence=0;for(const n of usedSequences)nextSequence=Math.max(nextSequence,n);for(const r of input.transactions)if(Number.isSafeInteger(r.sequence))nextSequence=Math.max(nextSequence,r.sequence);
    result.transactions=result.transactions.map((t,n)=>{
      const original=input.transactions[n];let id=original.id,sequence=original.sequence;
      if(id===undefined&&!v9){id='legacy-transaction-'+n;while(usedIds.has(id))id+='x';}
      if(typeof id!=='string'||!id.trim()||id!==id.trim()||id.length>160||usedIds.has(id))D.fail('Ungültige oder doppelte ursprüngliche Buchungs-ID.');
      if(sequence===undefined&&!v9)sequence=++nextSequence;
      if(!Number.isSafeInteger(sequence)||sequence<1||usedSequences.has(sequence))D.fail('Ungültige oder doppelte ursprüngliche Buchungssequenz.');
      usedIds.add(id);usedSequences.add(sequence);return {...t,id,sequence};
    });
    result.payment_clarifications=v9?K.records(raw.payment_clarifications,new Set(result.instruments.map(i=>i.id)),new Set(result.transactions.map(t=>t.id))).sort((a,b)=>a.sequence-b.sequence):[];
    if(result.payment_clarifications.some(r=>usedIds.has(r.id)||usedSequences.has(r.sequence)))D.fail('Klärungs-ID oder Sequenz kollidiert mit einem Depotdatensatz.');
    return result;
  }
  function oldPortfolio(p){const {payment_clarifications,...old}=p;return {...old,transactions:old.transactions.map(({id,sequence,...t})=>t)};}
  function clarificationValue(r){const {id,sequence,void:isVoid,void_reason,...payload}=r;return K.decision(payload,new Set([...(r.basis.instrument_id?[r.basis.instrument_id]:[]),...(r.instrument_id?[r.instrument_id]:[])]));}
  function clarificationSummary(r){const {portfolio,...summary}=r;return summary;}
  function boundDecision(p,raw){
    const ids=new Set(p.instruments.map(i=>i.id)),v=K.decision(raw,ids),t=p.transactions.find(t=>t.id===v.transaction_id);
    if(!t||t.void)D.fail('Aktive Originalbuchung in diesem Depot nicht gefunden.',404);
    if(JSON.stringify(K.transactionBasis(t,ids))!==JSON.stringify(v.basis))D.fail('Originalbuchungsbasis geändert. Neue Vorschau erforderlich.',412);
    return v;
  }
  function profileRows(raw){
    if(!Array.isArray(raw)||raw.length>100)D.fail('Höchstens 100 Planungsprofile je Depot erwartet.');
    const ids=new Set(),seq=new Set();
    return raw.map(row=>{
      if(!row||typeof row!=='object'||!Object.hasOwn(row,'id')||!Object.hasOwn(row,'sequence'))D.fail('Profil-ID und Sequenz erforderlich.');
      const {id,sequence,...payload}=row,profile=P.profile(payload);
      D.text(id,'Profil-ID',160);
      if(ids.has(id)||!Number.isSafeInteger(sequence)||sequence<1||seq.has(sequence))D.fail('Ungültige oder doppelte Profil-ID/Sequenz.');
      ids.add(id);seq.add(sequence);return {...profile,id,sequence};
    }).sort((a,b)=>a.sequence-b.sequence);
  }
  function metadataValue(r){const {id,instrument_id,sequence,void:isVoid,void_reason,...payload}=r;return M.payload(payload);}
  function metadataRow(p,raw,sequence){
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Object.hasOwn(raw,'instrument_id'))D.fail('Metadatenzeile benötigt Instrumentbezug.');
    const {instrument_id,...payload}=raw;return M.snapshot({id:'pending',instrument_id,sequence,void:false,...M.payload(payload)},new Set(p.instruments.map(i=>i.id)));
  }
  function record(s,p,key,item){const result={...item,id:uid(),sequence:++s.sequence};p[key].push(result);return result.id;}
  function importedLedger(raw){
    const l=A.ledger(raw);
    l.snapshots.sort((a,b)=>a.sequence-b.sequence);l.budgets.sort((a,b)=>a.sequence-b.sequence);return l;
  }
  function validateLedgerSet(ledgers,ids=new Set(),sequences=new Set(),max=Number.MAX_SAFE_INTEGER){
    if(!Array.isArray(ledgers)||ledgers.length>100)D.fail('Ungültige Registerliste.');
    for(const raw of ledgers){const l=A.ledger(raw);for(const r of [l,...l.institutions,...l.snapshots,...l.budgets]){if(ids.has(r.id))D.fail('Doppelte globale Registerkennung.');ids.add(r.id);}for(const r of [...l.snapshots,...l.budgets]){if(r.sequence>max||sequences.has(r.sequence))D.fail('Ungültige globale Registersequenz.');sequences.add(r.sequence);}}
  }
  function appendLedger(s,raw){
    const l=importedLedger(raw),map=new Map(l.institutions.map(i=>[i.id,uid()]));
    const result={...l,id:uid(),institutions:l.institutions.map(i=>({...i,id:map.get(i.id)})),snapshots:[],budgets:[]};
    for(const r of [...l.snapshots.map(r=>({kind:'snapshots',row:r})),...l.budgets.map(r=>({kind:'budgets',row:r}))].sort((a,b)=>a.row.sequence-b.row.sequence)){
      const item={...r.row};if(r.kind==='snapshots')item.institution_id=map.get(item.institution_id);record(s,result,r.kind,item);
    }
    s.allowance_ledgers.push(result);return result.id;
  }
  function gdpValue(r){const {id,sequence,void:isVoid,void_reason,...p}=r;return GC.payload(p);}
  function validateGDPSet(rows,ids=new Set(),sequences=new Set(),max=Number.MAX_SAFE_INTEGER){for(const r of GC.records(rows)){if(ids.has(r.id)||sequences.has(r.sequence)||r.sequence>max)D.fail('Globale BIP-ID oder Sequenz kollidiert.');ids.add(r.id);sequences.add(r.sequence);}}
  function validateGDPImport(rows,portfolios,ledgers){const ids=new Set(),seq=new Set();for(const p of portfolios){if(p.id)ids.add(p.id);for(const k of ['instruments','transactions','quotes','region_snapshots','country_snapshots','sector_snapshots','company_snapshots','planning_profiles','instrument_metadata_snapshots','payment_clarifications'])for(const r of p[k]||[]){if(r.id)ids.add(r.id);if(r.sequence)seq.add(r.sequence);}}for(const l of ledgers)for(const r of [l,...l.institutions,...l.snapshots,...l.budgets]){ids.add(r.id);if(r.sequence)seq.add(r.sequence);}validateGDPSet(rows,ids,seq);}
  const hashValue=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
  function apply(s,action,data){
    if(action==='gdp_dataset_add'){
      if(!data||Object.keys(data).length!==1||!Object.hasOwn(data,'payload'))D.fail('Vollständiger BIP-Stand ausdrücklich angeben.');const value=GC.payload(data.payload);
      if(s.gdp_datasets.some(r=>!r.void&&JSON.stringify(gdpValue(r))===JSON.stringify(value)))D.fail('Dieser aktive BIP-Stand ist bereits vorhanden.',409);
      return {dataset_id:record(s,s,'gdp_datasets',{...value,void:false})};
    }
    if(action==='gdp_dataset_void'){
      if(!data||Object.keys(data).length!==2||!['id','reason'].every(k=>Object.hasOwn(data,k)))D.fail('BIP-Storno mit Grund erwartet.');const r=s.gdp_datasets.find(r=>r.id===data.id&&!r.void);if(!r)D.fail('Aktiver BIP-Stand nicht gefunden.',404);const reason=D.text(data.reason,'BIP-Stornogrund',500);r.void=true;r.void_reason=reason;return {dataset_id:r.id};
    }
    if(action==='allowance_create'){
      const l=A.ledger({id:uid(),name:data.name,mode:data.mode,institutions:[],snapshots:[],budgets:[]});s.allowance_ledgers.push(l);return {ledger_id:l.id};
    }
    if(action==='allowance_import'){
      if(typeof data.digest!=='string'||!/^[a-f0-9]{64}$/.test(data.digest))D.fail('Ungültige Registerimportkennung.');
      if(Object.hasOwn(s.imports,data.digest))D.fail('Dieses Vorlagenregister wurde bereits importiert.',409);
      if(s.allowance_ledgers.some(l=>l.mode==='example'&&l.name===data.ledger.name))D.fail('Dieses Beispielregister ist bereits vorhanden; Historie bleibt erhalten.',409);
      const id=appendLedger(s,data.ledger);s.imports[data.digest]=id;return {ledger_id:id};
    }
    if(['allowance_institution_add','allowance_snapshot_add','allowance_budget_add','allowance_snapshot_void','allowance_budget_void'].includes(action)){
      const l=s.allowance_ledgers.find(l=>l.id===data.ledger_id);if(!l)D.fail('Register nicht gefunden.',404);
      if(action==='allowance_institution_add'){const item=A.institution({id:uid(),label:data.label});l.institutions.push(item);return {ledger_id:l.id,id:item.id};}
      const {ledger_id,...raw}=data,kind=action.includes('_budget_')?'budgets':'snapshots';let id;
      if(action.endsWith('_void')){const r=l[kind].find(r=>r.id===data.id&&!r.void);if(!r)D.fail('Aktiver Registerstand nicht gefunden.',404);r.void=true;r.void_reason=D.text(data.reason,'Stornogrund',500);id=r.id;}
      else{
        const r={...raw,id:uid(),sequence:s.sequence+1,void:false},item=kind==='budgets'?A.budget(r):A.snapshot(r,new Set(l.institutions.map(i=>i.id)));
        const same=r=>{const {id,sequence,...rest}=r;return JSON.stringify(rest);};
        if(l[kind].some(r=>!r.void&&same(kind==='budgets'?A.budget(r):A.snapshot(r,new Set(l.institutions.map(i=>i.id))))===same(item)))D.fail('Dieser Registerstand ist bereits vorhanden.',409);
        id=record(s,l,kind,item);
      }
      return {ledger_id:l.id,id};
    }
    if(action==='allowance_batch'){
      if(!Array.isArray(data.commands)||!data.commands.length||data.commands.length>100||data.commands.some(c=>!['allowance_snapshot_add','allowance_budget_add','allowance_institution_add','allowance_snapshot_void','allowance_budget_void'].includes(c.action)))D.fail('Ungültige Register-Sammelaktion.');
      return {results:data.commands.map(c=>apply(s,c.action,c.data))};
    }
    if(action==='portfolio_create'){
      if(!['live','example'].includes(data.mode))D.fail('Ungültiger Depotmodus.');
      const p={id:uid(),name:D.text(data.name,'Depotname',80),mode:data.mode,instruments:[],transactions:[],quotes:[],region_snapshots:[],country_snapshots:[],sector_snapshots:[],company_snapshots:[],planning_profiles:[],instrument_metadata_snapshots:[],payment_clarifications:[]};s.portfolios.push(p);return {portfolio_id:p.id};
    }
    if(action==='import'){
      if(!/^[a-f0-9]{64}$/.test(data.digest)||!Array.isArray(data.legacy_digests)||data.legacy_digests.length>9||data.legacy_digests.some(d=>typeof d!=='string'||!/^[a-f0-9]{64}$/.test(d))||!Array.isArray(data.portfolios)||!data.portfolios.length||data.portfolios.length>100||!Array.isArray(data.history))D.fail('Ungültige geprüfte Importdaten.');
      if([data.digest,...(data.legacy_digests||[])].some(d=>Object.hasOwn(s.imports,d)))D.fail('Dieser Datenstand wurde bereits importiert.',409);
      validateGDPImport(data.gdp_datasets,data.portfolios,data.allowance_ledgers||[]);
      let first;
      for(const raw of data.portfolios){
        const normalized=importedPortfolio(raw,10), p={...normalized,id:uid(),instruments:[],transactions:[],quotes:[],region_snapshots:[],country_snapshots:[],sector_snapshots:[],company_snapshots:[],planning_profiles:[],instrument_metadata_snapshots:[],payment_clarifications:[]}, ids=new Map(),transactionIds=new Map();
        for(const i of normalized.instruments)ids.set(i.id,record(s,p,'instruments',D.instrument(i)));
        for(const t of normalized.transactions)transactionIds.set(t.id,record(s,p,'transactions',{...t,instrument_id:ids.get(t.instrument_id)||null}));
        for(const q of normalized.quotes)record(s,p,'quotes',{...q,instrument_id:ids.get(q.instrument_id)});
        for(const r of normalized.region_snapshots)record(s,p,'region_snapshots',{...r,instrument_id:ids.get(r.instrument_id)});
        for(const r of normalized.country_snapshots)record(s,p,'country_snapshots',{...r,instrument_id:ids.get(r.instrument_id)});
        for(const r of normalized.sector_snapshots)record(s,p,'sector_snapshots',{...r,instrument_id:ids.get(r.instrument_id)});
        for(const r of normalized.company_snapshots)record(s,p,'company_snapshots',{...r,instrument_id:ids.get(r.instrument_id)});
        for(const row of normalized.planning_profiles){const {id,sequence,...payload}=row;record(s,p,'planning_profiles',P.profile(payload));}
        for(const r of normalized.instrument_metadata_snapshots)record(s,p,'instrument_metadata_snapshots',{...r,instrument_id:ids.get(r.instrument_id)});
        for(const r of normalized.payment_clarifications)record(s,p,'payment_clarifications',{...r,transaction_id:transactionIds.get(r.transaction_id),instrument_id:r.instrument_id===null?null:ids.get(r.instrument_id),basis:{...r.basis,instrument_id:r.basis.instrument_id===null?null:ids.get(r.basis.instrument_id)}});
        s.portfolios.push(p);first??=p.id;
      }
      for(const ledger of (data.allowance_ledgers||[]))appendLedger(s,ledger);
      for(const r of GC.records(data.gdp_datasets).sort((a,b)=>a.sequence-b.sequence))record(s,s,'gdp_datasets',r);
      for(const digest of [data.digest,...(data.legacy_digests||[])])s.imports[digest]=first;
      if(data.history?.length)s.audit.push({created:new Date().toISOString(),action:'imported_history',history:data.history});
      return {portfolio_id:first};
    }
    const p=s.portfolios.find(p=>p.id===data.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
    const ids=new Set(p.instruments.map(i=>i.id));let id;
    if(action==='clarification_add'){
      if(Object.keys(data).length!==2||!['portfolio_id','decision'].every(k=>Object.hasOwn(data,k)))D.fail('Ungültige Klärungsaktion.');
      const value=boundDecision(p,data.decision);
      if(p.payment_clarifications.some(r=>!r.void&&JSON.stringify(clarificationValue(r))===JSON.stringify(value)))D.fail('Diese aktive Klärung ist bereits vorhanden.',409);
      return {portfolio_id:p.id,id:record(s,p,'payment_clarifications',{...value,void:false})};
    }
    if(action==='clarification_void'){
      if(Object.keys(data).length!==3||!['portfolio_id','id','reason'].every(k=>Object.hasOwn(data,k)))D.fail('Ungültiges Klärungsstorno.');
      const r=p.payment_clarifications.find(r=>r.id===data.id&&!r.void);if(!r)D.fail('Aktive Klärung in diesem Depot nicht gefunden.',404);
      r.void=true;r.void_reason=D.text(data.reason,'Klärungs-Stornogrund',500);return {portfolio_id:p.id,id:r.id};
    }
    if(action==='metadata_add'){
      if(Object.keys(data).length!==3||!['portfolio_id','instrument_id','payload'].every(k=>Object.hasOwn(data,k)))D.fail('Ungültige Metadatenaktion.');
      const row=metadataRow(p,{instrument_id:data.instrument_id,...M.payload(data.payload)},s.sequence+1);
      const normalized=JSON.stringify(metadataValue(row));
      if(p.instrument_metadata_snapshots.some(r=>!r.void&&r.instrument_id===row.instrument_id&&JSON.stringify(metadataValue(r))===normalized))D.fail('Dieser Metadatenstand ist bereits vorhanden.',409);
      return {portfolio_id:p.id,id:record(s,p,'instrument_metadata_snapshots',row)};
    }
    if(action==='metadata_void'){
      if(Object.keys(data).length!==3||!['portfolio_id','id','reason'].every(k=>Object.hasOwn(data,k)))D.fail('Ungültige Metadaten-Stornoaktion.');
      const r=p.instrument_metadata_snapshots.find(r=>r.id===data.id&&!r.void);if(!r)D.fail('Aktiver Metadatenstand in diesem Depot nicht gefunden.',404);
      r.void=true;r.void_reason=D.text(data.reason,'Metadaten-Stornogrund',500);return {portfolio_id:p.id,id:r.id};
    }
    if(action==='metadata_enrich'){
      if(Object.keys(data).length!==2||!['portfolio_id','rows'].every(k=>Object.hasOwn(data,k))||!Array.isArray(data.rows)||!data.rows.length||data.rows.length>1000)D.fail('Keine gültigen neuen Metadatenzeilen.',409);
      const seen=new Set(),added=[];
      for(const raw of data.rows){
        const row=metadataRow(p,raw,s.sequence+1);
        if(seen.has(row.instrument_id)||p.instrument_metadata_snapshots.some(r=>r.instrument_id===row.instrument_id))D.fail('Metadatenhistorie bereits vorhanden. Vorschau erneut prüfen.',409);
        seen.add(row.instrument_id);added.push(record(s,p,'instrument_metadata_snapshots',row));
      }
      return {portfolio_id:p.id,added:added.length,ids:added};
    }
    if(['profile_add','profile_update','profile_delete'].includes(action)){
      const keys=action==='profile_add'?['portfolio_id','profile']:action==='profile_update'?['portfolio_id','id','profile']:['portfolio_id','id'];
      if(keys.some(k=>!Object.hasOwn(data,k))||Object.keys(data).some(k=>!keys.includes(k)))D.fail('Ungültige Profilaktion.');
      let row;
      if(action!=='profile_add'){row=p.planning_profiles.find(r=>r.id===data.id);if(!row)D.fail('Profil in diesem Depot nicht gefunden.',404);}
      if(action==='profile_delete'){p.planning_profiles.splice(p.planning_profiles.indexOf(row),1);return {portfolio_id:p.id,id:row.id};}
      const payload=P.profile(data.profile);
      if(action==='profile_add'){
        if(p.planning_profiles.length>=100)D.fail('Höchstens 100 Planungsprofile je Depot.',409);
        return {portfolio_id:p.id,id:record(s,p,'planning_profiles',payload)};
      }
      const updated={...payload,id:row.id,sequence:++s.sequence};p.planning_profiles[p.planning_profiles.indexOf(row)]=updated;
      return {portfolio_id:p.id,id:updated.id};
    }
    if(action==='company_enrich'){
      if(!Array.isArray(data.rows)||!data.rows.length)D.fail('Keine neuen Unternehmensstände ausgewählt.');
      const seen=new Set();
      for(const raw of data.rows){
        const item=U.snapshot({...raw,id:uid(),sequence:s.sequence+1,void:false},ids);
        if(seen.has(item.instrument_id)||p.company_snapshots.some(r=>r.instrument_id===item.instrument_id))D.fail('Unternehmenshistorie bereits vorhanden. Vorschau erneut prüfen.',409);
        seen.add(item.instrument_id);record(s,p,'company_snapshots',item);
      }
      return {portfolio_id:p.id,added:data.rows.length};
    }
    if(action==='sector_enrich'){
      if(!Array.isArray(data.rows)||!data.rows.length)D.fail('Keine neuen Sektorstände ausgewählt.');
      const seen=new Set();
      for(const raw of data.rows){
        const item=S.snapshot({...raw,id:uid(),sequence:s.sequence+1,void:false},ids);
        if(seen.has(item.instrument_id)||p.sector_snapshots.some(r=>r.instrument_id===item.instrument_id))D.fail('Sektorhistorie bereits vorhanden. Vorschau erneut prüfen.',409);
        seen.add(item.instrument_id);record(s,p,'sector_snapshots',item);
      }
      return {portfolio_id:p.id,added:data.rows.length};
    }
    if(action==='country_enrich'){
      if(!Array.isArray(data.rows)||!data.rows.length)D.fail('Keine neuen Länderstände ausgewählt.');
      const seen=new Set();
      for(const raw of data.rows){
        const item=C.snapshot({...raw,id:uid(),sequence:s.sequence+1,void:false},ids);
        if(seen.has(item.instrument_id)||p.country_snapshots.some(r=>r.instrument_id===item.instrument_id))D.fail('Länderhistorie bereits vorhanden. Vorschau erneut prüfen.',409);
        seen.add(item.instrument_id);record(s,p,'country_snapshots',item);
      }
      return {portfolio_id:p.id,added:data.rows.length};
    }
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
    if(action==='company_add'){
      const {portfolio_id,...raw}=data;
      const item=U.snapshot({...raw,id:uid(),sequence:s.sequence+1,void:false},ids);
      const same=r=>JSON.stringify({instrument_id:r.instrument_id,effective_date:r.effective_date,observed_date:r.observed_date,disclosure_scope:r.disclosure_scope,mapping:r.mapping,allocations:[...r.allocations].sort((a,b)=>a.holding_id.localeCompare(b.holding_id)),source:r.source});
      if(p.company_snapshots.some(r=>!r.void&&same(U.snapshot(r,ids))===same(item)))D.fail('Dieser Unternehmensstand ist bereits vorhanden.',409);
      id=record(s,p,'company_snapshots',item);
    }else if(action==='company_void'){
      const row=p.company_snapshots.find(r=>r.id===data.id&&!r.void);if(!row)D.fail('Aktiver Unternehmensstand nicht gefunden.',404);
      row.void=true;row.void_reason=D.text(data.reason,'Unternehmens-Stornogrund',500);id=row.id;
    }else if(action==='sector_add'){
      const {portfolio_id,...raw}=data;
      const item=S.snapshot({...raw,id:uid(),sequence:s.sequence+1,void:false},ids);
      const same=r=>JSON.stringify({instrument_id:r.instrument_id,effective_date:r.effective_date,observed_date:r.observed_date,taxonomy:r.taxonomy,allocations:[...r.allocations].sort((a,b)=>a.sector_id.localeCompare(b.sector_id)),source:r.source});
      if(p.sector_snapshots.some(r=>!r.void&&same(S.snapshot(r,ids))===same(item)))D.fail('Dieser Sektorstand ist bereits vorhanden.',409);
      id=record(s,p,'sector_snapshots',item);
    }else if(action==='sector_void'){
      const row=p.sector_snapshots.find(r=>r.id===data.id&&!r.void);if(!row)D.fail('Aktiver Sektorstand nicht gefunden.',404);
      row.void=true;row.void_reason=D.text(data.reason,'Sektor-Stornogrund',500);id=row.id;
    }else if(action==='country_add'){
      const {portfolio_id,...raw}=data;
      const item=C.snapshot({...raw,id:uid(),sequence:s.sequence+1,void:false},ids);
      const same=r=>JSON.stringify({instrument_id:r.instrument_id,effective_date:r.effective_date,observed_date:r.observed_date,allocations:[...r.allocations].sort((a,b)=>a.country_id.localeCompare(b.country_id)),classification:r.classification,source:r.source});
      if(p.country_snapshots.some(r=>!r.void&&same(C.snapshot(r,ids))===same(item)))D.fail('Dieser Länderstand ist bereits vorhanden.',409);
      id=record(s,p,'country_snapshots',item);
    }else if(action==='country_void'){
      const row=p.country_snapshots.find(r=>r.id===data.id&&!r.void);if(!row)D.fail('Aktiver Länderstand nicht gefunden.',404);
      row.void=true;row.void_reason=D.text(data.reason,'Länder-Stornogrund',500);id=row.id;
    }else if(action==='instrument_add'){
      const item=D.instrument(data);if(p.instruments.some(i=>i.isin===item.isin))D.fail('Diese ISIN ist bereits vorhanden.',409);id=record(s,p,'instruments',item);
    }else if(action==='transaction_add'){
      const item=D.transaction(data,ids);D.holdings([...p.transactions,item]);id=record(s,p,'transactions',item);
    }else if(action==='transaction_void'){
      const t=p.transactions.find(t=>t.id===data.id&&!t.void);if(!t)D.fail('Aktive Buchung nicht gefunden.',404);
      t.void=true;t.void_reason=D.text(data.reason,'Stornogrund',500);D.holdings(p.transactions);id=t.id;
    }else if(action==='quote_batch_add'){
      const plan=Q.plan(p,data.rows,{reference_day:data.reference_day,valuation_date:data.valuation_date});
      if(!plan.can_commit)D.fail('Keine neuen Kurse zu übernehmen.',409);
      const added_ids=plan.additions.map(q=>record(s,p,'quotes',q));
      return {portfolio_id:p.id,added:added_ids.length,existing:plan.existing_count,ids:added_ids};
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
      validateState(s);
      const previous=s.requests[b.key];
      if(previous){if(previous.signature!==signature)D.fail('Wiederholungskennung gehört zu einer anderen Aktion.',409);return previous.result;}
      if(b.revision!==s.revision)D.fail('Daten wurden zwischenzeitlich geändert. Ansicht aktualisieren und Eingabe prüfen.',412);
      const result=apply(s,b.action,b.data);s.revision++;result.revision=s.revision;
      s.requests[b.key]={signature,result};s.audit.push({created:new Date().toISOString(),action:b.action,data:clone(b.data)});validateState(s);return result;
    });
  }
  function download(value,name){
    const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  async function exportDepot(pid){const s=await transact(false,s=>{validateState(s);return clone(s);}),p=s.portfolios.find(p=>p.id===pid);if(!p)D.fail('Depot nicht gefunden.');download({schema_version:10,portfolio:p},'investmenttracker-depot.json');}
  async function backup(){const s=await transact(false,s=>{validateState(s);return clone(s);});download({schema_version:10,format:'investmenttracker-backup',portfolios:s.portfolios,allowance_ledgers:s.allowance_ledgers,gdp_datasets:s.gdp_datasets,audit:s.audit},'investmenttracker-sicherung-'+new Date().toISOString().slice(0,10)+'.json');return {message:'Sicherung zum Herunterladen bereitgestellt. Bitte die JSON-Datei aufbewahren.',path:''};}
  async function preview(b){
    let raw,version=1,history=[],warnings=[],allowance_ledgers=[],gdp_datasets=[];
    if(b.source==='template'){
      raw=[clone(globalThis.TRACKER_TEMPLATE)];warnings=['Nur Beispielwerte, keine Aussage über aktuell verfügbare Mittel.','Kurse: abgelesener Tabellenstand 17.11.2026, tatsächliches Kursdatum unbekannt.','Sonstiger Kauf über 10,10 EUR bleibt ungeklärt; Ergebnis und Rendite bleiben bis zur Zuordnung offen.'];
    }else{
      const f=b.file;if(!f||![1,2,3,4,5,6,7,8,9,10].includes(f.schema_version))D.fail('Investmenttracker-JSON (Version 1 bis 10) erwartet.');version=f.schema_version;
      if(version<10&&Object.hasOwn(f,'gdp_datasets'))D.fail('Eigene BIP-Stände benötigen Version 10.');
      if(f.portfolio&&Object.hasOwn(f,'gdp_datasets'))D.fail('Depotexport darf keinen globalen BIP-Katalog enthalten.');
      if(version===10&&!f.portfolio)gdp_datasets=GC.records(f.gdp_datasets).sort((a,b)=>a.sequence-b.sequence);
      if(version<6&&Object.hasOwn(f,'allowance_ledgers'))D.fail('Freistellungsregister benötigen Version 6.');
      if(f.portfolio&&Object.hasOwn(f,'allowance_ledgers'))D.fail('Depotexport darf keine globalen Register enthalten.');
      if(version>=6&&!f.portfolio){if(!Array.isArray(f.allowance_ledgers)||f.allowance_ledgers.length>100)D.fail('V6–V10-Sicherung benötigt Registerliste.');allowance_ledgers=f.allowance_ledgers.map(importedLedger);validateLedgerSet(allowance_ledgers); }
      if(f.portfolio)raw=[f.portfolio];else if(f.format==='investmenttracker-backup'&&Array.isArray(f.portfolios)&&f.portfolios.length<=100){raw=f.portfolios;history=Array.isArray(f.audit)?f.audit:[];}else D.fail('Ungültige Depotdatei oder Sicherung.');
      if(!raw.length)D.fail('Die Datei enthält kein Depot.');warnings=['Alle enthaltenen Depots werden separat angelegt. Bestehende Daten bleiben erhalten.'];
    }
    const portfolios=raw.map(p=>importedPortfolio(p,version));
    validateGDPImport(gdp_datasets,raw,allowance_ledgers);
    const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
    const digest=await hash({portfolios,allowance_ledgers,gdp_datasets});
    const legacy_digests=[];
    if(gdp_datasets.length===0){legacy_digests.push(await hash({portfolios,allowance_ledgers}));
    const legacyPortfolios=portfolios.map(oldPortfolio);
    if(portfolios.every(p=>p.payment_clarifications.length===0)){
    legacy_digests.push(await hash({portfolios:legacyPortfolios,allowance_ledgers}));
    if(portfolios.every(p=>p.instrument_metadata_snapshots.length===0)){
    legacy_digests.push(await hash({portfolios:legacyPortfolios.map(({instrument_metadata_snapshots,...p})=>p),allowance_ledgers}));
    if(portfolios.every(p=>p.planning_profiles.length===0)){
    const legacy=legacyPortfolios.map(({planning_profiles,instrument_metadata_snapshots,...p})=>p);
    legacy_digests.push(await hash({portfolios:legacy,allowance_ledgers}));
    if(allowance_ledgers.length===0){
    legacy_digests.push(await hash(legacyPortfolios.map(({planning_profiles,instrument_metadata_snapshots,...p})=>p)));
    if(portfolios.every(p=>p.company_snapshots.length===0)){
      legacy_digests.push(await hash(raw.map(p=>S.portfolio(p,version<4?version:4))));
      if(portfolios.every(p=>p.sector_snapshots.length===0)){
        legacy_digests.push(await hash(raw.map(p=>C.portfolio(p,version<3?version:3))));
        if(portfolios.every(p=>p.country_snapshots.length===0)){
          legacy_digests.push(await hash(raw.map(p=>R.portfolio(p,version===1?1:2))));
          if(portfolios.every(p=>p.region_snapshots.length===0))legacy_digests.push(await hash(raw.map(D.portfolio)));
        }
      }
    }
    }
    }
    }
    }
    }
    if(version<10)warnings.push('Diese Datei enthält keine eigenen globalen BIP-Stände.');
    if(version<9)warnings.push('Diese Datei enthält keine manuellen Zahlungsklärungen.');
    if(version<8)warnings.push('Diese Datei enthält keine zusätzlichen Produktmetadaten.');
    if(version<7)warnings.push('Diese Datei enthält keine gespeicherten Planungsprofile.');
    if(version<6)warnings.push('Diese Datei enthält keine globalen Freistellungsregister.');
    if(version<5)warnings.push('Diese Datei enthält keine Unternehmensstände. Bisherige Quellen bleiben erhalten.');
    if(version<4)warnings.push('Diese Datei enthält keine Sektorstände. Bisherige Quellen bleiben erhalten.');
    if(version===1)warnings.push('Version 1 enthält keine Regionaldaten.');
    if(version<3)warnings.push('Diese Datei enthält keine Länderstände. Bestehende Regionalstände bleiben erhalten.');
    const uncertain=portfolios.flatMap(p=>p.region_snapshots).filter(r=>!r.void&&r.effective_date===null).length;
    if(uncertain)warnings.push(uncertain+' Regionalstand/-stände ohne bekanntes Zusammensetzungsdatum.');
    const id=uid();if(previews.size>=20)previews.delete(previews.keys().next().value);previews.set(id,{portfolios,allowance_ledgers,gdp_datasets,digest,legacy_digests,history,time:Date.now()});
    const summary={name:portfolios.length===1?portfolios[0].name:portfolios.length+' Depots aus Sicherung',mode:portfolios.every(p=>p.mode==='example')?'example':'live'};
    for(const key of ['instruments','transactions','quotes','region_snapshots','country_snapshots','sector_snapshots','company_snapshots','planning_profiles','instrument_metadata_snapshots','payment_clarifications'])summary[key]=portfolios.reduce((n,p)=>n+p[key].length,0);
    const regional_coverage=portfolios.flatMap(p=>p.region_snapshots.map(r=>{
      const covered=Object.values(r.weights).reduce((sum,w)=>sum+D.dec(w),0n);
      return {portfolio:p.name,instrument_id:r.instrument_id,isin:p.instruments.find(i=>i.id===r.instrument_id).isin,
        snapshot_id:r.id,coverage:D.str(covered),unknown:D.str(D.dec('1')-covered),
        effective_date:r.effective_date,observed_date:r.observed_date,source:r.source,void:r.void};
    }));
    const country_coverage=portfolios.flatMap(p=>p.country_snapshots.map(r=>{
      const coverage=r.allocations.reduce((sum,a)=>sum+D.dec(a.weight),0n);
      return {portfolio:p.name,instrument_id:r.instrument_id,isin:p.instruments.find(i=>i.id===r.instrument_id).isin,snapshot_id:r.id,coverage:D.str(coverage),unknown:D.str(D.dec('1')-coverage),effective_date:r.effective_date,observed_date:r.observed_date,source:r.source,classification:r.classification,void:r.void};
    }));
    if(country_coverage.some(r=>r.effective_date===null||r.classification.effective_date===null))warnings.push('Länder- oder Klassifikationsdaten enthalten unbekannte Gültigkeitsdaten. Quellen prüfen.');
    const sector_coverage=portfolios.flatMap(p=>p.sector_snapshots.map(r=>({portfolio:p.name,instrument_id:r.instrument_id,isin:p.instruments.find(i=>i.id===r.instrument_id).isin,snapshot_id:r.id,...S.coverage(r.allocations),effective_date:r.effective_date,observed_date:r.observed_date,taxonomy:r.taxonomy,source:r.source,void:r.void})));
    const over=sector_coverage.filter(r=>!r.void&&r.status==='overreported').length;
    if(over)warnings.push(over+' nicht stornierte Sektorstände enthalten gemeldete Überdeckungen; Gewichte bleiben unverändert.');
    if(sector_coverage.some(r=>r.effective_date===null||r.taxonomy.effective_date===null))warnings.push('Sektor-/Taxonomiedaten enthalten unbekannte Gültigkeitsdaten. Quellen prüfen.');
    const company_coverage=portfolios.flatMap(p=>p.company_snapshots.map(r=>({portfolio:p.name,instrument_id:r.instrument_id,isin:p.instruments.find(i=>i.id===r.instrument_id).isin,snapshot_id:r.id,...U.coverage(r.allocations),
      unresolved_weight:D.str(r.allocations.filter(a=>a.company_id===null).reduce((sum,a)=>sum+D.dec(a.weight),0n)),
      effective_date:r.effective_date,observed_date:r.observed_date,disclosure_scope:r.disclosure_scope,mapping:r.mapping,source:r.source,void:r.void})));
    if(company_coverage.length)warnings.push('Unternehmensangaben sind gemeldete Teillisten und Namensgruppen laut Quelle, keine vollständigen oder verifizierten Emittentenbestände.');
    if(company_coverage.some(r=>!r.void&&r.status==='overreported'))warnings.push('Unternehmensstände enthalten Überdeckungen; Rohgewichte bleiben unverändert.');
    if(company_coverage.some(r=>r.effective_date===null||r.mapping.effective_date===null))warnings.push('Unternehmens-/Mappingdaten enthalten unbekannte Gültigkeitsdaten. Quellen prüfen.');
    if(company_coverage.some(r=>D.dec(r.unresolved_weight)>0n))warnings.push('Unternehmensstände enthalten ungeklärte Namenszuordnungen.');
    return {preview_id:id,metadata_sources:portfolios.flatMap(p=>p.instrument_metadata_snapshots.map(r=>({portfolio:p.name,isin:p.instruments.find(i=>i.id===r.instrument_id).isin,observed_date:r.observed_date,effective_date:r.effective_date,source:r.source,void:r.void}))),summary:{...summary,allowance_ledgers:allowance_ledgers.length,gdp_datasets:gdp_datasets.length},warnings:[...warnings,...(allowance_ledgers.length?['Register werden separat angelegt; keine Bestätigung persönlicher Steueransprüche.']:[])],allowance_ledgers,regional_coverage,country_coverage,sector_coverage,company_coverage};
  }

  // Validation only: never replace a stored object with an import-normalized copy.
  function validateState(s){
    if(!Number.isSafeInteger(s.revision)||s.revision<0||!Number.isSafeInteger(s.sequence)||s.sequence<0||!Array.isArray(s.portfolios)||!s.portfolios.length||!Array.isArray(s.audit))D.fail('Ungültiger gespeicherter Zustand.');
    for(const key of ['requests','imports'])if(!s[key]||typeof s[key]!=='object'||Array.isArray(s[key]))D.fail('Ungültige gespeicherte Kennungen.');
    const ids=new Set(),sequences=new Set();
    for(const p of s.portfolios){
      D.text(p.id,'Depot-ID',160);if(ids.has(p.id))D.fail('Doppelte Depot-ID.');ids.add(p.id);
      if(Object.hasOwn(p,'gdp_datasets'))D.fail('BIP-Katalog darf nicht innerhalb eines Depots liegen.');
      if(Object.hasOwn(p,'allowance_ledgers'))D.fail('Register dürfen nicht innerhalb eines Depots liegen.');
      U.portfolio(p,s.schema_version>=6?5:s.schema_version);
      if(s.schema_version>=7)profileRows(p.planning_profiles);
      else if(Object.hasOwn(p,'planning_profiles'))D.fail('Planungsprofile benötigen Version 7.');
      if(s.schema_version>=8)M.snapshots(p.instrument_metadata_snapshots,new Set(p.instruments.map(i=>i.id)));
      else if(Object.hasOwn(p,'instrument_metadata_snapshots'))D.fail('Produktmetadaten benötigen Version 8.');
      if(s.schema_version>=9)K.records(p.payment_clarifications,new Set(p.instruments.map(i=>i.id)),new Set(p.transactions.map(t=>t.id)));
      else if(Object.hasOwn(p,'payment_clarifications'))D.fail('Zahlungsklärungen benötigen Version 9.');
      for(const row of [...p.instruments,...p.transactions,...p.quotes,...(p.region_snapshots||[]),...(p.country_snapshots||[]),...(p.sector_snapshots||[]),...(p.company_snapshots||[]),...(p.planning_profiles||[]),...(p.instrument_metadata_snapshots||[]),...(p.payment_clarifications||[])]){
        D.text(row.id,'Datensatz-ID',160);
        if(ids.has(row.id)||!Number.isSafeInteger(row.sequence)||row.sequence<1||row.sequence>s.sequence||sequences.has(row.sequence))D.fail('Ungültige gespeicherte ID oder Sequenz.');
        ids.add(row.id);sequences.add(row.sequence);
      }
    }
    if(s.schema_version>=6)validateLedgerSet(s.allowance_ledgers,ids,sequences,s.sequence);
    else if(Object.hasOwn(s,'allowance_ledgers'))D.fail('Register benötigen Datenformat 6.');
    if(s.schema_version===10)validateGDPSet(s.gdp_datasets,ids,sequences,s.sequence);
    else if(Object.hasOwn(s,'gdp_datasets'))D.fail('BIP-Katalog benötigt Format 10.');
  }
  async function migrationStatus(){
    return transact(true,s=>{validateState(s);return {schema_version:s.schema_version,revision:s.revision,required:s.schema_version===9};},[9,10]);
  }
  async function migrationBackup(){
    const s=await transact(false,s=>{validateState(s);return clone(s);},[9,10]);
    download({schema_version:s.schema_version,format:'investmenttracker-backup',portfolios:s.portfolios,...(s.schema_version>=6?{allowance_ledgers:s.allowance_ledgers}:{}),...(s.schema_version>=10?{gdp_datasets:s.gdp_datasets}:{}),audit:s.audit,raw_state:s},'investmenttracker-vor-umstellung.json');
    const token=uid();backupTicket={token,revision:s.revision,signature:JSON.stringify(s)};
    return {revision:s.revision,backup_token:token,message:'Sicherung bereitgestellt. Den Download vor der Umstellung aufbewahren.'};
  }
  async function migrate(b){
    const result=await transact(true,s=>{
      validateState(s);
      if(s.schema_version===10)return {schema_version:10,revision:s.revision,already_migrated:true};
      if(b?.revision!==s.revision)D.fail('Daten wurden geändert. Neue Sicherung erstellen und erneut prüfen.',412);
      if(!backupTicket||b.backup_token!==backupTicket.token||b.acknowledged!==true)D.fail('Vorher Sicherung herunterladen und Aufbewahrung ausdrücklich bestätigen.');
      if(backupTicket.revision!==s.revision||backupTicket.signature!==JSON.stringify(s))D.fail('Bestand seit Sicherung verändert. Neue Sicherung erstellen.',412);
      s.gdp_datasets=[];
      s.schema_version=10;s.revision++;
      s.audit.push({created:new Date().toISOString(),action:'schema_migration',from:9,to:10});
      validateState(s);
      return {schema_version:10,revision:s.revision};
    },[9,10]);
    backupTicket=null;return result;
  }

  async function api(path,b){
    if(path==='gdp/catalog'){
      if(!b||Object.keys(b).length!==1||!Object.hasOwn(b,'as_of'))D.fail('BIP-Stichtag ausdrücklich angeben.');return transact(false,s=>{validateState(s);return {revision:s.revision,records:clone(s.gdp_datasets),summary:GC.catalog(s.gdp_datasets,b.as_of)};});
    }
    if(path==='gdp/compare'){
      if(!b||Object.keys(b).length!==4||!['portfolio_id','dataset_id','as_of','options'].every(k=>Object.hasOwn(b,k)))D.fail('Depot, BIP-Stand, Stichtag und Vergleichsbasis ausdrücklich angeben.');return transact(false,s=>{validateState(s);const p=s.portfolios.find(p=>p.id===b.portfolio_id),r=s.gdp_datasets.find(r=>r.id===b.dataset_id);if(!p||!r)D.fail('Depot oder BIP-Stand nicht gefunden.',404);return {revision:s.revision,...GC.compare(p,r,b.as_of,b.options)};});
    }
    if(path==='gdp/preview'){
      if(!b||Object.keys(b).length!==2||!['payload','as_of'].every(k=>Object.hasOwn(b,k)))D.fail('Vollständigen BIP-Stand und Stichtag angeben.');const asOf=D.day(b.as_of),value=GC.payload(b.payload),s=await transact(false,s=>{validateState(s);return clone(s);}),id=uid(),duplicate=s.gdp_datasets.some(r=>!r.void&&JSON.stringify(gdpValue(r))===JSON.stringify(value));if(gdpPreviews.size>=20)gdpPreviews.delete(gdpPreviews.keys().next().value);gdpPreviews.set(id,{payload:clone(value),revision:s.revision,time:Date.now()});return {preview_id:id,revision:s.revision,payload:clone(value),summary:GC.catalog([{id:'preview-'+id,sequence:s.sequence+1,void:false,...value}],asOf)[0],duplicate,can_commit:!duplicate};
    }
    if(path==='gdp/commit'){
      const item=gdpPreviews.get(b?.preview_id);if(!item||Date.now()-item.time>1800000)D.fail('BIP-Vorschau abgelaufen. Bitte erneut prüfen.');if(b.revision!==item.revision)D.fail('BIP-Vorschau erneut prüfen.',412);return command({key:b.key,revision:item.revision,action:'gdp_dataset_add',data:{payload:item.payload}});
    }
    if(path==='clarifications/preview'){
      if(!b||Object.keys(b).length!==4||!['portfolio_id','decision','valuation_date','knowledge_date'].every(k=>Object.hasOwn(b,k)))D.fail('Klärung mit beiden ausdrücklichen Stichtagen erwartet.');
      const s=await transact(false,s=>{validateState(s);return clone(s);}),p=s.portfolios.find(p=>p.id===b.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
      const decision=boundDecision(p,b.decision),options={valuation_date:D.day(b.valuation_date),knowledge_date:D.day(b.knowledge_date)},id=uid();
      const before=K.calculate(p,options),after=K.calculate({...p,payment_clarifications:[...p.payment_clarifications,{...decision,id:'preview-'+id,sequence:s.sequence+1,void:false}]},options);
      if(before.overview.cash!==after.overview.cash)D.fail('Klärung verändert Cash.');
      if(clarificationPreviews.size>=20)clarificationPreviews.delete(clarificationPreviews.keys().next().value);clarificationPreviews.set(id,{portfolio_id:p.id,decision:clone(decision),revision:s.revision,time:Date.now()});
      return {preview_id:id,revision:s.revision,portfolio_id:p.id,source_transaction:clone(p.transactions.find(t=>t.id===decision.transaction_id)),decision,before:clarificationSummary(before),after:clarificationSummary(after)};
    }
    if(path==='clarifications/commit'){
      const item=clarificationPreviews.get(b.preview_id);if(!item||Date.now()-item.time>1800000)D.fail('Klärungsvorschau abgelaufen. Bitte erneut prüfen.');if(b.revision!==item.revision)D.fail('Klärungsvorschau erneut prüfen.',412);
      return command({key:b.key,revision:item.revision,action:'clarification_add',data:{portfolio_id:item.portfolio_id,decision:item.decision}});
    }
    if(path==='clarifications/calculate'){
      if(!b||Object.keys(b).length!==3||!['portfolio_id','valuation_date','knowledge_date'].every(k=>Object.hasOwn(b,k)))D.fail('Beide Klärungsstichtage ausdrücklich angeben.');
      const s=await transact(false,s=>{validateState(s);return clone(s);}),p=s.portfolios.find(p=>p.id===b.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
      return {revision:s.revision,portfolio_id:p.id,...clarificationSummary(K.calculate(p,{valuation_date:b.valuation_date,knowledge_date:b.knowledge_date}))};
    }
    if(path==='metadata/preview'){
      if(!b||Object.keys(b).length!==3||!['portfolio_id','instrument_ids','as_of'].every(k=>Object.hasOwn(b,k))||!Array.isArray(b.instrument_ids)||!b.instrument_ids.length||b.instrument_ids.length>1000||new Set(b.instrument_ids).size!==b.instrument_ids.length)D.fail('Wertpapiere ausdrücklich und eindeutig auswählen.');
      const asOf=D.day(b.as_of),s=await transact(false,s=>{validateState(s);return clone(s);}),p=s.portfolios.find(p=>p.id===b.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
      const fixture=globalThis.TRACKER_INSTRUMENT_METADATA?.records;if(!Array.isArray(fixture))D.fail('Metadatenvorlage fehlt.');const rows=[],matches=[];
      for(const iid of b.instrument_ids){
        const i=p.instruments.find(i=>i.id===iid);if(!i)D.fail('Unbekanntes ausgewähltes Wertpapier.');
        const candidates=fixture.filter(r=>r.instrument_id===i.isin);if(candidates.length>1)D.fail('Mehrdeutige Metadaten-ISIN.');
        const existing=p.instrument_metadata_snapshots.some(r=>r.instrument_id===i.id),status=existing?'existing':candidates.length?'new':'missing';let value=null,notKnownAtDate=false;
        if(candidates.length){
          if(candidates[0].void!==false)D.fail('Stornierte Metadatenvorlage nicht verwendbar.');
          value=metadataRow(p,{instrument_id:i.id,...metadataValue(candidates[0])},s.sequence+rows.length+1);notKnownAtDate=value.observed_date>asOf;
          if(status==='new')rows.push({instrument_id:i.id,...metadataValue(value)});
        }
        matches.push({instrument_id:i.id,name:i.name,isin:i.isin,status,not_known_at_date:notKnownAtDate,payload:value?metadataValue(value):null});
      }
      const id=uid();if(metadataPreviews.size>=20)metadataPreviews.delete(metadataPreviews.keys().next().value);metadataPreviews.set(id,{portfolio_id:p.id,rows:clone(rows),revision:s.revision,time:Date.now()});
      return {preview_id:id,revision:s.revision,portfolio_id:p.id,name:p.name,mode:p.mode,as_of:asOf,added:rows.length,can_commit:rows.length>0,matches,warnings:['Nur gemeldete Produktangaben aus dem alten Tabellenstand, keine extern geprüften aktuellen Produkteigenschaften.','TER-Einheit, Volumenwährung und AI-Ticker bleiben ausdrücklich ungeklärt. Bestehende Historien werden nicht überschrieben.']};
    }
    if(path==='metadata/commit'){
      const item=metadataPreviews.get(b.preview_id);if(!item||Date.now()-item.time>1800000)D.fail('Metadatenvorschau abgelaufen. Bitte erneut prüfen.');if(b.revision!==item.revision)D.fail('Metadatenvorschau erneut prüfen.',412);
      return command({key:b.key,revision:item.revision,action:'metadata_enrich',data:{portfolio_id:item.portfolio_id,rows:item.rows}});
    }
    if(path==='metadata/summary'){
      const s=await transact(false,s=>{validateState(s);return clone(s);}),p=s.portfolios.find(p=>p.id===b.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);return M.summary(p,b.as_of);
    }
    if(path==='quotes/preview'){
      const s=await transact(false,s=>{validateState(s);return clone(s);}),p=s.portfolios.find(p=>p.id===b.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
      const plan=Q.plan(p,b.rows,{reference_day:b.reference_day,valuation_date:b.valuation_date}),id=uid();
      if(quotePreviews.size>=20)quotePreviews.delete(quotePreviews.keys().next().value);
      quotePreviews.set(id,{portfolio_id:p.id,rows:clone(plan.rows.map(r=>r.quote)),reference_day:plan.reference_day,valuation_date:plan.valuation_date,revision:s.revision,time:Date.now()});
      return {preview_id:id,revision:s.revision,portfolio_id:p.id,...plan};
    }
    if(path==='quotes/commit'){
      const item=quotePreviews.get(b.preview_id);if(!item||Date.now()-item.time>1800000)D.fail('Kursvorschau abgelaufen. Bitte erneut prüfen.');
      if(b.revision!==item.revision)D.fail('Kursvorschau verändert. Bitte erneut prüfen.',412);
      const {time,revision,...data}=item;return command({key:b.key,revision,action:'quote_batch_add',data});
    }
    if(path==='allowances/preview'){
      const state=await transact(false,s=>{validateState(s);return clone(s);}),fixture=globalThis.TRACKER_ALLOWANCES;
      if(!fixture||!Array.isArray(fixture.records)||!Array.isArray(fixture.years))D.fail('Freistellungsvorlage fehlt.');
      const institutions=[...new Map(fixture.records.map(r=>[r.institution_id,{id:r.institution_id,label:r.institution_label}])).values()];
      let seq=0;const ledger=A.ledger({id:'allowance-template',name:'Freistellungsvorlage · Beispiel',mode:'example',institutions,
        snapshots:fixture.records.map(r=>({id:'template-s'+seq,sequence:++seq,institution_id:r.institution_id,year:r.year,currency:r.currency,allocated_amount:r.allocated_amount,used_amount:r.used_amount,used_origin:r.used_origin,observed_date:r.observed_date,used_as_of:null,source:r.source,void:false})),
        budgets:fixture.years.map(r=>({id:'template-b'+seq,sequence:++seq,year:r.year,currency:'EUR',amount:r.source_hardcoded_budget,observed_date:fixture.records[0].observed_date,source:fixture.records[0].source,void:false}))});
      const digest=await hashValue(ledger),id=uid();if(allowancePreviews.size>=20)allowancePreviews.delete(allowancePreviews.keys().next().value);allowancePreviews.set(id,{ledger,digest,revision:state.revision,time:Date.now()});
      return {preview_id:id,revision:state.revision,already_imported:Object.hasOwn(state.imports,digest)||state.allowance_ledgers.some(l=>l.mode==='example'&&l.name===ledger.name),ledger,warnings:['Ausschließlich Beispielregister, keine persönlichen Steuerangaben oder bestätigten Ansprüche.','Fehlende Verbrauchswerte bleiben unbekannt; 2.000 EUR sind nur der feste Quellrechenwert.']};
    }
    if(path==='allowances/commit'){
      const item=allowancePreviews.get(b.preview_id);if(!item||Date.now()-item.time>1800000)D.fail('Registervorschau abgelaufen.');if(b.revision!==item.revision)D.fail('Registervorschau erneut prüfen.',412);
      return command({key:b.key,revision:item.revision,action:'allowance_import',data:{ledger:item.ledger,digest:item.digest}});
    }
    if(path==='allowances/summary'){
      const s=await transact(false,s=>{validateState(s);return clone(s);}),l=s.allowance_ledgers.find(l=>l.id===b.ledger_id);if(!l)D.fail('Register nicht gefunden.',404);return A.summary(l,b.year,b.as_of);
    }
    if(path==='companies/preview'){
      const s=await transact(false,clone),p=s.portfolios.find(p=>p.id===b.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
      const fixture=globalThis.TRACKER_COMPANIES?.records;if(!Array.isArray(fixture))D.fail('Unternehmensvorlage fehlt.');
      const rows=[],matches=[];
      for(const i of p.instruments){
        const candidates=fixture.filter(f=>f.isin===i.isin);if(candidates.length>1)D.fail('Mehrdeutige Vorlagen-ISIN.');
        const f=candidates[0],existing=p.company_snapshots.some(r=>r.instrument_id===i.id),status=existing?'existing':f?'new':'missing';let coverage=null;
        if(f){
          const allocations=f.allocations.map(({holding_id,reported_name,weight,company_id,company_label})=>({holding_id,reported_name,weight,company_id,company_label}));
          const row=U.snapshot({id:'preview',instrument_id:i.id,sequence:1,effective_date:f.effective_date,observed_date:f.observed_date,disclosure_scope:f.disclosure_scope,mapping:f.mapping,allocations,source:f.source,void:false},new Set([i.id]));
          coverage=U.coverage(row.allocations);if(status==='new')rows.push(row);
        }
        matches.push({name:i.name,isin:i.isin,status,weight_sum:coverage?.weight_sum||null,disclosure_status:coverage?.status||null,unreported_weight:coverage?.unreported_weight||null,overreported_weight:coverage?.overreported_weight||null,source:f?.source||null,mapping:f?.mapping||null,disclosure_scope:f?.disclosure_scope||null,effective_date:f?.effective_date||null,observed_date:f?.observed_date||null});
      }
      const id=uid();if(companyPreviews.size>=20)companyPreviews.delete(companyPreviews.keys().next().value);
      companyPreviews.set(id,{portfolio_id:p.id,rows,revision:s.revision,time:Date.now()});
      return {preview_id:id,revision:s.revision,name:p.name,mode:p.mode,matches,added:rows.length};
    }
    if(path==='companies/commit'){
      const item=companyPreviews.get(b.preview_id);if(!item||Date.now()-item.time>1800000)D.fail('Unternehmensvorschau abgelaufen. Bitte erneut prüfen.');
      if(b.revision!==item.revision)D.fail('Ansicht verändert. Unternehmensvorschau erneut öffnen.',412);
      return command({key:b.key,revision:item.revision,action:'company_enrich',data:{portfolio_id:item.portfolio_id,rows:item.rows}});
    }
    if(path==='sectors/preview'){
      const s=await transact(false,clone),p=s.portfolios.find(p=>p.id===b.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
      const fixture=globalThis.TRACKER_SECTORS?.records;if(!Array.isArray(fixture))D.fail('Sektorvorlage fehlt.');
      const rows=[],matches=[];
      for(const i of p.instruments){
        const candidates=fixture.filter(f=>f.isin===i.isin);if(candidates.length>1)D.fail('Mehrdeutige Vorlagen-ISIN.');
        const f=candidates[0],existing=p.sector_snapshots.some(r=>r.instrument_id===i.id),status=existing?'existing':f?'new':'missing';let coverage=null;
        if(f){
          const allocations=f.allocations.map(({sector_id,label,weight})=>({sector_id,label,weight}));
          const row=S.snapshot({id:'preview',instrument_id:i.id,sequence:1,effective_date:f.effective_date,observed_date:f.observed_date,taxonomy:f.taxonomy,allocations,source:f.source,void:false},new Set([i.id]));
          coverage=S.coverage(row.allocations);if(status==='new')rows.push(row);
        }
        matches.push({name:i.name,isin:i.isin,status,weight_sum:coverage?.weight_sum||null,disclosure_status:coverage?.status||null,unreported_weight:coverage?.unreported_weight||null,overreported_weight:coverage?.overreported_weight||null,source:f?.source||null,taxonomy:f?.taxonomy||null,effective_date:f?.effective_date||null,observed_date:f?.observed_date||null});
      }
      const id=uid();if(sectorPreviews.size>=20)sectorPreviews.delete(sectorPreviews.keys().next().value);
      sectorPreviews.set(id,{portfolio_id:p.id,rows,revision:s.revision,time:Date.now()});
      return {preview_id:id,revision:s.revision,name:p.name,mode:p.mode,matches,added:rows.length};
    }
    if(path==='sectors/commit'){
      const item=sectorPreviews.get(b.preview_id);if(!item||Date.now()-item.time>1800000)D.fail('Sektorvorschau abgelaufen. Bitte erneut prüfen.');
      if(b.revision!==item.revision)D.fail('Ansicht verändert. Sektorvorschau erneut öffnen.',412);
      return command({key:b.key,revision:item.revision,action:'sector_enrich',data:{portfolio_id:item.portfolio_id,rows:item.rows}});
    }
    if(path==='countries/preview'){
      const s=await transact(false,clone),p=s.portfolios.find(p=>p.id===b.portfolio_id);if(!p)D.fail('Depot nicht gefunden.',404);
      const fixture=globalThis.TRACKER_COUNTRIES?.records;if(!Array.isArray(fixture))D.fail('Ländervorlage fehlt.');
      const rows=[],matches=[];
      for(const i of p.instruments){
        const candidates=fixture.filter(f=>f.isin===i.isin);if(candidates.length>1)D.fail('Mehrdeutige Vorlagen-ISIN.');
        const f=candidates[0],existing=p.country_snapshots.some(r=>r.instrument_id===i.id),status=existing?'existing':f?'new':'missing';let coverage=null;
        if(f){
          // Development-only references are intentionally stripped by this adapter.
          const allocations=f.allocations.map(({country_id,label,weight,region,market_class})=>({country_id,label,weight,region,market_class}));
          const row=C.snapshot({id:'preview',instrument_id:i.id,sequence:1,effective_date:f.effective_date,observed_date:f.observed_date,allocations,classification:f.classification,source:f.source,void:false},new Set([i.id]));
          coverage=D.str(row.allocations.reduce((sum,a)=>sum+D.dec(a.weight),0n));if(status==='new')rows.push(row);
        }
        matches.push({name:i.name,isin:i.isin,status,coverage,source:f?.source||null,classification:f?.classification||null,observed_date:f?.observed_date||null});
      }
      const id=uid();if(countryPreviews.size>=20)countryPreviews.delete(countryPreviews.keys().next().value);
      countryPreviews.set(id,{portfolio_id:p.id,rows,revision:s.revision,time:Date.now()});
      return {preview_id:id,revision:s.revision,name:p.name,mode:p.mode,matches,added:rows.length};
    }
    if(path==='countries/commit'){
      const item=countryPreviews.get(b.preview_id);if(!item||Date.now()-item.time>1800000)D.fail('Ländervorschau abgelaufen. Bitte erneut prüfen.');
      if(b.revision!==item.revision)D.fail('Ansicht verändert. Ländervorschau erneut öffnen.',412);
      return command({key:b.key,revision:item.revision,action:'country_enrich',data:{portfolio_id:item.portfolio_id,rows:item.rows}});
    }
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
    if(path==='sale-scenario/calculate'){
      if(!b||Object.keys(b).length!==2||!Object.hasOwn(b,'portfolio_id')||!Object.hasOwn(b,'options'))D.fail('Depot und Simulationsannahmen ausdrücklich angeben.');
      return transact(false,s=>{validateState(s);const p=s.portfolios.find(p=>p.id===b.portfolio_id);if(!p)D.fail('Depot nicht mehr vorhanden.',404);if(!globalThis.TrackerSaleScenario)D.fail('Verkaufssimulationsmodell nicht geladen.');return {...TrackerSaleScenario.calculate(p,b.options),revision:s.revision};});
    }
    if(path.startsWith('state?')){
      await ready();const s=await transact(false,clone), asOf=new URLSearchParams(path.split('?')[1]).get('as_of');
      for(const p of s.portfolios){p.overview=D.overview(p,asOf);p.distribution=R.distribution(p,asOf);p.country_distribution=C.distribution(p,asOf);p.sector_distribution=S.distribution(p,asOf);p.company_distribution=U.distribution(p,asOf);p.instrument_metadata=M.summary(p,asOf);for(const t of p.transactions){t.cash_effect=D.str(D.cash(t));t.charges=D.str(D.dec(t.fee)+D.dec(t.tax));}}
      return {schema_version:10,revision:s.revision,portfolios:s.portfolios,allowance_ledgers:s.allowance_ledgers,gdp_datasets:s.gdp_datasets,data_path:'In diesem Browserprofil gespeichert (IndexedDB). Die HTML-Datei enthält die Anwendung, nicht deine eingegebenen Daten. Vor Browserwechsel oder Löschen der Browserdaten eine JSON-Sicherung herunterladen.'};
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
