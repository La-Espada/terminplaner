import { IsISO8601, IsUUID } from 'class-validator';

/**
 * Was eine Buchung vom Client braucht \u2014 und nur das.
 *
 * Kein `endsAt`: Die Dauer steht an der Leistung, und ein Client, der das Ende
 * mitschicken duerfte, koennte eine einstuendige Behandlung als fuenfminuetige
 * buchen. Kein Preis: Der kommt aus der Leistung und wird als Schnappschuss
 * gespeichert (E-09). Kein `customerId`: Gebucht wird fuer die angemeldete
 * Person.
 *
 * Auch kein Freitextfeld. `appointments.customer_note_encrypted` existiert im
 * Schema, aber die Verschluesselung kommt erst in Schritt 40 und die zugehoerige
 * Einwilligung in Schritt 42. Ein Feld, in das Kundinnen erfahrungsgemaess
 * Allergien und Hauterkrankungen schreiben, darf nicht vorher offen stehen.
 */
export class BuchungDto {
  @IsUUID()
  serviceId!: string;

  @IsUUID()
  staffId!: string;

  @IsISO8601({ strict: true }, { message: 'Der Beginn wird als ISO-8601-Zeitpunkt gebraucht.' })
  startsAt!: string;
}
