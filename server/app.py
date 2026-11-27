import json
import os
import secrets
import sqlite3
import time
from datetime import datetime
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from .domain import Problem, overview, cash
from decimal import Decimal
from .imports import source_portfolio, preview
from .store import Store

ROOT = Path(__file__).resolve().parent.parent


def create_app(database=None):
    store = Store(database or Path(os.getenv('INVESTMENT_DATA_DIR', ROOT/'data'))/'investmenttracker.sqlite3')
    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
    token = secrets.token_urlsafe(32)
    previews = {}
    app.state.store = store

    @app.exception_handler(Problem)
    async def problem_handler(request, exc):
        return JSONResponse({'error': exc.message}, status_code=exc.status)

    @app.exception_handler(sqlite3.OperationalError)
    async def storage_error(request, exc):
        return JSONResponse({'error':'Speicherung vorübergehend nicht möglich. Eingabe behalten und erneut versuchen.'}, status_code=503)

    @app.middleware('http')
    async def local_only(request: Request, call_next):
        host = request.headers.get('host', '')
        if host.split(':')[0] not in {'127.0.0.1', 'localhost', 'testserver'}:
            return JSONResponse({'error':'Nur lokaler Zugriff ist freigegeben.'}, status_code=403)
        if request.url.path.startswith('/api/'):
            origin = request.headers.get('origin')
            if request.headers.get('sec-fetch-site') == 'cross-site' or (origin and origin != f'http://{host}'):
                return JSONResponse({'error':'Fremder Ursprung nicht erlaubt.'}, status_code=403)
            if request.method not in {'GET','HEAD'} and not secrets.compare_digest(request.headers.get('x-app-token',''),token):
                return JSONResponse({'error':'Sitzung abgelaufen. Bitte Seite neu laden.'}, status_code=403)
            if request.method == 'POST':
                if 'application/json' not in request.headers.get('content-type',''):
                    return JSONResponse({'error':'JSON erwartet.'},status_code=415)
                body = await request.body()
                if len(body) > 8_000_000:
                    return JSONResponse({'error':'Datei ist zu groß (max. 8 MB).'},status_code=413)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        return response

    async def body(request):
        try:
            result = await request.json()
        except (ValueError, UnicodeError):
            raise Problem('Ungültige JSON-Datei.')
        if not isinstance(result, dict):
            raise Problem('JSON-Objekt erwartet.')
        return result

    @app.get('/api/health')
    def health():
        return {'app':'investmenttracker','version':'0.1.0'}

    @app.get('/api/state')
    def state(as_of: str = ''):
        # Browser supplies its local date, avoiding host-timezone assumptions.
        as_of = as_of or datetime.now().date().isoformat()
        snapshot = store.snapshot()
        for p in snapshot['portfolios']:
            p['overview'] = overview(p['instruments'],p['transactions'],p['quotes'],as_of)
            for t in p['transactions']:
                t['cash_effect'] = str(cash(t))
                t['charges'] = str(Decimal(t['fee']) + Decimal(t['tax']))
        return {**snapshot,'token':token, 'data_path':str(store.path)}

    @app.post('/api/command')
    async def command(request: Request):
        b = await body(request)
        if not isinstance(b.get('action'), str) or b.get('action') not in {'portfolio_create','instrument_add','transaction_add','transaction_void','quote_add'}:
            raise Problem('Ungültige Aktion.')
        if not isinstance(b.get('data'),dict):
            raise Problem('Buchungsdaten fehlen.')
        return store.command(b.get('key'),b.get('revision'),b['action'],b['data'])

    @app.post('/api/import/preview')
    async def import_preview(request: Request):
        b = await body(request)
        if b.get('source') == 'template':
            result = preview(source_portfolio(ROOT/'documentation/source-analysis.json'))
            warnings = ['Nur Beispielwerte, keine Aussage über aktuell verfügbare Mittel.',
                        'Kurse gelten als abgelesener Tabellenstand am 17.11.2026; ursprünglicher Kurszeitpunkt unbekannt.',
                        'Nur originale ETF- und Cash-Buchungen; bekannte Fehler abgeleiteter Tabellen werden nicht übernommen.',
                        'Liquidität!103: „Sonstiger Kauf“ (10,10 EUR) wird als ungeklärter Cash-Abgang erhalten. Ergebnis und Rendite bleiben bis zur Zuordnung offen.']
        else:
            raw = b.get('file')
            if not isinstance(raw,dict) or raw.get('schema_version') != 1 or 'portfolio' not in raw:
                raise Problem('Bitte einen Investmenttracker-Depotexport (Version 1) auswählen.')
            result = preview(raw['portfolio'])
            warnings = ['Wird als separates Depot angelegt. Bestehende Daten bleiben erhalten.']
        now = time.monotonic()
        for key in list(previews):
            if now-previews[key]['time'] > 1800:
                previews.pop(key)
        if len(previews) >= 20:
            previews.pop(next(iter(previews)))
        preview_id = secrets.token_urlsafe(20)
        previews[preview_id] = {**result, 'time':now}
        return {'preview_id':preview_id,'summary':result['summary'],'warnings':warnings}

    @app.post('/api/import/commit')
    async def import_commit(request: Request):
        b = await body(request)
        item = previews.get(str(b.get('preview_id')))
        if not item or time.monotonic()-item['time'] > 1800:
            raise Problem('Importvorschau abgelaufen. Bitte erneut prüfen.')
        store.backup()
        return store.command(b.get('key'),b.get('revision'),'import',
                             {'portfolio':item['portfolio'],'digest':item['digest']})

    @app.get('/api/export/{pid}')
    def export(pid: str):
        p = next((p for p in store.snapshot()['portfolios'] if p['id'] == pid),None)
        if p is None:
            raise Problem('Depot nicht gefunden.',404)
        return JSONResponse({'schema_version':1,'portfolio':p},headers={'Content-Disposition':'attachment; filename="investmenttracker-depot.json"'})

    @app.post('/api/backup')
    def backup():
        path = store.backup()
        return {'path':str(path), 'message':'Datenbanksicherung erstellt und Integrität geprüft.'}

    @app.get('/')
    def index():
        return FileResponse(ROOT/'web/index.html')

    app.mount('/assets',StaticFiles(directory=ROOT/'web'),name='assets')
    app.mount('/brand',StaticFiles(directory=ROOT/'design/brand'),name='brand')
    return app
