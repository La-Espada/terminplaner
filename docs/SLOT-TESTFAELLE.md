# Testfallkatalog Slot-Berechnung (Schritt 21)

Dieses Dokument beschreibt die Testfälle für `GET /api/v1/availability`. Es ist die
Vorbereitung auf Schritt 21 aus `docs/UMSETZUNG.md` und enthält keinen Produktionscode.

Grundlage: `docs/PLAN.md` Abschnitt 5.1, `docs/UMSETZUNG.md` Schritt 20 und 21,
`docs/ENTSCHEIDUNGEN.md` E-06, E-07, E-11, E-12, sowie `backend/prisma/schema.prisma`.

Der Plan nennt sechs Pflichtfälle. Dieses Dokument führt sie als F-01 bis F-07 aus — der
Umstellungstag ist in Frühjahr und Herbst aufgeteilt, weil die beiden Richtungen
unterschiedliche Fehler aufdecken. Ergänzt werden sieben weitere Fälle Z-01 bis Z-07.

---

## 1. Warum dieser Katalog vor dem Code entsteht

Die Slot-Berechnung ist kein Algorithmus mit einem richtigen Ergebnis, sondern eine Kette
von Entscheidungen, die jede für sich plausibel klingt und in Kombination falsch wird.
Ob ein Puffer über das Arbeitsende hinausragen darf, ob das Raster am Fensteranfang oder an
Mitternacht ausgerichtet ist, ob die Vorlaufzeit auf- oder abgerundet wird — all das ist
nirgends vorgeschrieben. Wird es erst beim Programmieren implizit entschieden, steht die
Entscheidung im Code und nicht in der Spezifikation, und der Test bestätigt nur noch, was
ohnehin passiert.

Deshalb legt Abschnitt 2 diese Punkte zuerst fest. Jede Festlegung dort ist eine Annahme,
die ein Testfall prüfbar macht.

---

## 2. Festlegungen, die vor dem ersten Test getroffen sein müssen

### 2.1 Konfiguration

Alle Werte aus `.env` (Stand 2026-10-08), identisch zu `.env.example`:

| Schlüssel                     | Wert            | Bedeutung für die Slot-Berechnung                  |
| ----------------------------- | --------------- | -------------------------------------------------- |
| `STUDIO_TIMEZONE`             | `Europe/Vienna` | Zeitzone, in der Arbeitszeiten gelesen werden      |
| `SLOT_GRANULARITY_MINUTES`    | `15`            | Raster der angebotenen Startzeiten                 |
| `BOOKING_LEAD_TIME_MINUTES`   | `120`           | Mindestabstand zwischen Anfragezeitpunkt und Start |
| `BOOKING_HORIZON_DAYS`        | `90`            | Wie weit im Voraus gebucht werden darf             |
| `CANCELLATION_DEADLINE_HOURS` | `24`            | Geht erst in Schritt 23 ein, nicht in die Slots    |
| `AUTO_CONFIRM_BOOKINGS`       | `true`          | Neue Termine entstehen als `CONFIRMED`             |

`CANCELLATION_DEADLINE_HOURS` steht hier nur zur Abgrenzung: Die Storno-Frist beeinflusst
die Slot-Liste nicht. Sie entscheidet, ob ein bestehender Termin noch storniert werden
darf, nicht ob eine Zeit frei ist. Wird sie in Schritt 21 eingebaut, ist das bereits ein
Fehler.

`AUTO_CONFIRM_BOOKINGS=true` bedeutet, dass in den Testdaten `CONFIRMED` der Normalfall
ist. Bei `false` entstünden `PENDING`-Termine — die müssen Slots genauso blockieren, siehe
Abschnitt 2.5.

### 2.2 Zeitzone und Speicherung (E-06)

Studio-Zeitzone ist `Europe/Vienna`. Gespeichert wird ausnahmslos `timestamptz` in UTC.
`working_hours.start_time` und `end_time` sind dagegen `TIME(0)` **ohne** Zeitzone: Sie
sind Ortszeit-Angaben an der Wanduhr und bekommen ihre UTC-Bedeutung erst, wenn sie auf ein
konkretes Datum gelegt werden. Genau an dieser Stelle entsteht die Sommerzeitabhängigkeit.

Konsequenz für jeden Testfall: Jeder Zeitwert wird in beiden Darstellungen angegeben. Die
Zusicherung im Test erfolgt auf dem UTC-Zeitpunkt, nicht auf der Ortszeit-Beschriftung.
Nur der UTC-Zeitpunkt ist eindeutig — am 25.10.2026 gibt es zwei verschiedene Zeitpunkte
mit der Beschriftung „02:30".

Die API liefert `startsAt` und `endsAt` als ISO-8601 mit explizitem Offset oder `Z`. Eine
Antwort ohne Offset ist am Umstellungstag nicht interpretierbar und gilt als Fehler.

### 2.3 Raster, Fenster, Grenzen

| Frage                                             | Festlegung                                       |
| ------------------------------------------------- | ------------------------------------------------ |
| Woran ist das 15-Minuten-Raster ausgerichtet?     | An **Ortszeit-Mitternacht** des jeweiligen Tages |
| Darf ein Slot genau zum Arbeitsende enden?        | Ja. Fensterende ist inklusive für das Slot-Ende  |
| Darf ein Slot genau zum Arbeitsbeginn starten?    | Ja                                               |
| Zählt eine Berührung an den Rändern als Konflikt? | Nein. Intervalle sind halboffen: `[start, ende)` |
| Muss der Puffer noch ins Arbeitsfenster passen?   | **Nein** — siehe 2.4                             |

Die Ausrichtung des Rasters an Mitternacht ist die wichtigere der beiden Varianten. Wäre
das Raster am Fensteranfang ausgerichtet, würde eine Abwesenheit, die um 11:20 endet, zu
Startzeiten 11:20, 11:35, 11:50 führen — für die Kundin unerklärlich und über zwei Tage
hinweg inkonsistent. Bei Ausrichtung an Mitternacht ist die erste Startzeit nach 11:20
immer 11:30.

Halboffene Intervalle sind dieselbe Semantik, die `tstzrange` in E-07 standardmäßig
verwendet (`[)`). Weicht die Anwendung davon ab, behauptet sie an jeder Termingrenze einen
Konflikt, den die Datenbank nicht sieht — oder umgekehrt.

### 2.4 Puffer

`services.buffer_minutes` ist Aufräumzeit nach der Behandlung. Festlegungen:

1. Der Puffer ist **nicht** Teil des Termins. `appointments.ends_at` enthält nur
   `duration_minutes`. Der Puffer existiert nirgends als gespeicherter Wert und wird bei
   jeder Slot-Berechnung aus `services.buffer_minutes` des jeweils bestehenden Termins neu
   abgeleitet.
2. Der Puffer blockiert ausschließlich **nach** dem Termin, nicht davor.
3. Der Puffer **muss nicht** mehr ins Arbeitsfenster passen. Ein Termin 16:00–17:00 bei
   Arbeitsende 17:00 ist erlaubt, obwohl der Puffer bis 17:15 reichen würde.

Punkt 3 ist eine fachliche Entscheidung, keine technische. Die Gegenvariante — der Puffer
muss ins Fenster passen — würde den letzten Slot des Tages streichen und damit über ein
Jahr gerechnet rund 250 buchbare Stunden kosten. Aufräumen nach Feierabend ist zumutbar,
eine strukturell blockierte letzte Stunde nicht.

Punkt 1 hat eine unangenehme Nebenwirkung, die in Abschnitt 6 wieder auftaucht: Der
`EXCLUDE`-Constraint aus E-07 kennt den Puffer nicht. Er verhindert Überschneidungen von
`starts_at` bis `ends_at`, nicht bis Pufferende. Die Puffereinhaltung ist damit allein
Sache der Anwendung.

### 2.5 Welche Termine blockieren

| Status                  | Blockiert Slot | Begründung                               |
| ----------------------- | -------------- | ---------------------------------------- |
| `PENDING`               | ja             | Im `EXCLUDE`-Constraint enthalten (E-07) |
| `CONFIRMED`             | ja             | Im `EXCLUDE`-Constraint enthalten (E-07) |
| `COMPLETED`             | ja             | Defensiv, siehe unten                    |
| `NO_SHOW`               | ja             | Defensiv, siehe unten                    |
| `CANCELLED_BY_CUSTOMER` | nein           | Zeit ist wieder frei                     |
| `CANCELLED_BY_STAFF`    | nein           | Zeit ist wieder frei                     |

