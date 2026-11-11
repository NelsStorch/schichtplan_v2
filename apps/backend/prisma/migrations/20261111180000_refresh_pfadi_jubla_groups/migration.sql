-- Pfadi- und Jubla-Gruppen wurden bisher mit den Cevi-Gruppentypen ausgewertet (Abteilung/Schar nie erkannt).
-- Der Zwischenspeicher wird beim nächsten Login neu gefüllt, mit den Gruppentypen des jeweiligen Verbands.
DELETE FROM "hitobito_groups" WHERE "provider" IN ('PFADI', 'JUBLA');
