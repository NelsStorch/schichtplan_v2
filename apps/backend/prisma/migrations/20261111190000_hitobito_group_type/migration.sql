-- Gruppentyp der Hitobito-Gruppe (z. B. «Abteilung», «Region»): Beim Anlegen kann eine Person, die mehrere Ebenen
-- leitet, wählen, für welche. Bestehende Einträge bekommen den Typ beim nächsten Auffrischen (spätestens nach 24 h).
ALTER TABLE "hitobito_groups" ADD COLUMN "group_type" TEXT;
