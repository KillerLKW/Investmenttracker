"""Local launcher. Never exposes the service to the LAN."""
import argparse
import json
import socket
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
import uvicorn
from server.app import create_app


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--no-browser', action='store_true')
    parser.add_argument('--port', type=int, default=8766)
    args = parser.parse_args()
    url = f'http://127.0.0.1:{args.port}'
    try:
        with urllib.request.urlopen(url+'/api/health', timeout=1) as response:
            if json.load(response).get('app') == 'investmenttracker':
                if not args.no_browser:
                    webbrowser.open(url)
                print('Investmenttracker läuft bereits: '+url)
                return
    except Exception:
        pass
    sock = socket.socket()
    try:
        sock.bind(('127.0.0.1', args.port))
    except OSError:
        raise SystemExit(f'Port {args.port} ist belegt. Anderen Port mit --port auswählen.')
    finally:
        sock.close()
    app = create_app()
    if not args.no_browser:
        def open_when_ready():
            for _ in range(100):
                try:
                    with urllib.request.urlopen(url+'/api/health', timeout=.4):
                        webbrowser.open(url)
                        return
                except Exception:
                    time.sleep(.1)
        threading.Thread(target=open_when_ready, daemon=True).start()
    print('Investmenttracker: '+url, flush=True)
    uvicorn.run(app, host='127.0.0.1', port=args.port, log_level='warning', access_log=False)


if __name__ == '__main__':
    main()
