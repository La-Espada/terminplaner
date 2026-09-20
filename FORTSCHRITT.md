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

Geprüfter Stand der Infrastruktur:

| Dienst     | Stand                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| PostgreSQL | 17.11 auf `127.0.0.1:5433`, Zeitzone UTC (5433, siehe E-24)               |
| Extensions | `btree_gist` 1.7 und `citext` 1.6 verfügbar — Voraussetzung für Schritt 5 |
| Redis      | 7 auf `:6379`, antwortet mit `PONG`                                       |
| Mailpit    | erreichbar auf http://localhost:8025                                      |
| API        | `GET /api/v1/health` → `200`, Datenbankverbindung steht                   |

## Als Nächstes

- [ ] **4. Datenbankschema** — alle 13 Tabellen aus `docs/datenmodell.puml` als
      Prisma-Migration. `prisma/schema.prisma` enthält bisher nur Datasource und
      Generator, noch keine Modelle.
      _Fertig, wenn:_ Migration läuft auf leerer Datenbank durch, `\dt` zeigt alle Tabellen.
- [ ] **5. Überschneidungsschutz** — `btree_gist` aktivieren, Exclusion-Constraint auf
      `appointments`. Braucht in Prisma eine manuell ergänzte Migration, weil Prisma
      Exclusion-Constraints nicht selbst erzeugt.
- [ ] **6. Nebenläufigkeitstest schreiben** — bleibt absichtlich rot bis Schritt 22.
      Dabei kommt auch das Testframework ins Projekt, bisher gibt es keins.
- [ ] **7. CI-Pipeline** — GitHub Actions: Lint, Test, Build, Migration.

## Offen, blockiert nichts sofort

- Seit dem letzten Commit (`5d8fb9a`) ist einiges dazugekommen: das ganze `backend/` und
  die Dokumentationsänderungen. Noch nicht committet.
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
