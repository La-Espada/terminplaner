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

  // 204 hat keinen Rumpf — .json() wuerde dort werfen.
  const inhalt: unknown = antwort.status === 204 ? null : await antwort.json().catch(() => ({}));

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

export interface Leistung {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  priceCents: number;
  isActive: boolean;
  sortOrder: number;
  /** Wie oft gebucht. Entscheidet, ob Loeschen angeboten wird. */
  terminAnzahl: number;
  anbieterAnzahl: number;
  /** Erscheint sie in der App? Aktiv zu sein genuegt nicht — jemand muss sie anbieten. */
  buchbar: boolean;
}

export interface ZuordnungsZeile {
  serviceId: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  isActive: boolean;
  staffIds: string[];
}

export interface ZuordnungsMatrix {
  staff: Array<{ id: string; displayName: string; isActive: boolean; colorHex: string | null }>;
  zeilen: ZuordnungsZeile[];
}

export interface LeistungsDaten {
  name: string;
  description?: string;
  durationMinutes: number;
  bufferMinutes?: number;
  /** Ganzzahlige Cent, nie Kommazahlen (E-08). */
  priceCents: number;
  sortOrder?: number;
}

export interface Kosmetikerin {
  id: string;
  userId: string;
  displayName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  bio: string | null;
  colorHex: string | null;
  isActive: boolean;
  /** Hat die Person ihr Passwort schon vergeben? */
  zugangAktiv: boolean;
  /** Laeuft noch eine offene Einladung? */
  einladungOffen: boolean;
  leistungAnzahl: number;
  terminAnzahl: number;
}

export interface KosmetikerinDaten {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  displayName?: string;
  bio?: string;
  colorHex?: string;
}

export interface Profil {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string;
  emailVerified: boolean;
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

  /** Eigenes Profil. Liefert auch die Rolle, nach der sich die Navigation richtet. */
  profil: () => anfrage<Profil>('/me'),

  leistungen: {
    liste: () => anfrage<Leistung[]>('/admin/services'),

    anlegen: (daten: LeistungsDaten) =>
      anfrage<Leistung>('/admin/services', { method: 'POST', body: JSON.stringify(daten) }),

    aendern: (id: string, daten: Partial<LeistungsDaten> & { isActive?: boolean }) =>
      anfrage<Leistung>(`/admin/services/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(daten),
      }),

    loeschen: (id: string) => anfrage<void>(`/admin/services/${id}`, { method: 'DELETE' }),
  },

  team: {
    liste: () => anfrage<Kosmetikerin[]>('/admin/staff'),

    anlegen: (daten: KosmetikerinDaten) =>
      anfrage<Kosmetikerin>('/admin/staff', { method: 'POST', body: JSON.stringify(daten) }),

    aendern: (id: string, daten: Partial<Omit<KosmetikerinDaten, 'email'>>) =>
      anfrage<Kosmetikerin>(`/admin/staff/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(daten),
      }),

    aktivSetzen: (id: string, isActive: boolean) =>
      anfrage<Kosmetikerin>(`/admin/staff/${id}/aktiv`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive }),
      }),

    einladungErneut: (id: string) =>
      anfrage<{ message: string }>(`/admin/staff/${id}/einladung`, {
        method: 'POST',
        body: '{}',
      }),

    loeschen: (id: string) => anfrage<void>(`/admin/staff/${id}`, { method: 'DELETE' }),
  },

  zuordnung: {
    matrix: () => anfrage<ZuordnungsMatrix>('/admin/zuordnung'),

    zuordnen: (staffId: string, serviceId: string) =>
      anfrage<void>(`/admin/zuordnung/${staffId}/${serviceId}`, { method: 'PUT' }),

    /**
     * Entziehen. Ohne `bestaetigt` lehnt das Backend ab, solange kuenftige
     * Termine daran haengen — und nennt deren Anzahl in der Fehlermeldung.
     */
    entziehen: (staffId: string, serviceId: string, bestaetigt = false) =>
      anfrage<void>(
        `/admin/zuordnung/${staffId}/${serviceId}${bestaetigt ? '?bestaetigt=true' : ''}`,
        { method: 'DELETE' },
      ),
  },

  /**
   * Einladung einloesen. Braucht keine Anmeldung — wer hier ankommt, hat noch
   * kein Passwort.
   */
  einladungEinloesen: (token: string, password: string) =>
    anfrage<{ message: string }>('/auth/invitation/accept', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
};
