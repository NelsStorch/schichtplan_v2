-- Vorlagen speicherten Tag und Uhrzeit der Schichten bisher in Server-Zeit (UTC). Ab jetzt gilt Schweizer Zeit.
-- Bestehende Vorlagen einmal umrechnen. Der Versatz ist unbekannt (die Quell-Schichten sind nicht verknüpft),
-- darum gilt der Versatz am Erstellungstag der Vorlage: Sommer +2 h, Winter +1 h. Rutscht eine Schicht dabei
-- über Mitternacht, wandert sie einen Tag weiter (dayOffset + 1).
WITH conv AS (
  SELECT
    t."id",
    jsonb_agg(
      s.elem || jsonb_build_object(
        'dayOffset', GREATEST(0, COALESCE((s.elem->>'dayOffset')::int, 0) + FLOOR((s.start_min + o.off) / 1440.0)::int),
        'startTimeStr', lpad((((s.start_min + o.off) % 1440 + 1440) % 1440 / 60)::text, 2, '0') || ':' ||
                        lpad((((s.start_min + o.off) % 1440 + 1440) % 1440 % 60)::text, 2, '0'),
        'endTimeStr', lpad((((s.end_min + o.off) % 1440 + 1440) % 1440 / 60)::text, 2, '0') || ':' ||
                      lpad((((s.end_min + o.off) % 1440 + 1440) % 1440 % 60)::text, 2, '0')
      )
      ORDER BY s.ord
    ) AS shifts
  FROM "event_templates" t
  CROSS JOIN LATERAL (
    SELECT (EXTRACT(EPOCH FROM ((t."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Zurich') - t."createdAt") / 60)::int AS off
  ) o
  CROSS JOIN LATERAL (
    SELECT
      e.elem,
      e.ord,
      split_part(COALESCE(e.elem->>'startTimeStr', '12:00'), ':', 1)::int * 60
        + split_part(COALESCE(e.elem->>'startTimeStr', '12:00'), ':', 2)::int AS start_min,
      split_part(COALESCE(e.elem->>'endTimeStr', '14:00'), ':', 1)::int * 60
        + split_part(COALESCE(e.elem->>'endTimeStr', '14:00'), ':', 2)::int AS end_min
    FROM jsonb_array_elements(t."data"->'shifts') WITH ORDINALITY AS e(elem, ord)
  ) s
  WHERE jsonb_typeof(t."data"->'shifts') = 'array'
  GROUP BY t."id"
)
UPDATE "event_templates" t
SET "data" = jsonb_set(t."data", '{shifts}', conv.shifts)
FROM conv
WHERE conv."id" = t."id";
