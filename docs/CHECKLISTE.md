# Checkliste: offene Punkte außerhalb des Codes

Dinge, die sich **nicht** programmieren lassen, aber vor dem Livegang erledigt sein
müssen. Bewusst leer — zum Abhaken, wenn es soweit ist.

Stand: 2026-09-20

---

## Rechtliches und Datenschutz

> **Offen und wichtig:** Der Auftraggeber ist das **Dermazentrum Siebenhirten**, eine
> Arztpraxis (Dermatologie und Ästhetik), nicht ein Kosmetikstudio. Die bisherige
> DSGVO-Planung geht von einem Kosmetikbetrieb aus. Eine Arztpraxis unterliegt zusätzlich
> der **ärztlichen Verschwiegenheitspflicht** (§ 54 Ärztegesetz), führt
> Patientendokumentation mit eigenen Aufbewahrungsfristen, und Gesundheitsdaten sind dort
> nicht ein Randfall, sondern der Kern. Bewusst zurückgestellt, muss aber **vor Stufe 9**
> (Behandlungsnotizen) geklärt sein.

- [ ] Klären, welche Anforderungen aus dem Ärztegesetz zusätzlich gelten und ob die
      Behandlungsnotizen Teil der Patientendokumentation werden

- [ ] Verantwortliche Stelle im Sinne der DSGVO benennen (wer genau, mit Anschrift)
- [ ] Klären, ob ein Datenschutzbeauftragter bestellt werden muss
- [ ] Verarbeitungsverzeichnis nach Art. 30 anlegen
- [ ] Datenschutz-Folgenabschätzung nach Art. 35 durchführen — **verpflichtend**, weil
      Gesundheitsdaten verarbeitet werden
- [ ] Datenschutzerklärung erstellen
- [ ] Datenschutzerklärung juristisch prüfen lassen
- [ ] Impressum erstellen
- [ ] AGB erstellen (inkl. Storno-Bedingungen)
- [ ] Einwilligungstexte formulieren — getrennt für AGB, Datenschutz, Gesundheitsdaten,
      Marketing, Push
- [ ] Versionierung der Einwilligungstexte festlegen: Wo werden alte Fassungen archiviert?
      Ohne Archiv lässt sich nicht nachweisen, wozu Version 1.2 eigentlich eingewilligt hat
- [ ] TOM-Dokumentation erstellen (technische und organisatorische Maßnahmen)
- [ ] Meldeprozess für Datenpannen festlegen (72 Stunden, Art. 33) — wer meldet, an wen,
      wie wird es dokumentiert
- [ ] Aufbewahrungsfristen final festlegen und die Vorschlagswerte in `.env` ersetzen

## Auftragsverarbeitungsverträge (Art. 28)

- [ ] Hoster (Server und Backups)
- [ ] Mailversand-Dienstleister
- [ ] Push-Dienste: Google (FCM) und Apple (APNs) — Drittlandtransfer in die USA, muss in
      der Datenschutzerklärung benannt sein
- [ ] Fehler-Monitoring, falls nicht vollständig selbst gehostet

## Löschkonzept

- [ ] Löschkonzept schriftlich dokumentieren, mit Fristen je Datenart
- [ ] **Weg finden, wie Daten auch aus Backups verschwinden** — siehe unten, ungelöst
- [ ] Prozess festlegen, was nach einem Restore aus Backup passieren muss
- [ ] Restore einmal echt durchspielen und protokollieren

## Konten und Store

- [ ] Apple Developer Account einrichten — wird schon für Push (APNs) gebraucht, nicht
      erst beim Store-Release. Verifizierung kann Wochen dauern
- [ ] Google Play Developer Account einrichten
- [ ] Apple Privacy Nutrition Labels ausfüllen
- [ ] Google Data Safety Formular ausfüllen
- [ ] Beide Formulare gegen die Datenschutzerklärung prüfen — Abweichungen führen
      regelmäßig zur Ablehnung

## Mit dem Studio zu klären

- [ ] Storno-Frist in Stunden, und ob eine Storno-Gebühr erhoben wird
- [ ] Werden Buchungen automatisch bestätigt oder erst nach Freigabe?
- [ ] Vorlaufzeit für kurzfristige Buchungen
- [ ] Maximaler Buchungshorizont
- [ ] Zeitzone und Anzahl der Standorte bestätigen (angenommen: `Europe/Vienna`, einer)
- [ ] Anzahl Kosmetiker:innen und Leistungen zum Start
- [ ] Bestehende Kundendaten, die migriert werden müssen?

## Sicherheit

- [ ] Penetrationstest beauftragen und Befunde abarbeiten
- [ ] Lasttest durchführen, besonders auf Doppelbuchungen unter Last
- [ ] Secret-Management für Produktion festlegen (KMS oder Vault)
- [ ] Notfallzugriff auf den Verschlüsselungsschlüssel regeln — wer kommt dran, wenn du
      ausfällst?

## Betrieb

- [ ] Monitoring und Alarmierung einrichten
- [ ] Backup-Job einrichten: täglich, verschlüsselt, 30 Tage flache Aufbewahrung
- [ ] Schulung des Studiopersonals
- [ ] Kurzanleitung für die Admin-Oberfläche schreiben

---

## Ungelöst: Löschung aus Backups

Der Punkt, für den es noch keine fertige Antwort gibt. Er gehört ausdrücklich
festgehalten, weil er der schwächste Teil des Löschkonzepts ist.

### Das Problem