Die Regel lautet also: **alles blockiert außer den beiden Storno-Status.** Das ist bewusst
strenger als der Datenbank-Constraint. `COMPLETED` und `NO_SHOW` liegen fachlich immer in
der Vergangenheit und können deshalb nie einen buchbaren Slot betreffen; sollte dennoch
einer auftauchen, ist die strengere Variante die harmlose. Die gefährliche Abweichung ist
die andere Richtung: Bietet die Slot-Berechnung mehr an als der Constraint zulässt, führt
jede Buchung auf so einen Slot zu `409 Conflict` — der Client lädt neu, sieht denselben
Slot wieder und läuft in eine Schleife.

Eine Positivliste (`status IN ('PENDING','CONFIRMED')`) ist aus demselben Grund abzulehnen:
Kommt später ein Status dazu, fällt er stillschweigend aus der Blockade heraus. Die
Negativliste macht einen neuen Status standardmäßig blockierend, also sicher.

### 2.6 Umgang mit `time_off`

- `staff_id IS NULL` bedeutet studioweit und gilt für **alle** Kosmetiker:innen, auch für
  solche, die erst später angelegt werden (E-11).
- Maßgeblich sind immer `starts_at` und `ends_at`. `is_all_day` ist ein reines
  Anzeigekennzeichen für das Admin-Web und darf in der Berechnung nicht ausgewertet werden.
  Andernfalls hinge das Ergebnis davon ab, ob die Oberfläche bei ganztägigen Einträgen
  00:00–00:00, 00:00–23:59 oder 00:00–24:00 geschrieben hat.
- `type` beeinflusst die Berechnung nicht. Ein Urlaubstag blockiert genauso wie ein
  Krankheitstag. Der Typ dient Auswertung und Anzeige (E-12).

### 2.7 Offene Punkte, die den Katalog betreffen

Diese Punkte sind im Datenmodell noch nicht abgebildet und begrenzen den Katalog:

1. **Studio-Öffnungszeiten als eigene Entität fehlen.** `PLAN.md` 5.1 Schritt 2 nennt sie,
   `schema.prisma` kennt sie nicht. Bis dahin sind `working_hours` je Person die einzige
   Quelle. Dieser Katalog geht davon aus, dass es keine zusätzliche studioweite
   Öffnungszeit gibt. Kommt sie später dazu, braucht sie einen eigenen Fall: Arbeitszeit
   ragt über die Öffnungszeit hinaus.
2. **`working_hours` hat keine Gültigkeitsspanne.** Eine Änderung der Arbeitszeit wirkt
   rückwirkend auf alle Vergangenheit. Für die Slot-Berechnung in die Zukunft ist das
   folgenlos, für eine spätere Auslastungsstatistik nicht.
3. **Mehrfachbuchung je Person ist ausgeschlossen.** Das Datenmodell kennt keine Kapazität
   je Kosmetiker:in; der `EXCLUDE`-Constraint erzwingt genau einen Termin zur Zeit.

---

## 3. Gemeinsame Grunddaten

Alle Fälle setzen auf diesem Datenbestand auf. Abweichungen stehen beim jeweiligen Fall.

### 3.1 Leistungen (`services`)

| Kürzel | `name`                       | `duration_minutes` | `buffer_minutes` | `price_cents` | `is_active` |
| ------ | ---------------------------- | ------------------ | ---------------- | ------------- | ----------- |
| `S60`  | Gesichtsbehandlung klassisch | 60                 | 15               | 6900          | `true`      |
| `S30`  | Augenbrauen korrigieren      | 30                 | 0                | 2500          | `true`      |
| `S45`  | Wimpernlifting               | 45                 | 15               | 5500          | `false`     |

`S30` hat bewusst keinen Puffer: Nur so lässt sich in F-07c die Zeitzonenwirkung isoliert
prüfen, ohne dass Pufferlogik das Ergebnis mitbestimmt. `S45` ist inaktiv und dient Z-05.

### 3.2 Personal (`staff_profiles`) und Zuordnung (`staff_services`)

| Kürzel  | `display_name` | `is_active` | Zugeordnete Leistungen |
| ------- | -------------- | ----------- | ---------------------- |
| `ANNA`  | Anna           | `true`      | `S60`, `S30`           |
| `BEA`   | Bea            | `true`      | `S60`                  |
| `CHRIS` | Chris          | `false`     | `S60`, `S30`           |

`CHRIS` ist inaktiv, hat aber vollständige Arbeitszeiten (Mo–Fr 09:00–17:00) und darf in
keinem Ergebnis auftauchen. Eine inaktive Person ohne Arbeitszeiten würde den Fall nicht
prüfen — sie fiele schon an der leeren Arbeitszeit heraus und nicht an `is_active`.

### 3.3 Standardarbeitszeit (`working_hours`)

Sofern ein Fall nichts anderes sagt, gilt für `ANNA`:

| `weekday` | Tag        | `start_time` | `end_time` |
| --------- | ---------- | ------------ | ---------- |
| 1         | Montag     | `09:00:00`   | `17:00:00` |
| 2         | Dienstag   | `09:00:00`   | `17:00:00` |
| 3         | Mittwoch   | `09:00:00`   | `17:00:00` |
| 4         | Donnerstag | `09:00:00`   | `17:00:00` |
| 5         | Freitag    | `09:00:00`   | `17:00:00` |

`weekday`: 0 = Sonntag bis 6 = Samstag, wie in `schema.prisma` dokumentiert. Für Samstag
und Sonntag existiert **keine** Zeile — das ist in E-11 die Abbildung von „frei".

### 3.4 Fester Zeitpunkt „jetzt"

Jeder Fall nennt seinen eigenen eingefrorenen Zeitpunkt. Ohne eingefrorene Uhr sind die
Fälle zur Vorlaufzeit und zum Buchungshorizont nicht reproduzierbar, und die
Sommerzeitfälle würden ab April 2026 dauerhaft rot, weil ihr Datum in der Vergangenheit
läge.

### 3.5 Anfrageform

Soweit nicht anders angegeben:

```
GET /api/v1/availability?serviceId=S60&staffId=ANNA&from=<Datum>&to=<Datum>
```

`from` und `to` sind Kalendertage in Studio-Zeitzone, beide inklusive.

---

## 4. Die sechs Pflichtfälle

### F-01 — Normaler Arbeitstag ohne jede Ausnahme

**Jetzt:** Montag 2026-06-15 08:00 Ortszeit = `2026-06-15T06:00:00Z`
**Abfrage:** `serviceId=S60`, `staffId=ANNA`, `from=to=2026-06-16` (Dienstag)

**Ausgangszustand**

| Tabelle         | Inhalt                                                        |
| --------------- | ------------------------------------------------------------- |
| `working_hours` | `ANNA`, `weekday=2`, `09:00:00`–`17:00:00` (Standard aus 3.3) |
| `time_off`      | keine Zeile                                                   |
| `appointments`  | keine Zeile                                                   |
| `services`      | `S60`: 60 min Dauer, 15 min Puffer                            |

Arbeitsfenster: 09:00–17:00 Ortszeit (MESZ, UTC+2) = `2026-06-16T07:00:00Z` bis
`2026-06-16T15:00:00Z`, Länge 480 Minuten.

**Erwartetes Ergebnis: 29 Slots**

```
09:00 (07:00Z)  09:15 (07:15Z)  09:30 (07:30Z)  09:45 (07:45Z)
10:00 (08:00Z)  10:15 (08:15Z)  10:30 (08:30Z)  10:45 (08:45Z)
11:00 (09:00Z)  11:15 (09:15Z)  11:30 (09:30Z)  11:45 (09:45Z)
12:00 (10:00Z)  12:15 (10:15Z)  12:30 (10:30Z)  12:45 (10:45Z)
13:00 (11:00Z)  13:15 (11:15Z)  13:30 (11:30Z)  13:45 (11:45Z)
14:00 (12:00Z)  14:15 (12:15Z)  14:30 (12:30Z)  14:45 (12:45Z)
15:00 (13:00Z)  15:15 (13:15Z)  15:30 (13:30Z)  15:45 (13:45Z)
16:00 (14:00Z)
```

