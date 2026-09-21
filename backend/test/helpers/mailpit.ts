/**
 * Zugriff auf Mailpit in Tests.
 *
 * Mails werden nicht abgefangen oder gemockt, sondern wirklich versendet und aus
 * Mailpit wieder ausgelesen — denselben Weg nimmt auch eine echte Kundin. So
 * fällt auf, wenn der Versand kaputt ist oder der Link falsch zusammengesetzt wird.
 */

const BASIS = process.env.MAILPIT_URL ?? 'http://localhost:8025';

interface MailpitListe {
  total: number;
  messages: Array<{ ID: string; Subject: string; To: Array<{ Address: string }> }>;
}

interface MailpitNachricht {
  Subject: string;
  Text: string;
  HTML: string;
  To: Array<{ Address: string }>;
}

async function holen<T>(pfad: string): Promise<T> {
  const antwort = await fetch(`${BASIS}${pfad}`);
  if (!antwort.ok) {
    throw new Error(`Mailpit antwortet mit ${antwort.status} auf ${pfad}`);
  }
  return (await antwort.json()) as T;
}

/** Löscht alle Nachrichten. Vor jedem Test aufrufen, der Mails prüft. */
export async function mailsLeeren(): Promise<void> {
  const antwort = await fetch(`${BASIS}/api/v1/messages`, { method: 'DELETE' });
  if (!antwort.ok) {
    throw new Error(`Mailpit liess sich nicht leeren: ${antwort.status}`);
  }
}

export async function mailAnzahl(): Promise<number> {
  return (await holen<MailpitListe>('/api/v1/messages?limit=1')).total;
}

/**
 * Wartet auf die neueste Nachricht. Der Versand läuft asynchron, deshalb kurz
 * nachfragen statt sofort aufzugeben.
 */
export async function neuesteMail(timeoutMs = 5000): Promise<MailpitNachricht> {
  const ende = Date.now() + timeoutMs;
  while (Date.now() < ende) {
    const liste = await holen<MailpitListe>('/api/v1/messages?limit=1');
    if (liste.messages.length > 0) {
      return holen<MailpitNachricht>(`/api/v1/message/${liste.messages[0].ID}`);
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Innerhalb von ${timeoutMs} ms ist keine Mail in Mailpit angekommen`);
}

/** Zieht den Token aus dem Link in der neuesten Mail. */
export async function tokenAusNeuesterMail(): Promise<string> {
  const mail = await neuesteMail();
  const treffer = mail.Text.match(/token=([\w-]+)/);
  if (!treffer) {
    throw new Error(`Kein Token im Mailtext gefunden. Betreff: ${mail.Subject}`);
  }
  return treffer[1];
}
