# Migration app.cevi-schichtplan.ch (PHP) → Schichtplan V2

Stand der Übertragung der Legacy-App (prozedurales PHP + MySQL, Repo `app.cevi-schichtplan.ch`).
✅ übertragen · 🟡 teilweise · ⬜ offen · ➖ entfällt durch V2-Architektur

## Datenmodell

| Legacy (MySQL) | V2 (Postgres/Prisma) | Hinweis |
| --- | --- | --- |
| `Schichten` (Zeitfenster) × `Arbeiten` × `braucht_anz_personen_pro_arbeit` | `shifts` | Eine Legacy-Schicht hat mehrere Aufgaben. In V2 wird jede Kombination Schicht × Aufgabe eine `Shift` (`category` = Aufgabe, `requiredSlots` = `anz_personen`). |
| `Arbeiten.ue16_oder_ue18` | `shifts.minAge` | |
| `User_has_Schichten` | `shift_signups` | `anwesend` hat noch kein Gegenstück |
| `User` (Ceviname, geb_datum, ok, admin) | `users` + `department_members` / `event_organizers` | `ok` → `OK_MEMBER`, `admin` → `ADMIN` |
| `Stufe` | ⬜ | Stufen (Hiskia, Shiva, …) fehlen im V2-Modell |
| `EmailLogs`, `emailnotify` | ⬜ | Erinnerungs-Mails |
| `event_responsible.json`, `eventbilder/*` | `events` (Titel, Banner, Logo) | |

Ein Import-Skript MySQL → Postgres fehlt noch ⬜.

## Funktionen für Helfer:innen

| Legacy | V2 | Status |
| --- | --- | --- |
| `index.php`, `create_user.php` (Login per Cevi-Name) | `apps/login` (SSO, Cevi-Name-Schnell-Login, Cevi.DB, E-Mail) | ✅ |
| `schichtplan.php` (nach Tag gruppiert, Ampel frei/fast voll/voll) | `/events/[slug]` (Tage, Filter, Schicht-Tickets) | ✅ inkl. Regel „vor 03:00 = Vortag“ |
| `schicht_details.php`, `eintragen.php` | Ticket + Gast-Sheet / Direkt-Eintrag | ✅ |
| `austragen.php` mit 7-Tage-Frist, `austragen_zu_kurzfristig.php` | Austragen ohne Frist | 🟡 Frist fehlt im Backend |
| `meine_schichten.php` + Kalender | `/meine-schichten` mit .ics-Export | ✅ |
| `mein-acc.php`, `change_user_pw.php`, `del_acc.php` | Konto-Sheet (Anzeige, Abmelden) | 🟡 Profil bearbeiten/löschen fehlt |
| `email_notify.php` (Erinnerungen) | `services/email.ts` vorhanden | ⬜ |
| `find_swap_partner.php` (Schicht tauschen) | | ⬜ |
| `ki_schichtvorschlag.php`, `ki_spruch.php` | | ⬜ |
| PWA (`manifest.json`, `service-worker.js`, `offline.html`) | `manifest.json` + Icons | 🟡 Service Worker/Offline fehlt |

## Funktionen für OK & Admins

| Legacy | V2 | Status |
| --- | --- | --- |
| `event_wechsel.php`, `event_einstellungen.php`, `jahr_reset.php` | Mehrere Events parallel, Design-Dialog | ✅ / ➖ |
| `schicht_erstellen.php` | Schicht-Dialog | ✅ |
| `schicht_bearbeiten.php`, `edit_shift.php`, `del_schicht.php` | | ⬜ Backend hat keine PATCH/DELETE-Route für Schichten |
| `ok_eintragen.php` (Helfer einteilen) / `ok_austragen.php` | Austragen per ✕ am Namen | 🟡 Einteilen fehlt |
| `ok.php` (Dashboard), `schichtplan_ok.php` | Verwaltung direkt auf der Event-Seite | 🟡 |
| `edit_user.php`, `user_bearbeiten.php`, `doppelte_accounts.php` | | ⬜ |
| `auswertung.php`, `analytics_dashboard.php`, `progress.php` | Belegungsring + Tagesstatistik | 🟡 |
| `anwesenheit.php`, `anwesenheit_schichtliste.php` | | ⬜ |
| `drucken.php`, `plandrucken.php` | | ⬜ (Print-Styles) |
| `vorlage_erstellen.php`, `vorlage_anwenden.php` | | ⬜ |
| `tagesverantwortliche.php` | | ⬜ |
| `create_backup.php`, Log-Viewer | `deploy.ps1` (pg_dump), Docker-Logs | ➖ |

## Design

Alle neuen Oberflächen bauen auf `packages/ui` (siehe dessen README). `apps/landing` und `apps/login`
nutzen bereits Preset und Fonts, sind aber noch nicht auf die Tokens umgestellt und deshalb fest dunkel.
