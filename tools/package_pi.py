"""Package only the verified hosted app/service/installer; never server data or keys."""
import hashlib
import json
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parent.parent
proof = json.loads((root / 'test-results/sync-hosted-ui-result.json').read_text('utf-8'))
version = proof['version']
release = json.loads((root / ('test-results/release' + version.replace('.', '') + '-result.json')).read_text('utf-8'))
assert proof['result'] == release['result'] == 'PASS'
for name, sha in release['hashes'].items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == sha, name
names = ['pi/sync_server.py', 'pi/Investmenttracker-Pi.html', 'pi/install.sh', 'Pi-einrichten.ps1', 'Pi-einrichten.cmd', 'Website-updaten.ps1', 'Website-updaten.cmd', 'test-results/sync-hosted-ui-result.json']
files = {name: (root / name).read_bytes() for name in names}
guide = f'''Investmenttracker {version} – Pi-Version mit manuellem Gesamtbestandsabgleich

VORBEREITET UND LOKAL GETESTET; DIESE VERSION NICHT AUTOMATISCH INSTALLIERT.
Die automatische SSH-Anmeldung wurde abgewiesen. Keine Pi-Daten oder Dienste
wurden bei dieser Vorbereitung verändert.

Wenn die Pi-App schon läuft: Website-updaten.cmd aktualisiert nur die HTML-Seite,
mit vorheriger Sicherung der bisherigen Seite. Datenbank, Schlüssel und Dienst
werden dabei nicht ersetzt. Danach die Pi-Seite neu laden (Strg+F5).

1. In der bisherigen Offline-App eine vollständige JSON-Sicherung herunterladen.
2. Dieses ZIP vollständig entpacken.
3. Pi-einrichten.cmd starten und die SSH-/sudo-Anmeldung am eigenen Rechner
   durchführen. Standardziel: ludwig@homeserver.local.
   Voraussetzung ist die vorhandene TaskTracker-HTTPS-Site auf diesem Pi.
4. Im Pi-Terminal den eigenen Freigabeschlüssel anzeigen:
   sudo cat /etc/investmenttracker-sync.env
   Nur den Wert hinter INVESTMENT_SYNC_KEY= in der App verwenden.
5. https://homeserver.local/investmenttracker/ öffnen.
6. Die zuvor gesicherte JSON-Datei über Daten & Sicherung in die neue Browser-
   Umgebung einlesen. Die bisherigen Browserdaten wandern nicht automatisch mit.
7. Unter Pi-Synchronisierung den Schlüssel eingeben, Serverstand prüfen und
   den gewünschten lokalen Gesamtbestand ausdrücklich zum Server senden.
8. Auf einem zweiten Gerät dieselbe HTTPS-Adresse öffnen, Schlüssel eingeben,
   Serverstand prüfen, lokale Sicherung herunterladen/aufbewahren und den
   Serverbestand ausdrücklich laden.

REGELN
Es gibt einen gemeinsamen Gesamtbestand für diesen Schlüssel, keine getrennten
Benutzerkonten und keine automatische Zusammenführung. Laden ersetzt sämtliche
lokalen Depots/Register/BIP-Stände nach bestätigter Sicherung. Senden ersetzt
den zuvor geprüften zentralen Stand. Zwischenzeitliche Serveränderungen werden
abgewiesen. Bei Konflikten erst lokale Änderungen als JSON sichern, danach
entscheiden, welcher Gesamtbestand verwendet werden soll.

Offline weiterarbeiten ist möglich; ein geänderter lokaler Stand wird nicht
automatisch übertragen. Ein Neuöffnen der HTTPS-Seite braucht eine Verbindung;
es gibt keinen installierten Offline-Cache. Die einzelne Offline-HTML bleibt
als eigenständige, nicht automatisch synchronisierte Dateiversion nutzbar.

DIENST
Neue Pfade: /opt/investmenttracker-sync und /var/lib/investmenttracker-sync.
SQLite bewahrt jede angenommene zentrale Version auf. Das ist eine Historie,
kein Ersatz für externe JSON-Sicherungen. Schlüssel: /etc/investmenttracker-sync.env.
Dienst: investmenttracker-sync.service. API intern nur 127.0.0.1:8795.
Die bestehende TaskTracker-App wird nicht ersetzt. Nginx-Konfiguration wird
vor Ergänzung gesichert und bei fehlerhafter Prüfung zurückgesetzt.

Das Paket enthält keine persönlichen Daten, Schlüssel oder Serverdatenbank.
Automatische Kurse sind weiterhin nicht angebunden.
'''
files['Pi-Anleitung.txt'] = guide.encode('utf-8-sig')
files['Release.json'] = (json.dumps({'app': 'Investmenttracker-Pi', 'version': version, 'schema_version': 11, 'user_data_included': False, 'keys_included': False, 'deployed_to_pi': False, 'hashes': {n: hashlib.sha256(data).hexdigest() for n, data in files.items()}}, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
output = root / 'releases' / f'Investmenttracker-Pi-{version}.zip'
with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in sorted(files.items()):
        item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
        item.compress_type = zipfile.ZIP_DEFLATED
        item.external_attr = 0o100644 << 16
        archive.writestr(item, data, compresslevel=9)
with zipfile.ZipFile(output) as archive:
    assert set(archive.namelist()) == set(files)
    assert archive.testzip() is None
    manifest = json.loads(archive.read('Release.json'))
    for name, sha in manifest['hashes'].items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == sha
sha = hashlib.sha256(output.read_bytes()).hexdigest()
output.with_suffix('.zip.sha256').write_text(sha + '  ' + output.name + '\n', encoding='ascii')
(root / ('test-results/release' + version.replace('.', '') + '-pi-package-result.json')).write_text(json.dumps({'result': 'PASS', 'version': version, 'sha256': sha, 'files': sorted(files), 'user_data_included': False, 'keys_included': False, 'deployed_to_pi': False}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print('PASS: Pi package with verified hosted app, service, installer and guide; no user data/keys, not deployed.')
