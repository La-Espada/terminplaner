# Entscheidungsprotokoll

Jede nicht offensichtliche Entscheidung mit Begründung. Der Code zeigt, **was** gebaut
wurde — hier steht, **warum**.

Gedacht für den Moment, in dem du dich in sechs Monaten fragst, warum etwas so
umständlich aussieht. Meistens gibt es einen Grund, und meistens ist er hier notiert.

**Bevor du eine dieser Entscheidungen umdrehst:** lies die Begründung. Ist sie nicht mehr
gültig, dreh sie um — aber trag die Änderung hier ein, mit Datum.

---

## Überblick

| Nr.           | Entscheidung                                          | Datum      | Status       |
| ------------- | ----------------------------------------------------- | ---------- | ------------ |
| [E-01](#e-01) | Ein gemeinsames Backend für alle Clients              | 2026-09-08 | gültig       |
| [E-02](#e-02) | NestJS + PostgreSQL, EU-Hosting statt Firebase        | 2026-09-08 | gültig       |
| [E-03](#e-03) | React Native mit Expo statt zwei nativer Apps         | 2026-09-17 | **geändert** |
| [E-04](#e-04) | Monorepo statt vier getrennter Repositories           | 2026-09-20 | **geändert** |
| [E-05](#e-05) | Admin-Web vor der Mobile-App bauen                    | 2026-09-17 | gültig       |
| [E-06](#e-06) | Zeitstempel durchgängig `timestamptz` in UTC          | 2026-09-08 | gültig       |
| [E-07](#e-07) | Überschneidungsschutz in der Datenbank                | 2026-09-08 | gültig       |
| [E-08](#e-08) | Geldbeträge als Cent-Integer                          | 2026-09-08 | gültig       |
| [E-09](#e-09) | Preis beim Buchen einfrieren                          | 2026-09-08 | gültig       |
| [E-10](#e-10) | `staff_services` als reine Verknüpfung                | 2026-09-20 | **geändert** |
| [E-11](#e-11) | `working_hours` wiederkehrend, `time_off` einmalig    | 2026-09-20 | gültig       |
| [E-12](#e-12) | `time_off` ohne Freitextfeld                          | 2026-09-20 | gültig       |
| [E-13](#e-13) | Behandlungsnotizen als eigene verschlüsselte Tabelle  | 2026-09-08 | gültig       |
| [E-14](#e-14) | Kundennotiz wie Art.-9-Daten behandeln                | 2026-09-20 | gültig       |
| [E-15](#e-15) | Kein Soft-Delete, nur Anonymisierung                  | 2026-09-20 | gültig       |
| [E-16](#e-16) | Audit-Log ohne Inhalte                                | 2026-09-20 | gültig       |
| [E-17](#e-17) | Push nicht über den Expo-Dienst                       | 2026-09-17 | gültig       |
| [E-18](#e-18) | Push-Nachrichten ohne Klardaten                       | 2026-09-08 | gültig       |
| [E-19](#e-19) | Backups täglich, 30 Tage flach                        | 2026-09-20 | gültig       |
| [E-20](#e-20) | Buchungsregeln als Konfiguration, nicht als Code      | 2026-09-17 | gültig       |
| [E-21](#e-21) | Gesundheitsdaten bleiben in Version 1                 | 2026-09-17 | gültig       |
| [E-22](#e-22) | Nest-CLI entfernt, Build mit reinem tsc               | 2026-09-20 | gültig       |
| [E-23](#e-23) | Prisma auf 7.10.0 gepinnt statt Release-Candidate     | 2026-09-20 | gültig       |
| [E-24](#e-24) | PostgreSQL auf Port 5433 statt 5432                   | 2026-09-20 | gültig       |
| [E-25](#e-25) | Nachfrist bei der Token-Rotation                      | 2026-09-23 | gültig       |
| [E-26](#e-26) | Admin-Web spricht `localhost`, nicht `127.0.0.1`      | 2026-09-23 | gültig       |
| [E-27](#e-27) | Endpunkte sind standardmäßig geschützt                | 2026-10-04 | gültig       |
| [E-28](#e-28) | Anfragebegrenzung zählt nach IP **und** Konto         | 2026-10-04 | gültig       |
| [E-29](#e-29) | Tailwind jetzt, shadcn/ui später                      | 2026-10-07 | gültig       |
| [E-30](#e-30) | Personal wird eingeladen, nicht mit Passwort angelegt | 2026-10-07 | gültig       |
| [E-31](#e-31) | Leistung ohne Anbieterin ist oeffentlich unsichtbar   | 2026-10-08 | gueltig      |
| [E-32](#e-32) | Keine eigenen Studio-Oeffnungszeiten                  | 2026-10-08 | gueltig      |
| [E-33](#e-33) | Festlegungen der Slot-Berechnung                      | 2026-10-08 | gueltig      |
| [E-34](#e-34) | Kein Slot-Cache in Redis                              | 2026-10-08 | gueltig      |
| [E-35](#e-35) | Absagegrund als Kategorie, nicht als Freitext         | 2026-10-08 | gueltig      |

---

# Architektur und Stack

<a id="e-01"></a>

## E-01 · Ein gemeinsames Backend für alle Clients

**Entscheidung:** Mobile-App und Admin-Web sprechen dieselbe versionierte REST-API. Kein
eigenes Backend je Client.

**Warum:** Die Buchungslogik — Slot-Berechnung, Rechteprüfung, Preisfindung — darf nur an
einer Stelle existieren. Zwei Implementierungen driften garantiert auseinander, und der
Unterschied fällt erst auf, wenn eine Doppelbuchung entstanden ist.

**Konsequenz:** Kein Client enthält Geschäftslogik. Clients zeigen an, was die API liefert.
Änderungen an der Schnittstelle gehen zuerst ins OpenAPI-Dokument, dann in die Clients.

<a id="e-02"></a>

## E-02 · NestJS + PostgreSQL mit EU-Hosting statt Firebase

**Entscheidung:** Eigenes Backend auf europäischen Servern. Firebase wurde geprüft und
verworfen.

**Warum:** Firebase wäre deutlich schneller zum ersten Ergebnis gewesen. Aber es liegt bei
einem US-Konzern, und wir verarbeiten Gesundheitsdaten. Das ist der eine Bereich, in dem
ein Drittlandtransfer wirklich weh tut. Dazu kommt: Das Löschkonzept und die
Auftragsverarbeitung lassen sich nur mit voller Kontrolle über die Datenhaltung sauber
umsetzen.

**Preis dafür:** Mehr Eigenaufwand bei Authentifizierung und Infrastruktur.

<a id="e-03"></a>

## E-03 · React Native mit Expo statt zwei nativer Apps

**Ursprünglich (2026-09-08):** Getrennte native Apps in Swift und Kotlin, ausdrücklich so
gewünscht.

**Geändert am 2026-09-17,** nachdem feststand, dass das Projekt von einer einzelnen Person
umgesetzt wird.

**Warum die Änderung:** Zwei native Codebasen plus Admin-Web plus Backend bedeuten vier
Technologie-Stacks für eine Person. Mit Expo ist das gesamte Projekt in TypeScript —
eine Sprache, ein Paketmanager, ein Testframework, und die aus OpenAPI generierten Typen
lassen sich zwischen Web und App teilen.

**Preis dafür:** Etwas weniger Plattform-Integration. Für eine Terminbuchung nicht
relevant.

<a id="e-04"></a>

## E-04 · Monorepo statt vier getrennter Repositories

**Ursprünglich:** Vier Repos auf GitHub angelegt (`terminplaner-backend`, `-web-admin`,
`-mobile`, `-api-contract`).

**Geändert am 2026-09-20,** bevor der erste Commit entstand.

**Warum:** Der Kern des Projekts ist die geteilte Schnittstelle. Im Monorepo ist der
Import der generierten Typen ein Pfad — ändert sich ein Typ, zeigen beide Frontends sofort
den Fehler. Bei vier Repos bräuchte es ein veröffentlichtes, versioniertes Paket und drei
zusätzliche Schritte bei jeder Schnittstellenänderung. Dazu: eine CI statt vier, und
zusammengehörige Änderungen liegen in einem Commit.

**Hinweis:** Die vier alten GitHub-Repos existieren noch und werden nicht mehr gebraucht.

<a id="e-05"></a>

## E-05 · Admin-Web vor der Mobile-App bauen

**Entscheidung:** Die Reihenfolge in `UMSETZUNG.md` baut zuerst das Admin-Web vollständig,
dann erst die App.

**Warum:** Zwei Gründe. Die App ist ohne konfigurierte Leistungen und Arbeitszeiten
ohnehin nutzlos. Und wichtiger: Nach Schritt 26 ist das Admin-Web **eigenständig
einsetzbar** — das Studio kann telefonisch vereinbarte Termine digital verwalten, lange
bevor die App existiert. Bei einem Projekt, das neben anderem läuft, ist ein früher Punkt
mit echtem Nutzen mehr wert als ein technisch eleganter Aufbau.

---

# Datenmodell

<a id="e-06"></a>

## E-06 · Zeitstempel durchgängig `timestamptz` in UTC

**Entscheidung:** Alle Zeitstempel in UTC. Die Studio-Zeitzone steht als Konfigurationswert
in `STUDIO_TIMEZONE` und wird nur zur Anzeige und Berechnung benutzt.

**Warum:** Sommerzeit. Am Umstellungswochenende im Oktober gibt es eine Stunde doppelt.
Wer lokale Zeit speichert, hat an diesem Tag zwei Termine um 02:30 und keine Möglichkeit
mehr, sie auseinanderzuhalten.

**Konsequenz:** Tests für die Umstellungstage sind Pflicht, nicht optional.

<a id="e-07"></a>

## E-07 · Überschneidungsschutz in der Datenbank, nicht in der Anwendung

**Entscheidung:** Ein `EXCLUDE USING gist`-Constraint auf `appointments` verhindert, dass
sich zwei aktive Termine derselben Person zeitlich überlappen.

```sql
EXCLUDE USING gist (
  staff_id WITH =,
  tstzrange(starts_at, ends_at) WITH &&
) WHERE (status IN ('PENDING','CONFIRMED'))
```

**Warum:** Eine Prüfung in der Anwendung („gibt es schon einen Termin?" → „nein" →
„einfügen") hat immer ein Zeitfenster dazwischen. Tippen zwei Personen gleichzeitig auf
denselben Slot, kommen beide durch. Nur die Datenbank kann das atomar entscheiden.

**Konsequenz:** Der Constraint wird in Schritt 5 gesetzt, **bevor** irgendeine
Buchungslogik entsteht — dann kann sie gar nicht erst falsch gebaut werden. Der
Nebenläufigkeitstest aus Schritt 6 sichert das dauerhaft ab.

<a id="e-08"></a>

## E-08 · Geldbeträge als Cent-Integer

**Entscheidung:** Preise als ganze Zahl in Cent. 45,90 € steht als `4590` in der Datenbank.
Die Einheit steckt im Spaltennamen: `price_cents`.

**Warum:** Kommazahlen sind binär nicht exakt. 19 × 45,90 € ergibt in JavaScript
872,0999999999997 statt 872,10 — und dieser Fehler wächst mit jeder Rechnung.

**Warum nicht `NUMERIC`?** PostgreSQL hätte einen exakten Dezimaltyp, aber JavaScript hat
keinen. Der Wert käme als String zurück und müsste überall umgewandelt werden.
Cent-Integer sind über den ganzen Stack konsistent.

<a id="e-09"></a>

## E-09 · Preis beim Buchen einfrieren

**Entscheidung:** `appointments.price_cents_snapshot` speichert den Preis zum Zeitpunkt der
Buchung. Kein Fremdschlüssel auf den aktuellen Preis.

**Warum:** Erhöht das Studio im April die Preise, muss ein im März gebuchter Termin seine
45,90 € behalten — so steht es in der Bestätigungsmail der Kundin. Ohne Snapshot würden
sich auch alle vergangenen Termine rückwirkend ändern und die Umsatzstatistik vom Februar
gleich mit.

**Gilt sinngemäß für alles, was auf einem Beleg steht.** Wenn später weitere Felder auf
der Bestätigung landen, gehören sie ebenfalls eingefroren.

<a id="e-10"></a>

## E-10 · `staff_services` als reine Verknüpfung

**Ursprünglich:** Die Tabelle hatte eigene Spalten für abweichende Dauer und abweichenden
Preis je Kosmetiker:in.

**Geändert am 2026-09-20:** Beide Spalten entfernt. Dauer und Preis gelten studioweit
einheitlich und stehen ausschließlich in `services`.

**Warum:** Das Studio berechnet für dieselbe Leistung überall denselben Preis und plant
dieselbe Dauer. Zwei mögliche Quellen für denselben Wert hätten überall einen Fallback
erzwungen und die Frage aufgeworfen, welcher gilt.

**Was die Tabelle weiterhin leistet — und das ist ihr eigentlicher Zweck:** Sie beantwortet
_wer kann was_. Ohne sie müsste das System annehmen, dass jede Kosmetikerin jede Leistung
anbietet. Sie steuert die Auswahl in der App und grenzt in der Slot-Berechnung ein, wer
überhaupt infrage kommt.

**Nachrüstbar,** falls doch einmal gebraucht.

<a id="e-11"></a>

## E-11 · `working_hours` wiederkehrend, `time_off` einmalig

**Entscheidung:** Die Trennlinie ist nicht „Arbeit gegen Pause", sondern **wiederkehrend
gegen einmalig**.

| Fall                       | Gehört in                                     |
| -------------------------- | --------------------------------------------- |
| Mittagspause täglich 12–13 | `working_hours` — zwei Zeilen: 9–12 und 13–17 |
| Mittwochs frei             | `working_hours` — für Mittwoch keine Zeile    |
| Arzttermin am 12. Mai      | `time_off`                                    |
| Urlaub 15.–26. Juli        | `time_off`                                    |
| Feiertag                   | `time_off` mit `staff_id = NULL`              |

**Warum:** Verfügbarkeit wird nie gespeichert, sondern berechnet: Regel minus Ausnahmen
minus gebuchte Termine. Freie Slots zu speichern wären bei fünf Personen, 15-Minuten-Raster
und einem Jahr Vorlauf rund 700.000 Zeilen, die bei jeder Arbeitszeitänderung neu entstehen
müssten.

**`staff_id = NULL` bedeutet studioweit.** Ein Feiertag ist damit genau eine Zeile, für
immer — auch für Personen, die noch gar nicht eingestellt sind.

---

# Datenschutz

<a id="e-12"></a>

## E-12 · `time_off` ohne Freitextfeld

**Ursprünglich:** `reason : text`.

**Geändert am 2026-09-20** zu `type : TimeOffType` mit festen Werten (`VACATION`, `SICK`,
`TRAINING`, `PUBLIC_HOLIDAY`, `CLOSURE`, `OTHER`).

**Warum:** In ein Freitextfeld über Abwesenheiten schreibt irgendwann jemand „Reha nach
Bandscheiben-OP". Das sind Gesundheitsdaten nach Art. 9 — diesmal nicht über Kundschaft,
sondern über Beschäftigte. Dort ist die Lage eher strenger, weil eine Einwilligung
gegenüber der Arbeitgeberin selten wirklich freiwillig ist.

**Warum Weglassen statt Verschlüsseln:** Anders als bei der Kundennotiz braucht niemand
die Diagnose. Für Kalender und Planung genügt die Kategorie. Das Feld verschwindet als
Einfallstor, ohne dass etwas fehlt — und Urlaubstage lassen sich nebenbei zählen.

<a id="e-13"></a>

## E-13 · Behandlungsnotizen als eigene verschlüsselte Tabelle

**Entscheidung:** `treatment_notes` ist keine Spalte in `appointments`, sondern eine eigene
Tabelle mit AES-256-GCM-Feldverschlüsselung. Der Schlüssel liegt im KMS, nicht in der
Datenbank.

**Warum:** Gesundheitsdaten nach Art. 9 brauchen eigene Zugriffsregeln, eigene
Aufbewahrungsfrist und eigene Löschung — unabhängig vom Termin, der aus
Buchhaltungsgründen bleiben muss. Als Spalte wäre all das nicht trennbar.

**Konsequenz:** Zugriff nur mit ausdrücklicher Einwilligung und tatsächlichem
Behandlungsbezug. Jeder Lesezugriff wird protokolliert. Eine Datenschutz-Folgenabschätzung
nach Art. 35 ist verpflichtend.

<a id="e-14"></a>

## E-14 · Kundennotiz wie Art.-9-Daten behandeln

**Entscheidung:** `appointments.customer_note` heißt `customer_note_encrypted` und wird
genauso behandelt wie `treatment_notes`.

**Warum:** Das Feld sieht harmlos aus. Was Kundinnen dort hineinschreiben, ist es nicht:
„Bitte Rücksicht nehmen, ich habe Neurodermitis." „Allergie gegen Duftstoffe." „Bin
schwanger." In einem Kosmetikstudio ist das der erwartbare Normalfall, nicht die Ausnahme.
Ein unverschlüsseltes Freitextfeld hätte die ganze Sorgfalt bei `treatment_notes`
unterlaufen.

**Konsequenz:** Das Feld erscheint im Buchungsablauf nur bei erteilter
`HEALTH_DATA`-Einwilligung.

<a id="e-15"></a>

## E-15 · Kein Soft-Delete, nur Anonymisierung

**Entscheidung:** Es gibt kein `deleted_at`. Stattdessen `status = ANONYMIZED` und
`anonymized_at`.

**Warum:** Ein Soft-Delete — Zeile markieren, Daten stehen lassen — wäre keine Erfüllung
von Art. 17. Ein Feld namens `deleted_at` lädt aber genau dazu ein. Das Schema ist bewusst
so gebaut, dass der bequeme Weg auch der richtige ist.

**Warum nicht wirklich löschen:** Die Aufbewahrungspflicht für abgerechnete Leistungen
läuft sieben Jahre. Die Termine müssen bleiben. Also wird der Personenbezug entfernt und
die Zeile bleibt als Anker bestehen: E-Mail auf `deleted-<uuid>@invalid`, Name und Telefon
gelöscht, Notizschlüssel vernichtet.

**Einwilligungen bleiben.** Der Nachweis, dass jemand eingewilligt _hatte_, muss die
Löschung überleben.

<a id="e-16"></a>

## E-16 · Audit-Log ohne Inhalte

**Entscheidung:** `audit_log.metadata` enthält nur Verweise — IDs, Feldnamen, Statuswerte —
und niemals alte oder neue Werte. Zusätzlich markiert `is_art9_access` Lesezugriffe auf
Gesundheitsdaten.

**Warum:** `metadata` ist ein `jsonb`-Freiformfeld. Wer beim Debuggen den alten und neuen
Wert einer Behandlungsnotiz mitprotokolliert, legt Art.-9-Klartext unverschlüsselt direkt
neben die verschlüsselte Tabelle. Das ist keine hypothetische Gefahr, sondern das, was man
beim Fehlersuchen instinktiv tut.

**`is_art9_access`** erlaubt zwei Aufbewahrungsfristen: normale Einträge kürzer,
Art.-9-Zugriffe länger, weil die Rechenschaftspflicht das verlangt.

<a id="e-17"></a>

## E-17 · Push nicht über den Expo-Dienst

**Entscheidung:** `expo-notifications` wird verwendet, aber **nicht** der Expo Push Service.
Stattdessen native Device-Tokens beziehen und direkt vom eigenen Backend an FCM und APNs
senden.

**Warum:** Der Expo-Push-Dienst läuft über Expo-Server in den USA. Das wäre ein
zusätzlicher Auftragsverarbeiter im Drittland — zu Google und Apple, die wir ohnehin
brauchen, käme ein dritter dazu, ohne Gegenwert.

**Das war ein Nebeneffekt der Expo-Entscheidung (E-03),** der beim Wechsel nicht sofort
sichtbar war.

<a id="e-18"></a>

## E-18 · Push-Nachrichten ohne Klardaten

**Entscheidung:** Push-Nutzdaten enthalten nur eine `appointment_id` und einen allgemeinen
Text. Details lädt die App nach dem Öffnen aus dem Backend.

**Warum:** Push läuft zwingend über Google und Apple. Was in der Nachricht steht, sehen
beide — und es steht auf dem Sperrbildschirm. Bei einem Kosmetikstudio soll dort nicht
stehen, wer wann zu welcher Behandlung kommt.

---

# Betrieb

<a id="e-19"></a>

## E-19 · Backups täglich, 30 Tage flach

**Entscheidung:** Tägliche Sicherung, jede 30 Tage aufbewahrt — also immer 30 parallele
Stände. **Keine** gestaffelte Langzeitaufbewahrung, keine Wochen- oder Monatsarchive.

**Warum keine Staffelung:** Sie ist für die Ausfallsicherheit gut und für Art. 17 ein
Problem. Ein Monatsbackup mit einem Jahr Aufbewahrung hält eine im Januar gelöschte Person
bis Dezember am Leben. Ein Studio dieser Größe braucht keinen Stand von vor acht Monaten.

**Die Aussage, die daraus folgt** und später ins Löschkonzept gehört: Eine gelöschte Person
verschwindet spätestens 30 Tage nach der Anonymisierung auch aus der letzten Sicherung.

**Voraussetzung, noch offen:** Der Zugriff auf Backups muss auf den Notfall-Restore
beschränkt sein — nicht für Auswertungen, Support oder Tests. Die ganze Argumentation
steht und fällt damit, dass ein Backup eben keine zweite Datenbank ist.

<a id="e-20"></a>

## E-20 · Buchungsregeln als Konfiguration, nicht als Code

**Entscheidung:** Storno-Frist, Vorlaufzeit, Buchungshorizont, Slot-Raster und
automatische Bestätigung stehen in der `.env`, mit plausiblen Standardwerten und dem
Kommentar, dass sie noch zu klären sind.

**Warum:** Diese drei Fragen an das Studio waren offen und hätten die Slot-Berechnung
blockiert — den aufwendigsten Schritt des Projekts. Als Konfiguration blockieren sie
nichts mehr: Kommt die Antwort später, ist es eine Zeile in der `.env` statt einer
Codeänderung.

<a id="e-21"></a>

## E-21 · Gesundheitsdaten bleiben in Version 1

**Entscheidung:** Die Behandlungsnotizen bleiben im Umfang der ersten Version, obwohl sie
für eine Einzelperson erheblichen Zusatzaufwand bedeuten.

**Bewusst getroffen** in Kenntnis dessen, was daran hängt: Verschlüsselung,
Schlüsselverwaltung, Zugriffsprotokollierung, Einwilligungsdialog und eine
Folgenabschätzung nach Art. 35 — ohne Team, das gegenliest.

**Abgefedert durch die Reihenfolge:** Die Gesundheitsdaten kommen erst in Stufe 9, nach dem
funktionierenden Buchungskern. Geht vorher die Luft aus, steht trotzdem ein nutzbares
System.

---

# Werkzeuge und Umgebung

<a id="e-22"></a>

## E-22 · Nest-CLI entfernt, Build mit reinem tsc

**Entscheidung:** Kein `@nestjs/cli`. Gebaut wird mit `tsc -p tsconfig.build.json`,
entwickelt mit `concurrently` aus `tsc --watch` und Nodes eingebautem `node --watch`.

**Warum:** Der Nest-CLI ist unter Node 22 defekt — er stirbt mit
`ERR_REQUIRE_CYCLE_MODULE` an einer gebündelten Altlast (`ora` in
`@angular-devkit/schematics`), sowohl bei `nest new` als auch bei `nest build`. Das
Skelett ist deshalb von Hand entstanden.

**Nebeneffekt, der die Entscheidung bestätigt hat:** Der CLI und seine Schematics zogen
**zwei zusätzliche TypeScript-Versionen** in den Abhängigkeitsbaum (6.0.3 und 7.0.2 neben
5.9.3). Das führte zu Fehlern, die es im Projekt gar nicht gab — etwa `baseUrl has been
removed`, eine Meldung aus TypeScript 7. Ohne CLI ist überall nur noch 5.9.3 installiert.

**Preis dafür:** Kein `nest generate` für Gerüstcode. Bei der Projektgröße verschmerzbar.

<a id="e-23"></a>

## E-23 · Prisma auf 7.10.0 gepinnt statt Release-Candidate

**Entscheidung:** `prisma` und `@prisma/client` beide exakt auf `7.10.0`, ohne
`^`-Bereich.

**Warum:** `npm` liefert unter `latest` derzeit `prisma@8.0.0-rc.15` aus — einen
Release-Candidate — während `@prisma/client@latest` bei stabilen 7.10.0 steht. Ein RC
gehört nicht in ein System, das Gesundheitsdaten verarbeitet, und die beiden Pakete müssen
zusammenpassen.

**Bekannte Schwachstellen, bewusst akzeptiert:** `npm audit` meldet vier Einträge mit
hoher Einstufung. Alle hängen am `prisma`-CLI, einer reinen Entwicklungsabhängigkeit, die
in Produktion nie läuft. Eine davon betrifft `mysql2` — einen Treiber für eine Datenbank,
die wir gar nicht verwenden. `@prisma/client`, die einzige Prisma-Abhängigkeit zur
Laufzeit, ist **nicht** betroffen. Der einzige von npm angebotene Fix wäre ein Downgrade
auf Prisma 6, was die Paarung mit dem Client zerreißen würde.

**Wiedervorlage:** Sobald Prisma 8 stabil ist, beide Pakete gemeinsam anheben.

<a id="e-24"></a>

## E-24 · PostgreSQL auf Port 5433 statt 5432

**Entscheidung:** Der Container veröffentlicht auf `5433`. Die `DATABASE_URL` verwendet
`127.0.0.1`, nicht `localhost`.

**Warum der andere Port:** Auf dem Entwicklungsrechner läuft bereits eine native
PostgreSQL-17-Installation als Windows-Dienst (`postgresql-x64-17`) auf 5432. Verbindungen
landeten stumm dort statt im Container — mit irreführenden Fehlern: einmal „Rolle
terminplaner existiert nicht", einmal ein Authentifizierungsfehler. Beides sah nach einem
Problem mit unseren Zugangsdaten aus, war aber die falsche Datenbank.

**Warum `127.0.0.1` statt `localhost`:** Unter Windows löst `localhost` zuerst auf IPv6
(`::1`) auf, Docker veröffentlicht Ports aber auf IPv4. Das erzeugt dieselbe Klasse von
Fehlern — die Verbindung geht irgendwohin, nur nicht in den Container.

**Die bestehende Installation wurde bewusst nicht angefasst.** Sie könnte für anderes
gebraucht werden; ein zusätzlicher Port kostet nichts.

**Diagnosehilfe für später:** Meldet die Datenbank plötzlich Authentifizierungsfehler,
zuerst prüfen, ob überhaupt der richtige Server antwortet — von innen mit
`docker compose exec postgres psql "postgresql://...@127.0.0.1:5432/..."`, von außen mit
einem direkten Verbindungsversuch auf den veröffentlichten Port.

---

<a id="e-25"></a>

## E-25 · Nachfrist bei der Token-Rotation

**Entscheidung:** Wird ein bereits rotierter Refresh-Token innerhalb von **15
Sekunden** erneut vorgelegt, gibt es ein neues Paar statt einer Entwertung. Danach gilt
Diebstahlverdacht und die ganze Familie fliegt raus.

**Warum:** Ohne die Frist löst jede harmlose Doppelanfrage die Diebstahlerkennung aus —
zwei offene Tabs, ein Wiederholungsversuch nach Netzwerkabbruch, oder React im
Entwicklungsmodus, das Effekte doppelt ausführt. Genau das ist beim Bau des Admin-Webs
passiert: Die Sitzung überlebte kein Neuladen, obwohl niemand etwas gestohlen hatte.

**Der Haken, der beim ersten Versuch übersehen wurde:** Bei einer Familienentwertung sind
_alle_ Token frisch widerrufen. Sie fielen damit ebenfalls in die Nachfrist und bekamen
ein neues Paar — die Entwertung war wirkungslos. Der eigene Test hat das aufgedeckt.

**Die Lösung:** Eine Spalte `revoked_reason` (`ROTATED`, `LOGOUT`, `COMPROMISED`). Die
Nachfrist greift **nur** nach normaler Rotation. Bei einer Entwertung werden auch bereits
rotierte Token auf `COMPROMISED` umgeschrieben, damit keiner von ihnen die Sitzung über
die Nachfrist wiederbeleben kann.

**Preis dafür:** Ein gestohlener Token wirkt bis zu 15 Sekunden nach der legitimen
Rotation. Vertretbar gegenüber Sitzungen, die grundlos abbrechen.

**Zusätzlich im Client:** Parallele Erneuerungen werden zusammengelegt, damit unnötige
Rotationen gar nicht erst entstehen.

<a id="e-26"></a>

## E-26 · Admin-Web spricht `localhost`, nicht `127.0.0.1`

**Entscheidung:** Das Admin-Web ruft die API unter `http://localhost:3000` auf, obwohl die
Datenbankverbindung aus gutem Grund `127.0.0.1` verwendet (E-24).

**Warum:** Browser behandeln `localhost` und `127.0.0.1` als **verschiedene Sites**. Das
Refresh-Cookie ist `SameSite=Lax` und wurde bei einem Wechsel von `localhost:5173` nach
`127.0.0.1:3000` nicht mitgeschickt — die Sitzung überlebte kein Neuladen. Unterschiedliche
**Ports** sind dagegen unproblematisch, `localhost:5173` und `localhost:3000` gelten als
dieselbe Site.

**Merkhilfe für später:** Für die _Datenbank_ ist `127.0.0.1` richtig, weil Windows
`localhost` zuerst auf IPv6 auflöst und Docker auf IPv4 veröffentlicht. Für den _Browser_
ist `localhost` richtig, wegen SameSite. Beide Regeln gelten gleichzeitig und
widersprechen sich nur scheinbar.

---

<a id="e-27"></a>

## E-27 · Endpunkte sind standardmäßig geschützt

**Entscheidung:** Der `JwtAuthGuard` ist **global** registriert. Jeder Endpunkt verlangt
eine Anmeldung, sofern er nicht ausdrücklich mit `@Oeffentlich()` markiert ist.

**Warum diese Richtung:** Bei der umgekehrten Voreinstellung — alles offen, Schutz wird
angefordert — ist ein vergessener Guard ein Datenleck, und man sieht es dem Code nicht an.
Fehlt umgekehrt die Markierung, bekommt man einen 401 und merkt es sofort. Der
unaufmerksame Fall soll der sichere sein.

**Öffentlich sind nur fünf Endpunkte,** jeder mit Begründung im Code: Registrierung,
E-Mail-Verifizierung, Login, Refresh und Logout. Logout ist bewusst dabei — wäre er
geschützt, käme niemand mehr heraus, dessen Access-Token abgelaufen ist, und der
Refresh-Token bliebe bis zu 30 Tage gültig.

**Der Guard schaut bei jeder Anfrage in die Datenbank.** Ein gültiges JWT allein genügt
nicht: Zwischen Ausgabe und Verwendung liegen bis zu 15 Minuten, und in der Zeit kann ein
Konto gesperrt oder anonymisiert worden sein. Das kostet eine Abfrage je Anfrage — bei
einer Praxis mit einer Handvoll gleichzeitiger Nutzender ist das kein Thema, und die
Alternative wäre, dass eine Sperrung eine Viertelstunde lang wirkungslos bleibt.

**Zwei Ebenen, die nicht verwechselt werden dürfen:** Der Guard beantwortet „darf diese
Rolle hierher". Der `ZugriffService` beantwortet „darf diese Person auf _dieses_ Objekt
zugreifen". Nur die zweite verhindert, dass eine Kosmetikerin die Termine und Hautbefunde
einer Kollegin liest — beides mit derselben Rolle `STAFF`.

**Bei fremden Objekten melden wir „nicht gefunden", nicht „verboten".** Ein 403 auf eine
fremde Termin-ID bestätigt, dass sie existiert; über durchprobierte IDs ließe sich
ermitteln, wie ausgelastet die Praxis ist. Bei der Behandlungshistorie ist 403 dagegen
richtig, weil die Kundin dort ohnehin bekannt ist.

---

<a id="e-28"></a>

## E-28 · Anfragebegrenzung zählt nach IP **und** Konto

**Entscheidung:** Der Zähler läuft auf der Kombination aus IP-Adresse und der angegebenen
E-Mail-Adresse, nicht auf einer von beiden allein. Die Zähler liegen in Redis.

**Warum nicht nur nach IP:** Hinter einem gemeinsamen Anschluss — Praxis-WLAN,
Mobilfunk-NAT — teilen sich viele Leute eine Adresse. Fünf Fehlversuche einer Person
sperrten alle anderen mit aus.

**Warum nicht nur nach Konto:** Wer eine fremde Adresse kennt, könnte sie durch
absichtliche Fehlversuche dauerhaft aussperren. Die Begrenzung würde zur Waffe gegen die
rechtmäßige Inhaberin. Ein Test hält fest, dass eine gesperrte Adresse eine andere vom
selben Anschluss nicht behindert.

**Zwei Grenzen, verschiedene Gefahren:** `streng` schützt die Anmeldung gegen
Durchprobieren (fünf je 15 Minuten). `mail` schützt Registrierung und Passwort-Reset
dagegen, dass jemand ein fremdes Postfach flutet (drei je Stunde) — dort ist nicht das
Raten das Problem.

**Der Schlüssel ist gehasht.** Redis-Schlüssel tauchen in Protokollen und Werkzeugen auf;
dort gehört keine Patientenadresse hin. Ein Test prüft, dass im Zählerspeicher kein `@`
vorkommt.

**Fällt Redis aus, wird durchgelassen, nicht abgewiesen.** Sonst stünde die gesamte
Anmeldung still und das Studio käme nicht an seinen Kalender. Ein Ausfall der Begrenzung
ist das kleinere Übel als ein Ausfall des Systems — aber er wird laut protokolliert.

**Der Zählerspeicher ist selbst geschrieben.** Die fertigen Redis-Pakete unterstützen
NestJS nur bis Version 11, wir sind auf 12. Die Schnittstelle besteht aus einer Methode,
und so lässt sich das Verhalten bei Redis-Ausfall selbst bestimmen.

**Hinter einem Reverse-Proxy ist `TRUST_PROXY_HOPS` zu setzen.** Sonst steht in `req.ip`
die Adresse des Proxys, die Begrenzung zählt alle Nutzenden als eine Person, und fünf
Fehlversuche sperren das ganze Studio aus. In der Entwicklung steht der Wert auf 0.

---

<a id="e-29"></a>

## E-29 · Tailwind jetzt, shadcn/ui später

**Entscheidung:** Tailwind 4 ist eingezogen, shadcn/ui bewusst noch nicht. Der Plan nennt
beides zusammen für Schritt 14.

**Warum Tailwind sofort:** Die Grundlage für das Aussehen lässt sich später nur teuer
wechseln. Die Design-Tokens aus `docs/DESIGN.md` stehen jetzt als Theme in `stil.css` —
Tailwind 4 nimmt sie direkt aus CSS, eine `tailwind.config.js` gibt es nicht mehr.

**Warum shadcn/ui noch nicht:** Sein Wert liegt in zugänglichen Bausteinen, die von Hand
richtig zu bauen mühsam ist — Dialoge mit Fokusfalle, Auswahlfelder mit Tastaturbedienung,
Datumsfelder. Davon braucht Stufe 3 keinen einzigen; hier entstehen Layout, Navigation und
Routing. Eine Einrichtung für Bausteine, die noch niemand verwendet, wäre Aufwand ohne
Gegenwert.

**Wann dann:** Sobald der erste Dialog gebraucht wird, voraussichtlich beim Umbuchen per
Drag & Drop (Schritt 26). Dort lohnt es sich sofort.

**Woran man merkt, dass die Entscheidung falsch war:** Wenn in `stil.css` eigene Dialoge
oder Auswahlfelder auftauchen. Dann wurde nachgebaut, was es fertig gibt.

---

## E-30

### Personal wird eingeladen, nicht mit Passwort angelegt

**Datum:** 2026-10-07 · **Status:** gültig

**Entscheidung:** Legt die Studioleitung eine Kosmetiker:in an, vergibt sie **kein**
Passwort. Das Konto bekommt einen zufälligen, niemandem bekannten Hash und eine Einladung
per Mail; das Passwort setzt die eingeladene Person selbst über einen Einmal-Token
(`AuthTokenPurpose.INVITATION`, sieben Tage gültig). Ein Endpunkt zum Setzen fremder
Passwörter existiert nicht.

**Warum:** Der naheliegende Weg — ein Feld "Passwort" im Anlegen-Formular — hat drei
Fehler auf einmal. Erstens kennt die Studioleitung danach das Passwort ihrer Mitarbeiterin
und muss es ihr übermitteln, also per WhatsApp, Zettel oder Zuruf. Zweitens ist nicht mehr
unterscheidbar, wer gehandelt hat: Steht in der Behandlungsdokumentation ein Eintrag von
Anna, könnte ihn auch die Chefin geschrieben haben. In einer Arztpraxis ist genau das der
Punkt, an dem eine Dokumentation ihre Beweiskraft verliert. Drittens bleibt ein so
vergebenes Passwort erfahrungsgemäß stehen.

Sieben Tage Gültigkeit statt der 60 Minuten eines Passwort-Resets: Wer neu anfängt, schaut
nicht am selben Tag ins Postfach. Der Token hat 256 Bit Entropie, die Frist ist nicht der
schwächste Punkt. Eine neue Einladung entwertet die alte, und die Verwaltung zeigt an, ob
jemand seinen Zugang schon eingerichtet hat — sonst bleibt die Frage "warum kommt Anna
nicht rein?" unbeantwortbar.

**Konsequenz:** Ein Konto ist zwischen Anlegen und Einlösen in einem Zwischenzustand:
vorhanden, aber nicht benutzbar. Solche Personen erscheinen deshalb **nicht** in der
öffentlichen Liste — buchbar ist nur, wer seinen eigenen Kalender auch öffnen kann. Geht
die Mail verloren, hängt der Zugang an "Einladung erneut"; einen Weg daran vorbei gibt es
bewusst nicht.

**Woran man merkt, dass die Entscheidung falsch war:** Wenn in der Praxis reihenweise
Einladungen ablaufen und die Studioleitung ständig nachschicken muss. Dann ist nicht die
Entscheidung falsch, sondern die Frist zu kurz — oder die Mail landet im Spam, was zuerst
zu prüfen wäre.

---

## E-31

### Eine Leistung ohne Anbieterin erscheint oeffentlich nicht

**Datum:** 2026-10-08 · **Status:** gültig

**Entscheidung:** `GET /services` liefert eine Leistung nur, wenn mindestens eine
Kosmetiker:in sie anbietet, die auch arbeiten kann — Profil aktiv, Konto nicht gesperrt,
Einladung eingelöst. Aktiv zu sein genügt nicht mehr. Die Verwaltungsliste zeigt dafür ein
eigenes Feld `buchbar` und nennt den Fall beim Namen.

**Warum:** Eine Leistung ohne Anbieterin ist in der App eine Sackgasse: auswählbar, aber
dahinter steht niemand. Die Kundin wählt, tippt auf Weiter und bekommt eine leere Liste —
und hält das für einen Fehler der App, nicht für eine Lücke in der Pflege. Besser gar nicht
erst anbieten.

Die Bedingung ist bewusst dieselbe wie in der öffentlichen Teamliste und nicht bloß "es
gibt eine Zeile in `staff_services`". Eine Zuordnung auf eine deaktivierte Person ist keine
Anbieterin; sonst erschiene die Leistung, wäre aber trotzdem nicht buchbar.

**Konsequenz:** Die Studioleitung kann eine Leistung anlegen und sie taucht nirgends auf —
das ist verwirrend, wenn man den Grund nicht sieht. Deshalb steht er in der Liste: "niemand
bietet sie an". Ohne diesen Hinweis wäre die Regel eine Falle. Zwei Tests aus Schritt 17
mussten nachziehen; sie prüften Sichtbarkeitsregeln der Leistung und legten dabei keine
Zuordnung an.

**Entzogen wird mit Bestätigung, nicht verboten:** Hängen künftige Termine an einer
Zuordnung, lehnt der Server zunächst ab und nennt die Anzahl. Erst `?bestaetigt=true` führt
ihn aus. Durchwinken wäre falsch — der Grund fürs Entziehen betrifft oft auch die
bestehenden Termine, etwa eine abgelaufene Zertifizierung. Zwangsweise stornieren wäre noch
falscher: Ob und wie ein vereinbarter Termin abgesagt wird, entscheidet das Studio, nicht
diese Funktion.

**Woran man merkt, dass die Entscheidung falsch war:** Wenn im Betrieb regelmäßig gefragt
wird, warum eine Leistung in der App fehlt, obwohl sie aktiv ist. Dann ist nicht die Regel
falsch, sondern der Hinweis zu leise.

---

## E-32

### Keine eigene Entität für Studio-Öffnungszeiten

**Datum:** 2026-10-08 · **Status:** gültig

**Entscheidung:** `working_hours` je Kosmetiker:in ist die **einzige** Quelle dafür, wann
gebucht werden kann. Eine zweite Entität für Öffnungszeiten des Studios gibt es nicht.
Studioweite Schließungen — Feiertag, Betriebsurlaub — laufen über `time_off` mit
`staff_id = NULL`.

**Warum:** `PLAN.md` 5.1 sah ursprünglich vor, Öffnungszeiten **und** Arbeitszeiten
abzuziehen. Beim Bau von Schritt 20 fiel auf, dass es die erste Entität nie gab — und dass
das gut so ist. Zwei Quellen für dieselbe Frage müssen widerspruchsfrei gehalten werden,
und sie werden es nie: Wer eine Kosmetikerin von 7 bis 19 einträgt, während das Studio von
8 bis 18 geöffnet hat, bekommt stillschweigend beschnittene Zeiten und sucht den Fehler
dann an der falschen Stelle. Mit einer Quelle ist die eingetragene Zeit die Wahrheit.

Öffnungszeiten, wie sie auf der Website stehen, sind davon unberührt. Das ist eine Angabe
für Menschen, keine Regel für den Kalender — und gehört deshalb nicht in dieses System.

**Konsequenz:** "Alle arbeiten Mo–Fr 9–17" muss für jede Person eingetragen werden. Das
wäre lästig, deshalb gibt es "Zeiten übernehmen von" — eine Bequemlichkeit in der
Oberfläche statt einer zweiten Wahrheit in der Datenbank. Ein Feiertag dagegen wird
weiterhin **einmal** eingetragen und gilt für alle; die Abfrage für eine einzelne Person
liefert studioweite Einträge deshalb immer mit. Wer das versäumt, bietet Slots am 1. Mai
an.

**Woran man merkt, dass die Entscheidung falsch war:** Wenn das Studio anfängt, eine
Pseudo-Person "Studio" anzulegen, nur um dort Öffnungszeiten zu hinterlegen. Dann fehlt
der Begriff wirklich.

---

## E-33

### Die vier strittigen Festlegungen der Slot-Berechnung

**Datum:** 2026-10-08 · **Status:** gültig

Der vollständige Katalog steht in [SLOT-TESTFAELLE.md](SLOT-TESTFAELLE.md). Hier nur die
vier Punkte, bei denen die Gegenvariante vertretbar gewesen wäre — damit später
nachvollziehbar ist, dass sie bedacht wurde.

**1. Der Puffer muss nicht mehr ins Arbeitsfenster passen.** Ein Termin 16:00–17:00 bei
Arbeitsende 17:00 ist erlaubt, obwohl der Puffer bis 17:15 reichte. Die Gegenvariante
sträche den letzten Slot jedes Tages und köstete über ein Jahr gerechnet rund 250 buchbare
Stunden. Aufräumen nach Feierabend ist zumutbar, eine strukturell blockierte letzte Stunde
nicht.

**2. Blockiert wird nach Negativliste.** Alles ausser `CANCELLED_BY_CUSTOMER` und
`CANCELLED_BY_STAFF` blockiert — auch `COMPLETED` und `NO_SHOW`, die fachlich immer in der
Vergangenheit liegen. Das ist strenger als der `EXCLUDE`-Constraint (E-07), der nur
`PENDING` und `CONFIRMED` kennt, und das ist die harmlose Richtung. Die gefährliche wäre
die andere: Bietet die Slot-Berechnung mehr an als der Constraint zulässt, endet jede
Buchung darauf in `409`, der Client lädt neu, sieht denselben Slot wieder und läuft in eine
Schleife. Eine Positivliste wäre ausserdem die Falle, dass ein später ergänzter Status
stillschweigend aus der Blockade fällt.

**3. Das Raster hängt an der Ortszeit-Mitternacht, nicht am Fensteranfang.** Wäre es am
Fensteranfang ausgerichtet, führte eine Abwesenheit, die um 11:20 endet, zu den
Startzeiten 11:20, 11:35, 11:50 — für die Kundin unerklärlich und von Tag zu Tag
verschieden.

**4. Aneinandergrenzende Arbeitszeiten werden zusammengefasst.** Trägt das Studio 9–12 und
12–17 ein, ist das ein durchgehender Tag. Ohne Zusammenfassen entstünde an der Naht eine
künstliche Grenze, und eine einstündige Behandlung um 11:30 wäre nicht buchbar, obwohl
durchgearbeitet wird.

**Konsequenz, die man im Blick behalten muss:** Der Puffer existiert nirgends als
gespeicherter Wert und steht in keinem Constraint. Seine Einhaltung ist allein Sache der
Anwendung — die Datenbank fängt einen Fehler dort nicht ab.

**Woran man merkt, dass etwas falsch ist:** Wenn Buchungen auf angebotene Slots mit `409`
scheitern. Dann sind Slot-Berechnung und Constraint auseinandergelaufen, und Punkt 2 ist
der erste Ort zum Nachsehen.

---

## E-34

### Kein Zwischenspeichern der Slots in Redis

**Datum:** 2026-10-08 · **Status:** gültig · **Ändert:** PLAN.md 5.1

**Entscheidung:** Die Slot-Liste wird nicht gecacht. `PLAN.md` 5.1 sah vor, das Ergebnis
60 Sekunden in Redis zu halten und bei jeder Buchung zu verwerfen. Das entfällt.

**Warum:** Der Plan entstand, bevor es die Berechnung gab. Jetzt, wo sie steht, ist
sichtbar, was sie kostet: drei indizierte Abfragen auf kleine Tabellen — ein Studio hat
eine Handvoll Leistungen, eine Handvoll Kosmetiker:innen und ein paar hundert Termine im
Jahr. Dafür einen Cache zu bauen heißt, einen Fehlerzustand einzuführen, den es sonst
nicht gäbe.

Und dieser Fehlerzustand ist genau der, gegen den die ganze Buchungslogik absichert: Eine
veraltete Slot-Liste bietet eine Zeit an, die der `EXCLUDE`-Constraint ablehnt. Die Buchung
endet in `409`, die App lädt die Slots neu, bekommt dieselbe veraltete Liste und bietet
denselben Slot wieder an. Die Kundin sitzt in einer Schleife, und zwar bis zu 60 Sekunden
lang — im schlimmsten Fall genau dann, wenn viele gleichzeitig buchen, also wenn der Cache
seinen einzigen Zweck erfüllen soll.

**Konsequenz:** Wird es doch einmal eng, ist der Cache nachträglich einzubauen — aber
dann mit gemessener Begründung und mit dem Verwerfen an derselben Stelle wie das Einfügen,
in derselben Transaktion. Eine Invalidierung, die nach dem Commit läuft, hat dasselbe
Zeitfenster wie eine Prüfung in der Anwendung, und aus demselben Grund gibt es den
Constraint.

**Woran man merkt, dass die Entscheidung falsch war:** Wenn `GET /availability` unter
normaler Last messbar langsam wird. Nicht: wenn es sich langsam anfühlt.

---

## E-35

### Der Absagegrund ist eine Kategorie, kein Freitext

**Datum:** 2026-10-08 · **Status:** gültig · **Ändert:** `appointments.cancellation_reason`

**Entscheidung:** `cancellation_reason` ist keine freie Zeichenkette mehr, sondern ein Enum
mit vier Werten: `STAFF_UNAVAILABLE`, `CUSTOMER_REQUEST`, `OPERATIONAL`, `SONSTIGES`. Beim
Absagen durch das Studio ist er Pflicht, bei einer Absage durch die Kundin bleibt er leer.

**Warum:** Die Spalte stand seit dem ersten Schema als `String?` da und fiel erst beim Bau
von Schritt 23 auf. In ein Freitextfeld neben einem Termin schreibt das Personal
erfahrungsgemäß, warum es nicht geklappt hat — und in einer Hautarztpraxis heißt das
früher oder später "Patientin hat Ausschlag" oder "Reaktion auf die Creme". Damit entstünde
ein Gesundheitsdatum nach Art. 9 in einer Spalte, die weder verschlüsselt noch an eine
Einwilligung gebunden noch zugriffsprotokolliert ist. Genau dieselbe Überlegung hat in
E-12 den Freitext aus `time_off` entfernt; sie war hier nur übersehen worden.

Eine Kategorie beantwortet die Frage, für die das Feld da ist — wer hat abgesagt und
warum ungefähr — und lässt sich auswerten. Ein Freitext kann beides nicht.

**Konsequenz:** Wer mehr sagen will, kann es nicht. Das ist der Preis und er ist bewusst
bezahlt: Das Studio hat ein Telefon. Falls sich herausstellt, dass eine Notiz wirklich
gebraucht wird, gehört sie in `treatment_notes` — verschlüsselt, einwilligungsgebunden
und protokolliert —, nicht in dieses Feld.

Die Kategorie darf ins Zugriffsprotokoll, ein Freitext dürfte es nicht: Das Protokoll wird
länger aufbewahrt als die Daten, auf die es verweist.

**Woran man merkt, dass die Entscheidung falsch war:** Wenn `SONSTIGES` der mit Abstand
häufigste Wert wird. Dann fehlt eine Kategorie — und die Antwort ist, sie zu ergänzen,
nicht ein Textfeld daneben zu stellen.

---

## Noch nicht entschieden

Diese Punkte sind offen und stehen mit Begründung in
[CHECKLISTE.md](CHECKLISTE.md):

- **Ein Verschlüsselungsschlüssel oder einer pro Person** (Schritt 39). Ein globaler
  Schlüssel schließt Crypto-Shredding dauerhaft aus — man kann ihn nicht für eine einzelne
  Person vernichten.
- **Löschjournal für Restores:** bauen oder nicht, und in welcher Form.
- **Die drei Buchungsregeln** aus E-20 sind mit Standardwerten belegt, aber nicht bestätigt.
- **Storno-Gebühr** ja oder nein.
- Die vollständige Liste der offenen organisatorischen und rechtlichen Punkte steht in
  `CHECKLISTE.md`.
