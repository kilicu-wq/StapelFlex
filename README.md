# Stapel Flex

Flexibler Trainingstracker als installierbare PWA – die Schwester von [Stapel](https://github.com/kilicu-wq/Stapel-App), aber ohne festen Plan.

## Funktionen

- **Training frei zusammenstellen**: Übungen aus Muskelgruppen-Dropdowns (Brust, Rücken, Schultern, Bizeps, Trizeps, Beine, Po, Bauch …) zum Trainingstag hinzufügen.
- **Kalenderwochen mit bis zu 4 Trainingstagen**: ◀/▶ blättert durch die Wochen, **HEUTE** springt zur aktuellen KW, Wischen wechselt den Tag.
- **Öffnet beim letzten Training**: Woche und Tag werden gespeichert – nach dem Wechsel in eine andere App geht es genau dort weiter.
- **Sätze mit Gewicht × Wiederholungen**, vorbelegt mit den Gewichten vom letzten Mal, inkl. „Zuletzt: …“-Hinweis und ▲-Fortschritt.
- **Verlauf**: Kurve pro Übung (Top-Gewicht, Volumen, Wiederholungen) und Wochen-Zeitleiste.
- **Übungskatalog iterativ pflegen**: Übungen/Gruppen anlegen, umbenennen, archivieren (Verlauf bleibt erhalten).
- **Sicherung & Wiederherstellung**: JSON-Sicherung über das Teilen-Menü (Dateien/iCloud, AirDrop, Mail) oder als Text; Wiederherstellen per Datei oder Einfügen, mit Vorschau und Rückfall-Kopie. Erinnerung, wenn die letzte Sicherung älter als 7 Tage ist. Lesbarer Text-Export.
- **Offline & dauerhaft**: Service Worker, IndexedDB (`stapelflex-db`), `navigator.storage.persist()`.

## Projektstruktur

```
index.html            Einstiegspunkt
css/style.css         Styles
css/fonts.css         @font-face (selbst gehostet)
fonts/                Font-Dateien (woff2)
js/app.js             App-Logik (UI, Daten, Sicherung)
js/db.js              IndexedDB-Wrapper
manifest.json         PWA-Manifest
sw.js                 Service Worker (Offline-Caching)
icons/                App-Icons (scripts/gen_icons.py)
```

## Standard-Übungen anpassen

`DEFAULT_CATALOG` in `js/app.js` ist nur der Startwert beim allerersten Öffnen. Danach gehört der Katalog der Nutzerin und wird im Tab „Übungen“ gepflegt. Übungs-IDs nie umbenennen – der Verlauf hängt daran.

## Updates ausrollen

Nach Änderungen an CSS/JS die `CACHE_VERSION` in `sw.js` hochzählen, sonst liefert der Service Worker weiter die alte Version aus.

## Hosting über GitHub Pages

1. In **Settings → Pages** die Quelle auf **GitHub Actions** stellen.
2. Der Workflow `.github/workflows/deploy.yml` deployt bei jedem Push auf `main`.
3. Auf dem iPhone in Safari öffnen → Teilen → **Zum Home-Bildschirm**. Erst als installierte App ist der Speicher zuverlässig dauerhaft.

## Lokal testen

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen.
