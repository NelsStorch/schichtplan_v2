-- Bereinigung der verfaelschten 4xx-Statistik-Eintraege durch den internen Docker-Healthcheck auf /api/departments/current
DELETE FROM "request_stats"
WHERE "route" = '/api/departments/current'
  AND "status_class" = '4xx';
