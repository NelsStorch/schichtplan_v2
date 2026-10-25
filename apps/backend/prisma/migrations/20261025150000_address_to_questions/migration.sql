-- Datensparsamkeit: Die Adresse wird nicht mehr im Profil gespeichert. Wer sie braucht, stellt
-- beim Anlass eine Frage «Adresse» (mit Aufbewahrungsdauer). Pro Frage gilt neu eine
-- Aufbewahrungsdauer in Tagen nach dem Anlass-Ende (null = nie löschen).

ALTER TABLE "event_questions" ADD COLUMN "retention_days" INTEGER;

-- Anlässe mit Pflichtangabe «Adresse»: daraus wird eine Pflichtfrage (Aufbewahrung wie bisher: nie)
INSERT INTO "event_questions" ("id", "event_id", "label", "type", "options", "required", "scope", "sort_order", "retention_days")
SELECT gen_random_uuid()::text, e."id", 'Adresse (Strasse, PLZ, Ort)', 'TEXT', ARRAY[]::TEXT[], true, 'ONCE',
       COALESCE((SELECT MAX(q."sort_order") + 1 FROM "event_questions" q WHERE q."event_id" = e."id"), 0),
       NULL
FROM "events" e
WHERE 'ADDRESS' = ANY(e."required_fields");

-- Adressen der dort eingetragenen Personen als Antwort übernehmen
INSERT INTO "event_answers" ("id", "event_id", "question_id", "user_id", "value", "updated_at")
SELECT gen_random_uuid()::text, q."event_id", q."id", u."id", u."address", NOW()
FROM "event_questions" q
JOIN "events" e ON e."id" = q."event_id" AND 'ADDRESS' = ANY(e."required_fields")
JOIN "users" u ON u."address" IS NOT NULL AND btrim(u."address") <> ''
WHERE q."label" = 'Adresse (Strasse, PLZ, Ort)'
  AND EXISTS (
    SELECT 1 FROM "shift_signups" su JOIN "shifts" s ON s."id" = su."shiftId"
    WHERE s."eventId" = e."id" AND su."userId" = u."id"
  )
ON CONFLICT ("question_id", "user_id") DO NOTHING;

UPDATE "events" SET "required_fields" = array_remove("required_fields", 'ADDRESS')
WHERE 'ADDRESS' = ANY("required_fields");

-- Vorlagen: Frage statt Pflichtangabe (neue Anlässe: 30 Tage)
UPDATE "event_templates"
SET "data" = jsonb_set(
      "data"::jsonb,
      '{questions}',
      COALESCE("data"::jsonb -> 'questions', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
        'label', 'Adresse (Strasse, PLZ, Ort)', 'type', 'TEXT', 'options', '[]'::jsonb,
        'required', true, 'scope', 'ONCE', 'retentionDays', 30
      ))
    ),
    "required_fields" = array_remove("required_fields", 'ADDRESS')
WHERE 'ADDRESS' = ANY("required_fields");

-- Gespeicherte Adressen löschen
ALTER TABLE "users" DROP COLUMN "address";

-- Auch im rohen Cevi.DB-Profil (nur Debug) keine Adresse mehr aufbewahren
UPDATE "users"
SET "ceviDbData" = ("ceviDbData"::jsonb - 'address' - 'street' - 'housenumber' - 'postbox' - 'zip_code'
                   - 'postal_code' - 'town' - 'country' - 'additional_addresses')
WHERE "ceviDbData" IS NOT NULL AND jsonb_typeof("ceviDbData"::jsonb) = 'object';

UPDATE "users"
SET "ceviDbData" = jsonb_set("ceviDbData"::jsonb, '{_userInfo}',
      ("ceviDbData"::jsonb -> '_userInfo') - 'address' - 'street' - 'housenumber' - 'postbox' - 'zip_code'
      - 'postal_code' - 'town' - 'country' - 'additional_addresses')
WHERE "ceviDbData" IS NOT NULL AND jsonb_typeof("ceviDbData"::jsonb -> '_userInfo') = 'object';
