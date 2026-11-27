"""Create the separate same-origin hosted variant of the current offline app."""
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / 'Investmenttracker.html').read_text('utf-8')
assert "connect-src 'none'" in html
assert 'TrackerLocalV11Sync' in html
html = html.replace("connect-src 'none'", "connect-src 'self'", 1)
html = html.replace('<script>', '<script>globalThis.TRACKER_SYNC_HOSTED=true;\n', 1)
assert 'globalThis.TRACKER_SYNC_HOSTED=true;' in html
(root / 'pi/Investmenttracker-Pi.html').write_text(html, encoding='utf-8')
print('PASS: separate hosted variant, same local models and same-origin sync only.')