Rechenweg: `(480 − 60) / 15 + 1 = 29`. Erster Slot 09:00–10:00, letzter Slot 16:00–17:00.
Der Slot 16:15–17:15 fehlt, weil er über das Arbeitsende hinausreicht.

**Was dieser Fall absichert**

- Das Grundraster stimmt und ist an vollen Viertelstunden ausgerichtet.
- Der letzte Slot endet exakt zum Arbeitsende und wird **nicht** verworfen. Fällt er weg,
  ist das Fensterende versehentlich exklusiv gerechnet oder der Puffer wird mit ins Fenster
  gezwungen (Verstoß gegen 2.3 bzw. 2.4). Beide Fehler sind an genau diesem einen fehlenden
  Slot zu erkennen und sonst fast unsichtbar.
- Die Umrechnung Ortszeit nach UTC verwendet den Sommerzeit-Offset `+02:00`. Eine fest
  verdrahtete `+01:00` verschiebt alle 29 Slots um eine Stunde nach vorn; die Anzahl bliebe
  korrekt, und ein Test, der nur zählt, bliebe grün.

---

### F-02 — Tag mit fester Mittagspause (zwei Arbeitszeitzeilen)

**Jetzt:** Montag 2026-06-15 08:00 Ortszeit = `2026-06-15T06:00:00Z`
**Abfrage:** `serviceId=S60`, `staffId=ANNA`, `from=to=2026-06-17` (Mittwoch)

**Ausgangszustand**

Die Standardzeile für `weekday=3` wird durch zwei Zeilen ersetzt:

| `staff_id` | `weekday` | `start_time` | `end_time` | Ortszeit    | UTC                     |
| ---------- | --------- | ------------ | ---------- | ----------- | ----------------------- |
| `ANNA`     | 3         | `09:00:00`   | `12:00:00` | 09:00–12:00 | `07:00:00Z`–`10:00:00Z` |
| `ANNA`     | 3         | `13:00:00`   | `17:00:00` | 13:00–17:00 | `11:00:00Z`–`15:00:00Z` |

`time_off` und `appointments` leer.

**Erwartetes Ergebnis: 22 Slots**

```
Vormittag (09:00–12:00, 180 min → 9 Slots)
09:00 (07:00Z)  09:15 (07:15Z)  09:30 (07:30Z)  09:45 (07:45Z)
10:00 (08:00Z)  10:15 (08:15Z)  10:30 (08:30Z)  10:45 (08:45Z)
11:00 (09:00Z)

Nachmittag (13:00–17:00, 240 min → 13 Slots)
13:00 (11:00Z)  13:15 (11:15Z)  13:30 (11:30Z)  13:45 (11:45Z)
14:00 (12:00Z)  14:15 (12:15Z)  14:30 (12:30Z)  14:45 (12:45Z)
15:00 (13:00Z)  15:15 (13:15Z)  15:30 (13:30Z)  15:45 (13:45Z)
16:00 (14:00Z)
```

Ausdrücklich **nicht** enthalten: 11:15, 11:30, 11:45, 12:00, 12:15, 12:30, 12:45.

**Was dieser Fall absichert**

- Mehrere Arbeitszeitzeilen desselben Wochentags werden als getrennte Fenster behandelt und
  nicht zu einem einzigen 09:00–17:00 zusammengefasst. Ein `MIN(start_time)`/`MAX(end_time)`
  je Wochentag — eine naheliegende SQL-Vereinfachung — liefert 29 statt 22 Slots und bucht
  die Mittagspause voll.
- Kein Slot überbrückt die Lücke. 11:30–12:30 wäre der typische Fehler, wenn die Fenster
  korrekt geladen, die Slots aber über alle Fenster hinweg fortlaufend geschnitten werden.

**Variante F-02b — aneinandergrenzende Zeilen ohne Lücke**

Gleicher Aufbau, aber die zweite Zeile beginnt um `12:00:00` statt `13:00:00`. Fachlich ist
das derselbe Tag wie F-01: durchgehend 09:00–17:00, nur in zwei Zeilen gespeichert. Das
passiert in der Praxis, wenn jemand die Arbeitszeit nachträglich teilt und die Pause später
wieder streicht.

**Erwartung: 29 Slots, identisch zu F-01.**

Die drei kritischen Slots sind 11:15, 11:30 und 11:45 — jene, die über die Naht laufen.
Werden die Fenster nicht verschmolzen, kommt das Ergebnis auf 9 + 17 = 26 Slots. Dieser
Fall sichert ab, dass aneinandergrenzende Fenster vor dem Schneiden zusammengelegt werden.
Der Unterschied von drei Slots ist so klein, dass er in einer Oberfläche niemandem auffällt
und erst als Beschwerde zurückkommt.

---

### F-03 — Tag mit halbem Urlaubstag

**Jetzt:** Montag 2026-06-15 08:00 Ortszeit = `2026-06-15T06:00:00Z`
**Abfrage:** `serviceId=S60`, `staffId=ANNA`, `from=to=2026-06-18` (Donnerstag)

**Ausgangszustand**

| Tabelle         | Inhalt                                     |
| --------------- | ------------------------------------------ |
| `working_hours` | `ANNA`, `weekday=4`, `09:00:00`–`17:00:00` |
| `time_off`      | siehe unten                                |
| `appointments`  | keine Zeile                                |

`time_off`-Zeile:

| Feld         | Wert                                               |
| ------------ | -------------------------------------------------- |
| `staff_id`   | `ANNA`                                             |
| `starts_at`  | 2026-06-18 12:00 Ortszeit = `2026-06-18T10:00:00Z` |
| `ends_at`    | 2026-06-18 17:00 Ortszeit = `2026-06-18T15:00:00Z` |
| `type`       | `VACATION`                                         |
| `is_all_day` | `false`                                            |

**Erwartetes Ergebnis: 9 Slots**

```
09:00 (07:00Z)  09:15 (07:15Z)  09:30 (07:30Z)  09:45 (07:45Z)
10:00 (08:00Z)  10:15 (08:15Z)  10:30 (08:30Z)  10:45 (08:45Z)
11:00 (09:00Z)
```

Letzter Slot 11:00–12:00 endet exakt zum Beginn der Abwesenheit.

**Variante F-03b — Abwesenheit beginnt zwischen zwei Rasterpunkten**

`starts_at` auf 2026-06-18 11:30 Ortszeit = `2026-06-18T09:30:00Z`. Fenster 09:00–11:30 =
150 Minuten.

**Erwartung: 7 Slots** — 09:00, 09:15, 09:30, 09:45, 10:00, 10:15, 10:30. Der Slot
10:30–11:30 endet exakt zum Beginn der Abwesenheit. 10:45 fehlt, weil 10:45–11:45 in die
Abwesenheit hineinragt.

**Was dieser Fall absichert**

- Eine Abwesenheit schneidet ein Arbeitsfenster in der Mitte und erzeugt daraus ein
  kürzeres Fenster, nicht gar keines. Der häufige Fehler ist die Alles-oder-nichts-Logik:
  „Es gibt eine `time_off`-Zeile an diesem Tag, also ist der Tag frei" — damit lägen hier
  null statt neun Slots an.
- Die Grenze ist halboffen. Der Slot 11:00–12:00 ist gültig, obwohl sein Ende mit dem
  Beginn der Abwesenheit zusammenfällt. Bei geschlossenen Intervallen fiele er weg.
- F-03b prüft zusätzlich, dass das Raster an Mitternacht ausgerichtet bleibt und nicht am
  Fensterende neu beginnt.

---

### F-04 — Studioweiter Feiertag

**Jetzt:** Dienstag 2026-10-20 08:00 Ortszeit = `2026-10-20T06:00:00Z`
**Abfrage 1:** `serviceId=S60`, `staffId=ANNA`, `from=to=2026-10-26`
**Abfrage 2:** `serviceId=S60`, **ohne** `staffId`, `from=to=2026-10-26`

2026-10-26 ist ein Montag und der österreichische Nationalfeiertag.

**Ausgangszustand**

| Tabelle         | Inhalt                                                      |
| --------------- | ----------------------------------------------------------- |
| `working_hours` | `ANNA` und `BEA` jeweils `weekday=1`, `09:00:00`–`17:00:00` |
| `appointments`  | keine Zeile                                                 |

`time_off`-Zeile:

