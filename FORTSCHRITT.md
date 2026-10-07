# Fortschritt

Kurzes Arbeitsprotokoll. Nach jeder Sitzung eine Zeile: was fertig ist, was als Nächstes
dran ist. Die Schrittnummern beziehen sich auf [docs/UMSETZUNG.md](docs/UMSETZUNG.md).

---

## Erledigt

### Stufe 1 — Fundament

- [x] **1. Monorepo angelegt** — npm-Workspaces mit `backend/`, `web-admin/`, `mobile/`,
      `api-contract/`, dazu `docs/`. ESLint 10 mit typescript-eslint, Prettier,
      `.editorconfig`, `.gitattributes` (LF überall), Husky-Pre-Commit mit lint-staged.
      `.gitignore` deckt `.env`, `node_modules` und Schlüsseldateien ab — geprüft, dass
      sie nicht in `git status` auftauchen.
- [x] **2. Lokale Infrastruktur** — `docker-compose.yml` mit PostgreSQL 17, Redis 7,
      Mailpit. Alle drei laufen und antworten.
- [x] **3. NestJS-Skelett** — Backend mit Prisma 7, Konfiguration über Umgebungsvariablen
      mit Joi-Validierung beim Start, Health-Endpoint. `GET /api/v1/health` liefert
      `{"status":"ok","checks":{"database":"up"}}`.
- [x] **4. Datenbankschema** — alle 13 Tabellen und 7 Enums als Prisma-Migration
      `20260920202513_init_schema`. Modelle in TypeScript-Schreibweise, Tabellen und
      Spalten per `@map` in snake_case.
- [x] **5. Überschneidungsschutz** — Exclusion-Constraint `appointments_no_overlap` als
      von Hand geschriebene Migration `20260920210224_appointment_overlap_constraint`.
      Dazu acht CHECK-Constraints gegen unsinnige Werte (Ende vor Beginn, negative
      Preise, Wochentag ausserhalb 0–6).
- [x] **6. Nebenläufigkeitstest** — Vitest ins Projekt geholt, mit SWC für
      Decorator-Metadaten. 50 gleichzeitige Einfügungen auf denselben Slot, genau eine
      kommt durch. Schutzschalter bricht ab, sobald `DATABASE_URL` nicht lokal ist.
- [x] **7. CI-Pipeline** — GitHub Actions in zwei Stufen: erst Lint, Format und Typen
      ohne Datenbank, dann Migrationen und Tests gegen frisch hochgefahrenes PostgreSQL
      und Redis. `prisma migrate deploy` läuft dabei gegen eine **leere** Datenbank —
      lokal ist sie durch viele Läufe gewandert und würde einen kaputten Migrationspfad
      nicht auffallen lassen.

**Stufe 1 ist damit abgeschlossen.**

### Stufe 2 — Authentifizierung

- [x] **8. Registrierung** — Argon2id mit OWASP-Parametern, E-Mail-Verifizierung über
      Einmal-Token, Einwilligungen mit Version protokolliert. Der Endpunkt verrät nicht,
      ob eine Adresse bereits vergeben ist.
- [x] **9. Login und Token** — JWT 15 Minuten, Refresh 30 Tage mit Rotation und
      Diebstahlerkennung. Falsches Passwort und unbekannte Adresse sind nicht
      unterscheidbar. Refresh-Token als httpOnly-Cookie fürs Web, im Rumpf für die App.
- [x] **Admin-Konto** — `npm run seed:admin --workspace @terminplaner/backend`. Das erste
      Konto lässt sich nicht über die Registrierung erzeugen, dort wird jeder zur Kundin.
- [x] **10. Rollen und Rechte** — `JwtAuthGuard` global, Endpunkte damit
      standardmäßig geschützt. `RollenGuard` für die grobe Stufe, `ZugriffService` für
      die objektbezogene: Eine Kosmetikerin kommt nicht an die Termine und Hautbefunde
      einer Kollegin, obwohl beide Rolle `STAFF` haben.
