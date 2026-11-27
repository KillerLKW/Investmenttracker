#!/bin/sh
set -eu
stage=$1
public_host=$2
case "$stage" in .investmenttracker-sync-*) ;; *) echo 'Invalid staging directory' >&2; exit 1;; esac
case "$public_host" in ''|*[!a-zA-Z0-9.-]*) echo 'Invalid host' >&2; exit 1;; esac
site=/etc/nginx/sites-available/tasktracker-https
snippet=/etc/nginx/snippets/investmenttracker-api.conf
keyfile=/etc/investmenttracker-sync.env
test -f "$site"
test -L /etc/nginx/sites-enabled/tasktracker-https
grep -Eq '^[[:space:]]*listen 443 ssl;' "$site"
if ! grep -Fq "include $snippet;" "$site"; then
    test "$(grep -cE '^[[:space:]]*location / \{' "$site")" -eq 1
    if grep -Eq 'location[[:space:]].*/investmenttracker' "$site"; then echo 'Existing Investmenttracker route needs review' >&2; exit 1; fi
fi
command -v python3 >/dev/null
nginx -t
test -f "$stage/sync_server.py"
test -f "$stage/Investmenttracker-Pi.html"
python3 -m py_compile "$stage/sync_server.py"
install -d -m 755 /opt/investmenttracker-sync
install -m 644 "$stage/sync_server.py" /opt/investmenttracker-sync/sync_server.py
install -m 644 "$stage/Investmenttracker-Pi.html" /opt/investmenttracker-sync/Investmenttracker-Pi.html
if ! test -e "$keyfile"; then
    (umask 077; python3 -c 'import secrets; print("INVESTMENT_SYNC_KEY=" + secrets.token_hex(32))' > "$keyfile")
    printf 'INVESTMENT_SYNC_ORIGIN=https://%s\n' "$public_host" >> "$keyfile"
fi
grep -Fxq "INVESTMENT_SYNC_ORIGIN=https://$public_host" "$keyfile"
chmod 600 "$keyfile"
cat > /etc/systemd/system/investmenttracker-sync.service <<'UNIT'
[Unit]
Description=Investmenttracker explicit snapshot sync
After=network.target

[Service]
ExecStart=/usr/bin/python3 /opt/investmenttracker-sync/sync_server.py
EnvironmentFile=/etc/investmenttracker-sync.env
DynamicUser=yes
StateDirectory=investmenttracker-sync
StateDirectoryMode=0700
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
Restart=on-failure

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable investmenttracker-sync.service
systemctl restart investmenttracker-sync.service
systemctl is-active --quiet investmenttracker-sync.service
install -d -m 700 /var/backups/investmenttracker-sync
backup=$(mktemp /var/backups/investmenttracker-sync/nginx.XXXXXX)
cp -p "$site" "$backup"
previous=
if test -f "$snippet"; then
    previous=$(mktemp /var/backups/investmenttracker-sync/snippet.XXXXXX)
    cp -p "$snippet" "$previous"
fi
cat > "$snippet" <<'NGINX'
location = /investmenttracker/ {
    proxy_pass http://127.0.0.1:8795;
    proxy_set_header Host $host;
}
location = /investmenttracker-api/snapshot {
    client_max_body_size 8m;
    proxy_pass http://127.0.0.1:8795;
    proxy_set_header Host $host;
}
NGINX
if ! grep -Fq "include $snippet;" "$site"; then
    sed -i "/^[[:space:]]*location \/ {/i\    include $snippet;" "$site"
fi
if ! nginx -t || ! systemctl reload nginx; then
    cp -p "$backup" "$site"
    if test -n "$previous"; then cp -p "$previous" "$snippet"; else rm -f "$snippet"; fi
    systemctl reload nginx
    echo 'Nginx setup failed; previous site restored.' >&2
    exit 1
fi
printf '\nBereit: https://%s/investmenttracker/\n' "$public_host"
printf 'Freigabeschluessel auf dem Pi anzeigen: sudo cat /etc/investmenttracker-sync.env\n'
printf 'Vor Datenwechsel die bisherige Offline-App als JSON sichern. Kein automatischer Datenimport.\n'
