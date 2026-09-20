# Terminplaner Kosmetikstudio – Entwicklungsplan

**Stand:** 2026-09-08
**Status:** Entwurf zur Abstimmung

---

## 1. Ziel und Rahmen

Ein Terminbuchungssystem für ein Kosmetikstudio, bestehend aus drei Clients auf einem
gemeinsamen Backend:

| Client                     | Zielgruppe                       | Technologie                            |
| -------------------------- | -------------------------------- | -------------------------------------- |
| Mobile-App (iOS + Android) | Kundinnen und Kunden             | React Native mit Expo, TypeScript      |
| Admin-WebApp               | Studioleitung + Kosmetiker:innen | React + TypeScript (SPA)               |
| Backend                    | alle Clients                     | NestJS + PostgreSQL, Hosting in der EU |

> **Änderung vom 2026-09-17:** Ursprünglich waren getrennte native Apps (Swift und Kotlin)
> vorgesehen. Da das Projekt von einer einzelnen Person umgesetzt wird, wurde auf eine
> gemeinsame Expo-Codebasis umgestellt. Damit ist das gesamte Projekt in TypeScript
> geschrieben. Die Umsetzungsreihenfolge steht in `UMSETZUNG.md`.

**Grundprinzip:** Das Backend ist die einzige Quelle der Wahrheit. Kein Client enthält
Geschäftslogik zur Slot-Berechnung, Preisfindung oder Rechteprüfung. Alle drei Clients
sprechen dieselbe versionierte REST-API (`/api/v1`).

---

## 2. Rollen und Rechte

Drei Rollen, hierarchisch:

### 2.1 `ADMIN` (Studioleitung)

- Vollzugriff auf alles
- Kosmetiker:innen anlegen, bearbeiten, deaktivieren
- Dienstleistungen (Services) und Preise pflegen
- Öffnungszeiten und Feiertage des Studios pflegen
- Alle Termine sehen, umbuchen, stornieren
- Kundenkonten einsehen, sperren, löschen
- Auswertungen (Auslastung, No-Show-Quote)
- DSGVO-Funktionen ausführen (Auskunft, Löschung)

### 2.2 `STAFF` (Kosmetiker:in)

- Login ausschließlich in der WebApp, **nicht** in der Kunden-App
- Eigenen Kalender sehen und verwalten
- Eigene Arbeitszeiten und Abwesenheiten (Urlaub, Krankheit, Fortbildung) pflegen
- Termine bei sich selbst annehmen, verschieben, stornieren
- Kundenhistorie **nur** für Kundinnen und Kunden, die bei ihr/ihm einen Termin haben oder hatten
- Kein Zugriff auf Benutzerverwaltung oder Preisgestaltung

### 2.3 `CUSTOMER` (Kundin / Kunde)

- Registrierung und Login in der Mobile-App (iOS und Android)
- Services durchsuchen, Kosmetiker:in wählen, freie Slots sehen, buchen
- Eigene Termine sehen, verschieben, stornieren (bis X Stunden vorher, konfigurierbar)
- Eigenes Profil bearbeiten, Daten exportieren, Konto löschen

**Umsetzung:** Rollen als Enum in der Datenbank, Durchsetzung serverseitig über NestJS-Guards
(`@Roles('ADMIN')`) plus objektbezogene Prüfung (darf dieser Staff diesen Termin sehen?).
Rollenprüfung im Client dient nur der UI, niemals der Sicherheit.

---

## 3. Systemarchitektur

```
┌───────────────────────────┐   ┌──────────────┐
│ Mobile-App (Expo / RN)    │   │ Admin WebApp │
│ iOS + Android, TypeScript │   │    React     │
└─────────────┬─────────────┘   └──────┬───────┘
              │                        │
              └── HTTPS / REST /api/v1 ┘
                           │
                   ┌───────▼────────┐
                   │  NestJS API    │
                   │  Auth · Booking│
                   │  Notify · GDPR │
                   └───┬────────┬───┘
                       │        │
               ┌───────▼──┐  ┌──▼─────────┐
               │PostgreSQL│  │ Redis      │
               │ (EU)     │  │ Queue/Lock │
               └──────────┘  └──┬─────────┘
                                │
                     ┌──────────▼──────────┐
                     │ Worker: Reminder,   │
                     │ Mail, Push          │
                     └──────────┬──────────┘
                                │
                  ┌─────────────┴──────────────┐
                  │ FCM (Android) · APNs (iOS) │
                  │ SMTP EU (z.B. Mailjet DE)  │
                  └────────────────────────────┘
```

