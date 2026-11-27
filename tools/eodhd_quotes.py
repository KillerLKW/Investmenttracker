"""Personal EODHD coverage check and quote-feed export. Standard library only.

No account creation, no token storage, no tracker writes, no redirects/retries.
The local daily budget counts requests conservatively, including failed calls.
"""
import argparse
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
import getpass
import json
import re
import sqlite3
import sys
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://eodhd.com/api'
SYMBOL = re.compile(r'^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$')
EXCHANGE = re.compile(r'^[A-Za-z][A-Za-z0-9]{0,14}$')


class FetchProblem(Exception):
    def __init__(self, status, http_status=None):
        self.status, self.http_status = status, http_status
        super().__init__(status)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def now_utc():
    return datetime.now(timezone.utc)


class Cache:
    def __init__(self, path):
        self.path = str(path)
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as con:
            con.execute('CREATE TABLE IF NOT EXISTS budget(day TEXT PRIMARY KEY, used INTEGER NOT NULL)')
            con.execute('CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY, day TEXT NOT NULL, payload TEXT NOT NULL)')

    @contextmanager
    def connect(self):
        con = sqlite3.connect(self.path, timeout=10)
        try:
            with con:
                yield con
        finally:
            con.close()

    def reserve(self, day, maximum=20):
        with self.connect() as con:
            con.execute('BEGIN IMMEDIATE')
            row = con.execute('SELECT used FROM budget WHERE day=?', (day,)).fetchone()
            used = row[0] if row else 0
            if used >= maximum:
                raise FetchProblem('local_daily_budget_exhausted')
            con.execute('INSERT OR REPLACE INTO budget VALUES (?,?)', (day, used + 1))

    def used(self, day):
        with self.connect() as con:
            row = con.execute('SELECT used FROM budget WHERE day=?', (day,)).fetchone()
            return row[0] if row else 0

    def get(self, key, day, max_age_days=0):
        with self.connect() as con:
            row = con.execute('SELECT day,payload FROM cache WHERE key=?', (key,)).fetchone()
        if row and 0 <= (date.fromisoformat(day) - date.fromisoformat(row[0])).days <= max_age_days:
            return json.loads(row[1], parse_float=Decimal)
        return None

    def put(self, key, day, value):
        # Cache public normalized data only; never request URLs or credentials.
        with self.connect() as con:
            con.execute('INSERT OR REPLACE INTO cache VALUES (?,?,?)', (key, day, json.dumps(value, ensure_ascii=False)))


