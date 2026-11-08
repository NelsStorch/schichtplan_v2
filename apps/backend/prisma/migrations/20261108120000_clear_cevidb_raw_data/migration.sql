-- Rohdaten aus Cevi.DB werden nicht mehr gespeichert (die Debugseite /cevidb-daten ist entfernt).
-- Schritt 1: gespeicherte Rohdaten löschen. Die Spalte selbst entfernt eine spätere Migration,
-- sobald kein laufender Code sie mehr liest (beim Rollout läuft der alte Code noch kurz weiter).
UPDATE "users" SET "ceviDbData" = NULL WHERE "ceviDbData" IS NOT NULL;
