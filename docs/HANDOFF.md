# Kontext-Übergabe: Terminplaner Kosmetikstudio

**Zweck dieser Datei:** In eine neue Claude-Unterhaltung hochladen — zusammen mit
`PLAN.md`, `UMSETZUNG.md` und `datenmodell.puml` — um ohne Kontextverlust weiterzuarbeiten.
**Stand:** 2026-09-17

---

## Was gebaut wird

Ein Terminbuchungssystem für ein Kosmetikstudio, das die Terminvergabe vereinfachen soll.

| Teil         | Technologie                                                                    |
| ------------ | ------------------------------------------------------------------------------ |
| Backend      | NestJS + PostgreSQL + Redis, Hosting in der EU                                 |
| Admin-WebApp | React + TypeScript — für Studioleitung und Kosmetiker:innen                    |
| Mobile-App   | React Native mit Expo — eine Codebasis für iOS und Android, für die Kundschaft |

Alles TypeScript. Projektverzeichnis: `C:\Users\CemilAslan\Desktop\terminplaner` — aktuell
nur `docs/`, noch kein Code, noch kein Git-Repo.

**Umgesetzt wird das von einer einzelnen Person.** Das ist die wichtigste
Rahmenbedingung — sie hat bereits zwei Entscheidungen verändert (siehe unten) und sollte
bei allen weiteren Vorschlägen mitgedacht werden. Keine Zeit- oder Aufwandsschätzungen
erwünscht, nur Reihenfolge.

---

## Entscheidungen, die feststehen

Diese sind bestätigt und **nicht** neu aufzurollen:

| Thema                        | Entscheidung                                                                               | Hintergrund                                                                                                                                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend                      | **NestJS + PostgreSQL**, EU-Hosting                                                        | DSGVO: volle Kontrolle über Daten, Löschkonzept, AV-Verträge. Firebase wurde wegen Drittlandtransfer verworfen                                                        |
| Ein Backend für alle Clients | ja                                                                                         | ausdrücklicher Wunsch                                                                                                                                                 |
| Mobile                       | **React Native mit Expo**                                                                  | Ursprünglich waren getrennte native Apps (Swift/Kotlin) gewünscht. Nach der Umstellung auf Einzelentwicklung geändert: eine Codebasis, eine Sprache im ganzen Projekt |
| Behandlungsnotizen (Art. 9)  | **bleiben in Version 1**                                                                   | bewusst so entschieden, trotz des Zusatzaufwands für eine Einzelperson                                                                                                |
| Nicht im MVP                 | Online-Zahlung, Gutscheine, Bewertungen, Warteliste, mehrere Standorte, Kalender-Sync, SMS | zurückgestellt                                                                                                                                                        |

### Vier Punkte, die den Entwurf prägen

1. **Doppelbuchungen werden auf Datenbankebene verhindert**, nicht in der
   Anwendungslogik: ein `EXCLUDE USING gist`-Constraint auf `appointments`. Der Constraint
   wird ganz früh gesetzt (Schritt 5), damit die Buchungslogik gar nicht erst falsch
   entstehen kann.
2. **Die Behandlungsnotizen sind Gesundheitsdaten nach Art. 9 DSGVO.** Eigene Tabelle,
   AES-256-GCM-Feldverschlüsselung mit Schlüssel außerhalb der Datenbank, eigene
   ausdrückliche Einwilligung, Protokollierung jedes Lesezugriffs,
   Datenschutz-Folgenabschätzung nach Art. 35 vor Produktivgang. Bewusst spät eingeplant
   (Stufe 9), nach dem funktionierenden Buchungskern.
3. **Push und DSGVO beißen sich.** Push-Nutzdaten enthalten nur eine `appointment_id` und
   generischen Text; Details lädt die App nach dem Öffnen nach. Zusätzlich: **nicht** den
   Expo-Push-Dienst verwenden, der über US-Server läuft — stattdessen native Device-Tokens
   beziehen und direkt vom eigenen Backend an FCM und APNs senden.
