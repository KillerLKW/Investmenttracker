# Investmenttracker

Privates Quellcode-Repository des lokalen Investmenttrackers.

Enthalten sind die Oberfläche in HTML/CSS/JavaScript, die Finanz- und Speicherlogik, das Python-Backend, der Pi-Synchronisierungsdienst sowie Build- und Betriebsskripte.

**Keine Vorlagendaten:** Tabellen-Auszüge, Portfolio-/Transaktionsdaten, Beispielimporte, Testdaten, Entwicklungsprotokolle und fertige HTML-/ZIP-Dateien gehören nicht zu diesem Repository. Die fertigen Apps enthalten eine eingebettete Vorlage und bleiben deshalb ausschließlich lokal.

## Lokal verwenden

Die bestehende lokale App kann weiterhin unverändert über Investmenttracker.html geöffnet werden. Ein GitHub-Upload ersetzt keine JSON-Sicherung der eigenen Depots und aktualisiert die Pi-Website nicht.

## Entwicklung

- Oberfläche und Rechenmodelle: web/
- Früheres Python-Backend: server/
- Pi-Dienst und Installer: pi/
- Build: build_standalone.py und tools/build_sync.py
- Kursabruf-Helfer: tools/eodhd_quotes.py

Die bisherigen Build- und Prüfabläufe erwarten zusätzlich lokale Quelldatensätze unter documentation/ und lokale Nachweise unter test-results/. Diese Daten sind bewusst ausgeschlossen. Ein frischer Clone allein erzeugt daher noch keine fertige App; passende eigene Datensätze oder eine spätere datensatzunabhängige Build-Variante sind dafür erforderlich.

Weitere Hinweise: [GITHUB.md](GITHUB.md).