**Backend-Module (NestJS):**
`auth`, `users`, `staff`, `services`, `availability`, `appointments`, `notifications`,
`gdpr`, `audit`, `admin`

---

## 4. Datenmodell (PostgreSQL)

Kerntabellen:

**`users`**
`id (uuid)`, `email (unique, citext)`, `password_hash (argon2id)`, `role`, `first_name`,
`last_name`, `phone`, `email_verified_at`, `status (ACTIVE|BLOCKED|ANONYMIZED)`,
`created_at`, `updated_at`, `anonymized_at`

> **Kein Soft-Delete.** Es gibt bewusst kein `deleted_at`. Art. 17 wird durch
> Anonymisierung erfüllt, nicht durch Markieren. `anonymized_at` hält fest, wann das
> geschah. Siehe Abschnitt 8.3.

**`staff_profiles`**
`id`, `user_id → users`, `display_name`, `bio`, `photo_url`, `is_active`, `color_hex`

**`services`** (Dienstleistungen)
`id`, `name`, `description`, `duration_minutes`, `buffer_minutes`, `price_cents`,
`is_active`, `sort_order`

**`staff_services`** (welche Kosmetiker:in bietet welche Leistung an)
`staff_id`, `service_id` – reine Verknüpfungstabelle. Dauer und Preis gelten studioweit
einheitlich und stehen ausschließlich in `services`.

**`working_hours`** (Regelarbeitszeit pro Kosmetiker:in)
`id`, `staff_id`, `weekday (0–6)`, `start_time`, `end_time`

**`time_off`** (einmalige Abwesenheiten mit konkretem Datum)
`id`, `staff_id (nullable = ganzes Studio)`, `starts_at`, `ends_at`,
`type (VACATION|SICK|TRAINING|PUBLIC_HOLIDAY|CLOSURE|OTHER)`, `is_all_day`

> **Abgrenzung zu `working_hours`:** Wiederkehrend gegen einmalig. Eine feste
> Mittagspause von 12 bis 13 ist wiederkehrend und wird in `working_hours` als zwei Zeilen
> für denselben Wochentag abgebildet (9–12 und 13–17). Ein Arzttermin am 12. Mai ist
> einmalig und gehört in `time_off`.
>
> **Bewusst kein Freitextfeld.** Ein `reason` als Freitext würde Einträge wie „Reha nach
> Bandscheiben-OP" einladen – Gesundheitsdaten über Beschäftigte, also Art. 9. Bei
> Beschäftigten ist die Lage eher strenger, weil eine Einwilligung gegenüber der
> Arbeitgeberin selten wirklich freiwillig ist. Für Kalender und Planung genügt die
> Kategorie; die Diagnose braucht das System nicht.

**`appointments`**
`id`, `customer_id → users`, `staff_id → staff_profiles`, `service_id → services`,
`starts_at (timestamptz)`, `ends_at (timestamptz)`,
`status (PENDING|CONFIRMED|CANCELLED_BY_CUSTOMER|CANCELLED_BY_STAFF|COMPLETED|NO_SHOW)`,
`price_cents_snapshot`, `customer_note_encrypted (bytea)`, `cancelled_at`, `cancellation_reason`,
`created_at`, `updated_at`

**`treatment_notes`** – Art.-9-Daten, getrennte Tabelle, verschlüsselt (siehe §8.4)
`id`, `appointment_id`, `customer_id`, `author_staff_id`, `content_encrypted (bytea)`,
`created_at`

**`consents`**
`id`, `user_id`, `type (TOS|PRIVACY|HEALTH_DATA|MARKETING|PUSH)`, `version`,
`granted (bool)`, `granted_at`, `revoked_at`, `ip_hash`

