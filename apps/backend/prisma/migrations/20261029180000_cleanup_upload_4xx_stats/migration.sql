-- Einmalige Bereinigung verfälschter historischer 4xx-Statistiken für Bildabrufe
DELETE FROM "request_stats" WHERE "route" = '/api/uploads/:id' AND "status_class" = '4xx';
