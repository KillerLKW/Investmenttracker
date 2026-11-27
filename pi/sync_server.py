"""Loopback-only snapshot service behind the existing HTTPS reverse proxy.

Stores opaque format-11 snapshots with independent CAS versions and immutable
history. Full investment validation is performed by the unchanged browser model.
"""
import argparse
from contextlib import contextmanager
from datetime import datetime, timezone
import hmac
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sqlite3
from urllib.parse import urlparse

MAX_BODY = 8_000_000
KEYS = {'schema_version', 'revision', 'sequence', 'portfolios', 'allowance_ledgers', 'gdp_datasets', 'requests', 'imports', 'audit'}


class Problem(Exception):
    def __init__(self, message, status=422):
        self.message, self.status = message, status


def validate_snapshot(s):
    if not isinstance(s, dict) or set(s) != KEYS or s['schema_version'] != 11:
        raise Problem('Vollständiger Format-11-Stand erforderlich.')
    if any(type(s[k]) is not int or not 0 <= s[k] <= 9007199254740991 for k in ('revision', 'sequence')):
        raise Problem('Ungültige lokale Revision oder Sequenz.')
    if not isinstance(s['portfolios'], list) or not 1 <= len(s['portfolios']) <= 100:
        raise Problem('Ein bis 100 Depots erforderlich.')
    for k in ('allowance_ledgers', 'gdp_datasets', 'audit'):
        if not isinstance(s[k], list):
            raise Problem('Ungültige globale Datenliste.')
    for k in ('requests', 'imports'):
        if not isinstance(s[k], dict):
            raise Problem('Ungültige Kennungen.')
    ids = set()
    for p in s['portfolios']:
        if not isinstance(p, dict) or not isinstance(p.get('id'), str) or not p['id'] or p['id'] in ids:
            raise Problem('Ungültige oder doppelte Depot-ID.')
        ids.add(p['id'])
        for k in ('instruments', 'transactions', 'quotes', 'region_snapshots', 'country_snapshots', 'sector_snapshots', 'company_snapshots', 'planning_profiles', 'instrument_metadata_snapshots', 'payment_clarifications', 'custom_target_profiles'):
            if not isinstance(p.get(k), list):
                raise Problem('Unvollständiges Format-11-Depot.')
    # The server does not reinterpret financial records or manufacture migrations.
    return s


