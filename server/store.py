"""SQLite persistence, revision control and idempotent atomic commands."""
import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager, closing
from datetime import datetime, timezone
from pathlib import Path
from .domain import Problem, instrument, transaction, number, day, check_holdings


def encode(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version not in (0, 1):
                raise RuntimeError('Unbekannte Datenbankversion. Keine automatische Änderung.')
            db.executescript('''
                CREATE TABLE IF NOT EXISTS meta (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL);
                INSERT OR IGNORE INTO meta VALUES(1,0);
                CREATE TABLE IF NOT EXISTS portfolios (id TEXT PRIMARY KEY, name TEXT NOT NULL, mode TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS records (
                  sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL,
                  portfolio_id TEXT NOT NULL REFERENCES portfolios(id), kind TEXT NOT NULL,
                  payload TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS records_portfolio ON records(portfolio_id,kind);
                CREATE TABLE IF NOT EXISTS requests (key TEXT PRIMARY KEY, digest TEXT NOT NULL, result TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS imports (digest TEXT PRIMARY KEY, portfolio_id TEXT NOT NULL REFERENCES portfolios(id));
                CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, created TEXT NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL);
                PRAGMA user_version=1;
            ''')
            if not db.execute('SELECT 1 FROM portfolios').fetchone():
                db.execute('INSERT INTO portfolios VALUES(?,?,?)', (str(uuid.uuid4()), 'Mein Depot', 'live'))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        try:
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

    def revision(self, db):
        return db.execute('SELECT revision FROM meta WHERE id=1').fetchone()[0]

    def records(self, db, pid, kind):
        return [{**json.loads(r['payload']), 'id': r['id'], 'sequence': r['sequence']}
                for r in db.execute('SELECT * FROM records WHERE portfolio_id=? AND kind=? ORDER BY sequence', (pid, kind))]

    def add(self, db, pid, kind, data):
        rid = str(uuid.uuid4())
        db.execute('INSERT INTO records(id,portfolio_id,kind,payload) VALUES(?,?,?,?)', (rid, pid, kind, encode(data)))
        return rid

    def snapshot(self):
        with self.connect() as db:
            db.execute('BEGIN')
            portfolios = [dict(p) for p in db.execute('SELECT * FROM portfolios ORDER BY rowid')]
            for p in portfolios:
                for key in ('instruments', 'transactions', 'quotes'):
                    p[key] = self.records(db, p['id'], key)
            return {'schema_version': 1, 'revision': self.revision(db), 'portfolios': portfolios}

    def command(self, key, revision, action, data):
        if not isinstance(key, str) or not 8 <= len(key) <= 100:
            raise Problem('Ungültige Wiederholungskennung.')
        digest = hashlib.sha256(encode({'action': action, 'data': data}).encode()).hexdigest()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            previous = db.execute('SELECT * FROM requests WHERE key=?', (key,)).fetchone()
            if previous:
                if previous['digest'] != digest:
                    raise Problem('Wiederholungskennung wurde bereits für andere Daten verwendet.', 409)
                return json.loads(previous['result'])
            if type(revision) is not int or revision != self.revision(db):
                raise Problem('Daten wurden zwischenzeitlich geändert. Ansicht neu laden und Eingabe prüfen.', 412)
            result = self.apply(db, action, data)
            db.execute('UPDATE meta SET revision=revision+1 WHERE id=1')
            result['revision'] = self.revision(db)
            db.execute('INSERT INTO requests VALUES(?,?,?)', (key, digest, encode(result)))
            db.execute('INSERT INTO audit(created,action,payload) VALUES(?,?,?)',
                       (datetime.now(timezone.utc).isoformat(), action, encode(data)))
            return result

    def apply(self, db, action, data):
        from .domain import text
        if action == 'portfolio_create':
            pid = str(uuid.uuid4())
            mode = data.get('mode', 'example')
            if not isinstance(mode, str) or mode not in {'live', 'example'}:
                raise Problem('Ungültiger Depotmodus.')
            db.execute('INSERT INTO portfolios VALUES(?,?,?)', (pid, text(data.get('name'), 'Depotname', 80), mode))
            return {'portfolio_id': pid}
        if action == 'import':
            return self.import_portfolio(db, data)
        pid = data.get('portfolio_id')
        if not isinstance(pid, str):
            raise Problem('Ungültige Depotkennung.')
        if not db.execute('SELECT 1 FROM portfolios WHERE id=?', (pid,)).fetchone():
            raise Problem('Depot nicht gefunden.', 404)
        instruments = self.records(db, pid, 'instruments')
        ids = {i['id'] for i in instruments}
        if action == 'instrument_add':
            item = instrument(data)
            if any(i['isin'] == item['isin'] for i in instruments):
                raise Problem('Diese ISIN ist im Depot bereits vorhanden.', 409)
            rid = self.add(db, pid, 'instruments', item)
        elif action == 'transaction_add':
            item = transaction(data, ids)
            check_holdings(self.records(db, pid, 'transactions') + [item])
            rid = self.add(db, pid, 'transactions', item)
        elif action == 'transaction_void':
            rows = self.records(db, pid, 'transactions')
            row = next((r for r in rows if r['id'] == data.get('id')), None)
            if not row or row['void']:
                raise Problem('Aktive Buchung nicht gefunden.', 404)
            row['void'] = True
            row['void_reason'] = text(data.get('reason'), 'Stornogrund', 500)
            check_holdings(rows)
            rid = row.pop('id')
            row.pop('sequence')
            db.execute('UPDATE records SET payload=? WHERE id=?', (encode(row), rid))
        elif action == 'quote_add':
            if not isinstance(data.get('instrument_id'), str) or data.get('instrument_id') not in ids:
                raise Problem('Wertpapier nicht gefunden.')
            rid = self.add(db, pid, 'quotes', {'instrument_id': data['instrument_id'],
                'price': number(data.get('price'), 'Kurs', False), 'date': day(data.get('date')),
                'source': text(data.get('source', 'Manuell'), 'Kursquelle', 120), 'currency': 'EUR'})
        else:
            raise Problem('Unbekannte Aktion.')
        return {'id': rid, 'portfolio_id': pid}

    def import_portfolio(self, db, data):
        p = data['portfolio']
        digest = data['digest']
        if db.execute('SELECT 1 FROM imports WHERE digest=?', (digest,)).fetchone():
            raise Problem('Dieser Datenstand wurde bereits importiert.', 409)
        pid = str(uuid.uuid4())
        db.execute('INSERT INTO portfolios VALUES(?,?,?)', (pid, p['name'], p['mode']))
        mapping = {}
        for item in p['instruments']:
            old_id = item['id']
            mapping[old_id] = self.add(db, pid, 'instruments', instrument(item))
        transactions = []
        for item in p['transactions']:
            normalized = transaction({**item, 'instrument_id': mapping.get(item.get('instrument_id'))}, set(mapping.values()))
            normalized['void'] = item.get('void', False)
            if item.get('void_reason'):
                normalized['void_reason'] = item['void_reason']
            transactions.append(normalized)
        check_holdings(transactions)
        for item in transactions:
            self.add(db, pid, 'transactions', item)
        for q in p['quotes']:
            self.apply(db, 'quote_add', {**q, 'portfolio_id': pid, 'instrument_id': mapping[q['instrument_id']]})
        db.execute('INSERT INTO imports VALUES(?,?)', (digest, pid))
        return {'portfolio_id': pid}

    def backup(self):
        folder = self.path.parent / 'backups'
        folder.mkdir(exist_ok=True)
        target = folder / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.sqlite3')
        with self.connect() as source, closing(sqlite3.connect(target)) as destination:
            source.backup(destination)
            if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise Problem('Sicherung konnte nicht geprüft werden.', 500)
        return target
