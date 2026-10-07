import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setzeAccessToken, type Profil } from '../api/client';

export type Rolle = 'ADMIN' | 'STAFF' | 'CUSTOMER';

interface Sitzung {
  /** `undefined`, solange noch geprüft wird. */
  person: Profil | null | undefined;
  anmelden: (email: string, passwort: string) => Promise<void>;
  abmelden: () => Promise<void>;
  /** Hat die angemeldete Person eine dieser Rollen? */
  hatRolle: (...rollen: Rolle[]) => boolean;
}

const Kontext = createContext<Sitzung | null>(null);

export function SitzungsAnbieter({ children }: { children: React.ReactNode }) {
  const [person, setPerson] = useState<Profil | null | undefined>(undefined);

  /**
   * Beim Laden versuchen, die Sitzung über das httpOnly-Cookie fortzusetzen.
   * Der Access-Token liegt nur im Speicher und ist nach dem Neuladen weg.
   */
  useEffect(() => {
    let abgebrochen = false;

    void (async () => {
      try {
        const antwort = await api.erneuern();
        setzeAccessToken(antwort.accessToken);
        const profil = await api.profil();
        if (!abgebrochen) setPerson(profil);
      } catch {
        if (!abgebrochen) setPerson(null);
      }
    })();

    return () => {
      abgebrochen = true;
    };
  }, []);

  const anmelden = useCallback(async (email: string, passwort: string) => {
    const antwort = await api.anmelden(email, passwort);
    setzeAccessToken(antwort.accessToken);
    setPerson(await api.profil());
  }, []);

  const abmelden = useCallback(async () => {
    try {
      await api.abmelden();
    } finally {
      // Auch wenn der Aufruf scheitert, lokal abmelden — sonst sitzt jemand in
      // einer Oberfläche fest, die er nicht mehr bedienen kann.
      setzeAccessToken(null);
      setPerson(null);
    }
  }, []);

  const wert = useMemo<Sitzung>(
    () => ({
      person,
      anmelden,
      abmelden,
      hatRolle: (...rollen: Rolle[]) => person != null && rollen.includes(person.role as Rolle),
    }),
    [person, anmelden, abmelden],
  );

  return <Kontext.Provider value={wert}>{children}</Kontext.Provider>;
}

export function useSitzung(): Sitzung {
  const wert = useContext(Kontext);
  if (wert === null) {
    throw new Error('useSitzung muss innerhalb von SitzungsAnbieter verwendet werden');
  }
  return wert;
}
