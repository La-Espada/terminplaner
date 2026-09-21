# Umsetzungsreihenfolge – Terminplaner Kosmetikstudio

**Stand:** 2026-09-17
**Bezug:** Ergänzt `PLAN.md`. Dort steht, _was_ gebaut wird — hier steht, _in welcher
Reihenfolge_.
**Rahmen:** Einzelentwickler. Keine Zeitschätzungen, bewusst.

---

## Drei Regeln für diese Reihenfolge

**1. Vertikale Scheiben statt Schichten.**
Nicht erst das ganze Backend, dann das ganze Frontend. Stattdessen ein Feature komplett
durch alle Ebenen, dann das nächste. Sonst liegt monatelang Code herum, der nie gegen eine
echte Oberfläche lief — und genau dort verstecken sich die Fehler.

**2. Das Admin-Web kommt vor der App.**
Zwei Gründe. Erstens ist die App ohne konfigurierte Leistungen und Arbeitszeiten ohnehin
nutzlos. Zweitens ist das Admin-Web nach Schritt 24 bereits **eigenständig einsetzbar**:
Das Studio kann telefonisch vereinbarte Termine digital verwalten, noch bevor die App
existiert. Das ist der erste Punkt, an dem die Arbeit echten Nutzen stiftet.

**3. Nach jedem Schritt läuft das System.**
Kein Schritt hinterlässt einen kaputten Zustand. Als Einzelperson ohne Review-Partner ist
ein jederzeit lauffähiger Stand die einzige verlässliche Absicherung.

---

## Stack

| Teil      | Technologie                                                    |
| --------- | -------------------------------------------------------------- |
| Backend   | NestJS + PostgreSQL + Redis                                    |
| Admin-Web | React + TypeScript                                             |
| Mobile    | **React Native mit Expo** — eine Codebasis für iOS und Android |

TypeScript durchgehend. Das ist der eigentliche Gewinn der Expo-Entscheidung: kein Wechsel
zwischen Swift, Kotlin und TypeScript, sondern eine Sprache, ein Paketmanager, ein
Testframework. Typen aus dem OpenAPI-Schema lassen sich für Web und App gemeinsam
generieren.

---

# Stufe 1 — Fundament

### 1. Monorepo anlegen

`backend/`, `web-admin/`, `mobile/`, `api-contract/`. Linter, Formatter, Commit-Hooks.
Git-Repo initialisieren, `main` als geschützten Branch.
**Fertig, wenn:** `git log` zeigt den ersten Commit, Linter läuft in allen Ordnern durch.

### 2. Lokale Infrastruktur

`docker-compose.yml` mit PostgreSQL, Redis und Mailpit (fängt lokale Mails ab, damit kein
echter Versand nötig ist).
**Fertig, wenn:** `docker compose up` startet alle drei, Mailpit ist im Browser erreichbar.

### 3. NestJS-Skelett

Projekt aufsetzen, Prisma anbinden, Health-Endpoint, Konfiguration über Umgebungsvariablen.
**Fertig, wenn:** `GET /api/v1/health` antwortet mit `200`.

### 4. Datenbankschema

Alle 13 Tabellen aus `datenmodell.puml` als Migration. Vollständig, nicht häppchenweise —
spätere Schemaänderungen sind teurer als ein etwas größerer erster Wurf.
**Fertig, wenn:** Migration läuft auf leerer Datenbank durch, `\dt` zeigt alle Tabellen.

### 5. Überschneidungsschutz