**`audit_log`**
`id`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata (jsonb)`,
`is_art9_access (bool)`, `created_at`, `ip_hash`

> `metadata` enthält **nur Verweise, niemals Inhalte** – keine alten oder neuen Werte von
> Behandlungsnotizen oder `customer_note_encrypted`. Sonst läge Art.-9-Klartext
> unverschlüsselt im Log, direkt neben der verschlüsselten Originaltabelle. Erlaubt sind
> IDs, Feldnamen und Statuswerte. `is_art9_access` markiert Lesezugriffe auf
> Gesundheitsdaten, die länger aufbewahrt werden als normale Einträge.

**`refresh_tokens`**
`id`, `user_id`, `token_hash`, `device_label`, `expires_at`, `revoked_at`

**`device_tokens`** (Push)
`id`, `user_id`, `platform (IOS|ANDROID)`, `token`, `last_seen_at`

**`notifications_outbox`**
`id`, `user_id`, `channel (PUSH|EMAIL)`, `template`, `payload (jsonb)`,
`scheduled_for`, `sent_at`, `failed_reason`

### Wichtige Constraints und Indizes

- Alle Zeitstempel als `timestamptz`, gespeichert in UTC. Die Studio-Zeitzone
  (`Europe/Vienna`) liegt separat in der Konfiguration. Sommerzeit ist damit korrekt
  abgebildet.
- Überschneidungsschutz auf Datenbankebene – das ist die wichtigste einzelne Zeile im
  gesamten Schema:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE appointments ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (
    staff_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  ) WHERE (status IN ('PENDING','CONFIRMED'));
```

Damit sind Doppelbuchungen auch bei zeitgleichen Anfragen ausgeschlossen, unabhängig
davon, was die Anwendungsschicht tut.

- Index auf `appointments (staff_id, starts_at)` und `(customer_id, starts_at DESC)`

---

## 5. Buchungslogik

### 5.1 Freie Slots berechnen

