# Waiting Games – KroxenStudios

Kleine Browserspiele für zwischendurch. Die Seiten sind rein statisch und laufen auf GitHub Pages.

| Pfad | Spiel |
|---|---|
| `Asphalt Arkade/` | Drift durch eine Stadt |
| `Mattenwurf/` | Zeitungen werfen |
| `e-scooter-klicker/` | Klicker |
| `MultiplayerRoom/` | **Bastelkarre** – Fahrzeuge aus Teilen bauen, online fahren und fliegen |

## Veröffentlichen (GitHub Pages)

1. Diesen Ordner als Repository-Wurzel pushen (der Ordner `nicht veröffentlichen/` steht in der `.gitignore`).
2. Auf GitHub: *Settings → Pages → Deploy from a branch → `main` / `/ (root)`*.
3. Die Startseite ist dann `https://<name>.github.io/<repo>/`, die Bastelkarre liegt unter `/MultiplayerRoom/`.

Alle Pfade sind relativ; `.nojekyll` sorgt dafür, dass die Dateien unverändert ausgeliefert werden.

Zur Bastelkarre gehört die fertig erzeugte Karte `MultiplayerRoom/welt.json` (ca. 0,5 MB) mit `gelaende.js`. Sie wird einmal vom Generator in `nicht veröffentlichen/weltgenerator/` erzeugt und nicht zur Laufzeit berechnet.

## Server der Bastelkarre

Die Bastelkarre verbindet sich per WebSocket mit dem Cloudflare-Worker `bastelkarre-online`
(`https://bastelkarre-online.kroxenstudios.workers.dev`, Quelltext in `nicht veröffentlichen/bastelkarre-online/`).
Deploy: `nicht veröffentlichen/bastelkarre-online/deploy.cmd`. Der Worker liefert den Ordner
`MultiplayerRoom/` zusätzlich selbst aus; GitHub Pages braucht ihn nur für die Mehrspieler-Verbindung.

Änderst du den Namen des Workers, passe `WORKER_HOST` in `MultiplayerRoom/spiel.js` an.

## Sprachen

Deutsch und Englisch. Die Wahl wird wie bei den anderen Spielen unter `wg-lang` im Browser gespeichert
(Startseite oder Knopf „DE | EN“ im Spiel); Vorgabe ist die Browsersprache.