- [x] **11. Einwilligungen** — `GET` und `PATCH /me/consents`. Die Tabelle ist ein
      Protokoll, kein Zustand: Ein Widerruf löscht nichts, sondern hängt eine Zeile an.
      Pflicht-Einwilligungen (AGB, Datenschutz) lassen sich nicht einzeln widerrufen —
      das wäre eine Kontolöschung. Veraltete Textfassungen gelten nicht mehr als erteilt.
- [x] **12. Passwort zurücksetzen** — Link per Mail, 60 Minuten gültig, wirkt genau
      einmal. Das Zurücksetzen entwertet **alle** Sitzungen und benachrichtigt die
      bekannte Adresse. Der Endpunkt verrät nicht, ob eine Adresse bekannt ist.
- [x] **13. Rate Limiting** — Zähler in Redis, nach IP **und** Konto. Fünf
      Anmeldeversuche je 15 Minuten, drei mailauslösende Anfragen je Stunde. Fällt Redis
      aus, wird durchgelassen statt abgewiesen — sonst stünde die Anmeldung still.

**Stufe 2 ist damit abgeschlossen.**

### Stufe 3 — Admin-Web, Grundgerüst

- [x] **14. React-Projekt** — Vite, React Router, TanStack Query, Tailwind 4 mit den
      Design-Tokens aus `docs/DESIGN.md`. shadcn/ui bewusst zurückgestellt, siehe E-29.
- [x] **15. Geschütztes Routing** — Nicht angemeldet führt zur Anmeldung, **mit dem Ziel
      im Gepäck**: Nach dem Anmelden geht es dort weiter, wo man hinwollte.
- [x] **16. Layout und Navigation** — Seitenleiste mit rollenabhängigem Menü, auf
      Tablets einklappbar. Noch nicht gebaute Bereiche werden ausgegraut gezeigt statt
      versteckt, damit ersichtlich ist, was geplant ist.

Am laufenden System geprüft:

| Prüfung                         | Ergebnis                                 |
| ------------------------------- | ---------------------------------------- |
| `/kalender` ohne Anmeldung      | führt zur Anmeldung, Ziel wird gemerkt   |
| nach dem Anmelden               | landet in `/kalender`, nicht auf `/`     |
| Menü als Studioleitung          | neun Punkte                              |
| Menü als Kosmetiker:in          | fünf — ohne Leistungen, Team, Auswertung |
| `/leistungen` als Kosmetiker:in | leitet auf die Startseite um             |
| Begrüßungstext                  | passt sich der Rolle an                  |

**Stufe 3 ist damit abgeschlossen.**

### Stufe 4 — Stammdaten

- [x] **17. Dienstleistungen** — Verwaltung im Admin-Web, öffentliche Liste für die App.
      Löschen nur, solange nie gebucht; danach deaktivieren, damit die Termingeschichte
      lesbar bleibt. Preise durchgängig als ganzzahlige Cent, die Oberfläche rechnet um.
- [x] **18. Kosmetiker:innen** — anlegen, bearbeiten, deaktivieren unter `/team`.
      **Die Studioleitung vergibt kein Passwort** (E-30): Das Konto wird per Mail
      eingeladen, die Kosmetiker:in setzt ihr Passwort selbst über `/einladung`. Dadurch
      bleibt nachvollziehbar, wer in der Dokumentation gehandelt hat. Deaktivieren sperrt
      die Anmeldung und beendet laufende Sitzungen sofort; gelöscht werden kann nur, wer
      nie einen Termin hatte.
- [x] **19. Leistungszuordnung** — Matrix unter `/leistungen/zuordnung`: Zeilen sind
      Leistungen, Spalten Kosmetiker:innen, ein Haken ist eine Zuordnung. Als Raster, weil
      man hier nach **Lücken** sucht; in zwei Detailansichten findet man die nie. Eine
      Leistung, die niemand anbietet, erscheint in der App nicht mehr (E-31) — und die
      Verwaltung sagt, warum.

