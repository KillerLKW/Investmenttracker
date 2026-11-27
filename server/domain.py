"""Pure decimal accounting. Cash amounts are positive inputs; type owns the sign."""
from datetime import date
from decimal import Decimal, InvalidOperation, localcontext, DefaultContext, getcontext
import re

# 27-digit accepted operands can produce 54-digit products; retain headroom for sums.
DefaultContext.prec = 64
getcontext().prec = 64

TYPES = {'deposit', 'withdrawal', 'buy', 'sell', 'dividend', 'interest', 'fee', 'tax', 'refund', 'unclassified_out'}
POSITIVE = {'deposit', 'sell', 'dividend', 'interest', 'refund'}


class Problem(Exception):
    def __init__(self, message, status=422):
        self.message, self.status = message, status


def text(value, label, maximum=160):
    if not isinstance(value, str) or not value.strip() or len(value) > maximum:
        raise Problem(f'{label}: bitte einen gültigen Text eingeben (max. {maximum} Zeichen).')
    return value.strip()


def number(value, label, zero=True):
    if not isinstance(value, str) or not re.fullmatch(r'\d{1,15}(\.\d{1,12})?', value):
        raise Problem(f'{label}: positive Dezimalzahl mit höchstens 12 Nachkommastellen erwartet.')
    try:
        result = Decimal(value)
    except InvalidOperation:
        raise Problem(f'{label}: ungültige Zahl.')
    if result < 0 or (not zero and result == 0):
        raise Problem(f'{label} muss größer als null sein.')
    return format(result, 'f')


def day(value):
    try:
        result = date.fromisoformat(value)
        if result.isoformat() != value or result.year < 1900 or result.year > 2200:
            raise ValueError()
        return value
    except (TypeError, ValueError):
        raise Problem('Bitte ein gültiges Datum zwischen 1900 und 2200 angeben.')


