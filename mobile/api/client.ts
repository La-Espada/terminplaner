import Constants from 'expo-constants';

/**
 * Zugriff auf die API.
 *
 * Die Basis-Adresse kommt aus der Expo-Konfiguration. Auf einem echten Gerät ist
 * `localhost` das Gerät selbst, nicht der Entwicklungsrechner — dort muss die
 * IP-Adresse des Rechners stehen. Im Browser und im Simulator reicht localhost.
 */
const BASIS =
  (Constants.expoConfig?.extra?.apiBasisUrl as string | undefined) ??
  'http://127.0.0.1:3000/api/v1';

export class ApiFehler extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Feldbezogene Meldungen aus der Validierung, falls vorhanden. */
    readonly felder?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiFehler';
  }
}

interface ProblemAntwort {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

/**
 * Übersetzt die Validierungsmeldungen von NestJS in Meldungen je Feld.
 * class-validator liefert Sätze wie „email must be an email" — die Zuordnung
 * geschieht über das erste Wort.
 */
function felderAusMeldungen(meldungen: string[]): Record<string, string> {
  const felder: Record<string, string> = {};
  for (const m of meldungen) {
    const feld = m.split(' ')[0];
    if (feld && !felder[feld]) felder[feld] = m;
  }
  return felder;
}

async function anfrage<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
  let antwort: Response;
  try {
    antwort = await fetch(`${BASIS}${pfad}`, {
      ...optionen,
      headers: { 'Content-Type': 'application/json', ...(optionen.headers ?? {}) },
    });
  } catch {
    // Netzwerkfehler sehen für Nutzende anders aus als Serverfehler und
    // brauchen eine andere Handlungsanweisung.
    throw new ApiFehler(0, 'Keine Verbindung zum Server. Prüfen Sie Ihre Internetverbindung.');
  }

  const inhalt: unknown = await antwort.json().catch(() => ({}));

  if (!antwort.ok) {
    const problem = inhalt as ProblemAntwort;
    const roh = problem.message;
    const meldungen = Array.isArray(roh) ? roh : typeof roh === 'string' ? [roh] : [];
    throw new ApiFehler(
      antwort.status,
      meldungen[0] ?? 'Es ist ein Fehler aufgetreten.',
      Array.isArray(roh) ? felderAusMeldungen(roh) : undefined,
    );
  }

  return inhalt as T;
}

export interface RegistrierungsDaten {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
  acceptedMarketing?: boolean;
}

export const api = {
  registrieren: (daten: RegistrierungsDaten) =>
    anfrage<{ message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(daten),
    }),

  gesundheit: () => anfrage<{ status: string }>('/health'),
};
