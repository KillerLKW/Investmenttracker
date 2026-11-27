# Investmenttracker

Quellcode-Repository des Investmenttrackers.

Website: [Investmenttracker öffnen](https://killerlkw.github.io/Investmenttracker/).

Enthalten sind die Oberfläche in HTML/CSS/JavaScript, die Finanz- und Speicherlogik, das Python-Backend, der Pi-Synchronisierungsdienst sowie Build- und Betriebsskripte.

**Keine Vorlagendaten:** Tabellen-Auszüge, Portfolio-/Transaktionsdaten, Beispielimporte, Testdaten und Entwicklungsprotokolle gehören nicht zu diesem Repository. Die bisherigen fertigen Offline-/Pi-Apps enthalten eine eingebettete Vorlage und bleiben ausschließlich lokal. Die Website unter `docs/` wird getrennt und ohne diese Daten aus dem Quellcode gebaut.

## Lokal verwenden

Die bestehende lokale App kann weiterhin unverändert über Investmenttracker.html geöffnet werden. Ein GitHub-Upload ersetzt keine JSON-Sicherung der eigenen Depots und aktualisiert die Pi-Website nicht.

## Entwicklung

- Oberfläche und Rechenmodelle: web/
- Früheres Python-Backend: server/
- Pi-Dienst und Installer: pi/
- Build: build_standalone.py und tools/build_sync.py
- Kursabruf-Helfer: tools/eodhd_quotes.py

## Datenfreie Webausgabe

Mit Python 3.11 oder neuer lässt sich eine statische Website ohne Quelldatensätze bauen:

```console
python tools/build_pages.py
```

Das Ergebnis steht unter `site/index.html` und `site/.nojekyll`. Der Build liest ausschließlich Programmcode und das Logo; Vorlagen, Beispieldepots und Zugangsdaten werden nicht eingebettet. Eigene Eingaben und Sicherungsimporte bleiben im Browser. Es gibt keinen automatischen Abgleich zwischen Geräten. Feste Handelsvorschauen, die die ausgeschlossene Vorlagenzuordnung benötigen, sind in dieser Ausgabe nicht enthalten.

Für GitHub Pages wird dieselbe Ausgabe mit `python tools/build_pages.py --output docs` unter `docs/` erzeugt. Pages veröffentlicht den Ordner `docs/` des Zweigs `main`.

Die bisherigen vollständigen Offline-/Pi-Builds und historischen Prüfabläufe erwarten weiterhin lokale Quelldatensätze unter documentation/ und Nachweise unter test-results/. Diese Daten bleiben ausgeschlossen.

Weitere Hinweise: [GITHUB.md](GITHUB.md).