Wird ein Konto anonymisiert, verschwinden die Daten aus der Datenbank — aber nicht aus dem
Backup von gestern. Zieht man dieses Backup zurück, sind Name, E-Mail und Telefonnummer
wieder da. Backups nachträglich zu bearbeiten ist keine Option: Ein verändertes Backup ist
kein verlässliches Backup mehr, und bei verschlüsselten oder inkrementellen Sicherungen
technisch ohnehin kaum machbar.

**Wichtig ist die Unterscheidung zweier Datenarten**, weil nur für eine davon ein
technischer Ausweg existiert:

|                                                                 | Im Backup enthalten als | Nach Löschung wiederherstellbar?                                           |
| --------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------- |
| Gesundheitsdaten (`treatment_notes`, `customer_note_encrypted`) | Chiffrat                | **Nein** — wenn der Schlüssel pro Person im KMS liegt und vernichtet wurde |
| Name, E-Mail, Telefon, Termindaten                              | Klartext                | **Ja** — dagegen hilft keine Verschlüsselung, die wir heute haben          |

### Was Crypto-Shredding leistet — und was nicht

Für die Gesundheitsdaten funktioniert der Mechanismus sauber: Das Backup enthält nur
Chiffrat, der Schlüssel liegt im KMS und wird bei der Anonymisierung vernichtet. Danach
ist der Inhalt überall unlesbar, auch in jedem alten Backup, ohne dass ein Backup
angefasst wird.

Zwei Voraussetzungen, die beide noch offen sind:

- **Ein Schlüssel pro Person.** Mit einem globalen Schlüssel geht es nicht — ihn zu
  vernichten würde die Daten aller Kundinnen unlesbar machen. Entscheidung fällt in
  Schritt 39.
- **Der Schlüssel darf nicht in der Datenbank liegen**, sonst ist er im Backup mit drin
  und kommt beim Restore zurück. Und die KMS-Sicherung darf ihn nicht überdauern.

**Für die übrigen Personendaten leistet Crypto-Shredding nichts.** Name und E-Mail stehen
im Klartext im Backup. Damit ist das Problem nicht gelöst, sondern nur verkleinert.

### Der übliche Weg: Löschung in Stufen

Es gibt keine Technik, die in eine unveränderliche Sicherung hineingreift und eine Zeile
entfernt. Die DSGVO verlangt das auch nicht — sie verlangt einen dokumentierten,
begründeten Prozess. Etabliert ist die „Löschung in Stufen":

1. **Sofort:** Löschung in der Produktivdatenbank.
2. **Backups sind gesperrt.** Zugriff nur für Wiederherstellung im Notfall, nicht für
   Auswertungen, nicht für Support, nicht für Tests. Schriftlich festgelegt und technisch
   durchgesetzt.
3. **Begrenzte Aufbewahrung.** Bei 30 Tagen Vorhaltung ist der Datensatz spätestens nach
   30 Tagen auch dort verschwunden — ohne weiteres Zutun.
4. **Löschjournal beim Restore.** Wird tatsächlich zurückgespielt, werden alle
   zwischenzeitlich erfolgten Anonymisierungen erneut angewendet, **bevor** das System
   wieder ans Netz geht.

Punkt 4 ist der heikle: Das Journal darf nur IDs und Zeitpunkte enthalten, niemals Namen
oder Adressen — sonst baut man genau die Schattendatenbank der Personen, die gelöscht
werden wollten.

Dieses Vorgehen ist gängige Praxis und wird von Aufsichtsbehörden allgemein akzeptiert,
solange es im Löschkonzept beschrieben und eingehalten wird. Ob es im konkreten Fall
ausreicht, muss die juristische Prüfung sagen — das ist keine Rechtsberatung.

### Die Maximalvariante

Man könnte **alle** Personendaten pro Person verschlüsseln, nicht nur die Gesundheitsdaten.
Dann würde das Vernichten des Schlüssels auch Name und Telefon überall unlesbar machen.

Der Haken ist die E-Mail-Adresse: Sie wird beim Login gesucht und muss eindeutig sein, und
nach verschlüsselten Werten lässt sich nicht suchen. Man bräuchte zusätzlich einen
deterministischen Hash für die Suche — womit die Komplexität deutlich steigt, für einen
Betrieb dieser Größe vermutlich unverhältnismäßig.

Meine Einschätzung: vorerst nicht. Aber die Option kennen, falls die juristische Prüfung
den Weg über die Stufenlöschung nicht mitträgt.

### Zu entscheiden

- [x] **Backup-Rhythmus und -Aufbewahrung festgelegt:** täglich sichern, jede Sicherung
      30 Tage aufbewahren, also immer 30 parallele Stände. Steht als
      `BACKUP_RETENTION_DAYS` in `.env.example`
- [x] **Keine gestaffelte Langzeitaufbewahrung.** Bewusst keine Wochen- oder
      Monatsarchive: Sie sind für die Ausfallsicherheit gut, halten gelöschte Personen
      aber monatelang am Leben und schwächen die Löschargumentation. Ein Studio dieser
      Größe braucht keinen Stand von vor acht Monaten
- [ ] Zugriff auf Backups technisch und organisatorisch einschränken — nur
      Notfall-Restore, nicht für Auswertungen, Support oder Tests
- [ ] Schritt 39: Schlüssel pro Person statt global — entscheiden und umsetzen
- [ ] Prüfen, ob die KMS-Sicherung den Schlüssel überdauert; falls ja, ist
      Crypto-Shredding wirkungslos
- [ ] Löschjournal: bauen oder nicht, und in welcher Form
- [ ] Restore-Prozedur schriftlich festhalten, inklusive Schritt „Löschjournal anwenden"
- [ ] Gesamtes Vorgehen im Löschkonzept beschreiben und juristisch prüfen lassen
