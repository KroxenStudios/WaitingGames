# Waiting Games – Release Notes

## 2026-10-30

### Neu: E-Scooter Klicker
Ein neues Spiel in den Waiting Games: Klicke den E-Scooter, baue deine Flotte auf und kaufe Power-ups.

- **Klicken:** Jeder Klick gibt dir Scooter. Für jeden neuen Scooter erscheint einer in deiner Flotte (bis zu 160 gleichzeitig sichtbar).
- **Power-ups:** Acht Upgrades mit steigenden Preisen.
  - Mehr pro Klick: Kräftiger Kick, Turbo-Motor.
  - Automatische Produktion: Praktikant, Ladestation, Sharing-Flotte, Scooter-Fabrik, Gigafactory, Mond-Werkstatt.
- **Meilensteine:** 19 Meilensteine zum Sammeln, von „Der erste Scooter“ über „Manufaktur“ und „Globale Produktion“ bis „Die Erde ist zu 100 % mit E-Scootern bedeckt“.
  - Beim Erreichen erscheint ein Hinweis; danach ist der Text im Tab „Meilensteine“ nachlesbar.
  - Noch nicht erreichte Meilensteine zeigen nur ihr Ziel.
  - Ein Balken zeigt, wie viel der Erdoberfläche bereits bedeckt ist.
- **Speicherstand:** Wird automatisch im Browser gespeichert. Über „Spielstand zurücksetzen“ kannst du neu beginnen.
- **Bedienung:** Maus, Touch oder Leertaste/Enter. Das Layout passt sich Handy-Bildschirmen an.
- Zahlen werden ab 10.000 abgekürzt (Tsd, Mio, Mrd, Bio, Brd).

### Neu: Deutsch und Englisch
- Alle Waiting Games (Startseite, Asphalt Arkade, Mattenwurf, E-Scooter Klicker) gibt es jetzt auf Deutsch und Englisch.
- Die Sprache folgt beim ersten Besuch der Browsersprache. Über **DE | EN** oben rechts auf der Startseite wechselst du; die Wahl wird gespeichert und gilt für alle Spiele.
- Auch Meilensteine, Meldungen im Spiel, Ladenschilder, Autonamen und die Datenschutzerklärung sind übersetzt. Die englische Datenschutzerklärung ist eine Übersetzung als Service, maßgeblich bleibt der deutsche Text.
- Technisch: gemeinsame Datei `i18n.js` (`WG.L(de, en)`), Speicherschlüssel `wg-lang`.

### Startseite
- Neue Karte für den E-Scooter Klicker.
- **Farbschema-Umschalter** oben rechts: Dunkelblau oder Beige. Beim ersten Besuch gilt die Systemeinstellung, danach deine Wahl.
- Die Farbe der Browserleiste folgt dem gewählten Schema.

### Technisches
- Das CSS der Startseite liegt jetzt in `styles.css` statt inline in `index.html`. Alle Farben sind CSS-Variablen.
- Der E-Scooter Klicker verwendet wie die anderen Spiele den KroxenStudios-Startbildschirm und das datenschutzfreundliche Zählpixel (keine Cookies, keine Spielereignisse).

### Bekannt / offen
- Das Farbschema gilt bisher nur für die Startseite; die Spiele bleiben dunkel.
- Das Scooter-Bild hat einen weißen Hintergrund und wird deshalb auf einem weißen Kreis bzw. invertiert dargestellt. Eine Version mit transparentem Hintergrund würde das verbessern.
- Das Ziel „Erde zu 100 % bedeckt“ (10¹⁵ Scooter) ist mit den aktuellen Preisen und Produktionsraten kaum erreichbar. Balancing steht noch aus.
