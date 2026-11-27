"""Package an already verified offline release; never include user data or profiles."""
import hashlib
import json
from pathlib import Path
import re
import zipfile

ROOT = Path(__file__).resolve().parent.parent


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build():
    app = (ROOT / 'Investmenttracker.html').read_bytes()
    version = re.search(r'Version (\d+\.\d+) · Datei', app.decode('utf-8')).group(1)
    proof = json.loads((ROOT / 'test-results' / ('release' + version.replace('.', '') + '-result.json')).read_text('utf-8'))
    if proof['result'] != 'PASS' or proof['version'] != version:
        raise ValueError('Passing proof for the active release required')
    for name, expected in proof['hashes'].items():
        source = (ROOT / name).resolve()
        if not source.is_relative_to(ROOT) or digest(source.read_bytes()) != expected:
            raise ValueError('Release source does not match verified hash: ' + name)
    guide = f'''Investmenttracker {version} – Offline-Dateiversion

1. ZIP vollständig entpacken, bevor du die App öffnest.
2. Investmenttracker.html doppelklicken oder Start-Investmenttracker.cmd öffnen.
3. Keine Installation, Python oder Internetverbindung erforderlich.
4. Zum Beenden das Browserfenster schließen.

DEINE DATEN
Eingaben liegen im Browserprofil, nicht in dieser HTML-Datei oder im ZIP.
Die App startet in einer neuen Umgebung leer. Die Vorlage ist ein freiwilliges
Beispiel und enthält keine bestätigten persönlichen Finanzdaten.

Vor Browser-/Computer-/Ordnerwechsel: In der bisherigen App unter
„Daten & Sicherung → Depots, Register & BIP sichern“ eine JSON-Sicherung
herunterladen und separat aufbewahren. Im neuen Browser unter „Export wieder
einlesen“ die JSON-Datei prüfen und als zusätzliche Depots übernehmen.
Es erfolgt kein Überschreiben oder automatischer Abgleich bestehender Depots.
Mehrfaches Einlesen kann zusätzliche Kopien erzeugen.

UPDATE AM BISHERIGEN ORT
Zuerst JSON-Sicherung herunterladen und aufbewahren. Die App schließen.
Nur Investmenttracker.html am bisherigen Ort ersetzen; Dateiname, Browser
und Profil beibehalten. Danach öffnen und Daten prüfen. Falls Daten nicht
erscheinen, die zuvor gesicherte JSON-Datei über die Importvorschau einlesen.
Die HTML-Datei allein nimmt deine Eingaben nicht mit.

KURSE UND HANDEL
Vorlagenkurse sind gespeicherte Quellenstände, keine Live-Kurse.
Handelsvorschläge sind Berechnungen und erzeugen keine Orders/Buchungen.
Ungeklärte Quellen, Teillisten und unbestätigte Jahresangaben bleiben sichtbar.
Keine automatische geräteübergreifende Synchronisierung oder Pi-Anbindung.

PAKET PRÜFEN
Release.json enthält die SHA-256-Prüfsummen der enthaltenen App-Dateien.
Die separate .zip.sha256-Datei enthält die Prüfsumme des vollständigen ZIP.
Das Paket enthält keine persönlichen Depots, Sicherungen, Serverdatenbanken oder Profile.
'''
    names = ['Investmenttracker.html', 'Start-Investmenttracker.cmd', 'Start-Investmenttracker.ps1']
    # Historical server setup/stop controls are not part of the user package.
    files = {name: (ROOT / name).read_bytes() for name in names}
    files['Kurzanleitung.txt'] = guide.encode('utf-8-sig')
    manifest = {'app': 'Investmenttracker', 'version': version, 'schema_version': proof['schema_version'], 'model_math_source_tests': proof['model_math_source_tests'], 'offline_ui_scripts': proof['offline_ui_scripts'], 'user_data_included': False, 'example_template_included': True, 'hashes': {name: digest(data) for name, data in files.items()}}
    files['Release.json'] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    output = ROOT / 'releases'
    output.mkdir(exist_ok=True)
    target = output / f'Investmenttracker-{version}.zip'
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compresslevel=9)
    sha = digest(target.read_bytes())
    target.with_suffix('.zip.sha256').write_text(sha + '  ' + target.name + '\n', encoding='ascii')
    print(json.dumps({'result': 'PASS', 'version': version, 'package': str(target), 'sha256': sha, 'files': sorted(files)}, ensure_ascii=False))
    return target


if __name__ == '__main__':
    build()
