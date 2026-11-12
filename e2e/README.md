# End-to-End-Tests

Prüfen die wichtigsten Abläufe im echten Browser (Playwright, Chromium) gegen die **lokale** Umgebung:

| Datei | Ablauf |
|---|---|
| `login.spec.ts` | Login-Portal mit E-Mail und Passwort, falsches Passwort, kein offener Redirect |
| `membersOnly.spec.ts` | Abteilung «Nur für Mitglieder»: ohne Anmeldung keine Anlässe, kein Arbeitskatalog |
| `helperSignup.spec.ts` | Helfer*in trägt sich ein, sieht die Schicht in «Meine Schichten», trägt sich aus; ohne Anmeldung kein Eintragen |
| `nickname.spec.ts` | Spitznamen-Profil anlegen und wieder anmelden, falsches Geburtsdatum |
| `okArea.spec.ts` | Abteilungsleitung im OK-Bereich, Helfende ohne Rechte bekommen keine OK-Daten |

Die Tests legen pro Lauf eigene Anlässe in der Zukunft an (Slug `e2e-…`) und löschen sie danach wieder.
Cevi-Name-Testprofile (`E2E…`) bleiben in der lokalen Datenbank.

## Ausführen

```bash
npm run dev:docker
```

In einem zweiten Terminal einmalig die Datenbank vorbereiten (ein beliebiges lokales Passwort für die Demo-Konten wählen):

```bash
docker exec schichtplan-dev-backend npx prisma migrate deploy
docker exec -e SEED_PASSWORD=mein-lokales-passwort schichtplan-dev-backend npm run db:seed
```

Einmalig den Browser installieren, dann die Tests mit demselben Passwort starten:

```bash
npx playwright install chromium
SEED_PASSWORD=mein-lokales-passwort npm run test:e2e
```

## Hinweise

- **Nur lokal:** `global-setup.ts` bricht ab, wenn eine Adresse nicht auf `localhost` zeigt. Die Tests legen Konten an und tragen sich ein.
- **Anmelden in den Tests:** Lokal gilt das Cookie des Login-Portals (`localhost:3002`) nicht für `demo.localhost:3000`. Die Tests melden sich darum direkt über den API-Proxy der Abteilungsseite an; den Login über das Portal prüft `login.spec.ts` separat.
- Bei einem Fehler liegen Screenshot und Trace unter `test-results/` (`npx playwright show-trace …`).
