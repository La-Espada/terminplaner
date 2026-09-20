# Fortschritt

Kurzes Arbeitsprotokoll. Nach jeder Sitzung eine Zeile: was fertig ist, was als Nächstes
dran ist. Die Schrittnummern beziehen sich auf [docs/UMSETZUNG.md](docs/UMSETZUNG.md).

---

## Erledigt

### Stufe 1 — Fundament

- [x] **1. Monorepo angelegt** — npm-Workspaces mit `backend/`, `web-admin/`, `mobile/`,
      `api-contract/`, dazu `docs/`. ESLint 10.11 mit typescript-eslint, Prettier,
      `.editorconfig`, Husky-Pre-Commit mit lint-staged. `.gitignore` deckt `.env`,
      `node_modules` und Schlüsseldateien ab — geprüft, dass sie nicht in `git status`
      auftauchen.
- [x] **2. Lokale Infrastruktur** — `docker-compose.yml` mit PostgreSQL 17, Redis 7 und
      Mailpit. Alle drei laufen und antworten.

Geprüft in Schritt 2:

| Dienst     | Stand                                                                     |
| ---------- | ------------------------------------------------------------------------- |
| PostgreSQL | 17.11 auf `:5432`, Zeitzone UTC                                           |
| Extensions | `btree_gist` 1.7 und `citext` 1.6 verfügbar — Voraussetzung für Schritt 5 |
| Redis      | 7 auf `:6379`, antwortet mit `PONG`                                       |
| Mailpit    | erreichbar auf http://localhost:8025                                      |

## Als Nächstes

- [ ] **3. NestJS-Skelett** — Projekt in `backend/`, Prisma anbinden, Konfiguration über
      Umgebungsvariablen, Health-Endpoint.
      _Fertig, wenn:_ `GET /api/v1/health` mit `200` antwortet.
- [ ] **4. Datenbankschema** — alle 13 Tabellen aus `docs/datenmodell.puml` als Migration.
- [ ] **5. Überschneidungsschutz** — `btree_gist` aktivieren, Exclusion-Constraint auf
      `appointments`.
- [ ] **6. Nebenläufigkeitstest schreiben** — bleibt absichtlich rot bis Schritt 22.
- [ ] **7. CI-Pipeline** — GitHub Actions: Lint, Test, Build, Migration.

## Offen, blockiert nichts sofort

Noch nicht committet — das Repo `La-Espada/terminplaner` hat bisher keinen Commit.

Die alten Repos `terminplaner-backend`, `terminplaner-web-admin`, `terminplaner-mobile`
und `terminplaner-api-contract` existieren noch auf GitHub und werden nicht mehr gebraucht.

## Zu klären mit dem Studio

Die drei Buchungsregeln stehen vorerst als Standardwerte in `.env.example` und sind
kommentiert. Sie blockieren den Baufortschritt damit nicht mehr, müssen aber vor Schritt 21
(Slot-Berechnung) belastbar beantwortet sein:

- Storno-Frist in Stunden (`CANCELLATION_DEADLINE_HOURS`, aktuell 24)
- Automatische Bestätigung oder Freigabe durch das Studio? (`AUTO_CONFIRM_BOOKINGS`,
  aktuell `true`)
- Vorlaufzeit und Buchungshorizont (`BOOKING_LEAD_TIME_MINUTES` 120,
  `BOOKING_HORIZON_DAYS` 90)

Ebenfalls offen, wird vor Schritt 34 gebraucht: Apple- und Google-Developer-Account.
