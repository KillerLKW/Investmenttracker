# GitHub und Datenschutz

Ziel: privates Repository https://github.com/KillerLKW/Investmenttracker

Nutzerentscheidung vom 27.11.2026: nur Code, ohne Vorlagendaten. Deshalb sind documentation/, tests/, test-results/, data/, releases/, die fertige Investmenttracker.html und die fertige Pi-HTML vollständig ausgeschlossen. Auch Zugangsdaten, Datenbanken und Browserprofile bleiben lokal.

Der bestehende lokale Projektordner behält seine App, Vorlagen, Dokumentation, Prüfungen und Sicherungen. Diese Dateien werden nicht gelöscht. Der frühere lokale Entwicklungsstand bleibt zusätzlich unter einer rein lokalen Git-Referenz erhalten; diese darf nicht mit --mirror oder vergleichbaren Befehlen hochgeladen werden. Der zu veröffentlichende main-Zweig hat eine neue, ausschließlich aus Quellcode bestehende Historie.

Vor zukünftigen Commits stets git status und git diff --cached prüfen. GitHub sichert den ausgewählten Programmcode; eigene Depots benötigen weiterhin eine vollständige JSON-Sicherung.
