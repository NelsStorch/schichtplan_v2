-- Zeitraum eines Anlasses ergibt sich ab jetzt aus den Schichten (erste Schicht bis letzte Schicht).
-- Bestehende Anlässe mit Schichten einmal nachführen; Anlässe ohne Schichten behalten ihr Datum.
UPDATE "events" AS e
SET "startDate" = r.first_start,
    "endDate" = r.last_end
FROM (
  SELECT "eventId", MIN("startTime") AS first_start, MAX("endTime") AS last_end
  FROM "shifts"
  GROUP BY "eventId"
) AS r
WHERE r."eventId" = e."id";
