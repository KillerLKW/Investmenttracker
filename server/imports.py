"""Read-only adapters. Derived sheets are deliberately excluded from imports."""
import hashlib
import json
from datetime import date, timedelta
from decimal import Decimal
from .domain import Problem, instrument, transaction, number, day, check_holdings, text
from .store import encode


def validate_portfolio(p):
    if not isinstance(p, dict):
        raise Problem('Ungültiges Depotformat.')
    p = json.loads(json.dumps(p))
    p['name'] = text(p.get('name'), 'Depotname', 80)
    if not isinstance(p.get('mode'), str) or p.get('mode') not in {'live', 'example'}:
        raise Problem('Depotmodus fehlt.')
    for key in ('instruments', 'transactions', 'quotes'):
        if not isinstance(p.get(key), list) or len(p[key]) > 50000:
            raise Problem(f'Ungültige Liste: {key}.')
    ids, isins = set(), set()
    for i in p['instruments']:
        if not isinstance(i, dict):
            raise Problem('Ungültiger Wertpapierdatensatz.')
        norm = instrument(i)
        if not isinstance(i.get('id'), str) or i['id'] in ids or norm['isin'] in isins:
            raise Problem('Doppelte oder fehlende Wertpapierkennungen.')
        ids.add(i['id']); isins.add(norm['isin'])
        i.update(norm)
    txs = []
    for t in p['transactions']:
        if not isinstance(t, dict):
            raise Problem('Ungültiger Buchungsdatensatz.')
        normalized = transaction(t, ids)
        if type(t.get('void', False)) is not bool:
            raise Problem('Ungültiger Stornostatus.')
        normalized['void'] = t.get('void', False)
        normalized['void_reason'] = str(t.get('void_reason', ''))[:500]
        txs.append(normalized)
    p['transactions'] = txs
    check_holdings(txs)
    for q in p['quotes']:
        if not isinstance(q, dict) or not isinstance(q.get('instrument_id'), str) or q.get('instrument_id') not in ids:
            raise Problem('Kurs verweist auf ein unbekanntes Wertpapier.')
        q['price'] = number(q.get('price'), 'Kurs', False)
        q['date'] = day(q.get('date'))
        q['source'] = text(q.get('source'), 'Kursquelle', 120)
    return p


def source_portfolio(path):
    raw = json.loads(path.read_text(encoding='utf-8'))
    tabs = {s['name']: {c['a']: c.get('v', {}) for c in s['cells']} for s in raw['sheets']}
    p = {'name': 'ETF-Vorlage · Beispiel', 'mode': 'example', 'instruments': [], 'transactions': [], 'quotes': []}
    def numeric(v):
        value = Decimal(str(v)).quantize(Decimal('0.000000000001'))
        return format(value, 'f').rstrip('0').rstrip('.') if value else '0'
    def cell(tab, address, field='numberValue'):
        return tab.get(address, {}).get(field)
    def serial(v):
        return (date(1899,12,30)+timedelta(days=int(v))).isoformat()
    for name, tab in tabs.items():
        isin = cell(tab, 'B3', 'stringValue')
        if not isin or len(isin) != 12 or not isin[:2].isalpha():
            continue
        iid = isin
        p['instruments'].append({'id': iid, 'isin': isin, 'name': cell(tab,'B2','stringValue'),
                                'category': cell(tab,'E9','stringValue') or 'Ohne Zuordnung'})
        for row in range(24, 301):
            dt, qty, amount = (cell(tab, f'{c}{row}') for c in ('A','B','D'))
            if dt is None and qty is None and amount is None:
                continue
            if dt is None or qty is None or amount is None:
                raise Problem(f'{name}, Zeile {row}: unvollständige Buchung.')
            if not qty or not amount or (qty > 0) != (amount > 0):
                raise Problem(f'{name}, Zeile {row}: widersprüchliches Vorzeichen.')
            p['transactions'].append({'date': serial(dt), 'type': 'buy' if qty > 0 else 'sell',
              'instrument_id': iid, 'quantity': numeric(abs(qty)), 'amount': numeric(abs(amount)),
              'fee':'0', 'tax':'0', 'note': f'Vorlage: {name}!A{row}:D{row}'})
        quote = cell(tab,'C17')
        if quote:
            p['quotes'].append({'instrument_id':iid, 'price':numeric(quote), 'date':'2026-11-17',
              'source':'Tabellenstand 17.11.2026; ursprüngliches Kursdatum unbekannt'})
    tab = tabs['Liquidität']
    types = {'Einzahlung':'deposit','Auszahlung':'withdrawal','Ausschüttung':'dividend','Kosten':'fee',
             'Zinsen':'interest','Steuern':'tax','Steuererstattung':'refund','Sonstiger Kauf':'unclassified_out'}
    for row in range(3,301):
        dt, amount, kind = cell(tab,f'A{row}'),cell(tab,f'B{row}'),cell(tab,f'C{row}','stringValue')
        if dt is None and amount is None and kind is None:
            continue
        if dt is None or amount is None or kind not in types:
            raise Problem(f'Liquidität, Zeile {row}: unvollständige oder unbekannte Buchung.')
        expected_positive = kind in {'Einzahlung','Ausschüttung','Zinsen','Steuererstattung'}
        if not amount or (amount > 0) != expected_positive:
            raise Problem(f'Liquidität, Zeile {row}: unerwartetes Vorzeichen.')
        p['transactions'].append({'date':serial(dt),'type':types[kind], 'amount':numeric(abs(amount)),
          'quantity':'0','fee':'0','tax':'0','note':f'Vorlage: Liquidität!A{row}:C{row}'})
    return validate_portfolio(p)


def preview(p):
    p = validate_portfolio(p)
    return {'portfolio': p, 'digest': hashlib.sha256(encode(p).encode()).hexdigest(),
            'summary': {'name':p['name'], 'mode':p['mode'], 'instruments':len(p['instruments']),
                        'transactions':len(p['transactions']), 'quotes':len(p['quotes'])}}