`btree_gist` aktivieren, Exclusion-Constraint auf `appointments` setzen.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE appointments ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('PENDING','CONFIRMED'));
```

**Fertig, wenn:** Zwei überlappende Zeilen für dieselbe Person lassen sich per `INSERT`
nicht anlegen.

> **Warum so früh?** Wenn der Constraint von Anfang an existiert, kann die Buchungslogik
> gar nicht erst falsch gebaut werden. Später nachgerüstet zwingt er zum Umbau bereits
> funktionierenden Codes.

### 6. Nebenläufigkeitstest schreiben

Test: 50 gleichzeitige Buchungsversuche auf denselben Slot, genau einer darf durchkommen.

Dabei kommt das Testframework ins Projekt (Vitest) samt Schutzschalter, der Tests
abbricht, sobald `DATABASE_URL` nicht auf eine lokale Datenbank zeigt — die Tests legen
Daten an und löschen sie wieder.

**Fertig, wenn:** Der Test existiert, läuft und beweist, dass von 50 gleichzeitigen
Einfügungen genau eine durchkommt. Zusätzlich hält ein bewusst als „erwarteter
Fehlschlag" markierter Test die Anforderung an den Buchungsdienst fest, der erst in
Schritt 22 entsteht.

> **Korrektur zur ursprünglichen Planung.** Hier stand, der Test solle dauerhaft rot
> bleiben, bis Schritt 22 ihn grün macht. Das widerspricht Schritt 7, wo ein roter Test
> den Merge blockieren soll — ein monatelang roter Test würde jede Auslieferung
> verhindern.
>
> Die Auflösung: Der Nachweis auf **Datenbankebene** ist sofort grün und sichert ab, was
> Schritt 5 gebaut hat. Der Nachweis auf **Dienstebene** ist als erwarteter Fehlschlag
> markiert. Sobald der Buchungsdienst existiert, schlägt dieser Test _unerwartet ins Grüne
> um_ und bricht damit den Testlauf — genau an dem Punkt, an dem die echten Zusicherungen
> geschrieben werden müssen. Ein Wecker, der klingelt, wenn es soweit ist, statt einer
> Alarmanlage, die monatelang heult.

### 7. CI-Pipeline

GitHub Actions: Lint, Test, Build. Migration gegen eine Wegwerf-Datenbank.
**Fertig, wenn:** Ein Push löst den Durchlauf aus, roter Test blockiert den Merge.

---

# Stufe 2 — Authentifizierung

Reine Backend-Arbeit, noch ohne Oberfläche. Getestet wird mit einem HTTP-Client.

### 8. Registrierung

`users` anlegen, Argon2id-Hashing, E-Mail-Verifizierung mit Token, Mail über Mailpit.
**Fertig, wenn:** Registrierung erzeugt einen Benutzer, der Link in Mailpit setzt
`email_verified_at`.

### 9. Login und Token

JWT-Access-Token (15 min), Refresh-Token (30 Tage) mit Rotation. Wird ein verbrauchtes
Refresh-Token erneut vorgelegt, wird die gesamte Familie invalidiert.
**Fertig, wenn:** Login liefert beide Token, Refresh funktioniert, ein zweimal benutztes
Refresh-Token sperrt die Sitzung.

### 10. Rollen und Rechte

Guards für `ADMIN`, `STAFF`, `CUSTOMER`. Zusätzlich objektbezogene Prüfung: Darf _diese_
Person _dieses_ Objekt sehen?
**Fertig, wenn:** Ein `CUSTOMER`-Token bekommt auf Admin-Endpunkten `403`.

> Die objektbezogene Prüfung ist der Teil, der gern vergessen wird. Ein Rollen-Guard
> allein erlaubt jedem Staff den Zugriff auf jeden fremden Termin.

### 11. Einwilligungen

`consents` mit Typ, Version und Zeitstempel. Erteilen und Widerrufen.
**Fertig, wenn:** Einwilligungen sind abrufbar und widerrufbar, die Version wird
mitgeschrieben.

### 12. Passwort zurücksetzen

Anforderung per Mail, zeitlich begrenzter Token, Neusetzen invalidiert alle Sitzungen.
**Fertig, wenn:** Der komplette Ablauf funktioniert über Mailpit.

### 13. Rate Limiting

Auf allen Auth-Endpunkten: 5 Versuche pro 15 Minuten je IP und Konto.
**Fertig, wenn:** Der sechste Login-Versuch wird mit `429` abgewiesen.

---

# Stufe 3 — Admin-Web, Grundgerüst

### 14. React-Projekt

Vite, Router, TanStack Query, Tailwind mit shadcn/ui. API-Client mit Typen aus dem
OpenAPI-Schema generiert.
**Fertig, wenn:** Die Anwendung startet und erreicht den Health-Endpoint.

### 15. Login und geschütztes Routing

Anmeldung über httpOnly-Cookie, kein `localStorage`. Automatischer Refresh. Weiterleitung
bei fehlender Berechtigung.
**Fertig, wenn:** Anmeldung als Admin klappt, ein abgelaufenes Token wird unbemerkt
erneuert.

### 16. Layout und Navigation

Grundgerüst mit rollenabhängigem Menü: `STAFF` sieht weniger als `ADMIN`.
**Fertig, wenn:** Ein Staff-Konto sieht weder Benutzerverwaltung noch Serviceverwaltung.

---

# Stufe 4 — Stammdaten

Ab hier jeweils Backend und Oberfläche zusammen, ein Thema nach dem anderen.

### 17. Dienstleistungen

Backend-CRUD plus Verwaltungsmaske. Dauer, Puffer, Preis, Aktivierung, Sortierung.
**Fertig, wenn:** Eine Leistung lässt sich im Browser anlegen, ändern und deaktivieren.

### 18. Kosmetiker:innen

`users` mit Rolle `STAFF` plus `staff_profiles`. Anlegen, bearbeiten, deaktivieren.
**Fertig, wenn:** Eine angelegte Kosmetiker:in kann sich selbst im Admin-Web anmelden.

### 19. Leistungszuordnung

`staff_services`: Wer bietet was an. Reine Verknüpfung – Dauer und Preis gelten studioweit
einheitlich und kommen aus `services`.
**Fertig, wenn:** Eine Leistung lässt sich mehreren Personen zuordnen und wieder entziehen.
Eine Leistung, die niemand anbietet, taucht in der Buchung nicht auf.

### 20. Arbeitszeiten und Abwesenheiten

`working_hours` je Wochentag für Wiederkehrendes — eine feste Mittagspause wird als zwei
Zeilen abgebildet (9–12 und 13–17). `time_off` für einmalige Abwesenheiten mit konkretem
Datum, kategorisiert über `type`, ohne Freitext. `staff_id = NULL` bedeutet studioweit,
also Feiertag oder Betriebsurlaub.
**Fertig, wenn:** Arbeitszeiten inklusive Mittagspause sind pflegbar, ein studioweiter
Feiertag lässt sich mit einem Eintrag für alle setzen.

> **Meilenstein A:** Das Studio kann sich vollständig selbst konfigurieren.

---

# Stufe 5 — Buchung, das Herzstück

### 21. Slot-Berechnung

Arbeitszeiten laden, davon abziehen: Öffnungszeiten, Abwesenheiten, bestehende Termine samt
Puffer. Rest in Raster schneiden, zu kurze und zu kurzfristige Slots verwerfen.
Ergebnis kurz in Redis cachen.
**Fertig, wenn:** `GET /availability` liefert korrekte Slots — geprüft gegen mindestens
diese Fälle: normaler Tag, Tag mit Mittagspause, Tag mit halbem Urlaub, Feiertag,
voll ausgebuchter Tag, **Tag der Sommerzeitumstellung**.

> **Das ist der aufwendigste und fehleranfälligste Schritt des gesamten Projekts.** Nicht
> weiterarbeiten, solange nicht alle sechs Fälle als Test abgesichert sind. Jeder Fehler
> hier wird später in drei Oberflächen gleichzeitig sichtbar.

### 22. Buchen

Transaktion, `ends_at` und Preis berechnet ausschließlich der Server. Bei Verletzung des
Constraints `409 Conflict`.
**Fertig, wenn:** Eine Buchung entsteht — und **der Test aus Schritt 6 wird grün**.

### 23. Stornieren und Verschieben

Fristprüfung für Kunden, freie Stornierung für Staff und Admin mit Pflichtgrund.
Verschieben als atomare Kombination. Jede Änderung ins `audit_log`.
**Fertig, wenn:** Storno gibt den Slot wieder frei, eine Stornierung nach Fristablauf wird
abgelehnt.

### 24. Nachbereitungsjob

Nächtlich: vergangene `CONFIRMED`-Termine auf `COMPLETED`.
**Fertig, wenn:** Der Job läuft und verändert nur, was er soll.

---

# Stufe 6 — Admin-Kalender

### 25. Kalenderansicht

Tag, Woche, Monat. Ressourcenansicht mit einer Spalte je Kosmetiker:in. `STAFF` sieht nur
sich selbst.
**Fertig, wenn:** Ein gebuchter Termin erscheint an der richtigen Stelle, in der richtigen
Farbe.

### 26. Termine verwalten

Umbuchen per Drag & Drop mit Bestätigungsdialog, stornieren, `NO_SHOW` markieren, Termin
im Namen einer Kundin anlegen.
**Fertig, wenn:** Ein Termin lässt sich per Maus verschieben, der Konflikt beim Verschieben
auf einen belegten Slot wird sauber abgefangen.

> **Meilenstein B — erster ausrollbarer Stand.**
> Ab hier kann das Studio das System bereits produktiv nutzen: Termine am Telefon annehmen
> und digital verwalten. Wenn du an dieser Stelle pausieren musst, hast du trotzdem etwas
> Fertiges abgeliefert. Das ist der wichtigste Punkt der ganzen Reihenfolge.

---

# Stufe 7 — Mobile App (Expo)

### 27. Expo-Projekt

Expo mit TypeScript, Navigation, API-Client mit denselben generierten Typen wie im Web.
**Fertig, wenn:** Die App startet im Simulator und auf einem echten Gerät.

### 28. Anmeldung

Registrierung, Login, Token in `expo-secure-store` (nutzt Keychain bzw. Keystore),
automatischer Refresh, Einwilligungs-Checkboxen bei der Registrierung.
**Fertig, wenn:** Registrierung inklusive E-Mail-Verifizierung funktioniert vom Gerät aus.

### 29. Leistungen und Kosmetiker:innen

Liste der Services, Auswahl der Kosmetiker:in, Profilbilder.
**Fertig, wenn:** Die in Stufe 4 angelegten Daten erscheinen in der App.

### 30. Buchungsablauf

Leistung → Kosmetiker:in → Datum → freier Slot → Bestätigung. Bei `409` die Slots neu laden
und verständlich erklären, was passiert ist.
**Fertig, wenn:** Eine Buchung vom Gerät erscheint sofort im Admin-Kalender.

### 31. Meine Termine

Kommende und vergangene Termine, Detailansicht, Stornieren mit Fristhinweis.
**Fertig, wenn:** Storno aus der App gibt den Slot im Admin-Kalender wieder frei.

> **Meilenstein C:** Der Kreis ist geschlossen — Buchung und Storno funktionieren von
> beiden Seiten.

---

# Stufe 8 — Benachrichtigungen

### 32. Outbox und Worker

`notifications_outbox` als Transactional Outbox, BullMQ-Worker, Retry mit Backoff,
Dead-Letter-Queue.
**Fertig, wenn:** Ein absichtlich fehlschlagender Versand landet nach den Versuchen in der
Dead-Letter-Queue statt verloren zu gehen.

### 33. E-Mail-Versand

Anbindung eines EU-Anbieters, Templates für alle sechs Anlässe aus `PLAN.md` Abschnitt 9.
**Fertig, wenn:** Buchungsbestätigung kommt an und sieht auf dem Handy ordentlich aus.

### 34. Push

`expo-notifications`, Token-Registrierung über `POST /me/devices`, **Logout löscht den
Token**, tote Tokens werden aufgeräumt.
**Fertig, wenn:** Eine Testbenachrichtigung erreicht iOS und Android, und nach dem Logout
kommt nichts mehr an.

> **Zwei Punkte, die hier leicht danebengehen:**
> Erstens: Expo bietet einen eigenen Push-Dienst an, der über Expo-Server in den USA läuft.
> Das wäre ein zusätzlicher Auftragsverarbeiter im Drittland. Stattdessen native
> Device-Tokens holen und direkt von deinem Backend an FCM und APNs senden.
> Zweitens: Push-Inhalte dürfen keine Klardaten enthalten — nur `appointment_id` und einen
> allgemeinen Text. Sonst steht auf dem Sperrbildschirm, wer wann zur Behandlung kommt.

### 35. Erinnerungen

24 Stunden vorher, geplant beim Buchen, entfernt beim Stornieren, verschoben beim Umbuchen.
Fallback auf E-Mail, wenn kein Push-Token vorliegt.
**Fertig, wenn:** Ein storniertes Termin löst keine Erinnerung mehr aus.

### 36. Deep-Links

Tippen auf die Benachrichtigung öffnet den passenden Termin in der App.
**Fertig, wenn:** Der Sprung funktioniert aus geschlossener und aus laufender App.

### 37. Zwei-Faktor-Authentifizierung

TOTP für `ADMIN` und `STAFF`, Einrichtung per QR-Code, Wiederherstellungscodes.
**Fertig, wenn:** Admin-Login ohne zweiten Faktor wird abgewiesen.

---

# Stufe 9 — Behandlungsnotizen (Art. 9 DSGVO)

> Ab hier werden Gesundheitsdaten verarbeitet. Diese Stufe hat ein anderes Risikoprofil als
> alles davor: Fehler kosten hier nicht Nacharbeit, sondern Bußgeld. Als Einzelperson ohne
> Gegenlesen die Stufe, bei der externe Prüfung am meisten wert ist.

### 38. Datenschutz-Folgenabschätzung

Nach Art. 35. Muss **vor** dem Produktivgang dieser Funktion abgeschlossen sein — aber
beginnen, bevor du sie baust, weil sie Anforderungen nachschieben kann.
**Fertig, wenn:** Das Dokument liegt vor und ist vom Verantwortlichen freigegeben.

### 39. Schlüsselverwaltung

KMS oder Vault. Schlüssel **nicht** in der Datenbank, nicht in der Umgebungsvariable neben
der Datenbank-URL. Rotation und Notfallzugriff durchdacht.

**Hier fällt die Entscheidung: ein globaler Schlüssel oder einer pro Person.**
Ein globaler Schlüssel ist einfacher, schließt aber Crypto-Shredding dauerhaft aus — man
kann ihn nicht für eine einzelne Person vernichten. Nur bei Schlüsseln pro Person, die im
KMS und **nicht** in der Datenbank liegen, verschwinden die Gesundheitsdaten einer
gelöschten Person auch aus allen Backups. Hintergrund in `docs/CHECKLISTE.md`.

**Fertig, wenn:** Das Backend holt den Schlüssel zur Laufzeit, ein Datenbank-Dump allein
nützt niemandem, und die Entscheidung über den Schlüsselzuschnitt ist dokumentiert.

### 40. Verschlüsselte Notizen

**Beide** Art.-9-Felder mit AES-256-GCM-Feldverschlüsselung: `treatment_notes.content_encrypted`
und `appointments.customer_note_encrypted`. Das zweite ist der Freitext, den die Kundin
beim Buchen eingibt — dort landen erfahrungsgemäß Allergien und Hauterkrankungen.
**Fertig, wenn:** Beide Spalten zeigen im `SELECT` unlesbare Bytes, und das Freitextfeld
im Buchungsablauf erscheint nur bei erteilter `HEALTH_DATA`-Einwilligung.

### 41. Zugriffskontrolle und Protokollierung

Zugriff nur bei Behandlungsbezug, jeder **Lesezugriff** auf beide Art.-9-Felder ins
`audit_log` mit `is_art9_access = true`. Dabei die harte Regel durchsetzen: `metadata`
enthält nur Verweise — IDs, Feldnamen, Statuswerte — und niemals Inhalte.
**Fertig, wenn:** Eine fremde Staff-Person bekommt `403`, der eigene Lesezugriff erzeugt
einen Log-Eintrag, und in keinem `metadata` steht Notiztext.

### 42. Einwilligung in der App

Eigener, ausdrücklicher Dialog für Gesundheitsdaten — getrennt von AGB und
Datenschutzerklärung, nicht vorangekreuzt. Widerruf jederzeit möglich.
**Fertig, wenn:** Ohne erteilte Einwilligung ist die Notizfunktion im Admin-Web nicht
sichtbar **und** das Freitextfeld im Buchungsablauf der App fehlt ebenfalls.

### 43. Notizen im Admin-Web

Erfassen und Lesen im Terminkontext, Historie je Kundin.
**Fertig, wenn:** Eine Notiz lässt sich erfassen, wieder lesen und ist im Audit-Log
nachvollziehbar.

### 44. Eigene Historie in der App

Kundinnen sehen ihre eigenen Behandlungen.
**Fertig, wenn:** Die eigene Historie erscheint, fremde ist nicht erreichbar.

---

# Stufe 10 — DSGVO-Werkzeuge

### 45. Datenexport

`GET /me/export` liefert alles: Profil, Termine, Notizen, Einwilligungen.
**Fertig, wenn:** Das JSON enthält nachweislich jede Tabelle mit Personenbezug.

### 46. Löschung

`DELETE /me` anonymisiert nach der Tabelle in `PLAN.md` Abschnitt 8.3: E-Mail auf
`deleted-<uuid>@invalid`, Name und Telefon gelöscht, `status = ANONYMIZED`, beide
Art.-9-Felder gelöscht und Schlüssel vernichtet, Tokens entfernt. Einwilligungen bleiben
als Nachweis, Termine bleiben pseudonymisiert für die Buchhaltung.
**Kein Soft-Delete** — es gibt kein `deleted_at`.
**Fertig, wenn:** Nach der Löschung findet eine Volltextsuche über die Datenbank keinen
Personenbezug mehr.

### 47. Aufbewahrungsfristen

Job je Datenart: Notizen kürzer als Termine, Termine bis Ende der Aufbewahrungspflicht,
Logs nach 30 Tagen. Die Werte kommen aus der Konfiguration, siehe `.env.example` und
`PLAN.md` Abschnitt 8.4.1 — Gesundheitsdaten kürzer als Termine, Art.-9-Zugriffe im
Audit-Log länger als normale Einträge.
**Fertig, wenn:** Der Job läuft im Trockenlauf und meldet plausible Mengen.

### 48. Audit-Log und Auswertungen

Einsicht für Admin, Filter, Auslastungs- und No-Show-Statistik.
**Fertig, wenn:** Zugriffe auf Behandlungsnotizen sind in der Oberfläche nachvollziehbar.

### 49. Profilfunktionen in der App

Daten exportieren, Konto löschen, Einwilligungen widerrufen — alles ohne Mailkontakt zum
Studio erreichbar.
**Fertig, wenn:** Eine Löschung lässt sich vollständig aus der App auslösen.

---

# Stufe 11 — Produktionsreife

### 50. Produktionsumgebung

Server in der EU, verschlüsselte Backups, **Restore einmal echt durchspielen**.
**Fertig, wenn:** Eine Wiederherstellung aus dem Backup ist erfolgreich getestet — nicht
nur eingerichtet.

> Ein Backup, das nie zurückgespielt wurde, ist kein Backup. Das ist der eine Punkt dieser
> Liste, bei dem „sieht gut aus" am wenigsten wert ist.

### 51. Monitoring

Selbstgehostetes Sentry in der EU, Uptime-Prüfung, Alarmierung. Logs ohne personenbezogene
Daten.
**Fertig, wenn:** Ein absichtlich erzeugter Fehler löst eine Benachrichtigung aus.

### 52. Härtung

Security-Header, CSP, Certificate Pinning in der App, Abhängigkeits-Scan.
**Fertig, wenn:** Die OWASP-Checkliste aus `PLAN.md` Abschnitt 12 ist abgearbeitet.

### 53. Lasttest

Slot-Abfrage und Buchung unter Last, Nebenläufigkeitstest gegen Staging.
**Fertig, wenn:** Unter Last entsteht keine Doppelbuchung.

### 54. Store-Vorbereitung

Apple Privacy Nutrition Labels, Google Data Safety, Listings, Screenshots.
**Fertig, wenn:** Beide Formulare decken sich mit der Datenschutzerklärung.

> Apple lehnt regelmäßig wegen Abweichungen zwischen Privacy Labels und
> Datenschutzerklärung ab. Jede Ablehnung kostet einen kompletten Review-Zyklus — deshalb
> hier sorgfältig sein, nicht zügig.

### 55. Beta

TestFlight und Play Internal Testing mit echtem Studiopersonal und einigen Stammkundinnen.
**Fertig, wenn:** Eine Woche ohne kritische Rückmeldung vergangen ist.

### 56. Livegang

Store-Review, Rollout, Schulung des Personals, erhöhte Aufmerksamkeit in den ersten zwei
Wochen.

---

## Abhängigkeiten, die du nicht umgehen kannst

```
4 Schema ─→ 5 Constraint ─→ 21 Slots ─→ 22 Buchen ─→ 23 Storno
                                             │
                        ┌────────────────────┼────────────────────┐
                        ▼                    ▼                    ▼
                  25 Kalender          30 App-Buchung       32 Outbox
                        │                                         │
                        ▼                                         ▼
                 Meilenstein B                            34 Push ─→ 35 Erinnerung