def instrument(data):
    isin = text(data.get('isin'), 'ISIN', 12).upper()
    if not re.fullmatch(r'[A-Z]{2}[A-Z0-9]{9}\d', isin):
        raise Problem('ISIN muss aus zwei Länderbuchstaben und zehn weiteren Zeichen bestehen.')
    digits = ''.join(str(int(c, 36)) if c.isalpha() else c for c in isin)
    total = sum((int(v)*2 // 10 + int(v)*2 % 10) if i % 2 else int(v)
                for i, v in enumerate(reversed(digits)))
    if total % 10:
        raise Problem('Die Prüfziffer der ISIN stimmt nicht.')
    return {'name': text(data.get('name'), 'Name'), 'isin': isin,
            'category': text(data.get('category', 'Ohne Zuordnung'), 'Strategie', 60), 'currency': 'EUR'}


def transaction(data, instrument_ids):
    kind = data.get('type')
    if not isinstance(kind, str) or kind not in TYPES:
        raise Problem('Unbekannter Buchungstyp.')
    iid = data.get('instrument_id') or None
    if iid is not None and not isinstance(iid, str):
        raise Problem('Ungültige Wertpapierkennung.')
    if iid and iid not in instrument_ids:
        raise Problem('Wertpapier gehört nicht zu diesem Depot.')
    if kind in {'buy', 'sell'} and not iid:
        raise Problem('Für Kauf oder Verkauf ein Wertpapier auswählen.')
    result = {'type': kind, 'date': day(data.get('date')), 'instrument_id': iid,
              'amount': number(data.get('amount'), 'Betrag', False),
              'quantity': number(data.get('quantity', '0'), 'Stückzahl', kind not in {'buy', 'sell'}),
              'fee': number(data.get('fee', '0'), 'Gebühren'),
              'tax': number(data.get('tax', '0'), 'Steuern'),
              'note': str(data.get('note', ''))[:500], 'void': False}
    if kind not in {'buy', 'sell'} and Decimal(result['quantity']) != 0:
        raise Problem('Nur Käufe und Verkäufe dürfen Stückzahlen enthalten.')
    if kind not in {'buy', 'sell', 'dividend', 'interest'} and (Decimal(result['fee']) or Decimal(result['tax'])):
        raise Problem('Bei diesem Buchungstyp Gebühren/Steuern als eigene Buchung erfassen.')
    return result


def cash(tx):
    amount = Decimal(tx['amount']) * (1 if tx['type'] in POSITIVE else -1)
    return amount - Decimal(tx['fee']) - Decimal(tx['tax'])


def check_holdings(transactions):
    # At day resolution buys precede sells; same-day executions cannot be ordered more precisely.
    holdings = {}
    for t in sorted((t for t in transactions if not t.get('void')), key=lambda t: (t['date'], t['type'] == 'sell')):
        if t['type'] not in {'buy', 'sell'}:
            continue
        key = t['instrument_id']
        holdings[key] = holdings.get(key, Decimal(0)) + Decimal(t['quantity']) * (1 if t['type'] == 'buy' else -1)
        if holdings[key] < 0:
            raise Problem(f"Verkauf am {t['date']} würde einen negativen Bestand erzeugen.")


def xirr(flows):
    """Conservative unique-root case: negative contributions followed by terminal positive value."""
    combined = {}
    for d, v in flows:
        combined[d] = combined.get(d, Decimal(0)) + v
    rows = sorted((date.fromisoformat(d), v) for d, v in combined.items() if v)
    if len(rows) < 2 or rows[0][0] == rows[-1][0]:
        return None, 'Für eine Jahresrendite werden Zahlungen an unterschiedlichen Tagen benötigt.'
    signs = [v > 0 for _, v in rows]
    if signs[0] or not signs[-1] or sum(a != b for a, b in zip(signs, signs[1:])) != 1:
        return None, 'Für diese Zahlungsfolge wird noch keine eindeutig abgesicherte XIRR ausgegeben.'
    with localcontext() as ctx:
        ctx.prec = 38
        times = [Decimal((d-rows[0][0]).days) / 365 for d, _ in rows]
        def npv(log_rate):
            return sum(v * (-log_rate*t).exp() for (_, v), t in zip(rows, times))
        lo, hi = Decimal(-20), Decimal(20)
        if npv(lo) * npv(hi) >= 0:
            return None, 'Keine Renditelösung im unterstützten Wertebereich.'
        for _ in range(150):
            mid = (lo+hi)/2
            if npv(mid) > 0:
                lo = mid
            else:
                hi = mid
        return str((((lo+hi)/2).exp()-1)), None


def overview(instruments, transactions, quotes, as_of):
    day(as_of)
    active = [t for t in transactions if not t.get('void') and t['date'] <= as_of]
    balance = sum((cash(t) for t in active), Decimal(0))
    contributions = sum((Decimal(t['amount']) * (1 if t['type'] == 'deposit' else -1)
                         for t in active if t['type'] in {'deposit', 'withdrawal'}), Decimal(0))
    positions, warnings = [], []
    invested = Decimal(0)
    for ins in instruments:
        qty = sum((Decimal(t['quantity']) * (1 if t['type'] == 'buy' else -1)
                   for t in active if t['instrument_id'] == ins['id'] and t['type'] in {'buy', 'sell'}), Decimal(0))
        eligible = [q for q in quotes if q['instrument_id'] == ins['id'] and q['date'] <= as_of]
        latest = max(eligible, key=lambda q: (q['date'], q['sequence']), default=None)
        value = qty * Decimal(latest['price']) if latest else (Decimal(0) if qty == 0 else None)
        if value is not None:
            invested += value
        if qty and not latest:
            warnings.append(f"{ins['name']}: Kurs zum Stichtag fehlt.")
        elif qty and (date.fromisoformat(as_of)-date.fromisoformat(latest['date'])).days > 7:
            warnings.append(f"{ins['name']}: Kurs älter als sieben Tage.")
        positions.append({**ins, 'quantity': str(qty), 'quote': latest, 'value': str(value) if value is not None else None})
    complete = all(p['value'] is not None for p in positions)
    total = balance + invested if complete else None
    if balance < 0:
        warnings.append('Cash-Bestand negativ. Fehlende Einzahlungen oder Buchungen prüfen.')
    future = sum(not t.get('void') and t['date'] > as_of for t in transactions)
    if future:
        warnings.append(f'{future} Buchung(en) liegen nach dem Stichtag und sind nicht eingerechnet.')
    flows = [(t['date'], Decimal(t['amount']) * (-1 if t['type'] == 'deposit' else 1))
             for t in active if t['type'] in {'deposit', 'withdrawal'}]
    unresolved = any(t['type'] == 'unclassified_out' for t in active)
    if unresolved:
        warnings.append('Nicht zugeordneter Cash-Abgang: mögliche fehlende Anlage prüfen. Ergebnis und Rendite bleiben bis zur Klärung offen.')
    rate, rate_note = xirr(flows + [(as_of, total)]) if total is not None and not unresolved else (None, 'Bewertung oder Buchungszuordnung unvollständig.')
    return {'as_of': as_of, 'cash': str(balance), 'invested': str(invested) if complete else None,
            'known_invested': str(invested), 'total': str(total) if total is not None else None,
            'contributions': str(contributions), 'gain': str(total-contributions) if total is not None and not unresolved else None,
            'positions': positions, 'warnings': warnings, 'xirr': rate, 'xirr_note': rate_note}