class Client:
    def __init__(self, token, cache, clock=now_utc, delay=3.2, opener=None):
        if not isinstance(token, str) or not 3 <= len(token) <= 512 or any(c.isspace() for c in token):
            raise ValueError('Vollständigen API-Schlüssel ohne Leerzeichen eingeben.')
        self._token, self.cache, self.clock, self.delay = token, cache, clock, delay
        self.opener = opener or build_opener(NoRedirect)
        self.requests = 0

    def request(self, endpoint, params):
        # Callers may not supply arbitrary destinations or credential parameters.
        if not re.fullmatch(r'(search/[A-Z]{2}[A-Z0-9]{9}\d|eod/[A-Za-z0-9_-]+\.[A-Za-z0-9]+)', endpoint) or 'api_token' in params:
            raise ValueError('Ungültiger Abrufpfad.')
        self.cache.reserve(self.clock().date().isoformat())
        if self.requests:
            time.sleep(self.delay)
        self.requests += 1
        url = BASE + '/' + endpoint + '?' + urlencode({**params, 'api_token': self._token, 'fmt': 'json'})
        try:
            with self.opener.open(Request(url, headers={'Accept': 'application/json'}, method='GET'), timeout=20) as response:
                raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    raise FetchProblem('response_too_large')
                return json.loads(raw, parse_float=Decimal, parse_constant=lambda _: (_ for _ in ()).throw(ValueError()))
        except HTTPError as e:
            # HTTPError contains the key-bearing URL. Never expose it or body text.
            raise FetchProblem('http_error', e.code) from None
        except (URLError, TimeoutError, OSError):
            raise FetchProblem('connection_error') from None
        except (ValueError, UnicodeError, RecursionError):
            raise FetchProblem('invalid_response') from None

    def mapping(self, isin, refresh=False):
        if not re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}\d', isin):
            raise ValueError('Kanonische ISIN erforderlich.')
        day = self.clock().date().isoformat()
        cache_key = 'mapping:' + isin
        if not refresh:
            saved = self.cache.get(cache_key, day, 30)
            if saved is not None:
                return saved
        result = self.request('search/' + isin, {'type': 'etf', 'limit': 100})
        if not isinstance(result, list):
            raise FetchProblem('invalid_search_response')
        candidates = []
        seen = set()
        for r in result:
            if not isinstance(r, dict) or r.get('ISIN') != isin or r.get('Currency') != 'EUR' or str(r.get('Type', '')).upper() != 'ETF':
                continue
            code, exchange = r.get('Code'), r.get('Exchange')
            if not isinstance(code, str) or not SYMBOL.fullmatch(code) or not isinstance(exchange, str) or not EXCHANGE.fullmatch(exchange):
                continue
            symbol = code + '.' + exchange
            if symbol not in seen:
                seen.add(symbol)
                candidates.append({'isin': isin, 'symbol': symbol, 'exchange': exchange, 'currency': 'EUR', 'name': str(r.get('Name', ''))[:200]})
        if not candidates:
            raise FetchProblem('no_exact_eur_etf_match')
        self.cache.put(cache_key, day, candidates)
        return candidates

    def close(self, mapping, refresh=False):
        symbol = mapping['symbol']
        if mapping['currency'] != 'EUR' or not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9]+', symbol):
            raise ValueError('Geprüfte EUR-Zuordnung erforderlich.')
        day = self.clock().date().isoformat()
        cache_key = 'close:' + symbol
        if not refresh:
            saved = self.cache.get(cache_key, day)
            if saved is not None:
                return {**saved, 'cached': True}
        end = date.fromisoformat(day)
        # Exclude the current session, which could still be incomplete. This is
        # deliberately previous-session EOD data, never an intraday/live claim.
        result = self.request('eod/' + symbol, {'from': (end - timedelta(days=14)).isoformat(), 'to': (end - timedelta(days=1)).isoformat(), 'period': 'd', 'order': 'd'})
        row = parse_close(result, day)
        self.cache.put(cache_key, day, row)
        return {**row, 'cached': False}


