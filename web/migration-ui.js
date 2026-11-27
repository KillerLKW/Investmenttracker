let migrationRevision=null,migrationToken=null,migrationStage='customTargets',migrationStart=10;
const paused=document.createElement('section');paused.id='migration-paused';paused.className='panel migration-paused';paused.hidden=true;
paused.innerHTML='<h2>Datenumstellung ausstehend</h2><p>Deine bisherigen Daten bleiben bis zur bestätigten Umstellung erhalten. Lade für jeden Schritt eine Sicherung herunter.</p><button id="migration-resume" class="primary">Umstellung öffnen</button>';
document.querySelector('main').before(paused);
const migrationApi=(path,data)=>(migrationStage==='legacy'?TrackerLocalV2:migrationStage==='countries'?TrackerLocalV3:migrationStage==='sectors'?TrackerLocalV4:migrationStage==='companies'?TrackerLocalV5:migrationStage==='allowances'?TrackerLocalV6Quotes:migrationStage==='profiles'?TrackerLocalV7:migrationStage==='metadata'?TrackerLocalV8:migrationStage==='clarifications'?TrackerLocalV9:migrationStage==='gdp'?TrackerLocalV10:TrackerLocal).api(path,data);
function resetMigrationConfirmation(){
  migrationRevision=null;migrationToken=null;$('#migration-confirm').checked=false;$('#migration-confirm').disabled=true;$('#migration-commit').disabled=true;
}
function showMigration(stage=migrationStage){
  migrationStage=stage;document.querySelector('main').hidden=true;document.querySelector('.sidebar').inert=true;paused.hidden=false;
  resetMigrationConfirmation();$('#migration-error').textContent='';
  const version={legacy:1,countries:2,sectors:3,companies:4,allowances:5,profiles:6,metadata:7,clarifications:8,gdp:9,customTargets:10}[stage],steps=11-migrationStart;
  $('#migration-title').textContent=(steps>1?`Schritt ${version-migrationStart+1} von ${steps}: `:'')+({legacy:'Regionalformat vorbereiten',countries:'Länderformat vorbereiten',sectors:'Sektorformat vorbereiten',companies:'Unternehmensformat vorbereiten',allowances:'Registerformat vorbereiten',profiles:'Planungsprofile vorbereiten',metadata:'Produktstammdaten vorbereiten',clarifications:'Zahlungsklärungen vorbereiten',gdp:'BIP-Katalog vorbereiten',customTargets:'Eigene Zielprofile vorbereiten'}[stage]);
  $('#migration-description').textContent=stage==='customTargets'?'Deine Depots erhalten eine leere eigene Zielhistorie (V10 → V11). Vorhandene feste Planungsprofile, Gewichte, Buchungen, Quellen und globale Register/BIP-Stände bleiben erhalten. Es werden keine Profile automatisch kopiert.':stage==='gdp'?'Ein leerer globaler Katalog für eigene BIP-Stände wird ergänzt (V9 → V10). Alle bisherigen Depotdaten, Zahlungsklärungen und Register bleiben erhalten. Es werden keine Vorlagen automatisch übernommen.':stage==='clarifications'?'Deine Depots erhalten eine leere Zahlungsklärungshistorie (V8 → V9). Originalbuchungen, Cash, Bestände, Quellenstände, Profile und Register bleiben erhalten. Es wird keine Zahlung automatisch zugeordnet.':stage==='metadata'?'Deine Depots erhalten Platz für zusätzliche Produktquellenstände (V7 → V8). Neue Historien beginnen leer; alle bisherigen Depotdaten, Profile und Freistellungsregister bleiben erhalten.':stage==='profiles'?'Deine Depots erhalten Platz für benannte Planungsprofile (V6 → V7). Die Profillisten beginnen leer; Buchungen, Kurse, Quellenhistorien und globale Freistellungsregister bleiben erhalten.':stage==='allowances'?'Globale Freistellungsregister werden vorbereitet (V5 → V6). Die neue Liste beginnt leer; alle bisherigen Depotdaten bleiben erhalten.':stage==='companies'?'Deine Depots erhalten Platz für Unternehmensstände und Namenszuordnungen (V4 → V5). Bestehende Historien bleiben erhalten.':stage==='legacy'?'Der alte Bestand erhält Platz für Regionaldaten (V1 → V2). Für die folgenden Schritte wird jeweils eine eigene Sicherung und Bestätigung benötigt.':stage==='countries'?'Deine Depots erhalten Platz für Länderstände und Klassifikationsquellen (V2 → V3). Danach folgt das Sektorformat mit eigener Sicherung.':'Deine Depots erhalten Platz für Sektorstände und deren Klassifikationsquellen (V3 → V4). Buchungen, Kurse, Regional- und Länderhistorien bleiben erhalten.';
  if(!$('#migration').open)$('#migration').showModal();
}
$('#migration-resume').onclick=()=>showMigration();
$('#migration-later').onclick=()=>$('#migration').close();
$('#migration-backup').onclick=async()=>{
  const b=$('#migration-backup');b.disabled=true;resetMigrationConfirmation();
  try{const r=await migrationApi('migration/backup');migrationRevision=r.revision;migrationToken=r.backup_token||null;$('#migration-confirm').disabled=false;$('#migration-error').textContent='Bitte prüfe, dass die JSON-Sicherung im Downloadordner liegt.';}
  catch(e){$('#migration-error').textContent=e.message}finally{b.disabled=false}
};
$('#migration-confirm').onchange=()=>$('#migration-commit').disabled=!$('#migration-confirm').checked;
$('#migration-commit').onclick=async()=>{
  const b=$('#migration-commit');b.disabled=true;
  try{
    await migrationApi('migration/commit',{revision:migrationRevision,backup_token:migrationToken,acknowledged:$('#migration-confirm').checked});
    if(migrationStage==='legacy'){showMigration('countries');return;}
    if(migrationStage==='countries'){showMigration('sectors');return;}
    if(migrationStage==='sectors'){showMigration('companies');return;}
    if(migrationStage==='companies'){showMigration('allowances');return;}
    if(migrationStage==='allowances'){showMigration('profiles');return;}
    if(migrationStage==='profiles'){showMigration('metadata');return;}
    if(migrationStage==='metadata'){showMigration('clarifications');return;}
    if(migrationStage==='clarifications'){showMigration('gdp');return;}
    if(migrationStage==='gdp'){showMigration('customTargets');return;}
    await refresh();
    $('#migration').close();paused.hidden=true;document.querySelector('.sidebar').inert=false;document.querySelector('main').hidden=false;
    toast('Daten umgestellt. Buchungen, Kurse und Quellenhistorien sind erhalten.');
  }catch(e){$('#migration-error').textContent=e.message;resetMigrationConfirmation();}
};
async function startTracker(){
  try{
    for(const [backend,version,stage] of [[TrackerLocal,10,'customTargets'],[TrackerLocalV10,9,'gdp'],[TrackerLocalV9,8,'clarifications'],[TrackerLocalV8,7,'metadata'],[TrackerLocalV7,6,'profiles'],[TrackerLocalV6Quotes,5,'allowances'],[TrackerLocalV5,4,'companies'],[TrackerLocalV4,3,'sectors'],[TrackerLocalV3,2,'countries'],[TrackerLocalV2,1,'legacy']]){
      try{const status=await backend.api('migration/status');if(status.required){migrationStart=version;showMigration(stage);return;}await refresh();return;}catch(e){if(e.status!==428)throw e;}
    }
    throw Error('Datenversion konnte nicht vorbereitet werden.');
  }catch(e){error(e.message);$('#save-state').textContent='Speicher prüfen';}
}
startTracker();