Eingabe: `service_id`, `staff_id` (oder „egal"), Datumsbereich.

1. Arbeitszeiten der Kosmetiker:in für die Tage laden (`working_hours`)
2. Studio-Öffnungszeiten und Feiertage abziehen
3. Abwesenheiten abziehen (`time_off`)
4. Bestehende Termine abziehen, inklusive `buffer_minutes` nach jedem Termin
5. Verbleibende Zeitfenster in ein Raster schneiden (z. B. 15-Minuten-Schritte)
6. Slots verwerfen, die kürzer als `duration_minutes` sind
7. Slots in der Vergangenheit und innerhalb der Vorlaufzeit (z. B. < 2 h) verwerfen

Das Ergebnis wird 60 Sekunden in Redis gecacht und bei jeder Buchung invalidiert.

### 5.2 Buchen, absichert gegen Race Conditions

1. Client sendet `POST /appointments` mit `staff_id`, `service_id`, `starts_at`
2. Server berechnet `ends_at` selbst aus `duration_minutes` – **niemals** aus Client-Daten
3. Preis wird serverseitig ermittelt und als Snapshot gespeichert
4. Einfügen in einer Transaktion. Greift der `EXCLUDE`-Constraint, antwortet die API mit
   `409 Conflict – Slot bereits vergeben`, der Client lädt die Slots neu
5. Bei Erfolg: Bestätigung per E-Mail und Push, Erinnerung wird in
   `notifications_outbox` eingeplant

### 5.3 Stornieren und Verschieben

- Kunde: bis `cancellation_deadline_hours` (Standard 24 h) vorher frei stornierbar,
  danach nur noch als Anfrage ans Studio
- Staff und Admin: jederzeit, mit Pflichtangabe eines Grundes; der Kunde wird
  automatisch benachrichtigt
- Verschieben ist eine atomare Kombination aus Storno und Neubuchung in einer Transaktion
- Jede Statusänderung landet im `audit_log`

### 5.4 Nachbereitung

Ein nächtlicher Job setzt vergangene `CONFIRMED`-Termine auf `COMPLETED`.
`NO_SHOW` setzt ausschließlich der Staff manuell.

---

## 6. API-Entwurf (Auszug)

```
POST   /api/v1/auth/register              Registrierung + Verifizierungsmail
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/login                 → Access-Token (15 min) + Refresh-Token (30 d)
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/password/forgot
POST   /api/v1/auth/password/reset

GET    /api/v1/services                   öffentlich
GET    /api/v1/staff                      öffentlich, aktive Kosmetiker:innen
GET    /api/v1/staff/:id/services

GET    /api/v1/availability?serviceId=&staffId=&from=&to=
POST   /api/v1/appointments
GET    /api/v1/appointments/me
GET    /api/v1/appointments/:id
PATCH  /api/v1/appointments/:id/cancel
PATCH  /api/v1/appointments/:id/reschedule

GET    /api/v1/me
PATCH  /api/v1/me
POST   /api/v1/me/devices                 Push-Token registrieren
GET    /api/v1/me/export                  DSGVO Art. 15/20 (JSON-Download)
DELETE /api/v1/me                         DSGVO Art. 17 (Löschung)
GET    /api/v1/me/consents
PATCH  /api/v1/me/consents

--- ab hier STAFF / ADMIN ---
GET    /api/v1/staff/me/calendar?from=&to=
POST   /api/v1/staff/me/time-off
PUT    /api/v1/staff/me/working-hours
GET    /api/v1/customers/:id/notes        nur mit Behandlungsbezug
POST   /api/v1/appointments/:id/notes

--- ab hier nur ADMIN ---
CRUD   /api/v1/admin/staff
CRUD   /api/v1/admin/services
GET    /api/v1/admin/appointments
GET    /api/v1/admin/stats
GET    /api/v1/admin/audit-log
POST   /api/v1/admin/users/:id/anonymize
```

**Konventionen:** Die OpenAPI-Spezifikation wird aus den NestJS-Decorators generiert und
ist die verbindliche Schnittstellendokumentation für beide App-Teams. Fehler einheitlich
als RFC-9457 Problem Details. Rate-Limits auf allen Auth-Endpunkten.

---

## 7. Authentifizierung und Sicherheit

- Passwort-Hashing mit **Argon2id**, Mindestlänge 12 Zeichen, Abgleich gegen eine Liste
  bekannter geleakter Passwörter
- **JWT Access Token** (15 Minuten, nur im Speicher) plus **Refresh Token** (30 Tage,
  rotierend). Wird ein bereits verbrauchtes Refresh-Token erneut vorgelegt, wird die
  gesamte Token-Familie invalidiert
- Token-Ablage: iOS **Keychain**, Android **EncryptedSharedPreferences**,
  WebApp **httpOnly-Secure-Cookie** – kein `localStorage`
- E-Mail-Verifizierung vor der ersten Buchung verpflichtend
- Rate Limiting: 5 Login-Versuche pro 15 Minuten je IP und Konto, danach exponentielles
  Backoff
- 2FA per TOTP für `ADMIN` und `STAFF` (Phase 4)
- HTTPS erzwungen, HSTS, Security-Header via Helmet, CSP in der WebApp
- Certificate Pinning in beiden Apps (Phase 6)
- Serverseitige Eingabevalidierung mit `class-validator` an jedem Endpunkt
- Keine Geheimnisse im Repository, Secrets über Umgebungsvariablen bzw. Vault
- Abhängigkeits-Scans (`npm audit`, Dependabot) im CI

---

## 8. DSGVO-Konzept

Datenschutz ist hier kein nachgelagerter Punkt, sondern zieht sich durch alle Phasen.

### 8.1 Rechtsgrundlagen (Art. 6 / Art. 9)

| Verarbeitung                         | Grundlage                                                  |
| ------------------------------------ | ---------------------------------------------------------- |
| Konto, Terminbuchung, Erinnerungen   | Art. 6 Abs. 1 lit. b – Vertragserfüllung                   |
| Rechnungs- und Buchhaltungsdaten     | Art. 6 Abs. 1 lit. c – rechtliche Pflicht                  |
| Behandlungsnotizen (Haut, Allergien) | **Art. 9 Abs. 2 lit. a – ausdrückliche Einwilligung**      |
| Marketing-Newsletter                 | Art. 6 Abs. 1 lit. a – Einwilligung, jederzeit widerrufbar |
| Fehler-Logs, Missbrauchsabwehr       | Art. 6 Abs. 1 lit. f – berechtigtes Interesse              |

### 8.2 Datenminimierung

Pflichtfelder bei der Registrierung: **E-Mail, Passwort, Vorname, Nachname**.
Telefonnummer optional, nur für Rückfragen. Kein Geburtsdatum, keine Adresse, kein
Geschlecht – solange dafür kein konkreter Zweck besteht.

### 8.3 Betroffenenrechte, technisch umgesetzt

| Recht                                   | Umsetzung                                                                          |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| Art. 15 Auskunft / Art. 20 Portabilität | `GET /me/export` liefert vollständiges JSON inkl. Termine, Notizen, Einwilligungen |
| Art. 16 Berichtigung                    | Profil in der App selbst editierbar                                                |
| Art. 17 Löschung                        | `DELETE /me` – sofortige Anonymisierung, Details unten                             |
| Art. 18 Einschränkung                   | Admin kann ein Konto auf `BLOCKED` setzen                                          |
| Art. 21 Widerspruch                     | Einwilligungen einzeln widerrufbar im Profil                                       |

**Löschung im Detail:** Vollständiges Löschen scheitert an der siebenjährigen
Aufbewahrungspflicht für abgerechnete Leistungen. Lösung ist **Anonymisierung, nicht
Soft-Delete**:

| Was                                      | Was damit geschieht                           |
| ---------------------------------------- | --------------------------------------------- |
| `users.email`                            | → `deleted-<uuid>@invalid`                    |
| `users.first_name`, `last_name`, `phone` | gelöscht                                      |
| `users.status`                           | → `ANONYMIZED`, `anonymized_at` gesetzt       |
| `treatment_notes`                        | Zeilen gelöscht, Schlüssel vernichtet         |
| `appointments.customer_note_encrypted`   | gelöscht, Schlüssel vernichtet                |
| `refresh_tokens`, `device_tokens`        | gelöscht                                      |
| `consents`                               | bleiben – Nachweis, dass eingewilligt **war** |
| `appointments` (Rest)                    | bleiben pseudonymisiert für die Buchhaltung   |

Nach Ablauf der Aufbewahrungsfrist räumt ein Job auch die Termine ab. Der gesamte Vorgang
wird im `audit_log` protokolliert.

> **Wichtig für die Umsetzung:** Es gibt kein `deleted_at` und kein Soft-Delete. Eine
> markierte Zeile mit weiterhin lesbarer E-Mail-Adresse wäre keine Erfüllung von Art. 17.
> Das Schema ist bewusst so gebaut, dass der bequeme Weg auch der richtige ist.

**Was die Löschung nicht erreicht:** Backups. Eine anonymisierte Person lebt im Backup von
gestern weiter. Das ist zulässig, muss aber im Löschkonzept mit einer definierten
Backup-Aufbewahrung beschrieben sein, nach deren Ablauf sich das von selbst erledigt.

### 8.4 Gesundheitsdaten (Art. 9) – Sonderbehandlung

Hier werden Gesundheitsdaten verarbeitet, deshalb gelten deutlich strengere Regeln.
**Betroffen sind zwei Felder**, nicht nur eines:

| Feld                                   | Herkunft                                     |
| -------------------------------------- | -------------------------------------------- |
| `treatment_notes.content_encrypted`    | vom Studio erfasste Behandlungsdokumentation |
| `appointments.customer_note_encrypted` | Freitext der Kundin bei der Buchung          |

Das zweite Feld sieht harmlos aus und ist es nicht. In einem Kosmetikstudio ist es der
erwartbare Normalfall, dass Kundinnen dort „Neurodermitis", „Allergie gegen Duftstoffe"
oder „bin schwanger" hineinschreiben. Ein unverschlüsseltes Freitextfeld würde die ganze
Sorgfalt bei `treatment_notes` unterlaufen. Deshalb gelten für beide Felder dieselben
Regeln:

- **Feldverschlüsselt** (AES-256-GCM, Schlüssel im KMS/Vault, nicht in der Datenbank)
- Nur bei ausdrücklicher, protokollierter `HEALTH_DATA`-Einwilligung. Ohne Einwilligung
  ist das Feld im UI nicht vorhanden — auch das Freitextfeld im Buchungsablauf nicht
- Zugriff nur für Staff mit tatsächlichem Behandlungsbezug. **Jeder Lesezugriff** wird im
  `audit_log` mit `is_art9_access = true` festgehalten
- **Niemals** in Push-Notifications, E-Mails, Logs oder Fehlerberichten
- Kürzere Aufbewahrungsfrist als Termindaten, separat konfigurierbar
- Datenschutz-Folgenabschätzung (Art. 35) vor Produktivgang erforderlich

**Das Audit-Log darf nicht zum Leck werden.** `audit_log.metadata` ist ein Freiformfeld
und enthält deshalb ausschließlich Verweise — IDs, Feldnamen, Statuswerte — und niemals
alte oder neue Inhalte. Wer beim Debuggen den Klartext einer Notiz mitprotokolliert, legt
Art.-9-Daten unverschlüsselt neben die verschlüsselte Tabelle.

### 8.4.1 Aufbewahrungsfristen

Jede Datenart hat eine eigene Frist, konfiguriert in `.env`:

| Daten                                | Variable                        | Vorschlag                        |
| ------------------------------------ | ------------------------------- | -------------------------------- |
| Gesundheitsdaten (beide Felder oben) | `HEALTH_DATA_RETENTION_MONTHS`  | 24 Monate nach letztem Termin    |
| Termine (Buchhaltung)                | `APPOINTMENT_RETENTION_YEARS`   | 7 Jahre                          |
| Audit-Log, normale Einträge          | `AUDIT_LOG_RETENTION_DAYS`      | 365 Tage                         |
| Audit-Log, Art.-9-Zugriffe           | `AUDIT_LOG_ART9_RETENTION_DAYS` | 1095 Tage (Rechenschaftspflicht) |
| Anwendungs-Logs                      | —                               | 30 Tage                          |

Die Werte sind Vorschläge und gehören mit der juristischen Prüfung abgestimmt.

### 8.5 Einwilligungen und Transparenz

- Registrierung mit getrennten, nicht vorangekreuzten Checkboxen für AGB,
  Datenschutzerklärung und optional Marketing. Kein „Alles akzeptieren" in einem Zug.
- Jede Einwilligung wird mit **Version und Zeitstempel** in `consents` gespeichert.
  Ändert sich die Datenschutzerklärung, wird sie neu eingeholt.
- Push-Benachrichtigungen: Opt-in, nicht beim ersten App-Start erzwingen
- Datenschutzerklärung und Impressum in beiden Apps und der WebApp erreichbar
- Kein Tracking, keine Werbe-SDKs, kein Google Analytics. Falls Crash-Reporting gewünscht
  ist: selbstgehostetes Sentry in der EU, ohne personenbezogene Daten.

### 8.6 Organisatorisch – nicht Code, aber Teil des Projekts

- **Verarbeitungsverzeichnis** (Art. 30) anlegen
- **AV-Verträge** (Art. 28) mit Hoster, Mailversender und Push-Dienst
- Push bedeutet Datentransfer an Google (FCM) und Apple (APNs) in die USA. Konsequenz:
  Push-Inhalte enthalten **keine** Klardaten, sondern nur „Sie haben morgen einen Termin".
  Die Details lädt die App nach dem Öffnen aus dem Backend. In der Datenschutzerklärung
  ist das zu benennen.
- **Löschkonzept** mit konkreten Fristen dokumentieren
- **TOM-Dokumentation** (technische und organisatorische Maßnahmen)
- Meldeprozess für Datenpannen (72 Stunden, Art. 33)
- Empfehlung: einmalige Prüfung durch eine Datenschutzjuristin oder einen -juristen vor
  dem Livegang. Dieser Plan ersetzt keine Rechtsberatung.

### 8.7 Hosting

Server und Backups ausschließlich in der EU, etwa Hetzner (Nürnberg, Falkenstein) oder
Scaleway (Paris). Datenbank-Backups verschlüsselt, ebenfalls in der EU. Kein CDN mit
US-Ausleitung für personenbezogene Endpunkte.

---

## 9. Benachrichtigungen

| Ereignis                                 | Kanal                 | Zeitpunkt                   |
| ---------------------------------------- | --------------------- | --------------------------- |
| Registrierung                            | E-Mail                | sofort (Verifizierungslink) |
| Buchung bestätigt                        | E-Mail + Push         | sofort                      |
| Erinnerung                               | Push, Fallback E-Mail | 24 h vorher                 |
| Termin durch Studio verschoben/storniert | E-Mail + Push         | sofort                      |
| Passwort zurücksetzen                    | E-Mail                | sofort                      |
| Neue Buchung eingegangen                 | E-Mail an Staff       | sofort                      |

Umgesetzt mit BullMQ auf Redis, mit `notifications_outbox` als Transactional Outbox – so
geht keine Nachricht verloren und keine wird doppelt versendet. Retry mit exponentiellem
Backoff, Dead-Letter-Queue für dauerhaft fehlgeschlagene Zustellungen. Push-Nutzdaten
enthalten nur eine `appointment_id`, keine Klartextinhalte.

---

## 10. Clients

### 10.1 Mobile-App (React Native mit Expo)

Eine Codebasis für iOS und Android.

- Mindestversionen: iOS 16, Android 8 (API 26)
- TypeScript, Expo Router für die Navigation, TanStack Query für Datenhaltung
- API-Client mit denselben aus OpenAPI generierten Typen wie die Admin-WebApp
- Screens: Onboarding, Login/Registrierung, Serviceliste, Kosmetiker:in-Auswahl,
  Kalender mit Slot-Auswahl, Buchungsbestätigung, Meine Termine, Behandlungshistorie,
  Profil, Einstellungen
- `expo-secure-store` für Tokens – nutzt intern Keychain (iOS) bzw. Keystore (Android)
- `expo-notifications` für Push. **Wichtig:** nicht über den Expo-Push-Dienst versenden,
  der über US-Server läuft und einen zusätzlichen Auftragsverarbeiter im Drittland
  bedeuten würde. Stattdessen native Device-Tokens beziehen und direkt vom eigenen Backend
  an FCM und APNs senden.
- Builds und Store-Auslieferung über EAS Build und EAS Submit
- Lokalisierung DE/EN von Anfang an
- Barrierefreiheit: skalierbare Schrift, Screenreader-Labels, Kontrast nach WCAG AA
- Dark Mode
- Offline: zuletzt geladene Termine lokal zwischengespeichert, Buchen nur online

Plattformunterschiede, die trotz gemeinsamer Codebasis zu beachten sind: Berechtigungs-
dialoge für Push unterscheiden sich im Ablauf, Deep-Links brauchen je Plattform eigene
Konfiguration, und die Store-Anforderungen an Datenschutzangaben sind verschieden.

### 10.3 Admin-WebApp (React + TypeScript)

- Vite, React Router, TanStack Query, Tailwind mit shadcn/ui
- Kalenderkomponente (FullCalendar oder Schedule-X): Tages-, Wochen- und Monatsansicht
  sowie Ressourcenansicht mit einer Spalte je Kosmetiker:in
- Drag & Drop zum Umbuchen, mit Bestätigungsdialog
- Screens: Login mit 2FA, Dashboard, Kalender, Terminliste mit Filtern, Kundenverwaltung,
  Kosmetiker:innen-Verwaltung, Serviceverwaltung, Arbeitszeiten und Abwesenheiten,
  Statistiken, Audit-Log, DSGVO-Werkzeuge
- Rollenabhängige Navigation: `STAFF` sieht nur Kalender, eigene Zeiten, eigene Kunden
- Responsiv bis Tablet-Größe, weil an der Rezeption häufig ein iPad steht

---

## 11. Infrastruktur und Betrieb

- **Repository:** Monorepo mit den Ordnern `backend/`, `web-admin/`, `mobile/` und
  `api-contract/`. Da alles TypeScript ist, lassen sich die aus OpenAPI generierten Typen
  von Web und App gemeinsam nutzen.
- **Umgebungen:** `dev` (lokal via Docker Compose), `staging`, `production`
- **CI/CD:** GitHub Actions – Lint, Tests, Build, Migration, Deploy. Mobile-Builds und
  Store-Auslieferung über EAS Build und EAS Submit
- **Datenbankmigrationen:** Prisma Migrate oder TypeORM, versioniert im Repo
- **Monitoring:** selbstgehostetes Sentry (EU), Uptime-Check, strukturierte Logs ohne
  personenbezogene Daten, Aufbewahrung 30 Tage
- **Backups:** täglich, verschlüsselt, **30 Tage flache Vorhaltung** — also immer 30
  parallele Stände, der älteste 30 Tage alt. Bewusst **keine gestaffelte
  Langzeitaufbewahrung** (keine Wochen- oder Monatsarchive): Sie verbessert die
  Ausfallsicherheit, hält gelöschte Personen aber monatelang am Leben und schwächt damit
  die Argumentation zu Art. 17. Konsequenz: Eine gelöschte Person verschwindet spätestens
  30 Tage nach der Anonymisierung auch aus der letzten Sicherung.
  **Restore-Test einmal pro Quartal**

---

## 12. Teststrategie

| Ebene           | Umfang                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------- |
| Unit            | Slot-Berechnung, Preislogik, Rechteprüfung – hohe Abdeckung, das ist der kritische Kern            |
| Integration     | API-Endpunkte gegen eine echte PostgreSQL-Instanz (Testcontainers)                                 |
| Nebenläufigkeit | Lasttest mit 50 gleichzeitigen Buchungsversuchen auf denselben Slot – genau einer darf durchkommen |
| E2E Web         | Playwright: Registrieren → Buchen → Stornieren sowie die Admin-Flows                               |
| E2E Mobile      | Maestro oder Detox für die Hauptpfade, auf beiden Plattformen                                      |
| Zeitzonen       | Explizite Tests über die Sommerzeitumstellung (letzter Sonntag im März und Oktober)                |
| DSGVO           | Automatisiert prüfen: Export vollständig, Löschung entfernt alle Personenbezüge                    |
| Sicherheit      | OWASP-Checkliste, Penetrationstest vor dem Livegang                                                |

---

## 13. Umsetzungsreihenfolge

Die ursprüngliche Roadmap ging von einem Team aus vier Personen und einem Zeitplan über
26 Wochen aus. Da das Projekt von einer einzelnen Person umgesetzt wird, ist diese Planung
hinfällig.

**Die verbindliche Reihenfolge steht in `UMSETZUNG.md`** – 56 Schritte in elf Stufen,
jeweils mit einem prüfbaren Kriterium für Fertigstellung, ohne Zeitschätzungen.

Drei Eckpunkte daraus:

- **Das Admin-Web kommt vor der App.** Nach Schritt 26 ist das System bereits eigenständig
  nutzbar: Das Studio kann telefonisch vereinbarte Termine digital verwalten, noch bevor
  die App existiert.
- **Die Slot-Berechnung (Schritt 21) ist der Engpass.** Alles Weitere baut darauf auf.
- **Die Behandlungsnotizen (Stufe 9) kommen bewusst spät**, nach dem funktionierenden
  Buchungskern.

---

## 14. Risiken

| Risiko                                                                                       | Auswirkung          | Gegenmaßnahme                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------- |
| Doppelbuchungen bei gleichzeitigen Anfragen                                                  | hoch                | DB-Exclusion-Constraint plus Nebenläufigkeitstests ab Phase 3                     |
| Zeitzonen- und Sommerzeitfehler                                                              | hoch                | konsequent `timestamptz` in UTC, dedizierte Tests                                 |
| Art.-9-Daten falsch behandelt                                                                | sehr hoch (Bußgeld) | eigene Phase, Verschlüsselung, DSFA, Rechtsprüfung                                |
| App-Store-Ablehnung wegen Datenschutzangaben                                                 | mittel              | Privacy Labels früh vorbereiten, nicht erst in Phase 7                            |
| Plattformunterschiede trotz gemeinsamer Codebasis (Push-Dialoge, Deep-Links, Store-Vorgaben) | niedrig             | auf beiden Plattformen auf echten Geräten testen, nicht nur im Simulator          |
| No-Shows trotz Erinnerung                                                                    | mittel              | später optional Anzahlung über Stripe – bewusst nicht im MVP                      |
| Studio ändert Arbeitszeiten kurzfristig                                                      | niedrig             | Abwesenheiten jederzeit pflegbar, betroffene Kunden werden automatisch informiert |

---

## 15. Bewusst nicht im MVP

Für spätere Versionen vorgemerkt: Online-Zahlung und Anzahlung (Stripe), Gutscheine,
Treuepunkte, Bewertungen, Warteliste bei ausgebuchten Slots, mehrere Standorte,
Kalender-Sync (iCal/Google), SMS-Erinnerungen, Serientermine, Statistik-Export für die
Buchhaltung.

---

## 16. Offene Punkte zur Klärung mit dem Studio

1. Zeitzone und Standort – der Plan nimmt `Europe/Vienna` und einen Standort an
2. Anzahl der Kosmetiker:innen und Dienstleistungen zum Start
3. Storno-Frist in Stunden, und ob eine Storno-Gebühr erhoben werden soll
4. Werden Buchungen automatisch bestätigt oder erst nach Freigabe durch das Studio?
   Der Plan geht von automatischer Bestätigung aus, der Status `PENDING` ist aber
   vorgesehen
5. Vorlaufzeit für kurzfristige Buchungen und maximaler Buchungshorizont
6. Gibt es bestehende Kundendaten, die migriert werden müssen?
7. Wer ist die verantwortliche Stelle im Sinne der DSGVO, und gibt es eine
   Datenschutzbeauftragte oder einen Datenschutzbeauftragten?
8. Apple Developer Account und Google Play Developer Account – vorhanden oder anzulegen?
