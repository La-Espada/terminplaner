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

- [ ] **8. Registrierung** — `users` anlegen, Argon2id, E-Mail-Verifizierung über Mailpit
- [ ] **9. Login und Token** — JWT 15 min, Refresh 30 Tage mit Rotation
- [ ] **10. Rollen und Rechte** — Guards plus objektbezogene Prüfung
- [ ] **11. Einwilligungen** — mit Version und Zeitstempel
- [ ] **12. Passwort zurücksetzen**
- [ ] **13. Rate Limiting**

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