| Feld         | Wert                                                            |
| ------------ | --------------------------------------------------------------- |
| `staff_id`   | `NULL` — studioweit                                             |
| `starts_at`  | 2026-10-26 00:00 Ortszeit = `2026-10-25T23:00:00Z` (MEZ, UTC+1) |
| `ends_at`    | 2026-10-27 00:00 Ortszeit = `2026-10-26T23:00:00Z`              |
| `type`       | `PUBLIC_HOLIDAY`                                                |
| `is_all_day` | `true`                                                          |

Für `BEA` existiert **keine** eigene `time_off`-Zeile. Das ist der Kern des Falls.

**Erwartetes Ergebnis: leere Liste in beiden Abfragen**

HTTP 200 mit `[]`, nicht 404 und nicht 400. Ein Feiertag ist ein gültiger Tag ohne Angebot,
kein Fehler.

**Was dieser Fall absichert**

- `staff_id IS NULL` wird als „gilt für alle" verstanden. Der mit Abstand häufigste Fehler
  ist `WHERE staff_id = :staffId` statt `WHERE staff_id = :staffId OR staff_id IS NULL`.
  In SQL ist `NULL = :staffId` niemals wahr, die Zeile fällt also still aus der Abfrage —
  ohne Fehlermeldung, ohne Warnung. Der Feiertag wird regulär ausgebucht, und es fällt erst
  auf, wenn jemand vor verschlossener Tür steht.
- Die zweite Abfrage ohne `staffId` stellt sicher, dass der Feiertag auch für `BEA` greift,
  für die es keinen individuellen Eintrag gibt — der Punkt, auf den E-11 ausdrücklich
  hinweist: ein Feiertag ist genau eine Zeile, für immer, auch für künftiges Personal.
- Nebenbei: Dass die Feiertagsgrenzen `23:00:00Z` und nicht `22:00:00Z` lauten, prüft die
  korrekte Winterzeit-Umrechnung einen Tag nach der Umstellung aus F-07.

---

### F-05 — Voll ausgebuchter Tag

**Jetzt:** Montag 2026-06-15 08:00 Ortszeit = `2026-06-15T06:00:00Z`
**Abfrage:** `serviceId=S60`, `staffId=ANNA`, `from=to=2026-06-19` (Freitag)

**Ausgangszustand**

Arbeitszeit `weekday=5`, 09:00–17:00 Ortszeit = `07:00:00Z`–`15:00:00Z`. Keine `time_off`.
Sechs Termine, alle `ANNA`, alle `S60`, alle `status = CONFIRMED`:

| Nr. | Ortszeit    | `starts_at`            | `ends_at`              | Blockiert mit Puffer bis |
| --- | ----------- | ---------------------- | ---------------------- | ------------------------ |
| 1   | 09:00–10:00 | `2026-06-19T07:00:00Z` | `2026-06-19T08:00:00Z` | 10:15 (`08:15:00Z`)      |
| 2   | 10:15–11:15 | `2026-06-19T08:15:00Z` | `2026-06-19T09:15:00Z` | 11:30 (`09:30:00Z`)      |
| 3   | 11:30–12:30 | `2026-06-19T09:30:00Z` | `2026-06-19T10:30:00Z` | 12:45 (`10:45:00Z`)      |
| 4   | 12:45–13:45 | `2026-06-19T10:45:00Z` | `2026-06-19T11:45:00Z` | 14:00 (`12:00:00Z`)      |
| 5   | 14:00–15:00 | `2026-06-19T12:00:00Z` | `2026-06-19T13:00:00Z` | 15:15 (`13:15:00Z`)      |
| 6   | 15:15–16:15 | `2026-06-19T13:15:00Z` | `2026-06-19T14:15:00Z` | 16:30 (`14:30:00Z`)      |

Der Rest 16:30–17:00 ist 30 Minuten lang und damit kürzer als die Behandlungsdauer.

**Erwartetes Ergebnis: leere Liste**

**Variante F-05b — ein Termin wird storniert**

Termin 3 bekommt `status = CANCELLED_BY_CUSTOMER` und `cancelled_at` gesetzt. Damit
entfällt sowohl der Termin als auch sein Puffer. Freies Fenster: 11:30 (Ende Puffer von
Termin 2) bis 12:45 (Beginn von Termin 4) = 75 Minuten.

**Erwartung: 2 Slots** — 11:30 (`09:30:00Z`) und 11:45 (`09:45:00Z`). Der Slot 11:45–12:45
endet exakt zum Beginn von Termin 4.

**Was dieser Fall absichert**

- Der Puffer blockiert tatsächlich. Wird er ignoriert, entstehen in F-05 die Slots 10:00,
  11:15, 12:30, 13:45, 15:00 und 16:15 — sechs Slots statt null. Jeder davon ist buchbar,
  jeder lässt der Kosmetikerin null Minuten zum Aufräumen.
- Der Puffer wird **nicht** mitgebucht. Prüfbar daran, dass `appointments.ends_at` der
  sechs Zeilen bei 60 Minuten nach `starts_at` liegt und nicht bei 75.
- Der Puffer blockiert nur nach hinten. Blockierte er auch davor, fiele in F-05b auch 11:30
  weg und es bliebe ein Slot.
- Stornierte Termine geben Zeit **und** Puffer wieder frei. Der typische Fehler ist eine
  Abfrage ohne Statusfilter: Dann bliebe F-05b leer und das Studio verlöre nach jeder
  Stornierung dauerhaft den Platz.
- Ein zu kurzer Rest erzeugt keinen Slot. Die 30 Minuten um 16:30 müssen verschwinden, auch
  wenn sie auf einem Rasterpunkt beginnen.

---

### F-06 — Sommerzeitbeginn, Sonntag 2026-03-29

Verifiziert: Der letzte Sonntag im März 2026 ist der 29. März. Um 02:00 MEZ wird auf 03:00
MESZ vorgestellt, der Offset springt von `+01:00` auf `+02:00`. Der Tag hat **23 Stunden**.
Die Ortszeiten 02:00:00 bis 02:59:59 existieren an diesem Tag nicht.

**Jetzt:** Freitag 2026-03-20 08:00 Ortszeit = `2026-03-20T07:00:00Z` (noch MEZ)

Wichtig: 2026-03-29 ist ein **Sonntag**, also `weekday = 0`. Im Standarddatenbestand aus
3.3 gibt es für Sonntag keine Zeile. Beide Sommerzeitfälle brauchen deshalb eine eigens
angelegte Sonntags-Arbeitszeit. Wird das übersehen, liefert der Test eine leere Liste,
läuft grün gegen eine leere Erwartung und prüft nichts.

#### F-06a — Regulärer Arbeitstag am Umstellungstag

**Ausgangszustand:** `working_hours` `ANNA`, `weekday=0`, `09:00:00`–`17:00:00`. Keine
`time_off`, keine `appointments`. Abfrage `serviceId=S60`, `staffId=ANNA`,
`from=to=2026-03-29`.

Arbeitsfenster: 09:00–17:00 Ortszeit = `2026-03-29T07:00:00Z`–`2026-03-29T15:00:00Z`.
Beide Grenzen liegen nach der Umstellung, der Offset ist durchgängig `+02:00`. Die Länge
beträgt unverändert 480 Minuten.

**Erwartetes Ergebnis: 29 Slots, exakt dieselben UTC-Zeitpunkt-Offsets wie in F-01**
(07:00Z bis 14:00Z). Der Vortag 2026-03-28 mit derselben Arbeitszeit ergäbe dagegen
`06:00:00Z`–`14:00:00Z`.

**Was dieser Fall absichert:** Dass der Offset pro Tag neu bestimmt wird. Eine
Implementierung, die den Offset einmal am Beginn des Abfragezeitraums ermittelt und auf
alle Tage anwendet, liefert hier `06:00:00Z` — eine Stunde zu früh. Die Anzahl stimmt, nur
die Zeitpunkte nicht. Deshalb muss der Test die UTC-Werte vergleichen, nicht die Anzahl.

#### F-06b — Arbeitszeit über die nicht existierende Stunde

**Ausgangszustand:** `working_hours` `ANNA`, `weekday=0`, `01:00:00`–`05:00:00`. Abfrage
wie oben.

| Ortszeit | UTC                    | Offset   |
| -------- | ---------------------- | -------- |
| 01:00    | `2026-03-29T00:00:00Z` | `+01:00` |
| 05:00    | `2026-03-29T03:00:00Z` | `+02:00` |

