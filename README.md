# Momentjes

**Bewaar de mooiste uitspraken en momenten van je kind — in hun eigen stemmetje.**

Momentjes is een voice-first web-app voor ouders. Tik op de grote knop, neem op wat je kind zegt (of vertel het zelf), en de app schrijft live mee. Alles komt in een prachtige tijdlijn die je later samen terugluistert.

**➜ Gebruik de app: https://xamsterdamxx.github.io/momentjes-app/**

Open de link op je telefoon en zet hem op je beginscherm (Safari: deel-knop → *Zet op beginscherm*). Vanaf dan werkt Momentjes als een gewone app, ook zonder internet.

## Waarom Momentjes?

- 🎙️ **Opnemen in één tik** — met live transcriptie in het Nederlands
- 🗂️ **Categorieën** — Uitspraak, Vraag, Ervaring, Mijlpaal
- 📅 **Tijdlijn** — alle momentjes per maand en dag, met audio
- 🔍 **Zoeken** — vind elk momentje terug op woord of categorie
- 👧🧒 **Meerdere kinderen** — elk kind een eigen profiel en kleur
- 💾 **Backup & herstel** — één zip-bestand met alles erin, naar je eigen iCloud/Bestanden

## Privacy — het hele punt van deze app

Momentjes is gebouwd voor het kostbaarste dat er is: de stem van je kind. Daarom:

- **Alles blijft op jouw toestel.** Audio en tekst staan in de lokale opslag van je telefoon — er is geen server, geen database in de cloud, geen account.
- **Geen tracking, geen analytics, geen cookies.** De app belt nergens naartoe.
- **Geen API-keys of wachtwoorden.** Deze hele app is statische HTML/CSS/JavaScript; je kunt elke regel nalezen.
- **Live transcriptie** gebruikt de spraakherkenning van je eigen toestel (op iPhone: dezelfde als Siri/dicteren).
- **Backups zijn van jou.** Een backup is een gewoon zip-bestand dat je zelf bewaart waar jij wilt.

De keerzijde van "alles lokaal" is dat je zelf voor backups zorgt. De app herinnert je er vriendelijk aan; een backup maken kost twee tikken.

## Zelf draaien / meebouwen

Geen build-stap, geen dependencies:

```bash
python3 -m http.server 8000
```

en open http://localhost:8000. Dat is alles.

**Stack:** vanilla HTML/CSS/JS · IndexedDB (opslag) · MediaRecorder (audio) · Web Speech API (transcriptie) · eigen minimale zip-writer/reader (backups) · service worker (offline PWA).

**Backup-formaat:** één zip met `manifest.json` (alle momentjes, kinderen en categorieën als JSON) en een map `audio/` met de opnames als `.m4a`. Bewust simpel en open — over 20 jaar nog leesbaar, ook zonder deze app.

## Licentie

MIT — gebruik het, leer ervan, maak er iets moois van.
