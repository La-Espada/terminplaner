# Fortschritt

Arbeitsprotokoll. Nach jeder Sitzung: was fertig ist, was als Nächstes dran ist. Die
Schrittnummern beziehen sich auf [docs/UMSETZUNG.md](docs/UMSETZUNG.md).

**Stand 2026-10-08: Schritt 1 bis 26 fertig, Meilenstein B erreicht, 332 Tests grün.**
Der Überblick steht unter [Wo das Projekt steht](#wo-das-projekt-steht), der Einstieg nach
einer Pause unter [Wieder einsteigen](#wieder-einsteigen).

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
- [x] **20. Arbeitszeiten und Abwesenheiten** — Regelwoche je Person unter
      `/arbeitszeiten`, Abwesenheiten unter `/arbeitszeiten/abwesenheiten`. Eine
      Mittagspause sind zwei Zeilen, ein Feiertag ein Eintrag für alle. Überschneidungen
      am selben Tag werden abgelehnt — ein doppelter Slot ist eine Doppelbuchung in spe.
      Keine eigenen Studio-Öffnungszeiten (E-32).
- [x] **Zeitzonenrechnung** als eigenes Fundament (`src/zeit/zeitzone.ts`). Der Versatz wird
      **pro Zeitpunkt** bestimmt, nie einmal für einen Zeitraum: Der 25. Oktober 2026 hat in
      Wien 25 Stunden, der 29. März 23. Beide Umstellungstage sind als Test festgehalten,
      samt der Ortszeit, die es nicht gibt, und der, die es zweimal gibt. Schritt 21 baut
      darauf auf.

> **Meilenstein A erreicht:** Das Studio kann sich vollständig selbst konfigurieren —
> Leistungen, Team, wer was anbietet, Arbeitszeiten und Abwesenheiten.

### Stufe 5 — Buchung

- [x] **21. Slot-Berechnung** — `GET /availability`. Der Engpass des Projekts, deshalb
      zuerst der Testfallkatalog ([SLOT-TESTFAELLE.md](docs/SLOT-TESTFAELLE.md)), dann der
      Code. Alle sechs Pflichtfälle plus sieben ergänzende sind als Test festgehalten,
      darunter beide Umstellungstage. Die strittigen Festlegungen stehen in E-33.
      Die Intervallarithmetik liegt als reine Funktionen in `src/zeit/intervalle.ts` —
      Fehler darin verstecken sich sonst hinter Zeitzonen und Datenbankabfragen.

**Noch nicht gebaut, bewusst:** Das Zwischenspeichern der Slots in Redis (PLAN.md 5.1).
Ein Cache ohne die Stelle, die ihn verwirft, liefert veraltete Slots — und eine Buchung
auf einen veralteten Slot endet in `409`, der Client lädt neu und sieht denselben Slot
wieder. Das Verwerfen gehört zur Buchung, also kommt beides zusammen in Schritt 22.

- [x] **22. Buchen** — `POST /appointments`. Der Server rechnet, der Client schlägt vor:
      Ende und Preis bestimmt ausschließlich der Server, die Kundin kommt aus der Sitzung.
      Geprüft wird zweistufig — steht der Beginn in der Slot-Liste (dieselbe Funktion, die
      auch die Liste liefert, keine zweite Wahrheit), und ist er im Augenblick des
      Einfügens noch frei (das kann nur die Datenbank beantworten).
      **Der absichtlich rote Test aus Schritt 6 ist grün** und trägt jetzt die
      Zusicherungen, die er verlangt hat: von 50 gleichzeitigen Buchungen genau eine
      erfolgreich, 49 mit `409` statt `500`.
- [x] **23. Stornieren und Verschieben** — Die Kundin sagt bis zur Frist ab und ohne
      Grund, das Studio jederzeit und mit Pflichtgrund. Verschoben wird **in derselben
      Zeile**, nicht als Absage plus Neubuchung — sonst stünde im Konto der Kundin eine
      Absage, die sie nie gemacht hat, und der Preisschnappschuss (E-09) wäre hinfällig.
      Dabei fällt der Termin beim Prüfen der neuen Zeit aus der Rechnung, sonst
      blockierte er sich beim Verschieben um eine Viertelstunde selbst.
      Der Absagegrund ist jetzt eine Kategorie statt Freitext (E-35) — das war eine
      Art.-9-Lücke im Schema seit dem ersten Tag.
- [x] **Zugriffsprotokoll** als eigener Dienst. Schreibt jede Änderung an einem Termin
      mit, hält aber niemals den Vorgang auf: Eine Lücke im Protokoll ist der kleinere
      Schaden als ein Studio, das wegen einer vollen Festplatte nicht mehr arbeiten kann.
- [x] **24. Nachbereitungsjob** — nächtlich um drei, vergangene bestätigte Termine auf
      `COMPLETED`. Er fässt bewusst nichts anderes an: `NO_SHOW` stellt ein Mensch fest,
      und ein unbestätigter Termin hat nicht stattgefunden. Mehrfaches Ausführen ändert
      nichts.

**Stufe 5 ist damit abgeschlossen.** Das System kann buchen, absagen, verschieben und
nachbereiten — vollständig über die API. Was fehlt, ist die Oberfläche dafür.

Zum Ausprobieren siehe „Wieder einsteigen“ weiter unten.

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

| Test                                                 | Ergebnis |
| ---------------------------------------------------- | -------- |
| 50 gleichzeitige Einfügungen, genau eine kommt durch | grün     |
| gleichzeitig bei verschiedenen Kosmetiker:innen      | grün     |
| dasselbe über den Buchungsdienst, 49-mal `409`       | grün     |

Der dritte stand bis Schritt 22 als _absichtlich roter_ Platzhalter hier und erinnerte bei
jedem Testlauf daran, was noch fehlt. Seit Schritt 22 trägt er die Zusicherungen, die er
verlangt hat.

### Stufe 6 — Admin-Kalender

- [x] **25. Kalenderansicht** — Tag, Woche, Monat unter `/kalender`. Die Tagesansicht ist
      die eigentliche Arbeitsansicht: eine Spalte je Kosmetiker:in, denn die Frage am
      Telefon lautet „wer ist wann frei". Der Monat zeigt bewusst keine Uhrzeiten, sondern
      Anzahlen — bei 30 Tagen wäre jede Kachel zu klein zum Lesen, und die Frage im Monat
      ist „wie voll ist es".

      Arbeitszeiten und Abwesenheiten liegen als Hintergrund im Raster. Ohne sie sieht
      ein leerer Kalender am Feiertag genauso aus wie an einem vollen Arbeitstag, an dem
      nur nichts gebucht ist. Die Aufräumzeit erscheint als eigener, schwächerer Streifen
      nach dem Termin — sie blockiert den Kalender, aber die Kundin hat sie nicht gebucht.

      **`STAFF` sieht nur sich selbst**, und zwar schon in der Abfrage: Der Filterwunsch
      des Clients kann nur weiter einschränken, nie erweitern. Fragt Anna nach Beas
      Spalte, bekommt sie ihre eigene.

      Die ganze Zeitrechnung der Oberfläche läuft über `Intl` in der Studio-Zeitzone, nicht
      über `getHours()`. Wer den Kalender aus dem Urlaub aufruft, soll trotzdem die Wiener
      Wanduhr sehen.

- [x] **26. Termine verwalten** — Umbuchen per Maus mit Rückfrage, absagen mit
      Kategorie, „nicht erschienen" vermerken und wieder zurücknehmen, Termin am Telefon
      anlegen.

      Gezogen wird nur innerhalb derselben Spalte: Die Person zu wechseln ist eine andere
      Entscheidung als die Zeit zu wechseln und kann an der Leistungszuordnung scheitern.
      Die Rückfrage vor dem Verschieben ist keine Zeremonie — ein Griff daneben
      verschiebt den Termin einer Kundin, die darauf wartet.

      Weil Ziehen mit der Tastatur nicht geht, steht in der Terminkarte zusätzlich ein
      Feld für Datum und Uhrzeit. Dieselbe Prüfung, derselbe Weg.

      „Nicht erschienen" geht erst, wenn der Termin vorbei ist — vorher wäre es eine
      Behauptung über die Zukunft — und nicht bei abgesagten Terminen: Wer absagt,
      erscheint nicht unentschuldigt.

      Die Kundensuche für die Telefonbuchung ist **Suche, keine Liste**: mindestens drei
      Zeichen, höchstens zehn Treffer, kein Personal. Eine durchblätterbare Kundenliste
      wäre ein Verzeichnis aller Patientinnen der Praxis, abrufbar von jedem angemeldeten
      Gerät. Die Vollliste kommt in Schritt 48 — dann mit Protokollierung.

      Beim Buchen am Telefon gilt die Vorlaufzeit nicht. Sie schützt davor, dass jemand
      für in zehn Minuten bucht, ohne dass das Studio davon weiß; ruft die Kundin an und
      das Studio sagt ja, ist genau diese Entscheidung gefallen. Protokolliert wird dabei,
      **wer gehandelt hat** — sonst stünde im Protokoll, die Kundin habe selbst gebucht.

> ### Meilenstein B erreicht — erster ausrollbarer Stand
>
> Ab hier kann das Studio das System produktiv nutzen: Termine am Telefon annehmen,
> digital führen, verschieben, absagen. Die Kundschaft braucht dafür noch nichts — die
> App kommt in Stufe 7. `UMSETZUNG.md` nennt das den wichtigsten Punkt der ganzen
> Reihenfolge: Wenn das Projekt hier stillstünde, hätte das Studio trotzdem ein
> funktionierendes Terminbuch.

## Wo das Projekt steht

**26 von 56 Schritten, Stufe 1 bis 6 abgeschlossen, Meilenstein B erreicht.**
332 Tests grün, kein erwarteter Fehlschlag mehr offen.

| Stufe                         | Schritte | Stand                          |
| ----------------------------- | -------- | ------------------------------ |
| 1 Fundament                   | 1–6      | fertig                         |
| 2 Authentifizierung           | 7–16     | fertig                         |
| 3 Admin-Web Grundgerüst       | —        | fertig (vorgezogen)            |
| 4 Stammdaten                  | 17–20    | fertig — **Meilenstein A**     |
| 5 Buchung                     | 21–24    | fertig                         |
| 6 Admin-Kalender              | 25–26    | fertig — **Meilenstein B**     |
| 7 Mobile App                  | 27–31    | offen                          |
| 8 Benachrichtigungen          | 32–37    | offen, ab 34 extern blockiert  |
| 9 Behandlungsnotizen (Art. 9) | 38–44    | offen, **rechtlich blockiert** |
| 10 DSGVO-Werkzeuge            | 45–49    | offen                          |
| 11 Produktionsreife           | 50–56    | offen, extern blockiert        |

**Was das System heute kann:** Das Studio richtet sich vollständig selbst ein —
Leistungen, Team, wer was anbietet, Arbeitszeiten, Abwesenheiten. Es rechnet freie Zeiten
korrekt aus, inklusive beider Zeitumstellungen. Termine lassen sich buchen, verschieben,
absagen und nachbereiten, über die API und über den Kalender im Admin-Web.

**Was fehlt:** Die App für die Kundschaft, Benachrichtigungen, Behandlungsnotizen und
alles, was zum Produktivgang gehört.

---

## Als Nächstes

**Schritt 27 — Expo-Projekt.** Der Einstieg in Stufe 7. Das Backend ist fertig dafür: Die
App braucht `GET /services`, `GET /services/:id/staff`, `GET /availability` und
`POST /appointments`, und alle vier stehen und sind öffentlich beziehungsweise für
Kundinnen offen.

Der Abnahmesatz lautet „Die App startet im Simulator und auf einem echten Gerät". Den
zweiten Teil kann ich nicht prüfen — dafür braucht es ein Telefon in deiner Hand. Im
Browser lässt sie sich bauen und bedienen.

### Drei Entscheidungen, die vor Stufe 9 fallen müssen

1. **Die Praxisfrage** (siehe `docs/CHECKLISTE.md`, ganz oben). Das Dermazentrum ist eine
   Arztpraxis, keine Kosmetikfirma. Ärztliche Verschwiegenheitspflicht,
   Patientendokumentation und deren Aufbewahrungsfristen gelten zusätzlich zur DSGVO und
   stehen in der bisherigen Planung nicht drin. **Das blockiert Stufe 9 vollständig.**
2. **Ein Verschlüsselungsschlüssel oder einer pro Person** (Schritt 39). Ein globaler
   Schlüssel schließt Crypto-Shredding dauerhaft aus — man kann ihn nicht für eine
   einzelne Person vernichten, und damit bleiben Gesundheitsdaten einer gelöschten Person
   in jedem Backup lesbar.
3. **Kundin wird Mitarbeiterin.** In einer Hautarztpraxis der erwartbare Fall, und heute
   nicht abbildbar — eine Adresse, ein Konto. Die drei möglichen Wege stehen mit ihren
   Haken in `docs/CHECKLISTE.md`.

### Was ich ohne dich nicht fertig bekomme

| Was                               | Ab Schritt | Warum                                  |
| --------------------------------- | ---------- | -------------------------------------- |
| Apple- und Google-Developer-Konto | 34         | kostet Geld, läuft auf deine Identität |
| EU-Mailanbieter                   | 33         | Vertrag und Zugangsdaten               |
| Freigabe der DSFA                 | 38         | Unterschrift des Verantwortlichen      |
| Server, Domain, Backup-Restore    | 50         | deine Infrastruktur, dein Budget       |
| Echtes Gerät, Beta-Tester         | 27, 55     | brauchen Menschen                      |

## Wieder einsteigen

Nach einer Pause in dieser Reihenfolge:

```bash
net start com.docker.service      # in einer Administrator-cmd, dann Docker Desktop starten
docker compose up -d              # im Projektwurzelverzeichnis
npm run dev --workspace @terminplaner/backend      # Port 3000
npm run dev --workspace @terminplaner/web-admin    # Port 5173
```

Das Admin-Konto legt der Seed an. Es verschwindet bei **jedem** Testlauf, weil die Tests
die Datenbank leeren — danach so wiederherstellen:

```bash
ADMIN_PASSWORD=dermazentrum-start-2026 npm run seed:admin --workspace @terminplaner/backend
```

Ein Konto für die Rolle `STAFF` steht bewusst **nicht** im Seed — es würde genau den Weg
umgehen, den Schritt 18 eingeführt hat. Stattdessen unter `/team` eine Kosmetiker:in
anlegen, die Einladung in Mailpit (http://localhost:8025) öffnen und das Passwort dort
vergeben. Das dauert eine halbe Minute und prüft nebenbei, dass der Weg noch funktioniert.

Damit im Kalender etwas zu sehen ist, braucht es ausserdem: eine Leistung, deren Zuordnung
zu dieser Person, Arbeitszeiten, und eine Kundin (die sich über `POST /auth/register`
selbst anlegt, Bestätigungsmail ebenfalls in Mailpit).

Tests laufen gegen **dieselbe** Datenbank wie die Entwicklung — der Überschneidungsschutz
lässt sich nur gegen echtes PostgreSQL prüfen, nicht gegen eine Attrappe:

```bash
npm test --workspace @terminplaner/backend
```

**Niemals `taskkill /IM node.exe`** — Docker Desktop läuft selbst auf Node und wird dabei
mit beendet. Prozesse gezielt über ihre PID.

## Offen, blockiert nichts sofort

- Docker Desktop startet auf diesem Rechner nicht von selbst. Vor dem nächsten Testlauf:
  in einer Administrator-cmd `net start com.docker.service`, dann Docker Desktop starten.
- Die alten Repos `terminplaner-backend`, `terminplaner-web-admin`, `terminplaner-mobile`
  und `terminplaner-api-contract` existieren noch auf GitHub und werden nicht gebraucht.
- **Branch-Schutz ist eingerichtet**, aber nicht überprüft. Beim Push meldet GitHub
  „2 of 2 required status checks are expected" und lässt ihn trotzdem durch — als
  Repository-Inhaber darf man an der Regel vorbei. Ob ein roter Durchlauf einen Merge
  über einen Pull Request wirklich blockiert, ist damit **nicht** nachgewiesen. Das zeigt
  sich erst beim ersten absichtlich roten PR.
- Der CI-Durchlauf auf GitHub wurde noch nie angesehen — `gh` ist auf diesem Rechner nicht
  installiert. Dass die Tests lokal grün sind, heißt nicht, dass sie es dort auch sind.
- `npm audit` meldet vier Einträge mit hoher Einstufung, alle am `prisma`-CLI und damit
  reine Entwicklungsabhängigkeit. Bewusst akzeptiert, Begründung in E-23.

## Beobachtet, nicht erklärt

- **Der Testlauf schlägt gelegentlich fehl und ist beim nächsten Mal grün.** Zweimal
  gesehen am 2026-10-08: einmal vier Fehlschläge, einmal einer. Vier weitere Läufe waren
  grün. Welche Fälle es traf, ist beide Male nicht gesichert — die Ausgabe war weg, bevor
  sie jemand gelesen hat.

  Geprüft und ausgeschlossen: `fileParallelism` ist bereits abgeschaltet, die Dateien
  räumen sich also nicht gegenseitig die Datenbank weg. Auch die Vermutung, ein direkt
  davor laufendes `prettier --write` schreibe Dateien unter dem Testlauf weg, hat sich
  nicht bestätigt — genau so ausgeführt war der Lauf grün.

  **Beim nächsten Mal zuerst die Namen sichern**, sonst wiederholt sich das:

  ```
  npx vitest run > testlauf.txt 2>&1; grep -E "FAIL|AssertionError" testlauf.txt
  ```

  Verdächtig sind die zeitabhängigen Stellen: die Anfragebegrenzung mit Redis, die
  15-Sekunden-Nachfrist bei der Token-Rotation (E-25) und die 50 gleichzeitigen Buchungen.

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
