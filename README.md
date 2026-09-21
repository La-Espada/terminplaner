# Terminplaner Kosmetikstudio

Terminbuchungssystem für ein Kosmetikstudio: Kundinnen und Kunden buchen per App,
das Studio verwaltet Termine, Personal und Leistungen über eine Web-Oberfläche.

## Aufbau

Monorepo mit npm-Workspaces:

| Ordner          | Inhalt                                                            |
| --------------- | ----------------------------------------------------------------- |
| `backend/`      | NestJS-API, PostgreSQL, Redis — die einzige Quelle der Wahrheit   |
| `web-admin/`    | React-Oberfläche für Studioleitung und Kosmetiker:innen           |
| `mobile/`       | React Native mit Expo, eine Codebasis für iOS und Android         |
| `api-contract/` | OpenAPI-Spezifikation und die daraus generierten TypeScript-Typen |
| `docs/`         | Plan, Umsetzungsreihenfolge, Datenmodell                          |

Alles TypeScript. Die generierten Typen aus `api-contract/` werden von `web-admin/` und
`mobile/` gemeinsam genutzt — deshalb Monorepo.

## Dokumentation

| Datei                                            | Inhalt                                                               |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| [docs/ENTSCHEIDUNGEN.md](docs/ENTSCHEIDUNGEN.md) | **Warum** etwas so ist, wie es ist. 21 Entscheidungen mit Begründung |
| [docs/PLAN.md](docs/PLAN.md)                     | **Was** gebaut wird: Rollen, Architektur, Datenmodell, API, DSGVO    |
| [docs/UMSETZUNG.md](docs/UMSETZUNG.md)           | **In welcher Reihenfolge**: 56 Schritte in elf Stufen                |
| [docs/CHECKLISTE.md](docs/CHECKLISTE.md)         | **Was noch offen ist** außerhalb des Codes: Recht, Verträge, Konten  |
| [FORTSCHRITT.md](FORTSCHRITT.md)                 | **Wo wir stehen**: erledigte Schritte, nächster dran                 |
| [docs/DESIGN.md](docs/DESIGN.md)                 | Farben, Schrift, Formen — abgeleitet von der Website des Studios     |
| [docs/datenmodell.puml](docs/datenmodell.puml)   | ERD als PlantUML                                                     |
| [docs/HANDOFF.md](docs/HANDOFF.md)               | Kontext-Übergabe für neue Arbeitssitzungen                           |

> Wenn du nach einer längeren Pause wieder einsteigst: `FORTSCHRITT.md` sagt dir, wo du
> warst. `ENTSCHEIDUNGEN.md` sagt dir, warum du etwas so gebaut hast.

## Entwicklung starten

Voraussetzungen: Node 22+, Docker Desktop.

```bash
cp .env.example .env
npm install
npm run db:up
```

Danach laufen:

- PostgreSQL auf `127.0.0.1:5433`
- Redis auf `localhost:6379`
- Mailpit auf http://localhost:8025 — fängt alle Mails ab, es wird lokal nichts echt versendet

> **Warum 5433 und nicht 5432?** Auf dem Entwicklungsrechner belegt eine native
> PostgreSQL-Installation bereits 5432. Und warum `127.0.0.1` statt `localhost`? Unter
> Windows löst `localhost` zuerst auf IPv6 auf, Docker veröffentlicht Ports aber auf IPv4.
> Beides steht ausführlicher in `docs/ENTSCHEIDUNGEN.md` unter E-24.

Backend starten:

```bash
npm run build --workspace @terminplaner/backend
npm run start --workspace @terminplaner/backend
```

Prüfen: http://127.0.0.1:3000/api/v1/health sollte `{"status":"ok", ... "database":"up"}`
liefern.

## Befehle

| Befehl              | Wirkung                                                   |
| ------------------- | --------------------------------------------------------- |
| `npm run db:up`     | Datenbank, Redis und Mailpit starten                      |
| `npm run db:down`   | Container stoppen                                         |
| `npm run db:reset`  | Container stoppen **und Daten löschen**, dann neu starten |
| `npm run lint`      | Linter über alle Workspaces                               |
| `npm run format`    | Prettier über alles                                       |
| `npm run typecheck` | TypeScript-Prüfung in allen Workspaces                    |
| `npm test`          | Tests in allen Workspaces                                 |

## Grundregeln

- **Zeitstempel immer `timestamptz` in UTC.** Die Studio-Zeitzone steht in
  `STUDIO_TIMEZONE` und wird nur zur Anzeige und Berechnung verwendet.
- **Geschäftslogik ausschließlich im Backend.** Kein Client berechnet Slots, Preise oder
  Rechte — Clients zeigen nur an, was die API liefert.
- **Keine Geheimnisse im Repository.** `.env` ist ignoriert, `.env.example` ist die Vorlage.
- **Gesundheitsdaten (Behandlungsnotizen) sind besonders geschützt.** Verschlüsselt,
  zugriffsprotokolliert, niemals in Logs, Mails oder Push-Nachrichten. Siehe
  `docs/PLAN.md`, Abschnitt 8.4.
