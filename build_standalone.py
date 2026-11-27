"""Developer packaging tool. The resulting HTML needs no Python or server."""
import base64
import json
from pathlib import Path
from server.imports import source_portfolio

ROOT=Path(__file__).resolve().parent
html=(ROOT/'web/index.html').read_text(encoding='utf-8')
logo='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'design/brand/logo.svg').read_bytes()).decode()
html=html.replace('/brand/logo.svg',logo)
html=html.replace('<link rel="stylesheet" href="/assets/styles.css">','<style>\n'+(ROOT/'web/styles.css').read_text(encoding='utf-8')+'\n</style>')
html=html.replace('<script defer src="/assets/appearance.js"></script>','')
html=html.replace('<script type="module" src="/assets/app.js"></script>','')
html=html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'">')
html=html.replace('Version 0.1 · EUR','Version 0.38 · Datei · EUR')
html=html.replace('Lokal auf deinem Computer','Direkt als Datei geöffnet')
html=html.replace('Verbindung wird hergestellt …','Browserspeicher wird geöffnet …')
html=html.replace('Gesamte Datenbank sichern','Depots, Register &amp; BIP sichern')
html=html.replace('Konsistente Sicherung aller Depots einschließlich Änderungsprotokoll. Kopiere Sicherungen zusätzlich auf ein zweites Medium.', 'Alle Depots, globalen Freistellungsregister, eigenen BIP-Stände und das Änderungsprotokoll als JSON herunterladen. Deine Eingaben liegen im Browserprofil, nicht in dieser HTML-Datei.')
html=html.replace('Der Export enthält das ausgewählte Depot.', 'Der Export enthält das ausgewählte Depot mit seinen Historien, aber keine globalen Freistellungsregister oder eigenen BIP-Stände. Nutze dafür die Gesamtsicherung.')
html=html.replace('Sicherung erstellen','Sicherung herunterladen')
html=html.replace('Eine Investmenttracker-Datei prüfen und als separates Depot übernehmen. Kein Überschreiben bestehender Daten.', 'Einen Depotexport oder eine Gesamtsicherung prüfen und als separate Depots übernehmen. Bestehende Daten bleiben erhalten.')
html=html.replace('Diese Version ist nur lokal erreichbar. Pi-Bereitstellung, automatische Kurse und Rebalancing folgen später.', 'Kein Server, keine Installation, keine Internetverbindung nötig. Vor Browserwechsel oder Löschen von Browserdaten bitte eine JSON-Sicherung herunterladen. Für mehrere Geräte gibt es noch keine Synchronisierung.')
template=json.dumps(source_portfolio(ROOT/'documentation/source-analysis.json'),ensure_ascii=False,separators=(',',':')).replace('</',r'<\/')
regions=json.dumps(json.loads((ROOT/'documentation/region-import-fixture.json').read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('</',r'<\/')
countries=json.dumps(json.loads((ROOT/'documentation/country-import-fixture.json').read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('</',r'<\/')
sectors=json.dumps(json.loads((ROOT/'documentation/sector-import-fixture.json').read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('</',r'<\/')
companies=json.dumps(json.loads((ROOT/'documentation/company-import-fixture.json').read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('</',r'<\/')
gdp=json.dumps(json.loads((ROOT/'documentation/gdp-import-fixture.json').read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('</',r'<\/')
allowances=json.dumps(json.loads((ROOT/'documentation/allowance-import-fixture.json').read_text(encoding='utf-8')),ensure_ascii=False,separators=(',',':')).replace('</',r'<\/')
metadata=json.dumps({'source_sha256': json.loads((ROOT/'documentation/instrument-metadata-model-fixture.json').read_text(encoding='utf-8'))['source_sha256'], 'records': json.loads((ROOT/'documentation/instrument-metadata-model-fixture.json').read_text(encoding='utf-8'))['records']},ensure_ascii=False,separators=(',',':')).replace('</',r'<\/')
scripts='globalThis.TRACKER_INSTRUMENT_METADATA='+metadata+';\n'+'globalThis.TRACKER_TEMPLATE='+template+';\nglobalThis.TRACKER_REGIONS='+regions+';\nglobalThis.TRACKER_COUNTRIES='+countries+';\nglobalThis.TRACKER_SECTORS='+sectors+';\nglobalThis.TRACKER_COMPANIES='+companies+';\nglobalThis.TRACKER_GDP='+gdp+';\nglobalThis.TRACKER_ALLOWANCES='+allowances+';\n'
for name in ['local-domain.js','region-domain.js','country-domain.js','sector-domain.js','company-domain.js','gdp-domain.js','gdp-catalog-domain.js','allowance-domain.js','target-domain.js','custom-target-domain.js','scenario-domain.js','performance-domain.js','payment-clarification-domain.js','liquidity-domain.js','sale-scenario-domain.js','shared-gain-domain.js','scenario-price-domain.js','scenario-sale-domain.js','portfolio-price-domain.js','company-value-domain.js','portfolio-companies-domain.js','sector-value-domain.js','portfolio-sectors-domain.js','country-value-domain.js','portfolio-countries-domain.js','gdp-value-domain.js','portfolio-gdp-domain.js','region-value-domain.js','portfolio-targets-domain.js','portfolio-trades-domain.js','trade-lookthrough-domain.js','quote-batch-domain.js','quote-feed-domain.js','planning-profile-domain.js','instrument-metadata-domain.js','local-store-v2.js','local-store-v3.js','local-store-v4.js','local-store-v5.js','local-store-v6-quotes.js','local-store-v7.js','local-store-v8.js','local-store-v9.js','local-store-v10.js','local-store-v11-sync.js','app.js','appearance.js','target-ui.js','custom-target-ui.js','scenario-ui.js','planning-profile-ui.js','performance-ui.js','distribution-ui.js','country-ui.js','sector-ui.js','company-ui.js','company-editor.js','gdp-ui.js','allowance-ui.js','quote-batch-ui.js','instrument-metadata-ui.js','payment-clarification-ui.js','liquidity-ui.js','sale-scenario-ui.js','shared-gain-ui.js','scenario-price-ui.js','portfolio-price-ui.js','portfolio-targets-ui.js','portfolio-trades-ui.js','portfolio-countries-ui.js','portfolio-sectors-ui.js','portfolio-companies-ui.js','portfolio-gdp-ui.js','trade-lookthrough-ui.js','quote-feed-ui.js','sync-ui.js','gdp-catalog-ui.js','migration-ui.js']:
    scripts+=(ROOT/'web'/name).read_text(encoding='utf-8')+'\n'
    if name=='local-store-v11-sync.js': scripts+='globalThis.TrackerLocal=TrackerLocalV11Sync;\n'
scripts+=(ROOT/'web/navigation.js').read_text(encoding='utf-8')+'\n'
scripts+=(ROOT/'web/mobile-menu.js').read_text(encoding='utf-8')+'\n'
html=html.replace('</body>','<script>\n'+scripts+'\n</script>\n</body>')
(ROOT/'Investmenttracker.html').write_text(html,encoding='utf-8')
print('Investmenttracker.html erstellt:',len(html.encode('utf-8')),'Bytes')
