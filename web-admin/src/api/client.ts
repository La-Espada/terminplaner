/**
 * Bewusst `localhost` und nicht `127.0.0.1`.
 *
 * Browser behandeln die beiden als verschiedene Sites. Das Refresh-Cookie ist
 * SameSite=Lax und wuerde bei einem Wechsel von localhost:5173 nach
 * 127.0.0.1:3000 nicht mitgeschickt — die Sitzung ueberlebte kein Neuladen.
 * Unterschiedliche Ports sind dagegen unproblematisch.
 */
const BASIS = import.meta.env.VITE_API_BASIS ?? 'http://localhost:3000/api/v1';

export class ApiFehler extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiFehler';
  }
}

/**
 * Der Access-Token liegt **nur im Speicher**, nicht in localStorage. Bei einem
 * Cross-Site-Scripting waere er dort auslesbar; im Speicher ist er nach einem
 * Neuladen einfach weg — und wird ueber das httpOnly-Cookie neu geholt.
 */
let accessToken: string | null = null;

export function setzeAccessToken(token: string | null): void {
  accessToken = token;
}

export function hatAccessToken(): boolean {
  return accessToken !== null;
}

interface ProblemAntwort {
  message?: string | string[];
}

async function anfrage<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
  let antwort: Response;
  try {
    antwort = await fetch(`${BASIS}${pfad}`, {
      ...optionen,
      // Ohne credentials schickt der Browser das Refresh-Cookie nicht mit.
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken !== null ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(optionen.headers ?? {}),
      },
    });
  } catch {
    throw new ApiFehler(0, 'Keine Verbindung zum Server. Läuft das Backend?');
  }

  const inhalt: unknown = await antwort.json().catch(() => ({}));

  if (!antwort.ok) {
    const roh = (inhalt as ProblemAntwort).message;
    const text = Array.isArray(roh) ? roh[0] : roh;
    throw new ApiFehler(antwort.status, text ?? 'Es ist ein Fehler aufgetreten.');
  }

  return inhalt as T;
}

export interface AnmeldeAntwort {
  accessToken: string;
  expiresIn: number;
}

/**
 * Laufende Erneuerung, damit parallele Aufrufe sich zusammenlegen.
 *
 * Ohne das schicken zwei gleichzeitige Anfragen denselben Refresh-Token — der
 * zweite waere dann schon verbraucht. Das Backend faengt das mit einer Nachfrist
 * ab, aber unnoetige Rotationen sind trotzdem zu vermeiden.
 */
let laufendeErneuerung: Promise<AnmeldeAntwort> | null = null;

export const api = {
  anmelden: (email: string, password: string) =>
    anfrage<AnmeldeAntwort>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  /** Holt ein neues Token-Paar ueber das httpOnly-Cookie. */
  erneuern: (): Promise<AnmeldeAntwort> => {
    laufendeErneuerung ??= anfrage<AnmeldeAntwort>('/auth/refresh', {
      method: 'POST',
      body: '{}',
    }).finally(() => {
      laufendeErneuerung = null;
    });
    return laufendeErneuerung;
  },

  abmelden: () => anfrage<{ message: string }>('/auth/logout', { method: 'POST', body: '{}' }),
};
