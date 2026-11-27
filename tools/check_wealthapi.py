"""Read-only production coverage check. Token is entered locally, never saved.

No account, portfolio, transaction or token-management endpoints are called.
The result is a coverage report, never an importable quote feed.
"""
import argparse
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import getpass
import json
from pathlib import Path
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, build_opener, HTTPRedirectHandler

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://wealthapi.eu/api'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Client:
    def __init__(self, token, delay=2, max_requests=40):
        if not isinstance(token, str) or not 32 <= len(token) <= 8192 or any(c.isspace() for c in token):
            raise ValueError('Vollständigen Token ohne Leerzeichen eingeben.')
        self._token, self.delay, self.maximum = token, delay, max_requests
        self.requests = 0
        self.opener = build_opener(NoRedirect)

    def get(self, path, parameters):
        if path not in ('/v2/symbols', '/v2/quotes'):
            raise ValueError('Nur lesende Symbol-/Kursabfragen erlaubt.')
        if self.requests >= self.maximum:
            return {'status': 'request_budget_exhausted'}
        if self.requests:
            time.sleep(self.delay)
        self.requests += 1
        request = Request(BASE + path + '?' + urlencode(parameters), headers={'Authorization': 'Bearer ' + self._token, 'Accept': 'application/json'}, method='GET')
        try:
            with self.opener.open(request, timeout=15) as response:
                raw = response.read(2_000_001)
                if len(raw) > 2_000_000:
                    return {'status': 'response_too_large'}
                data = json.loads(raw, parse_float=Decimal)
                return {'status': 'ok', 'data': data}
        except HTTPError as e:
            # Do not print response bodies or request headers containing secrets.
            return {'status': 'http_error', 'http_status': e.code}
        except (URLError, TimeoutError, OSError):
            return {'status': 'connection_error'}
        except (ValueError, UnicodeError):
            return {'status': 'invalid_json'}


def summarize_quotes(data):
    if not isinstance(data, dict) or not isinstance(data.get('quotes'), list):
        return []
    rows = []
    for r in data['quotes']:
        if not isinstance(r, dict) or r.get('currency') != 'EUR' or r.get('priceUnit') != 'CURRENCY':
            continue
        try:
            price = Decimal(str(r.get('last')))
            stamp = r.get('lastDateTime')
            parsed = datetime.fromisoformat(stamp.replace('Z', '+00:00')) if isinstance(stamp, str) else None
            if not price.is_finite() or price <= 0 or not parsed or not parsed.tzinfo:
                continue
        except (ValueError, InvalidOperation):
            continue
        rows.append({'price': str(price), 'timestamp': stamp, 'currency': 'EUR', 'venue': r.get('stockExchangeName'), 'venue_code': r.get('stockExchangeSlug'), 'kind': 'last'})
    return rows


def check(client, instruments):
    report = {'checked_at': datetime.now(timezone.utc).isoformat(), 'base_url': BASE, 'scope': 'read-only search/quotes for template ISINs; not personal holdings', 'pricing_verified': False, 'automatic_quote_writes': 0, 'instruments': []}
    stop = False
    for instrument in instruments:
        row = {'isin': instrument['isin'], 'template_role': instrument['source']['sheet'], 'status': 'not_checked', 'candidates': []}
        report['instruments'].append(row)
        if stop:
            continue
        result = client.get('/v2/symbols', {'isinOrWkn': row['isin']})
        if result['status'] != 'ok':
            row.update(result)
            stop = result.get('http_status') in (401, 403, 429) or result['status'] == 'request_budget_exhausted'
            continue
        data = result.get('data')
        symbols = data.get('symbols', []) if isinstance(data, dict) else []
        matches = [r for r in symbols if isinstance(r, dict) and r.get('isin') == row['isin'] and isinstance(r.get('id'), str) and isinstance(r.get('quoteProvider'), str)]
        if not matches:
            row['status'] = 'no_exact_isin_match'
            continue
        # Preserve ambiguity; do not silently pick one provider or security.
        if len(matches) != 1:
            row['status'] = 'ambiguous_mapping'
            row['candidates'] = [{'security_id': r['id'], 'provider': r['quoteProvider'], 'name': r.get('name')} for r in matches]
            continue
        symbol = matches[0]
        result = client.get('/v2/quotes', {'securityId': symbol['id'], 'quoteProvider': symbol['quoteProvider'], 'preferredCurrency': 'EUR', 'optimal': 'false'})
        if result['status'] != 'ok':
            row.update(result)
            stop = result.get('http_status') in (401, 403, 429) or result['status'] == 'request_budget_exhausted'
            continue
        quotes = summarize_quotes(result.get('data'))
        row['status'] = 'eur_quotes_available' if quotes else 'no_valid_eur_trade_price'
        row['candidates'] = [{'security_id': symbol['id'], 'provider': symbol['quoteProvider'], 'name': symbol.get('name'), 'quotes': quotes}]
    report['requests'] = client.requests
    report['all_template_instruments_have_eur_quotes'] = bool(report['instruments']) and all(r['status'] == 'eur_quotes_available' for r in report['instruments'])
    report['note'] = 'Availability does not verify permanent free use, freshness, preferred venue or compatibility with every partner account. No data was written to the tracker.'
    return report


def main():
    parser = argparse.ArgumentParser(description='Privater, ausschließlich lesender wealthAPI-Abdeckungstest')
    parser.add_argument('--output', type=Path, default=ROOT / 'test-results/wealthapi-authenticated-check.json')
    args = parser.parse_args()
    print('Es werden nur öffentliche ETF-Kennungen aus der Vorlage geprüft, keine persönlichen Depot-/Bankdaten.')
    print('Token nur hier lokal eingeben. Er wird weder angezeigt noch gespeichert.')
    client = Client(getpass.getpass('Persönlicher wealthAPI-Token: '))
    records = json.loads((ROOT / 'documentation/region-import-fixture.json').read_text('utf-8'))['records']
    result = check(client, records)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('Bericht gespeichert:', args.output)
    for row in result['instruments']:
        print(row['isin'], row['status'])


if __name__ == '__main__':
    main()