4. **Das Admin-Web kommt vor der Mobile-App.** Nach Schritt 26 der Umsetzungsreihenfolge
   ist das System bereits eigenständig nutzbar: Das Studio kann telefonisch vereinbarte
   Termine digital verwalten, noch bevor die App existiert.

---

## Was bereits existiert

| Datei                   | Inhalt                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/PLAN.md`          | Fachlicher Plan: Rollen und Rechte, Architektur, Datenmodell, Buchungslogik, API-Entwurf, Auth und Sicherheit, DSGVO-Konzept, Benachrichtigungen, Clients, Infrastruktur, Teststrategie, Risiken, offene Punkte |
| `docs/UMSETZUNG.md`     | Umsetzungsreihenfolge: 56 Schritte in elf Stufen, jeder mit einem prüfbaren Kriterium für Fertigstellung. Ohne Zeitschätzungen                                                                                  |
| `docs/datenmodell.puml` | ERD als PlantUML: 13 Entitäten, 5 Enums, fünf Pakete                                                                                                                                                            |

Alle drei sollten dieser Übergabe beiliegen.

---

## Datenmodell in Kurzform

13 Tabellen: `users`, `staff_profiles`, `services`, `staff_services`, `working_hours`,
`time_off`, `appointments`, `treatment_notes`, `consents`, `audit_log`, `refresh_tokens`,
`device_tokens`, `notifications_outbox`.

Drei Rollen: `ADMIN` (alles), `STAFF` (nur eigener Kalender, eigene Kunden, kein Login in
der Kunden-App), `CUSTOMER` (nur Mobile).

Zeitstempel durchgängig `timestamptz` in UTC, Studio-Zeitzone separat in der Konfiguration
(angenommen: `Europe/Vienna`).

---

## Stand und nächster Schritt

Es existiert noch kein Code. Als Nächstes stehen die Schritte 1 bis 7 aus `UMSETZUNG.md`
an: Monorepo anlegen, Docker Compose, NestJS-Skelett, vollständiges Datenbankschema,
Exclusion-Constraint, Nebenläufigkeitstest schreiben (bleibt absichtlich rot bis
Schritt 22), CI-Pipeline.

Offen gebliebene Angebote aus der bisherigen Unterhaltung:

- ein Mermaid-ERD zusätzlich zum PlantUML (rendert direkt in GitHub, ohne Tooling)
- die Pläne als teilbare Web-Seite veröffentlichen
- `plantuml.jar` herunterladen und das Diagramm lokal rendern (Java 25 ist installiert,
  PlantUML selbst nicht)

---

## Offene Fragen an das Studio

Drei davon blockieren die Slot- und Buchungslogik (Stufe 5 der Umsetzung) und sollten vor
Schritt 21 geklärt sein:

1. **Storno-Frist in Stunden**, und ob eine Storno-Gebühr erhoben werden soll
2. **Automatische Bestätigung oder Freigabe durch das Studio?** Der Plan nimmt automatisch
   an, der Status `PENDING` ist aber vorgesehen
3. **Vorlaufzeit für kurzfristige Buchungen und maximaler Buchungshorizont**

Werden diese erst während der Umsetzung nachgereicht, wird Schritt 21 — der aufwendigste
des Projekts — zweimal gebaut.

Weitere offene Punkte:

4. Zeitzone und Standort — angenommen `Europe/Vienna`, ein Standort (wird schon in
   Schritt 4 gebraucht)
5. Apple- und Google-Developer-Account vorhanden? Wird vor Schritt 34 gebraucht, weil
   APNs ohne Apple-Account nicht einzurichten ist und die Kontoeröffnung Vorlauf hat
6. Anzahl Kosmetiker:innen und Leistungen zum Start (für Seed-Daten und Beta)
7. Verantwortliche Stelle im Sinne der DSGVO, Datenschutzbeauftragte:r? (für die
   Folgenabschätzung, Schritt 38)
8. Bestehende Kundendaten, die migriert werden müssen?
