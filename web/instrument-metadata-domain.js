/* Isolated descriptive metadata model. No storage, clock, network or financial changes. */
(function(){
 const D=typeof module!=='undefined'?require('./local-domain.js'):TrackerDomain;
 const W=10n**24n;
 const maxSerial=(Date.parse('2200-12-31T00:00:00Z')-Date.UTC(1899,11,30))/86400000;
 const object=r=>r!==null&&typeof r==='object'&&!Array.isArray(r);
 function fields(r,required,label,optional=[]){if(!object(r)||required.some(k=>!Object.hasOwn(r,k))||Object.keys(r).some(k=>!required.includes(k)&&!optional.includes(k)))D.fail(label+': fehlende oder unbekannte Felder.');}
 const text=(v,label,max=240)=>v===null?null:D.text(v,label,max);
 const day=v=>v===null?null:D.day(v);
 function url(v){if(v===null)return null;const value=D.text(v,'Quellenlink',2000);let u;try{u=new URL(value);}catch{D.fail('Ungültiger Quellenlink.');}if(u.protocol!=='https:'||u.username||u.password)D.fail('Nur HTTPS-Links ohne Zugangsdaten erlaubt.');return value;}
 function source(r){
  fields(r,['kind','label','url','sheet','range','snapshot_sha256'],'Metadatenquelle');
  if(!['manual','spreadsheet_snapshot'].includes(r.kind))D.fail('Unbekannte Metadatenquelle.');
  const out={kind:r.kind,label:D.text(r.label,'Quellenbezeichnung',240),url:url(r.url),sheet:text(r.sheet,'Quellenblatt',160),range:text(r.range,'Quellenbereich',160),snapshot_sha256:r.snapshot_sha256};
  if(out.snapshot_sha256!==null&&(typeof out.snapshot_sha256!=='string'||!/^[a-f0-9]{64}$/.test(out.snapshot_sha256)))D.fail('Ungültiger Snapshot-Hash.');
  if(r.kind==='spreadsheet_snapshot'&&[out.sheet,out.range,out.snapshot_sha256].some(v=>v===null))D.fail('Tabellenquelle benötigt Blatt, Bereich und Hash.');
  return out;
 }
 function terRatio(number,unit){
  const value=D.dec(D.number(number,'TER-Rohwert'));
  if(!['percent','ratio'].includes(unit))D.fail('TER-Einheit ausdrücklich wählen.');
  if(value>(unit==='percent'?100n*W:W))D.fail('TER überschreitet 100 %.');
  return D.str(unit==='percent'?value/100n:value);
 }
 function ter(r){
  if(r===null)return null;fields(r,['reported_number','unit','annual_ratio'],'TER');const reported_number=D.number(r.reported_number,'TER-Rohwert');
  if(r.unit===null){if(r.annual_ratio!==null)D.fail('Unbekannte TER-Einheit erlaubt keine normalisierte Quote.');return {reported_number,unit:null,annual_ratio:null};}
  const ratio=terRatio(reported_number,r.unit);
  if(typeof r.annual_ratio!=='string'||!/^\d{1,15}(\.\d{1,14})?$/.test(r.annual_ratio)||D.dec(r.annual_ratio)!==D.dec(ratio))D.fail('TER-Rohwert, Einheit und normalisierte Quote widersprechen sich.');
  return {reported_number,unit:r.unit,annual_ratio:ratio};
 }
 function launch(r){
  if(r===null)return null;fields(r,['reported_serial','interpreted_date','interpretation','externally_verified'],'Auflagedatum');
  if(typeof r.externally_verified!=='boolean')D.fail('Verifikationsangabe fehlt.');const date=D.day(r.interpreted_date);
  if(r.interpretation==='sheets_serial_1899-12-30'){
   if(typeof r.reported_serial!=='string'||!/^\d{1,6}$/.test(r.reported_serial))D.fail('Ungültige Auflageserie.');
   const n=Number(r.reported_serial);if(n<2||n>maxSerial||new Date(Date.UTC(1899,11,30)+n*86400000).toISOString().slice(0,10)!==date)D.fail('Auflageserie und Datumsinterpretation widersprechen sich.');
  }else if(r.interpretation!=='reported_date'||r.reported_serial!==null)D.fail('Unbekannte Datumsinterpretation.');
  return {reported_serial:r.reported_serial,interpreted_date:date,interpretation:r.interpretation,externally_verified:r.externally_verified};
 }
 function volume(r,observed){
  if(r===null)return null;fields(r,['reported_text','amount','currency','effective_date'],'Fondsvolumen');
  const amount=r.amount===null?null:D.number(r.amount,'Fondsvolumen'),effective_date=day(r.effective_date);
  if((amount===null)!==(r.currency===null))D.fail('Volumenbetrag und Währung gemeinsam angeben oder unbekannt lassen.');
  if(r.currency!==null&&(typeof r.currency!=='string'||!/^[A-Z]{3}$/.test(r.currency)))D.fail('Währung als dreistelligen Großbuchstabencode angeben.');
  if(effective_date&&effective_date>observed)D.fail('Volumenstichtag liegt nach Beobachtung.');
  return {reported_text:text(r.reported_text,'Volumenangabe'),amount,currency:r.currency,effective_date};
 }
 function ticker(r){
  if(r===null)return null;fields(r,['reported_text','formula','verification','trading_venue'],'Ticker');
  if(!['ai_formula_unverified','reported_unverified'].includes(r.verification))D.fail('Unbekannter Ticker-Herkunftsstatus.');
  const formula=text(r.formula,'Tickerformel',2000),venue=text(r.trading_venue,'Gemeldeter Handelsplatz',160);
  if(r.verification==='ai_formula_unverified'&&(!formula||!/^=AI\(/i.test(formula)||venue!==null))D.fail('AI-Ticker benötigt Originalformel und keinen abgeleiteten Handelsplatz.');
  if(r.verification==='reported_unverified'&&formula!==null)D.fail('Formelherkunft ausdrücklich als AI-Ticker führen.');
  return {reported_text:D.text(r.reported_text,'Gemeldeter Ticker',160),formula,verification:r.verification,trading_venue:venue};
 }
 function strategy(r){
  if(r===null)return null;fields(r,['large','mid','small','category','classification'],'Eigene Strategie');
  if(r.classification!=='user_defined_source_labels')D.fail('Strategielabels sind eigene Zuordnungen.');
  for(const k of ['large','mid','small'])if(r[k]!==null&&typeof r[k]!=='boolean')D.fail('Größenflag muss ausdrücklich wahr, falsch oder unbekannt sein.');
  return {large:r.large,mid:r.mid,small:r.small,category:text(r.category,'Quellkategorie',60),classification:r.classification};
 }
 function payload(r){
  fields(r,['metadata_version','observed_date','effective_date','data','source'],'Metadaten');if(r.metadata_version!==1)D.fail('Unbekannte Metadatenversion.');
  const observed_date=D.day(r.observed_date),effective_date=day(r.effective_date);if(effective_date&&effective_date>observed_date)D.fail('Metadatengültigkeit liegt nach Beobachtung.');
  const d=r.data;fields(d,['reported_name','replication_label','distribution_label','domicile_label','launch','ter','volume','ticker','strategy','links'],'Produktangaben');fields(d.links,['profile_url','parser_url'],'Quellenlinks');
  return {metadata_version:1,observed_date,effective_date,data:{reported_name:text(d.reported_name,'Gemeldeter Name',160),replication_label:text(d.replication_label,'Replikationsangabe'),distribution_label:text(d.distribution_label,'Ertragsverwendung'),domicile_label:text(d.domicile_label,'Domizil'),launch:launch(d.launch),ter:ter(d.ter),volume:volume(d.volume,observed_date),ticker:ticker(d.ticker),strategy:strategy(d.strategy),links:{profile_url:url(d.links.profile_url),parser_url:url(d.links.parser_url)}},source:source(r.source)};
 }
 function snapshot(r,ids){
  const keys=['id','instrument_id','sequence','void','metadata_version','observed_date','effective_date','data','source'];fields(r,keys,'Metadatenstand',['void_reason']);
  if(!ids.has(r.instrument_id))D.fail('Metadatenstand verweist auf unbekanntes Wertpapier.');
  const id=D.text(r.id,'Metadaten-ID',160);if(!Number.isSafeInteger(r.sequence)||r.sequence<1)D.fail('Ungültige Metadatensequenz.');if(typeof r.void!=='boolean')D.fail('Metadaten-Stornostatus fehlt.');
  const {id:ignoreId,instrument_id,sequence,void:isVoid,void_reason,...raw}=r,out={id,instrument_id,sequence,void:isVoid,...payload(raw)};
  if(isVoid)out.void_reason=D.text(void_reason,'Metadaten-Stornogrund',500);else if(Object.hasOwn(r,'void_reason'))D.fail('Stornogrund ohne Storno.');return out;
 }
 function snapshots(raw,ids){
  if(!Array.isArray(raw)||raw.length>50000)D.fail('Ungültige Metadatenliste.');const seen=new Set(),seq=new Set();return raw.map(r=>{const row=snapshot(r,ids);if(seen.has(row.id)||seq.has(row.sequence))D.fail('Doppelte Metadaten-ID oder Sequenz.');seen.add(row.id);seq.add(row.sequence);return row;});
 }
 const selectionDate=r=>r.effective_date||r.observed_date;
 function choose(rows,id,asOf){let chosen=null;for(const r of rows){if(r.instrument_id!==id||r.void||r.observed_date>asOf||selectionDate(r)>asOf)continue;if(!chosen||selectionDate(r)>selectionDate(chosen)||selectionDate(r)===selectionDate(chosen)&&(r.observed_date>chosen.observed_date||r.observed_date===chosen.observed_date&&r.sequence>chosen.sequence))chosen=r;}return chosen;}
 function select(raw,ids,id,asOf){D.day(asOf);if(!ids.has(id))D.fail('Unbekanntes Wertpapier.');return choose(snapshots(raw,ids),id,asOf);}
 function warnings(row){
  if(!row)return ['missing_metadata'];const d=row.data,out=[];if(row.effective_date===null)out.push('metadata_effective_date_unknown');
  for(const key of ['reported_name','replication_label','distribution_label','domicile_label'])if(d[key]===null)out.push('missing_'+key);
  if(d.ter===null)out.push('missing_ter');else if(d.ter.unit===null)out.push('ter_unit_unknown');
  if(d.volume===null)out.push('missing_volume');else{if(d.volume.currency===null)out.push('volume_currency_unknown');if(d.volume.effective_date===null)out.push('volume_effective_date_unknown');}
  if(d.ticker===null)out.push('missing_ticker');else out.push(d.ticker.verification==='ai_formula_unverified'?'ticker_ai_unverified':'ticker_reported_unverified');
  if(d.launch===null)out.push('missing_launch_date');else{if(!d.launch.externally_verified)out.push('launch_date_not_externally_verified');if(d.launch.interpreted_date>row.observed_date)out.push('launch_date_after_observation');}
  if(d.strategy===null)out.push('missing_strategy_labels');else out.push('strategy_labels_user_defined');return out;
 }
 function summary(p,asOf){
  D.day(asOf);if(!Array.isArray(p?.instruments)||p.instruments.length>50000)D.fail('Wertpapierliste fehlt.');const ids=new Set(),isins=new Set();
  const instruments=p.instruments.map(i=>{const v=D.instrument(i);D.text(i.id,'Wertpapier-ID',160);if(ids.has(i.id)||isins.has(v.isin))D.fail('Doppelte Wertpapieridentität.');ids.add(i.id);isins.add(v.isin);return {...v,id:i.id};});
  const rows=snapshots(p.instrument_metadata_snapshots,ids),groups=new Map();for(const r of rows){if(!groups.has(r.instrument_id))groups.set(r.instrument_id,[]);groups.get(r.instrument_id).push(r);}
  const result=instruments.map(i=>{const r=choose(groups.get(i.id)||[],i.id,asOf);return {instrument_id:i.id,name:i.name,isin:i.isin,category:i.category,snapshot_id:r?.id||null,observed_date:r?.observed_date||null,effective_date:r?.effective_date||null,selection_date:r?selectionDate(r):null,data:r?.data||null,source:r?.source||null,warnings:warnings(r)};});
  return {as_of:asOf,selection_basis:'known_at_date',instruments:result,warnings:result.flatMap(r=>r.warnings.map(code=>({instrument_id:r.instrument_id,code})))};
 }
 const api=Object.freeze({source,terRatio,payload,snapshot,snapshots,select,summary});if(typeof module!=='undefined')module.exports=api;else globalThis.TrackerInstrumentMetadata=api;
})();