```

**Schritt 21 ist der Engpass.** Alles danach hängt daran. Wenn du merkst, dass du dich dort
festfährst: nicht ausweichen und etwas anderes vorziehen, sondern die Testfälle einzeln
abarbeiten. Ein halb fertiger Slot-Algorithmus, auf dem Kalender und App schon aufbauen,
ist der teuerste Zustand, den dieses Projekt erreichen kann.

---

## Drei Punkte, die früh geklärt sein müssen

Diese Antworten fehlen noch und blockieren jeweils einen konkreten Schritt:

| Frage                                                    | Blockiert      | Warum                                                              |
| -------------------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| Storno-Frist in Stunden                                  | Schritt 21, 23 | Geht direkt in die Slot- und Fristlogik ein                        |
| Automatische Bestätigung oder Freigabe durch das Studio? | Schritt 22     | Entscheidet, ob Buchungen als `PENDING` oder `CONFIRMED` entstehen |
| Vorlaufzeit und maximaler Buchungshorizont               | Schritt 21     | Bestimmt, welche Slots überhaupt angeboten werden                  |

Alle drei vor Stufe 5 klären. Werden sie erst während der Umsetzung nachgereicht, baust du
Schritt 21 zweimal — und das ist der Schritt, bei dem das am meisten wehtut.

Die Zeitzone (angenommen `Europe/Vienna`) wird schon in Schritt 4 gebraucht. Die
Developer-Accounts für Apple und Google spätestens vor Schritt 34, weil APNs ohne
Apple-Account nicht einzurichten ist und die Kontoeröffnung Vorlauf hat.

---

## Wenn du den Faden verlierst

Als Nebenprojekt liegt die Arbeit manchmal wochenlang. Zwei Gewohnheiten, die das
abfedern:

- **Nach jeder Sitzung eine Zeile in `FORTSCHRITT.md`:** letzter erledigter Schritt, und
  was als Nächstes dran ist. Kostet dreißig Sekunden und spart beim Wiedereinstieg eine
  Stunde Orientierung.
- **Nie mitten in einem Schritt aufhören.** Lieber einen Schritt kleiner schneiden, als
  einen halben offen zu lassen. Die Definition of Done oben ist dafür da.

Meilenstein B (Schritt 26) ist bewusst so gelegt, dass dort ein natürlicher Ruhepunkt
liegt: Wenn das Projekt danach stillsteht, hat das Studio trotzdem ein funktionierendes
Terminbuch.