Zum Ausprobieren: Das Admin-Konto legt der Seed an, es verschwindet bei jedem Testlauf und
wird so wiederhergestellt:

```
ADMIN_PASSWORD=dermazentrum-start-2026 npm run seed:admin --workspace @terminplaner/backend
```

Ein Konto zum Testen der Rolle `STAFF` steht **nicht** im Seed, und das soll so bleiben —
es würde genau den Weg umgehen, den Schritt 18 eingeführt hat. Stattdessen unter `/team`
eine Kosmetiker:in anlegen, die Einladung in Mailpit (http://localhost:8025) öffnen und das
Passwort dort vergeben. Das dauert eine halbe Minute und prüft nebenbei, dass der ganze Weg
noch funktioniert.

- [x] **Admin-Web mit Anmeldung** — Vite und React, Design-Tokens aus `docs/DESIGN.md`,
      Poppins lokal. Der Access-Token liegt nur im Speicher; nach dem Neuladen wird die
      Sitzung über das Cookie fortgesetzt. (Vorgezogen aus Stufe 3.)

Dabei kam eine Lücke im Datenmodell ans Licht: Es gab `users.emailVerifiedAt`, aber
keinen Ort für den Token selbst. Neue Tabelle `auth_tokens`, Migration
`20260921213958_auth_tokens`. Gespeichert wird nur der SHA-256-Hash.

Geprüfter Stand der Infrastruktur:

| Dienst     | Stand                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| PostgreSQL | 17.11 auf `127.0.0.1:5433`, Zeitzone UTC (5433, siehe E-24)               |
| Extensions | `btree_gist` 1.7 und `citext` 1.6 verfügbar — Voraussetzung für Schritt 5 |
| Redis      | 7 auf `:6379`, antwortet mit `PONG`                                       |
| Mailpit    | erreichbar auf http://localhost:8025                                      |
| API        | `GET /api/v1/health` → `200`, Datenbankverbindung steht                   |

Nach Schritt 4 gegen die laufende Datenbank geprüft:

| Prüfung               | Ergebnis                                                  |
| --------------------- | --------------------------------------------------------- |
| Tabellen              | 13 plus `_prisma_migrations`                              |
| Enums                 | 7, mit den erwarteten Werten                              |
| Extensions            | `citext` 1.6 und `btree_gist` 1.7 aktiv                   |
| `users.email`         | tatsächlich `citext` — Groß-/Kleinschreibung kollidiert   |
| Zeitstempel           | `timestamptz`, UTC rein und exakt wieder heraus           |
| Preis-Snapshot        | Preisänderung am Service lässt gebuchten Termin unberührt |
| Verschlüsselte Felder | `Bytes` laufen unverändert hin und zurück                 |
| `time_off` studioweit | `staff_id = NULL` funktioniert                            |

Verhalten des Überschneidungsschutzes, gegen die Datenbank geprüft:

| Fall                                    | Verhalten   |
| --------------------------------------- | ----------- |
| Überlappung 09:30–10:30 auf 09:00–10:00 | abgelehnt   |
| Überlappung von vorne 08:30–09:30       | abgelehnt   |
| vollständig enthalten 09:15–09:45       | abgelehnt   |
| **Anschlusstermin 10:00–11:00**         | **erlaubt** |
| **gleiche Zeit, andere Kosmetiker:in**  | **erlaubt** |
| **nach Storno derselbe Slot**           | **erlaubt** |
| rückwärts laufend 15:00–14:00           | abgelehnt   |
| ohne Dauer 16:00–16:00                  | abgelehnt   |

Die drei erlaubten Fälle sind genauso wichtig wie die abgelehnten — ein zu strenger
Constraint würde den Kalender unbenutzbar machen.

Testlauf (`npm test --workspace @terminplaner/backend`):

| Test                                                 | Ergebnis          |
| ---------------------------------------------------- | ----------------- |
| 50 gleichzeitige Einfügungen, genau eine kommt durch | grün              |
| gleichzeitig bei verschiedenen Kosmetiker:innen      | grün              |
| Buchungsdienst (Schritt 22)                          | erwarteter Fehler |

Der dritte Test ist als erwarteter Fehlschlag markiert. Sobald der Buchungsdienst
existiert, schlägt er _unerwartet ins Grüne_ um und bricht den Testlauf — genau dann,
wenn die echten Zusicherungen geschrieben werden müssen.

## Als Nächstes

**Stufe 2 — Authentifizierung.** Reine Backend-Arbeit, getestet mit einem HTTP-Client.

Noch offen aus Schritt 7: **Branch-Schutz auf GitHub** einrichten, damit ein roter
Durchlauf den Merge tatsächlich blockiert. Das geht nur in den Repository-Einstellungen,
nicht aus dem Code heraus.

## Offen, blockiert nichts sofort

- Docker Desktop startet auf diesem Rechner nicht von selbst. Vor dem nächsten Testlauf:
  in einer Administrator-cmd `net start com.docker.service`, dann Docker Desktop starten.
- Die alten Repos `terminplaner-backend`, `terminplaner-web-admin`, `terminplaner-mobile`
  und `terminplaner-api-contract` existieren noch auf GitHub und werden nicht gebraucht.
- `npm audit` meldet vier Einträge mit hoher Einstufung, alle am `prisma`-CLI und damit
  reine Entwicklungsabhängigkeit. Bewusst akzeptiert, Begründung in E-23.

## Stolpersteine, die schon geklärt sind

Damit sie nicht zweimal Zeit kosten — ausführlich in `docs/ENTSCHEIDUNGEN.md`:

- **Nest-CLI ist unter Node 22 defekt** (`ERR_REQUIRE_CYCLE_MODULE`). Entfernt, Build
  läuft mit reinem `tsc`. Siehe E-22.
- **PostgreSQL läuft auf 5433**, weil eine native Installation 5432 belegt. Und
  `127.0.0.1` statt `localhost`, weil Windows sonst auf IPv6 auflöst. Siehe E-24.
- **Docker Desktop braucht Adminrechte** zum Start: in einer Administrator-cmd
  `net start com.docker.service`, dann Docker Desktop normal starten.
- **Grenzen in Tests nicht über Umgebungsvariablen setzen.** Zwischen `test/setup.ts`
  und der Testdatei ist die Reihenfolge nicht verlässlich. Wer eigene Grenzen braucht,
  überschreibt den Options-Provider im Testmodul — siehe `anfragebegrenzung.spec.ts`.
- **Tests leeren die Datenbank.** `truncateAll` räumt alle Tabellen ab, also auch das
  Admin-Konto. Nach jedem Testlauf neu anlegen:
  `ADMIN_PASSWORD=... npm run seed:admin --workspace @terminplaner/backend`
- **Niemals `taskkill /IM node.exe`** — Docker Desktop läuft selbst auf Node und wird
  dabei mit beendet. Prozesse gezielt über ihre PID beenden.

## Zu klären mit dem Studio

Die drei Buchungsregeln stehen als Standardwerte in `.env.example` und werden beim Start
validiert. Sie blockieren nichts mehr, müssen aber vor Schritt 21 belastbar beantwortet
sein:

- Storno-Frist in Stunden (`CANCELLATION_DEADLINE_HOURS`, aktuell 24)
- Automatische Bestätigung oder Freigabe? (`AUTO_CONFIRM_BOOKINGS`, aktuell `true`)
- Vorlaufzeit und Buchungshorizont (`BOOKING_LEAD_TIME_MINUTES` 120,
  `BOOKING_HORIZON_DAYS` 90)

Ebenfalls offen, wird vor Schritt 34 gebraucht: Apple- und Google-Developer-Account.
Die vollständige Liste steht in [docs/CHECKLISTE.md](docs/CHECKLISTE.md).