Die Wanduhr zeigt vier Stunden Differenz, vergangen sind **drei**. Fensterlänge: 180
Minuten, nicht 240.

**Erwartetes Ergebnis: 9 Slots**

| UTC-Start              | Ortszeit |
| ---------------------- | -------- |
| `2026-03-29T00:00:00Z` | 01:00    |
| `2026-03-29T00:15:00Z` | 01:15    |
| `2026-03-29T00:30:00Z` | 01:30    |
| `2026-03-29T00:45:00Z` | 01:45    |
| `2026-03-29T01:00:00Z` | 03:00    |
| `2026-03-29T01:15:00Z` | 03:15    |
| `2026-03-29T01:30:00Z` | 03:30    |
| `2026-03-29T01:45:00Z` | 03:45    |
| `2026-03-29T02:00:00Z` | 04:00    |

Die Ortszeit springt zwischen dem vierten und fünften Slot von 01:45 auf 03:00. Kein Slot
trägt eine Beschriftung zwischen 02:00 und 02:59.

**Was dieser Fall absichert**

- Die Fensterlänge wird aus den beiden UTC-Zeitpunkten berechnet, nicht aus der Differenz
  der Wanduhrzeiten. Der klassische Fehler ist
  `endeUtc = startUtc + (end_time − start_time)`, hier also `00:00Z + 4h = 04:00Z`. Das
  entspricht 06:00 Ortszeit — eine Stunde nach Arbeitsende — und ergäbe 13 statt 9 Slots.
  Die vier überzähligen Slots liegen nach Feierabend.
- Die nicht existierende Stunde erzeugt keinen Slot. Wird das Raster in Ortszeit erzeugt
  (01:00, 01:15, …, 02:00, 02:15, …) und erst danach umgerechnet, muss jede Umrechnung von
  02:00 bis 02:45 scheitern oder stillschweigend auf 03:00 springen. Im zweiten Fall
  entstehen vier Slots mit demselben UTC-Zeitpunkt wie die 03:00er-Slots — sichtbare
  Dubletten in der App. Das Raster gehört deshalb in UTC erzeugt und nur zur Anzeige
  zurückgerechnet.

---

### F-07 — Sommerzeitende, Sonntag 2026-10-25

Verifiziert: Der letzte Sonntag im Oktober 2026 ist der 25. Oktober. Um 03:00 MESZ wird auf
02:00 MEZ zurückgestellt, der Offset springt von `+02:00` auf `+01:00`. Der Tag hat
**25 Stunden**. Die Ortszeiten 02:00:00 bis 02:59:59 existieren an diesem Tag **zweimal**.

Das ist der gefährlichere der beiden Tage, weil nichts fehlschlägt. Eine nicht existierende
Zeit lässt jede ordentliche Bibliothek Alarm schlagen. Eine doppelt existierende Zeit wird
klaglos in eine der beiden Möglichkeiten aufgelöst — und welche, hängt von der Bibliothek
ab.

**Jetzt:** Dienstag 2026-10-20 08:00 Ortszeit = `2026-10-20T06:00:00Z`

Auch hier gilt: `weekday = 0`, die Sonntagszeile muss eigens angelegt werden.

#### F-07a — Regulärer Arbeitstag am Umstellungstag

**Ausgangszustand:** `working_hours` `ANNA`, `weekday=0`, `09:00:00`–`17:00:00`. Keine
`time_off`, keine `appointments`.

Arbeitsfenster: 09:00–17:00 Ortszeit = `2026-10-25T08:00:00Z`–`2026-10-25T16:00:00Z`, beide
Grenzen nach der Umstellung, Offset `+01:00`, Länge 480 Minuten.

**Erwartetes Ergebnis: 29 Slots**, erster Start `2026-10-25T08:00:00Z` (09:00 Ortszeit),
letzter Start `2026-10-25T15:00:00Z` (16:00 Ortszeit).

**Was dieser Fall absichert:** Dasselbe wie F-06a, in der Gegenrichtung. Zusätzlich die
Tagesgrenze: Ortszeit-Mitternacht des 25.10. liegt bei `2026-10-24T22:00:00Z`, die des
26.10. bei `2026-10-25T23:00:00Z` — 25 Stunden dazwischen. Eine Implementierung, die den
Abfragetag als `tagesbeginnUtc + 24 h` abgrenzt, schneidet die letzte Stunde ab und
verliert damit bei einer Abfrage über mehrere Tage den Slot um 16:00.

#### F-07b — Arbeitszeit über die doppelt vorhandene Stunde

**Ausgangszustand:** `working_hours` `ANNA`, `weekday=0`, `01:00:00`–`05:00:00`.

| Ortszeit | UTC                    | Offset   |
| -------- | ---------------------- | -------- |
| 01:00    | `2026-10-24T23:00:00Z` | `+02:00` |
| 05:00    | `2026-10-25T04:00:00Z` | `+01:00` |

Die Wanduhr zeigt vier Stunden Differenz, vergangen sind **fünf**. Fensterlänge: 300
Minuten. Der Fensterbeginn liegt in UTC am **Vortag** — auch das ein eigener Fehlerpfad.

**Erwartetes Ergebnis: 17 Slots**

| UTC-Start              | Ortszeit     | UTC-Start              | Ortszeit    |
| ---------------------- | ------------ | ---------------------- | ----------- |
| `2026-10-24T23:00:00Z` | 01:00        | `2026-10-25T01:30:00Z` | 02:30 (MEZ) |
| `2026-10-24T23:15:00Z` | 01:15        | `2026-10-25T01:45:00Z` | 02:45 (MEZ) |
| `2026-10-24T23:30:00Z` | 01:30        | `2026-10-25T02:00:00Z` | 03:00       |
| `2026-10-24T23:45:00Z` | 01:45        | `2026-10-25T02:15:00Z` | 03:15       |
| `2026-10-25T00:00:00Z` | 02:00 (MESZ) | `2026-10-25T02:30:00Z` | 03:30       |
| `2026-10-25T00:15:00Z` | 02:15 (MESZ) | `2026-10-25T02:45:00Z` | 03:45       |
| `2026-10-25T00:30:00Z` | 02:30 (MESZ) | `2026-10-25T03:00:00Z` | 04:00       |
| `2026-10-25T00:45:00Z` | 02:45 (MESZ) |                        |             |
| `2026-10-25T01:00:00Z` | 02:00 (MEZ)  |                        |             |
| `2026-10-25T01:15:00Z` | 02:15 (MEZ)  |                        |             |

Acht Slots tragen die vier Beschriftungen 02:00, 02:15, 02:30 und 02:45 — jede genau
zweimal, mit unterschiedlichem Offset.

**Was dieser Fall absichert**

- Es entstehen 17 und nicht 13 Slots. Wer die Fensterlänge aus der Wanduhr-Differenz
  ableitet, verliert die zusätzliche Stunde und damit vier buchbare Slots.
- Die Liste enthält Dubletten in der Ortszeit-Beschriftung, aber keine in UTC. Eine
  Deduplizierung über die formatierte Ortszeit — in Oberflächen beliebt, um „doppelte"
  Einträge zu unterdrücken — löscht hier vier korrekte Slots.
- Der Fensterbeginn liegt in UTC auf dem Vortag. Eine Abfrage `WHERE starts_at >= :tag`
  mit `:tag = 2026-10-25T00:00:00Z` findet die ersten vier Slots nicht. Tagesgrenzen müssen
  aus der Ortszeit abgeleitet werden, nie aus UTC-Mitternacht.

#### F-07c — Termin in der doppelt vorhandenen Stunde

Der eigentliche Prüfstein für E-06.

**Ausgangszustand:** wie F-07b, zusätzlich Abfrage mit `serviceId=S30` (30 Minuten, kein
Puffer) und ein bestehender Termin:

| Feld         | Wert                                                               |
| ------------ | ------------------------------------------------------------------ |
| `staff_id`   | `ANNA`                                                             |
| `service_id` | `S30`                                                              |
| `starts_at`  | `2026-10-25T00:00:00Z` = 02:00 Ortszeit **MESZ**, erster Durchlauf |
| `ends_at`    | `2026-10-25T00:30:00Z` = 02:30 Ortszeit **MESZ**                   |
| `status`     | `CONFIRMED`                                                        |

