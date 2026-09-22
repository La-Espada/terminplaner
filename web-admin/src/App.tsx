import { useEffect, useState } from 'react';
import { api, setzeAccessToken } from './api/client';
import { Anmeldung } from './seiten/Anmeldung';
import { Uebersicht } from './seiten/Uebersicht';

type Zustand = 'pruefe' | 'angemeldet' | 'abgemeldet';

export function App() {
  const [zustand, setZustand] = useState<Zustand>('pruefe');

  // Beim Laden versuchen, die Sitzung über das httpOnly-Cookie fortzusetzen.
  // Der Access-Token liegt nur im Speicher und ist nach dem Neuladen weg.
  useEffect(() => {
    let abgebrochen = false;

    api
      .erneuern()
      .then((antwort) => {
        if (abgebrochen) return;
        setzeAccessToken(antwort.accessToken);
        setZustand('angemeldet');
      })
      .catch(() => {
        if (!abgebrochen) setZustand('abgemeldet');
      });

    return () => {
      abgebrochen = true;
    };
  }, []);

  if (zustand === 'pruefe') {
    return <div className="wartet">Sitzung wird geprüft …</div>;
  }

  return zustand === 'angemeldet' ? (
    <Uebersicht onAbgemeldet={() => setZustand('abgemeldet')} />
  ) : (
    <Anmeldung onAngemeldet={() => setZustand('angemeldet')} />
  );
}
