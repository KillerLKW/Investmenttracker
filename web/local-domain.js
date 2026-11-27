/* Exact cash/quantity arithmetic without a server. 24 decimal places cover
   products of the accepted 12-place input values; BigInt never rounds sums. */
globalThis.TrackerDomain = (() => {
  const SCALE = 10n ** 24n;
  const types = new Set(['deposit','withdrawal','buy','sell','dividend','interest','fee','tax','refund','unclassified_out']);
  const positive = new Set(['deposit','sell','dividend','interest','refund']);
  function fail(message, status=422) { const e=new Error(message); e.status=status; throw e; }
  function dec(value) {
    const s=String(value), negative=s.startsWith('-'), [a,b='']=(negative?s.slice(1):s).split('.');
    if(!/^\d+$/.test(a)||!/^\d{0,24}$/.test(b)) fail('Ungültiger interner Dezimalwert.');
    return (BigInt(a)*SCALE+BigInt(b.padEnd(24,'0')))*(negative?-1n:1n);
  }
  function str(value) {
    const sign=value<0n?'-':'';if(value<0n)value=-value;
    const fraction=(value%SCALE).toString().padStart(24,'0').replace(/0+$/,'');
    return sign+(value/SCALE).toString()+(fraction?'.'+fraction:'');
  }
  function number(value,label,zero=true) {
    if(typeof value!=='string'||!/^\d{1,15}(\.\d{1,12})?$/.test(value)) fail(label+': positive Zahl mit höchstens 12 Nachkommastellen erwartet.');
    const n=dec(value);if(!zero&&n===0n)fail(label+' muss größer als null sein.');return str(n);
  }
  function text(v,label,max=160) {if(typeof v!=='string'||!v.trim()||v.length>max)fail(label+': gültiger Text erforderlich.');return v.trim();}
  function day(v) {
    if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('Ungültiges Datum.');
    const d=new Date(v+'T00:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v||v<'1900-01-01'||v>'2200-12-31')fail('Bitte ein gültiges Datum zwischen 1900 und 2200 angeben.');return v;
  }
  function instrument(data) {
    if(!data||typeof data!=='object')fail('Ungültiges Wertpapier.');
    const isin=text(data.isin,'ISIN',12).toUpperCase();
    if(!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin))fail('Ungültiges ISIN-Format.');
    const digits=[...isin].map(c=>/[A-Z]/.test(c)?parseInt(c,36).toString():c).join('');
    const sum=[...digits].reverse().reduce((s,v,i)=>{const n=Number(v)*(i%2?2:1);return s+Math.floor(n/10)+n%10;},0);
    if(sum%10)fail('Die Prüfziffer der ISIN stimmt nicht.');
    if(data.currency&&data.currency!=='EUR')fail('Diese Version unterstützt nur EUR.');
    return {name:text(data.name,'Name'),isin,category:text(data.category||'Ohne Zuordnung','Strategie',60),currency:'EUR'};
  }
  function transaction(data,ids) {
    if(!data||typeof data!=='object'||!types.has(data.type))fail('Unbekannter Buchungstyp.');
    const iid=data.instrument_id||null, trade=['buy','sell'].includes(data.type);
    if(iid&&!ids.has(iid))fail('Wertpapier gehört nicht zu diesem Depot.');
    if(trade&&!iid)fail('Für Kauf/Verkauf ein Wertpapier wählen.');
    const t={type:data.type,date:day(data.date),instrument_id:iid,amount:number(data.amount,'Betrag',false),
      quantity:number(data.quantity??'0','Stückzahl',!trade),fee:number(data.fee??'0','Gebühr'),tax:number(data.tax??'0','Steuer'),note:String(data.note||'').slice(0,500),void:false};
    if(!trade&&dec(t.quantity)!==0n)fail('Nur Käufe und Verkäufe dürfen Stückzahlen enthalten.');
    if(!['buy','sell','dividend','interest'].includes(t.type)&&(dec(t.fee)||dec(t.tax)))fail('Gebühren und Steuern hier separat erfassen.');
    return t;
  }
  function cash(t) {return dec(t.amount)*(positive.has(t.type)?1n:-1n)-dec(t.fee)-dec(t.tax);}
  function holdings(rows) {
    const balances=new Map();
    const sorted=rows.filter(t=>!t.void).sort((a,b)=>a.date.localeCompare(b.date)||Number(a.type==='sell')-Number(b.type==='sell'));
    for(const t of sorted)if(['buy','sell'].includes(t.type)){
      const q=(balances.get(t.instrument_id)||0n)+dec(t.quantity)*(t.type==='buy'?1n:-1n);
      if(q<0n)fail('Verkauf am '+t.date+' würde einen negativen Bestand erzeugen.');balances.set(t.instrument_id,q);
    }
    return balances;
  }
  function xirr(flows) {
    const combined=new Map();for(const [d,v] of flows)combined.set(d,(combined.get(d)||0n)+v);
    const rows=[...combined].filter(([,v])=>v!==0n).sort((a,b)=>a[0].localeCompare(b[0]));
    if(rows.length<2)return [null,'Für eine Jahresrendite werden Zahlungen an unterschiedlichen Tagen benötigt.'];
    const signs=rows.map(([,v])=>v>0n);let changes=0;for(let i=1;i<signs.length;i++)if(signs[i]!==signs[i-1])changes++;
    if(signs[0]||!signs.at(-1)||changes!==1)return [null,'Für diese Zahlungsfolge wird noch keine eindeutig abgesicherte XIRR ausgegeben.'];
    const origin=Date.parse(rows[0][0]),times=rows.map(([d])=>(Date.parse(d)-origin)/86400000/365);
    // Only the numerical root finder uses Number; booked amounts remain exact.
    const amounts=rows.map(([,v])=>Number(str(v))),norm=Math.max(...amounts.map(Math.abs));
    const npv=x=>amounts.reduce((sum,v,i)=>sum+v/norm*Math.exp(-x*times[i]),0);
    let lo=-20,hi=20;
    if(!Number.isFinite(npv(lo))||!Number.isFinite(npv(hi))||npv(lo)*npv(hi)>=0)return [null,'Keine abgesicherte Renditelösung im unterstützten Wertebereich.'];
    for(let i=0;i<150;i++){const mid=(lo+hi)/2;if(npv(mid)>0)lo=mid;else hi=mid;}
    const rate=Math.expm1((lo+hi)/2);
    return Number.isFinite(rate)?[String(rate),null]:[null,'Rendite nicht berechenbar.'];
  }
  function overview(p,asOf) {
    day(asOf);const active=p.transactions.filter(t=>!t.void&&t.date<=asOf), warnings=[];
    let balance=0n,contributions=0n,invested=0n;
    for(const t of active){balance+=cash(t);if(['deposit','withdrawal'].includes(t.type))contributions+=dec(t.amount)*(t.type==='deposit'?1n:-1n);}
    const quantities=holdings(active);
    const positions=p.instruments.map(i=>{
      const q=quantities.get(i.id)||0n;
      const quote=p.quotes.filter(k=>k.instrument_id===i.id&&k.date<=asOf).sort((a,b)=>b.date.localeCompare(a.date)||b.sequence-a.sequence)[0]||null;
      const value=quote?q*dec(quote.price)/SCALE:(q===0n?0n:null);
      if(value!==null)invested+=value;
      if(q&&!quote)warnings.push(i.name+': Kurs zum Stichtag fehlt.');
      else if(q&&(Date.parse(asOf)-Date.parse(quote.date))/86400000>7)warnings.push(i.name+': Kurs älter als sieben Tage.');
      return {...i,quantity:str(q),quote,value:value===null?null:str(value)};
    });
    const total=positions.every(p=>p.value!==null)?balance+invested:null;
    if(balance<0n)warnings.push('Cash-Bestand negativ. Fehlende Einzahlungen oder Buchungen prüfen.');
    const future=p.transactions.filter(t=>!t.void&&t.date>asOf).length;
    if(future)warnings.push(future+' Buchung(en) liegen nach dem Stichtag und sind nicht eingerechnet.');
    const unresolved=active.some(t=>t.type==='unclassified_out');
    if(unresolved)warnings.push('Nicht zugeordneter Cash-Abgang: mögliche fehlende Anlage prüfen. Ergebnis und Rendite bleiben bis zur Klärung offen.');
    const flows=active.filter(t=>['deposit','withdrawal'].includes(t.type)).map(t=>[t.date,dec(t.amount)*(t.type==='deposit'?-1n:1n)]);
    const [rate,note]=total!==null&&!unresolved?xirr([...flows,[asOf,total]]):[null,'Bewertung oder Buchungszuordnung unvollständig.'];
    return {as_of:asOf,cash:str(balance),invested:total===null?null:str(invested),known_invested:str(invested),total:total===null?null:str(total),
      contributions:str(contributions),gain:total!==null&&!unresolved?str(total-contributions):null,positions,warnings,xirr:rate,xirr_note:note};
  }
  function portfolio(raw) {
    if(!raw||typeof raw!=='object')fail('Ungültiges Depotformat.');
    if(!['live','example'].includes(raw.mode))fail('Depotmodus fehlt.');
    for(const key of ['instruments','transactions','quotes'])if(!Array.isArray(raw[key])||raw[key].length>50000)fail('Ungültige Liste: '+key);
    const p={name:text(raw.name,'Depotname',80),mode:raw.mode,instruments:[],transactions:[],quotes:[]}, ids=new Set(),isins=new Set();
    for(const i of raw.instruments){const normalized=instrument(i);if(typeof i.id!=='string'||!i.id||ids.has(i.id)||isins.has(normalized.isin))fail('Doppelte oder fehlende Wertpapierkennung.');ids.add(i.id);isins.add(normalized.isin);p.instruments.push({...normalized,id:i.id});}
    for(const t of raw.transactions){const normalized=transaction(t,ids);if(t.void!==undefined&&typeof t.void!=='boolean')fail('Ungültiger Stornostatus.');p.transactions.push({...normalized,void:t.void||false,void_reason:String(t.void_reason||'').slice(0,500)});}
    holdings(p.transactions);
    for(const q of raw.quotes){if(!q||!ids.has(q.instrument_id))fail('Kurs verweist auf unbekanntes Wertpapier.');if(q.currency&&q.currency!=='EUR')fail('Nur EUR-Kurse unterstützt.');p.quotes.push({instrument_id:q.instrument_id,price:number(q.price,'Kurs',false),date:day(q.date),source:text(q.source,'Kursquelle',120),currency:'EUR'});}
    return p;
  }
  return {fail,dec,str,number,text,day,instrument,transaction,cash,holdings,xirr,overview,portfolio};
})();
if(typeof module!=='undefined')module.exports=globalThis.TrackerDomain;
