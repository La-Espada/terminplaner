-- Überschneidungsschutz für Termine (siehe docs/ENTSCHEIDUNGEN.md E-07).
--
-- Von Hand geschrieben: Prisma erzeugt keine Exclusion-Constraints. Wird das Schema
-- später geändert, bleibt diese Migration bestehen — sie darf nicht verloren gehen.
--
-- Warum auf Datenbankebene und nicht in der Anwendung: Eine Prüfung in der Anwendung
-- ("gibt es schon einen Termin?" -> "nein" -> "einfügen") hat immer ein Zeitfenster
-- dazwischen. Tippen zwei Personen gleichzeitig auf denselben Slot, kommen beide durch.
-- Nur die Datenbank kann das atomar entscheiden.

-- btree_gist liefert die Gleichheitsoperatoren für uuid in einem GiST-Index.
-- Bereits durch die vorige Migration angelegt, hier zur Sicherheit noch einmal.
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Kein Termin darf sich mit einem anderen derselben Kosmetiker:in zeitlich überlappen.
--
-- tstzrange(starts_at, ends_at) ist halboffen: Das Ende ist ausgeschlossen. Ein Termin
-- von 09:00 bis 10:00 und einer von 10:00 bis 11:00 überlappen sich also NICHT — genau
-- das gewünschte Verhalten für aufeinanderfolgende Termine.
--
-- Die WHERE-Klausel beschränkt den Schutz auf aktive Termine. Stornierte und vergangene
-- blockieren den Slot nicht mehr, sonst könnte ein abgesagter Termin den Kalender
-- dauerhaft belegen.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "staff_id" WITH =,
    tstzrange("starts_at", "ends_at") WITH &&
  )
  WHERE ("status" IN ('PENDING', 'CONFIRMED'));

-- Ein Termin muss nach seinem Beginn enden. Ohne diese Prüfung liesse sich ein leerer
-- oder rückwärts laufender Zeitraum speichern, den der Exclusion-Constraint dann als
-- überschneidungsfrei durchwinkt.
ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_ends_after_starts"
  CHECK ("ends_at" > "starts_at");

-- Dasselbe für Abwesenheiten.
ALTER TABLE "time_off"
  ADD CONSTRAINT "time_off_ends_after_starts"
  CHECK ("ends_at" > "starts_at");

-- Arbeitszeiten: Ende nach Beginn, Wochentag im gültigen Bereich (0 = Sonntag).
ALTER TABLE "working_hours"
  ADD CONSTRAINT "working_hours_ends_after_starts"
  CHECK ("end_time" > "start_time");

ALTER TABLE "working_hours"
  ADD CONSTRAINT "working_hours_weekday_range"
  CHECK ("weekday" BETWEEN 0 AND 6);

-- Geldbeträge und Zeitspannen können nicht negativ sein.
ALTER TABLE "services"
  ADD CONSTRAINT "services_price_not_negative" CHECK ("price_cents" >= 0);

ALTER TABLE "services"
  ADD CONSTRAINT "services_duration_positive" CHECK ("duration_minutes" > 0);

ALTER TABLE "services"
  ADD CONSTRAINT "services_buffer_not_negative" CHECK ("buffer_minutes" >= 0);

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_price_not_negative" CHECK ("price_cents_snapshot" >= 0);