def parse_close(rows, reference_day):
    if not isinstance(rows, list) or not rows:
        raise FetchProblem('no_completed_daily_close')
    parsed = []
    for r in rows:
        if not isinstance(r, dict) or not isinstance(r.get('date'), str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', r['date']):
            raise FetchProblem('invalid_close_response')
        try:
            day = date.fromisoformat(r['date'])
            value = r.get('close')  # Never adjusted_close: dividends are journaled separately.
            if isinstance(value, bool) or value is None:
                raise ValueError()
            price = Decimal(str(value))
            if not price.is_finite() or price <= 0:
                raise ValueError()
            canonical = format(price, 'f')
            if '.' in canonical:
                canonical = canonical.rstrip('0').rstrip('.')
            if not re.fullmatch(r'\d{1,15}(\.\d{1,12})?', canonical) or day >= date.fromisoformat(reference_day):
                raise ValueError()
        except (ValueError, InvalidOperation):
            raise FetchProblem('invalid_close_response') from None
        parsed.append({'date': day.isoformat(), 'price': canonical})
    latest = max(parsed, key=lambda r: r['date'])
    if any(r['date'] == latest['date'] and r['price'] != latest['price'] for r in parsed):
        raise FetchProblem('conflicting_same_day_closes')
    if (date.fromisoformat(reference_day) - date.fromisoformat(latest['date'])).days > 7:
        raise FetchProblem('stale_daily_close')
    return latest


def collect(client, instruments, exchange='XETRA', refresh=False):
    if not EXCHANGE.fullmatch(exchange):
        raise ValueError('Eindeutigen Handelsplatz angeben.')
    retrieved = client.clock().replace(microsecond=0).isoformat().replace('+00:00', 'Z')
    report = {'provider': 'EODHD', 'checked_at': retrieved, 'exchange': exchange, 'pricing_verified': False, 'template_coverage_complete': False, 'tracker_writes': 0, 'instruments': []}
    quotes, stopped, prepared = [], False, []
    for instrument in instruments:
        isin = instrument['isin']
        entry = {'isin': isin, 'status': 'not_checked'}
        report['instruments'].append(entry)
        if stopped:
            continue
        try:
            candidates = client.mapping(isin, refresh)
            matches = [r for r in candidates if r['exchange'] == exchange]
            if len(matches) != 1:
                entry.update(status='mapping_needs_review', candidates=candidates)
                continue
            mapping = matches[0]
            entry.update(status='mapping_ready_price_not_checked', symbol=mapping['symbol'])
            prepared.append((entry, mapping))
        except FetchProblem as e:
            entry['status'] = e.status
            if e.http_status:
                entry['http_status'] = e.http_status
            stopped = e.status == 'local_daily_budget_exhausted' or e.http_status in (401, 402, 403, 429)
    # Resolve/copy all mappings first, so the setup day's small allowance is not
    # repeatedly consumed by fresh prices before the remaining ISINs are resolved.
    for entry, mapping in prepared:
        if stopped:
            continue
        try:
            row = client.close(mapping, refresh)
            entry.update(status='completed_daily_close_available', date=row['date'], cached=row['cached'])
            quotes.append({'isin': entry['isin'], 'price': row['price'], 'date': row['date'], 'currency': 'EUR', 'venue': exchange, 'kind': 'close', 'source_url': 'https://eodhd.com/financial-summary/' + quote(mapping['symbol'], safe='')})
        except FetchProblem as e:
            entry['status'] = e.status
            if e.http_status:
                entry['http_status'] = e.http_status
            stopped = e.status == 'local_daily_budget_exhausted' or e.http_status in (401, 402, 403, 429)
    report['requests_this_run'] = client.requests
    report['local_requests_today'] = client.cache.used(client.clock().date().isoformat())
    report['template_coverage_complete'] = bool(instruments) and len(quotes) == len(instruments)
    # A partial feed is not presented as a complete portfolio update.
    feed = {'format': 'investmenttracker-quotes', 'version': 1, 'provider': {'name': 'EODHD', 'url': 'https://eodhd.com/'}, 'retrieved_at': retrieved, 'quotes': quotes} if report['template_coverage_complete'] else None
    return report, feed


def main():
    parser = argparse.ArgumentParser(description='ETF-Abdeckung prüfen und abgeschlossene EUR-Tageskurse als Kursdatei abrufen')
    parser.add_argument('--exchange', default='XETRA')
    parser.add_argument('--data-dir', type=Path, default=ROOT / 'data/eodhd')
    parser.add_argument('--output-dir', type=Path, default=ROOT / 'data/eodhd/output')
    parser.add_argument('--refresh', action='store_true', help='Cache bewusst umgehen; verbraucht zusätzliche Abrufe')
    args = parser.parse_args()
    print('Eigener EODHD-Schlüssel erforderlich. Keine Tracker-Daten werden geändert.')
    print('Kostenloser Zugang: https://eodhd.com/ ; keine Kontenerstellung durch dieses Programm.')
    token = getpass.getpass('API-Schlüssel (verdeckt, wird nicht gespeichert): ')
    if token == 'demo':
        raise ValueError('Der Demo-Schlüssel unterstützt keine ISIN-Suche. Eigenen kostenlosen Zugang verwenden.')
    client = Client(token, Cache(args.data_dir / 'cache.sqlite3'))
    instruments = json.loads((ROOT / 'documentation/region-import-fixture.json').read_text('utf-8'))['records']
    report, feed = collect(client, instruments, args.exchange, args.refresh)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    stamp = report['checked_at'].replace(':', '').replace('-', '')
    report_file = args.output_dir / ('pruefung-' + stamp + '.json')
    report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    for row in report['instruments']:
        print(row['isin'], row['status'])
    print('Prüfbericht:', report_file)
    if feed:
        target = args.output_dir / ('kurse-' + stamp + '.json')
        target.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        print('Kursdatei bereit. In der App unter Wertpapiere einlesen:', target)
    else:
        print('Keine vollständige Kursdatei erzeugt. Prüfbericht beachten; bei ausgeschöpftem Kontingent an einem späteren UTC-Tag fortsetzen.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, sqlite3.Error) as e:
        # Do not expose unexpected request URLs or provider responses in a traceback.
        print('Abruf konnte nicht abgeschlossen werden. Eingabe, Dateien und Verbindung prüfen.', file=sys.stderr)
        sys.exit(1)
