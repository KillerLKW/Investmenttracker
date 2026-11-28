"""Build a static website from code only; never read portfolio/template files."""
import ast
import argparse
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def build(output=None):
    output = Path(output) if output else ROOT / 'site'
    html = (ROOT / 'web/index.html').read_text('utf-8')
    logo = 'data:image/svg+xml;base64,' + base64.b64encode((ROOT / 'design/brand/logo.svg').read_bytes()).decode('ascii')
    html = html.replace('/brand/logo.svg', logo)
    html = html.replace('<link rel="stylesheet" href="/assets/styles.css">', '<style>\n' + (ROOT / 'web/styles.css').read_text('utf-8') + '\n</style>')
    html = html.replace('<script defer src="/assets/appearance.js"></script>', '')
    html = html.replace('<script type="module" src="/assets/app.js"></script>', '')
    html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'">')
    html = html.replace('Version 0.1 · EUR', 'Version 0.38 · Web · EUR')
    html = html.replace('Lokal auf deinem Computer', 'In diesem Browser gespeichert')
    html = html.replace('Verbindung wird hergestellt …', 'Browserspeicher wird geöffnet …')
    html = html.replace('Gesamte Datenbank sichern', 'Depots, Register &amp; BIP sichern')
    html = html.replace('Sicherung erstellen', 'Sicherung herunterladen')
    html = html.replace('Diese Version ist nur lokal erreichbar. Pi-Bereitstellung, automatische Kurse und Rebalancing folgen später.', 'Diese Website speichert deine Eingaben ausschließlich in diesem Browser. Zum Gerätewechsel eine vollständige JSON-Sicherung herunterladen und auf dem anderen Gerät einlesen.')
    empty = {'records': [], 'catalog': [], 'datasets': [], 'source_sha256': None}
    script = 'globalThis.TRACKER_PUBLIC_EDITION=true;globalThis.TRACKER_SYNC_HOSTED=false;globalThis.TRACKER_TEMPLATE=null;\n'
    for key in ['REGIONS', 'COUNTRIES', 'SECTORS', 'COMPANIES', 'GDP', 'ALLOWANCES', 'INSTRUMENT_METADATA']:
        script += 'globalThis.TRACKER_' + key + '=' + json.dumps(empty, separators=(',', ':')) + ';\n'
    # Reuse the reviewed script order, without executing the data-dependent builder.
    source = ast.parse((ROOT / 'build_standalone.py').read_text('utf-8'))
    loops = [node for node in source.body if isinstance(node, ast.For) and isinstance(node.target, ast.Name) and node.target.id == 'name']
    if len(loops) != 1:
        raise ValueError('Expected one explicit frontend script list')
    names = ast.literal_eval(loops[0].iter)
    for name in names + ['navigation.js', 'mobile-menu.js', 'public-edition.js', 'public-header.js', 'public-journal.js']:
        if Path(name).name != name or not name.endswith('.js'):
            raise ValueError('Invalid frontend source name')
        script += (ROOT / 'web' / name).read_text('utf-8') + '\n'
        if name == 'local-store-v11-sync.js':
            script += 'globalThis.TrackerLocal=TrackerLocalV11Sync;\n'
    html = html.replace('</body>', '<script>\n' + script + '\n</script>\n</body>')
    output.mkdir(parents=True, exist_ok=True)
    (output / 'index.html').write_text(html, encoding='utf-8')
    (output / '.nojekyll').write_text('', encoding='utf-8')
    print('PASS: code-only website built; no template, portfolio or credential files read.')
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='Website output directory; default: site/')
    args = parser.parse_args()
    build(args.output)