**Erwartetes Ergebnis: 16 Slots**

Ohne Termin ergäbe das 300-Minuten-Fenster bei 30 Minuten Dauer 19 Slots. Der Termin
entfernt genau drei Startzeiten: `2026-10-24T23:45:00Z` (liefe bis 00:15Z hinein),
`2026-10-25T00:00:00Z` und `2026-10-25T00:15:00Z`. Bleiben 16.

Entscheidend ist, was **nicht** entfernt wird:

| UTC-Start              | Ortszeit     | Status   |
| ---------------------- | ------------ | -------- |
| `2026-10-25T00:00:00Z` | 02:00 (MESZ) | entfernt |
| `2026-10-25T00:15:00Z` | 02:15 (MESZ) | entfernt |
| `2026-10-25T00:30:00Z` | 02:30 (MESZ) | **frei** |
| `2026-10-25T01:00:00Z` | 02:00 (MEZ)  | **frei** |
| `2026-10-25T01:15:00Z` | 02:15 (MEZ)  | **frei** |

**Was dieser Fall absichert**

Genau das Szenario, mit dem E-06 die UTC-Speicherung begründet. Der Slot „02:00" muss
angeboten werden, obwohl ein Termin „um 02:00" existiert — weil es zwei verschiedene
Zeitpunkte sind, 60 Minuten auseinander. Jede Implementierung, die Termine und Slots über
formatierte Ortszeit-Strings oder über `LocalDateTime`-Werte vergleicht, löscht hier den
freien Slot. Umgekehrt: Wäre lokale Zeit gespeichert, wären die beiden Termine nicht mehr
auseinanderzuhalten und auch der `EXCLUDE`-Constraint könnte sie nicht trennen.

Ergänzend ist zu prüfen, dass eine Buchung auf `2026-10-25T01:00:00Z` tatsächlich
durchgeht und **nicht** mit `409 Conflict` scheitert. Das verbindet F-07c mit E-07: Die
Slot-Berechnung und der Datenbank-Constraint müssen an diesem Tag dieselbe Meinung haben.

---

## 5. Ergänzende Fälle

Diese Fälle stehen nicht im Plan. Sie decken Fehler ab, die in Buchungssystemen
erfahrungsgemäß auftreten und von den sechs Pflichtfällen nicht berührt werden.

### Z-01 — Vorlaufzeit schneidet in den laufenden Tag

**Warum:** Die Vorlaufzeit ist der einzige Teil der Berechnung, der von der Uhr abhängt.
Sie wird regelmäßig zu grob umgesetzt — „heute gar nicht mehr buchbar" statt „ab jetzt plus
zwei Stunden" — oder sie wird korrekt angewendet und dann vom 60-Sekunden-Cache aus Z-06
überschrieben. Beides fällt in einem Test mit einem Abfragetag in der Zukunft nie auf.

**Jetzt:** Dienstag 2026-06-16 09:40 Ortszeit = `2026-06-16T07:40:00Z`
**Abfrage:** `serviceId=S60`, `staffId=ANNA`, `from=to=2026-06-16` — der laufende Tag

**Ausgangszustand:** Arbeitszeit `weekday=2`, 09:00–17:00. Keine `time_off`, keine
`appointments`.

Frühester zulässiger Start: 09:40 + 120 min = 11:40 Ortszeit = `2026-06-16T09:40:00Z`.
11:40 liegt nicht auf dem Raster; die nächste gültige Startzeit ist 11:45.

**Erwartetes Ergebnis: 18 Slots**

```
11:45 (09:45Z)  12:00 (10:00Z)  12:15 (10:15Z)  12:30 (10:30Z)
12:45 (10:45Z)  13:00 (11:00Z)  13:15 (11:15Z)  13:30 (11:30Z)
13:45 (11:45Z)  14:00 (12:00Z)  14:15 (12:15Z)  14:30 (12:30Z)
14:45 (12:45Z)  15:00 (13:00Z)  15:15 (13:15Z)  15:30 (13:30Z)
15:45 (13:45Z)  16:00 (14:00Z)
```

Ausdrücklich **nicht** enthalten: 09:00 bis 09:30 (Vergangenheit), 09:45 bis 11:30
(innerhalb der Vorlaufzeit). Insbesondere darf 10:10 — in 30 Minuten — nicht erscheinen.

**Festlegung, die dieser Fall verankert:** Die Vorlaufzeitgrenze wird auf den **nächsten**
Rasterpunkt aufgerundet, nie abgerundet. Abrunden auf 11:30 ergäbe einen Slot, der 10
Minuten zu früh liegt und die Regel verletzt. Die Grenze selbst ist inklusiv: Läge sie
exakt auf 11:45, wäre 11:45 gültig.

---

### Z-02 — Buchungshorizont, exakt am letzten und am ersten unzulässigen Tag

**Warum:** Horizontprüfungen sind Off-by-one-Fallen mit Zeitzonenanteil. Die naheliegende
Rechnung `jetzt + 90 × 86 400 000 ms` ergibt hier `2026-09-14T06:00:00Z` — also 08:00
Ortszeit am letzten Tag. Damit fielen alle Slots dieses Tages ab 08:00 heraus, obwohl der
Tag vollständig buchbar sein soll. Der Fehler trifft genau einen Tag und wird im
Alltagsbetrieb jahrelang nicht bemerkt.

**Jetzt:** Dienstag 2026-06-16 08:00 Ortszeit = `2026-06-16T06:00:00Z`

**Festlegung:** Der Horizont zählt Kalendertage in Studio-Zeitzone. Letzter buchbarer Tag
ist `heute + 90 Tage` einschließlich, bis zu dessen Ortszeit-Ende. 2026-06-16 + 90 Tage =
**2026-09-14** (Montag). Erster unzulässiger Tag: **2026-09-15** (Dienstag).

**Ausgangszustand:** Standardarbeitszeiten, keine `time_off`, keine `appointments`.

| Abfrage              | Erwartung                                                      |
| -------------------- | -------------------------------------------------------------- |
| `from=to=2026-09-14` | 29 Slots, erster `2026-09-14T07:00:00Z`, letzter `…T14:00:00Z` |
| `from=to=2026-09-15` | leere Liste, HTTP 200                                          |

Beide Tage sind Werktage mit Arbeitszeit — der Unterschied kommt ausschließlich vom
Horizont. Hätte einer der beiden ohnehin keine Arbeitszeit, prüfte der Fall nichts.

Zusätzlich: Eine Abfrage `from=2026-09-13&to=2026-09-20` muss Slots für den 14.09.
enthalten und für den 15.09. bis 20.09. keine — der Horizont wird pro Tag geprüft und
führt nicht dazu, dass die gesamte Abfrage abgelehnt wird.

---

### Z-03 — Abwesenheit grenzt lückenlos an einen Termin

**Warum:** Beim Abziehen von Intervallen entstehen leicht Fenster der Länge null oder mit
negativer Länge. Manche Implementierungen geben für ein Nullfenster trotzdem einen Slot an
dessen Startzeitpunkt aus, weil die Abbruchbedingung `länge < dauer` bei sortierten
Grenzen nie erreicht wird. Der Fehler ist selten und erzeugt genau einen falschen Slot —
den sich jemand bucht.

**Jetzt:** Montag 2026-06-15 08:00 Ortszeit = `2026-06-15T06:00:00Z`
**Abfrage:** `serviceId=S60`, `staffId=ANNA`, `from=to=2026-06-18` (Donnerstag)

**Ausgangszustand**

Arbeitszeit `weekday=4`, 09:00–17:00 = `07:00:00Z`–`15:00:00Z`.

Ein Termin:

| Feld        | Wert                                             |
| ----------- | ------------------------------------------------ |
| `staff_id`  | `ANNA`, `service_id` `S60`, `status` `CONFIRMED` |
| `starts_at` | 10:00 Ortszeit = `2026-06-18T08:00:00Z`          |
| `ends_at`   | 11:00 Ortszeit = `2026-06-18T09:00:00Z`          |

Puffer 15 min → blockiert bis 11:15 Ortszeit = `2026-06-18T09:15:00Z`.

Eine `time_off`-Zeile, die **exakt** dort anschließt:

| Feld        | Wert                                    |
| ----------- | --------------------------------------- |
| `staff_id`  | `ANNA`                                  |
| `starts_at` | 11:15 Ortszeit = `2026-06-18T09:15:00Z` |
| `ends_at`   | 12:15 Ortszeit = `2026-06-18T10:15:00Z` |
| `type`      | `TRAINING`                              |