class Store:
    def __init__(self, path):
        self.path = str(path)
        with self.connect() as con:
            con.execute('CREATE TABLE IF NOT EXISTS snapshots(version INTEGER PRIMARY KEY, created TEXT NOT NULL, payload TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path, timeout=10)
        con.execute('PRAGMA synchronous=FULL')
        try:
            with con:
                yield con
        finally:
            con.close()

    @staticmethod
    def latest(con):
        row = con.execute('SELECT version,payload FROM snapshots ORDER BY version DESC LIMIT 1').fetchone()
        return {'sync_version': row[0], 'snapshot': json.loads(row[1])} if row else {'sync_version': 0, 'snapshot': None}

    def read(self):
        with self.connect() as con:
            return self.latest(con)

    def put(self, snapshot, etag):
        validate_snapshot(snapshot)
        payload = json.dumps(snapshot, ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        if len(payload.encode('utf-8')) > MAX_BODY:
            raise Problem('Stand ist zu groß.', 413)
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            current = self.latest(con)
            if etag != '"sync-%d"' % current['sync_version']:
                raise Problem('Serverstand wurde geändert. Keine Daten überschrieben. Erneut prüfen.', 412)
            version = current['sync_version'] + 1
            con.execute('INSERT INTO snapshots VALUES (?,?,?)', (version, datetime.now(timezone.utc).isoformat(), payload))
        return {'sync_version': version, 'snapshot': snapshot}


def make_server(address, database, key, origin, html):
    parsed = urlparse(origin)
    if len(key) < 32 or parsed.path not in ('', '/') or parsed.query or parsed.fragment or parsed.username:
        raise ValueError('Strong configured key and exact public origin required')
    if parsed.scheme != 'https' and not (parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost')):
        raise ValueError('HTTPS origin required outside loopback tests')
    origin = origin.rstrip('/')
    store = Store(database)

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass  # Never log keys or financial payloads.

        def setup(self):
            super().setup()
            self.connection.settimeout(10)

        def send(self, status, value, etag=None):
            data = json.dumps(value, ensure_ascii=False, allow_nan=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            if etag:
                self.send_header('ETag', etag)
            self.end_headers()
            self.wfile.write(data)

        def authorized(self):
            if self.headers.get('Sec-Fetch-Site') == 'cross-site' or self.headers.get('Origin', origin) != origin:
                raise Problem('Fremder Ursprung nicht erlaubt.', 403)
            if not hmac.compare_digest(self.headers.get('Authorization', '').encode('utf-8'), ('Bearer ' + key).encode('utf-8')):
                raise Problem('Freigabeschlüssel fehlt oder ist ungültig.', 401)

        def do_GET(self):
            if self.path == '/investmenttracker/':
                data = Path(html).read_bytes()
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.send_header('Cache-Control', 'no-store')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Referrer-Policy', 'no-referrer')
                self.send_header('Content-Security-Policy', "frame-ancestors 'none'")
                self.end_headers()
                self.wfile.write(data)
                return
            if self.path != '/investmenttracker-api/snapshot':
                self.send(404, {'error': 'Unbekannte Route.'})
                return
            try:
                self.authorized()
                result = store.read()
                self.send(200, result, '"sync-%d"' % result['sync_version'])
            except Problem as e:
                self.send(e.status, {'error': e.message})
            except sqlite3.Error:
                self.send(503, {'error': 'Zentraler Speicher vorübergehend nicht verfügbar.'})

        def do_PUT(self):
            try:
                if self.path != '/investmenttracker-api/snapshot':
                    raise Problem('Unbekannte Route.', 404)
                self.authorized()
                if self.headers.get('Origin') != origin:
                    raise Problem('Ausdrücklicher gleicher Ursprung erforderlich.', 403)
                if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
                    raise Problem('JSON erwartet.', 415)
                if not self.headers.get('If-Match'):
                    raise Problem('Serverversion ausdrücklich prüfen.', 428)
                if self.headers.get('Transfer-Encoding'):
                    raise Problem('Inhaltslänge erforderlich.', 411)
                try:
                    size = int(self.headers.get('Content-Length', '-1'))
                except ValueError:
                    raise Problem('Ungültige Inhaltslänge.', 400)
                if not 0 < size <= MAX_BODY:
                    raise Problem('Ungültige Größe (maximal 8 MB).', 413)
                try:
                    raw = self.rfile.read(size)
                    if len(raw) != size:
                        raise ValueError()
                    value = json.loads(raw, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
                except (ValueError, UnicodeError, RecursionError):
                    raise Problem('Ungültige JSON-Datei.', 400)
                result = store.put(value, self.headers['If-Match'])
                self.send(200, result, '"sync-%d"' % result['sync_version'])
            except Problem as e:
                self.send(e.status, {'error': e.message})
            except (sqlite3.Error, OSError):
                self.send(503, {'error': 'Speichern vorübergehend nicht möglich. Lokale Daten behalten.'})

    server = ThreadingHTTPServer(address, Handler)
    if parsed.scheme == 'http' and parsed.hostname in ('127.0.0.1', 'localhost') and parsed.port == 0:
        origin = '%s://%s:%d' % (parsed.scheme, parsed.hostname, server.server_port)
    return server


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8795)
    parser.add_argument('--data-dir', type=Path, default=Path('/var/lib/investmenttracker-sync'))
    parser.add_argument('--html', type=Path, default=Path(__file__).with_name('Investmenttracker-Pi.html'))
    args = parser.parse_args()
    args.data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    make_server(('127.0.0.1', args.port), args.data_dir / 'snapshots.sqlite3', os.environ.get('INVESTMENT_SYNC_KEY', ''), os.environ.get('INVESTMENT_SYNC_ORIGIN', 'https://homeserver.local'), args.html).serve_forever()


if __name__ == '__main__':
    main()
