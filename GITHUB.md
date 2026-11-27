# GitHub und Datenschutz

Repository: https://github.com/KillerLKW/Investmenttracker
Website: https://killerlkw.github.io/Investmenttracker/

Nutzerentscheidung vom 27.11.2026: nur Code, ohne Vorlagendaten. Deshalb sind documentation/, tests/, test-results/, data/, releases/, die fertige Investmenttracker.html und die fertige Pi-HTML vollständig ausgeschlossen. Auch Zugangsdaten, Datenbanken und Browserprofile bleiben lokal.

Der bestehende lokale Projektordner behält seine App, Vorlagen, Dokumentation, Prüfungen und Sicherungen. Diese Dateien werden nicht gelöscht. Der frühere lokale Entwicklungsstand bleibt zusätzlich unter einer rein lokalen Git-Referenz erhalten; diese darf nicht mit --mirror oder vergleichbaren Befehlen hochgeladen werden. Der main-Zweig hat eine neue, ausschließlich aus Quellcode bestehende Historie.

Für GitHub Pages gibt es zusätzlich `tools/build_pages.py`: Der Builder erzeugt ausschließlich aus Quellcode eine leere Webausgabe unter `site/` bzw. mit `--output docs` unter `docs/`, ohne eine Datei aus den ausgeschlossenen Datenordnern zu lesen. Dieser generierte Website-Code enthält keine eingebetteten Vorlagendatensätze. Eigene Depotdaten werden ausschließlich im jeweiligen Browser gespeichert und verarbeitet.

Am 27.11.2026 hat der Nutzer ausdrücklich freigegeben, das bestehende Investmenttracker-Repository samt Quellcode öffentlich zu machen und GitHub Pages dort zu aktivieren. Die frühere datenhaltige Historie bleibt weiterhin nur lokal; veröffentlicht wird ausschließlich der bereinigte Quellcode mit der datenfreien Website.

Vor zukünftigen Commits stets git status und git diff --cached prüfen. GitHub sichert den ausgewählten Programmcode; eigene Depots benötigen weiterhin eine vollständige JSON-Sicherung.