**Erwartetes Ergebnis: 17 Slots**

```
09:00 (07:00Z)

12:15 (10:15Z)  12:30 (10:30Z)  12:45 (10:45Z)  13:00 (11:00Z)
13:15 (11:15Z)  13:30 (11:30Z)  13:45 (11:45Z)  14:00 (12:00Z)
14:15 (12:15Z)  14:30 (12:30Z)  14:45 (12:45Z)  15:00 (13:00Z)
15:15 (13:15Z)  15:30 (13:30Z)  15:45 (13:45Z)  16:00 (14:00Z)
```

Zwischen 10:00 und 12:15 ist nichts frei. Insbesondere darf **kein** Slot um 11:15
erscheinen — dort ist das Fenster null Minuten lang.

Das Vormittagsfenster 09:00–10:00 ist exakt 60 Minuten lang und ergibt genau einen Slot,
dessen Ende mit dem Terminbeginn zusammenfällt.

---

### Z-04 — Abfrage ohne `staffId` über mehrere Personen

**Warum:** `PLAN.md` nennt `staff_id` als optional („oder egal"). Das ist der Pfad, den die
Kundinnen-App am häufigsten nutzt und der in Tests am seltensten vorkommt. Typische Fehler:
Dubletten bei überlappenden Arbeitszeiten, Slots ohne Angabe wer sie bedienen kann, und
Personen, die die Leistung gar nicht anbieten.

**Jetzt:** Montag 2026-06-15 08:00 Ortszeit = `2026-06-15T06:00:00Z`
**Abfrage:** `serviceId=S60`, **ohne** `staffId`, `from=to=2026-06-16` (Dienstag)

**Ausgangszustand**

| Person  | `weekday=2` | Ortszeit    | UTC                     | `is_active` | bietet `S60` |
| ------- | ----------- | ----------- | ----------------------- | ----------- | ------------ |
| `ANNA`  | eine Zeile  | 09:00–13:00 | `07:00:00Z`–`11:00:00Z` | `true`      | ja           |
| `BEA`   | eine Zeile  | 11:00–17:00 | `09:00:00Z`–`15:00:00Z` | `true`      | ja           |
| `CHRIS` | eine Zeile  | 09:00–17:00 | `07:00:00Z`–`15:00:00Z` | `false`     | ja           |

Keine `time_off`, keine `appointments`.

**Erwartetes Ergebnis**

- `ANNA`: 13 Startzeiten, 09:00 bis 12:00 (letzter Slot 12:00–13:00)
- `BEA`: 21 Startzeiten, 11:00 bis 16:00
- `CHRIS`: keine, weil `is_active = false`

Als Menge unterschiedlicher Startzeiten: **29**, lückenlos 09:00 bis 16:00. Fünf davon —
11:00, 11:15, 11:30, 11:45, 12:00 — können von beiden Personen bedient werden.

**Festlegung, die dieser Fall verankert:** Die Antwort enthält je Startzeit **einen**
Eintrag mit der Liste der verfügbaren `staffId`. Nicht 34 Einträge mit Dubletten in der
Startzeit, und nicht 29 Einträge ohne Angabe der Person. Ohne diese Angabe müsste der
Client beim Buchen raten, und `POST /appointments` verlangt `staff_id`.

**Zusätzlich abgesichert:** Eine Person ohne `staff_services`-Zeile für die angefragte
Leistung darf nicht erscheinen. Dazu wird in einer Variante `BEA` die Zuordnung zu `S60`
entzogen; erwartet werden dann nur `ANNA`s 13 Startzeiten.

---

### Z-05 — Leistung inaktiv oder von niemandem angeboten

**Warum:** Schritt 19 verlangt ausdrücklich: „Eine Leistung, die niemand anbietet, taucht in
der Buchung nicht auf." Dieselbe Regel muss in der Verfügbarkeit greifen, sonst entsteht
ein Slot, dessen Buchung anschließend scheitert.

**Jetzt:** Montag 2026-06-15 08:00 Ortszeit = `2026-06-15T06:00:00Z`
**Abfragen:** `from=to=2026-06-16`, ohne `staffId`

| Variante | Ausgangszustand                                           | Erwartung        |
| -------- | --------------------------------------------------------- | ---------------- |
| a        | `serviceId=S45`, `is_active = false`, `ANNA` zugeordnet   | leere Liste, 200 |
| b        | `serviceId=S30`, aktiv, aber keine `staff_services`-Zeile | leere Liste, 200 |
| c        | `serviceId` unbekannte UUID                               | `404 Not Found`  |

Die Unterscheidung zwischen b und c ist bewusst: Eine existierende Leistung ohne Anbieter
ist eine gültige Abfrage mit leerem Ergebnis, eine nicht existierende Leistung ist ein
Fehler des Clients. Beides als 404 zu behandeln verwirrt die App, beides als leere Liste
verdeckt Tippfehler in der Integration.

---

### Z-06 — Cache liefert veraltete oder fremde Slots

**Warum:** `PLAN.md` 5.1 schreibt 60 Sekunden Redis-Cache mit Invalidierung bei jeder
Buchung vor. Ein Cache ist die billigste Stelle, an der eine korrekte Berechnung wieder
falsch wird, und die am schwersten zu bemerkende: Der Fehler verschwindet nach einer
Minute von selbst und ist damit nicht reproduzierbar, wenn man ihn manuell sucht.

**Jetzt:** Montag 2026-06-15 08:00 Ortszeit = `2026-06-15T06:00:00Z`
**Ausgangszustand:** wie F-01.

| Schritt | Aktion                                          | Erwartung                               |
| ------- | ----------------------------------------------- | --------------------------------------- |
| 1       | Abfrage `S60`/`ANNA`/2026-06-16                 | 29 Slots, 14:00 (`12:00:00Z`) enthalten |
| 2       | `POST /appointments` auf `2026-06-16T12:00:00Z` | 201                                     |
| 3       | Sofort erneut dieselbe Abfrage                  | 21 Slots                                |
| 4       | Termin stornieren                               | 200                                     |
| 5       | Sofort erneut dieselbe Abfrage                  | wieder 29 Slots                         |

Rechenweg zu Schritt 3: Der Termin belegt 14:00–15:00, der Puffer blockiert bis 15:15.
Freie Fenster sind 09:00–14:00 (300 min → 17 Slots, 09:00 bis 13:00) und 15:15–17:00
(105 min → 4 Slots, 15:15 bis 16:00), zusammen **21**. Gegenprobe über die Streichungen:
Von den 29 Startzeiten entfallen 13:15, 13:30, 13:45 (liefen in den Termin hinein), 14:00
(der Termin selbst) sowie 14:15, 14:30, 14:45 und 15:00 (lägen im Termin oder im Puffer) —
acht Streichungen, 29 − 8 = 21.

**Zusätzlich zu prüfen — Cache-Schlüssel:** Zwei Abfragen, die sich nur in `serviceId`
unterscheiden (`S60` und `S30`, gleicher Tag, gleiche Person, leerer Kalender), müssen
unterschiedliche Ergebnisse liefern: `S60` ergibt 29 Startzeiten von 09:00 bis 16:00, `S30`
ergibt 31 von 09:00 bis 16:30. Ein Cache-Schlüssel ohne `serviceId` liefert die zuvor
berechnete Liste zurück und bietet damit entweder 16:30 für eine 60-Minuten-Behandlung an
oder unterschlägt zwei gültige 30-Minuten-Slots. Der Schlüssel muss `serviceId`, `staffId`,
`from` und `to` enthalten.

---

### Z-07 — Mehrtägige Abwesenheit, die den Abfragetag nur überlappt

**Warum:** Dies ist der häufigste Fehler in der gesamten Liste. Die naheliegende Abfrage
lautet `WHERE starts_at >= :tagBeginn AND starts_at < :tagEnde` — sie findet jede
Abwesenheit, die am Abfragetag **beginnt**, und keine einzige, die früher begonnen hat.
Ein zweiwöchiger Urlaub blockiert damit nur seinen ersten Tag. Die Testdaten in F-03
verdecken das vollständig, weil dort Abwesenheit und Abfragetag identisch sind.

**Jetzt:** Montag 2026-06-15 08:00 Ortszeit = `2026-06-15T06:00:00Z`

**Ausgangszustand**

Standardarbeitszeiten für `ANNA`. Eine `time_off`-Zeile:

| Feld         | Wert                                                             |
| ------------ | ---------------------------------------------------------------- |
| `staff_id`   | `ANNA`                                                           |
| `starts_at`  | 2026-07-15 00:00 Ortszeit = `2026-07-14T22:00:00Z` (MESZ, UTC+2) |
| `ends_at`    | 2026-07-27 00:00 Ortszeit = `2026-07-26T22:00:00Z`               |
| `type`       | `VACATION`                                                       |
| `is_all_day` | `true`                                                           |

**Erwartetes Ergebnis**

| Abfragetag | Wochentag | Erwartung                     |
| ---------- | --------- | ----------------------------- |
| 2026-07-14 | Dienstag  | 29 Slots (letzter Arbeitstag) |
| 2026-07-15 | Mittwoch  | leere Liste (Urlaubsbeginn)   |
| 2026-07-20 | Montag    | leere Liste (Urlaubsmitte)    |
| 2026-07-24 | Freitag   | leere Liste                   |
| 2026-07-27 | Montag    | 29 Slots (erster Arbeitstag)  |

Der 2026-07-20 ist der entscheidende Tag: Dort beginnt und endet keine Abwesenheit, die
Zeile überlappt den Tag nur. Die richtige Bedingung ist eine Überschneidungsprüfung —
`starts_at < :tagEnde AND ends_at > :tagBeginn` — und nicht eine Prüfung auf `starts_at`
allein.

Die beiden Randtage 14.07. und 27.07. sichern zusätzlich ab, dass die Grenzen halboffen
sind: `ends_at` am 27.07. um 00:00 Ortszeit blockiert den 27. nicht mehr.

---

## 6. Die drei wahrscheinlichsten Fehlerstellen

### 6.1 Die Umrechnung Ortszeit nach UTC wird einmal statt pro Tag gemacht

`working_hours.start_time` ist `TIME(0)` ohne Zeitzone und muss für jeden einzelnen
Kalendertag mit dem an diesem Tag gültigen Offset nach UTC gelegt werden. Die naheliegende
Abkürzung — Offset einmal ermitteln und für den ganzen Abfragezeitraum verwenden, oder
`startUtc + (end_time − start_time)` rechnen — funktioniert an 363 von 365 Tagen im Jahr.

Das macht sie so gefährlich. Jeder manuelle Test, jede Oberflächenprüfung und jeder
Testdatensatz mit einem beliebig gewählten Datum bestätigt sie. Der Fehler zeigt sich an
zwei Sonntagen im Jahr, an denen das Studio vermutlich geschlossen ist — und danach in der
Woche darauf als um eine Stunde verschobene Slot-Liste, falls der Cache oder eine
vorberechnete Tabelle den falschen Offset weiterträgt. Eine typische Abfrage über 90 Tage
im März enthält immer einen Umstellungstag, ohne dass jemand das bemerkt.

Abgesichert durch: F-06a, F-06b, F-07a, F-07b, F-07c.

### 6.2 Die Tagesgrenze wird in UTC statt in Ortszeit gebildet

Fast jede Teilabfrage der Berechnung braucht „der Tag X von Anfang bis Ende": welche
`working_hours`-Zeilen gelten, welche `time_off`-Zeilen überlappen, welche Termine fallen
hinein, wo liegen die Rasterpunkte. Wird dafür UTC-Mitternacht genommen oder
`tagesbeginn + 24 h` gerechnet, stimmt das Fenster an jedem Tag des Jahres um ein bis zwei
Stunden nicht — in MESZ beginnt der Ortszeit-Tag um `22:00:00Z` des Vortags.

Der Effekt ist besonders tückisch, weil er sich mit dem ersten Fehler überlagert und weil
er in jedem Fall auftritt, bei dem Arbeitszeiten früh am Morgen oder spät am Abend liegen.
In F-07b beginnt das Arbeitsfenster in UTC am **Vortag** — eine Abfrage, die nach
`starts_at` innerhalb des UTC-Tages filtert, verliert dort vier Slots stillschweigend.
Dieselbe Verwechslung macht Z-02 kaputt: 90 Tage als `90 × 86 400 000 ms` statt als
90 Kalendertage schneidet den letzten Tag mittendrin ab.

Abgesichert durch: F-07a, F-07b, Z-02, Z-07 und implizit jeder Fall mit expliziten
UTC-Werten.

### 6.3 Das Abziehen der Blockaden ist unvollständig oder zu grob

Der dritte Risikoherd ist nicht die Zeitzone, sondern die Mengenlehre. Fünf Quellen
blockieren Zeit: Arbeitszeitlücken, individuelle Abwesenheiten, studioweite Abwesenheiten,
bestehende Termine und deren Puffer. Jede hat eine eigene Falle, und jede davon erzeugt ein
Ergebnis, das plausibel aussieht:

- `WHERE staff_id = :id` übergeht `staff_id IS NULL` — der Feiertag verschwindet lautlos,
  weil `NULL = :id` niemals wahr ergibt (F-04).
- `WHERE starts_at BETWEEN :von AND :bis` übergeht jede Abwesenheit, die vorher begonnen
  hat — der zweiwöchige Urlaub blockiert nur seinen ersten Tag (Z-07).
- Fehlender Statusfilter lässt stornierte Termine weiterblockieren; ein zu weiter
  Statusfilter lässt `PENDING`-Termine durchfallen und erzeugt dann `409` beim Buchen
  (F-05b, Abschnitt 2.5).
- Der Puffer existiert nirgends gespeichert und auch nicht im `EXCLUDE`-Constraint aus
  E-07. Vergisst die Anwendung ihn, merkt es die Datenbank nicht: Die Buchung geht durch,
  und zwei Termine liegen ohne Aufräumzeit hintereinander (F-05).
- Aneinandergrenzende Arbeitszeitfenster werden nicht verschmolzen (F-02b), oder beim
  Abziehen entstehen Nullfenster, die trotzdem einen Slot liefern (Z-03).

Die Gemeinsamkeit: Keiner dieser Fehler wirft eine Ausnahme. Alle liefern eine
wohlgeformte Slot-Liste, die um wenige Einträge daneben liegt. Deshalb muss jeder Testfall
die **vollständige** Liste zusichern, nicht nur deren Länge und nicht nur einzelne
Stichproben.

---

## 7. Zusammenfassung der Erwartungswerte

| Fall  | Kurzbeschreibung                            | Erwartete Slots |
| ----- | ------------------------------------------- | --------------- |
| F-01  | Normaler Arbeitstag                         | 29              |
| F-02  | Mittagspause 12–13                          | 22              |
| F-02b | Zwei aneinandergrenzende Zeilen             | 29              |
| F-03  | Halber Urlaubstag ab 12:00                  | 9               |
| F-03b | Halber Urlaubstag ab 11:30                  | 7               |
| F-04  | Studioweiter Feiertag                       | 0               |
| F-05  | Voll ausgebuchter Tag                       | 0               |
| F-05b | Ein Termin storniert                        | 2               |
| F-06a | 29.03., Arbeitszeit 09:00–17:00             | 29              |
| F-06b | 29.03., Arbeitszeit 01:00–05:00             | 9               |
| F-07a | 25.10., Arbeitszeit 09:00–17:00             | 29              |
| F-07b | 25.10., Arbeitszeit 01:00–05:00             | 17              |
| F-07c | 25.10., Termin in der doppelten Stunde      | 16              |
| Z-01  | Vorlaufzeit im laufenden Tag                | 18              |
| Z-02  | Horizont, letzter / erster unzulässiger Tag | 29 / 0          |
| Z-03  | Abwesenheit grenzt an Termin                | 17              |
| Z-04  | Ohne `staffId`, zwei Personen               | 29 Startzeiten  |
| Z-05  | Leistung inaktiv / ohne Anbieter            | 0               |
| Z-06  | Cache nach Buchung                          | 29 → 21 → 29    |
| Z-07  | Mehrtägiger Urlaub, Mitte                   | 0               |

Erst wenn alle diese Werte als Test grün sind, ist Schritt 21 abgeschlossen. `UMSETZUNG.md`
sagt dazu: nicht weiterarbeiten, solange das nicht der Fall ist.
