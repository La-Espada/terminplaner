import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiFehler, api, type Kosmetikerin } from '../api/client';

interface Props {
  /** `null` bedeutet: neu anlegen. */
  person: Kosmetikerin | null;
  onFertig: () => void;
  onAbbrechen: () => void;
}

/**
 * Vorschlagsfarben für den Kalender.
 *
 * Fest vorgegeben statt freier Farbwahl: Die Farben müssen nebeneinander
 * unterscheidbar bleiben und zur Palette passen. So landet niemand
 * versehentlich bei Neongelb auf Weiß.
 */
const FARBEN = [
  { wert: '#9c7a53', name: 'Gold' },
  { wert: '#7a8c6f', name: 'Salbei' },
  { wert: '#6f7f94', name: 'Taubenblau' },
  { wert: '#a3706f', name: 'Altrosa' },
  { wert: '#8a7596', name: 'Flieder' },
  { wert: '#6f8c8a', name: 'Petrol' },
];

export function TeamFormular({ person, onFertig, onAbbrechen }: Props) {
  const istNeu = person === null;

  const [email, setEmail] = useState(person?.email ?? '');
  const [vorname, setVorname] = useState(person?.firstName ?? '');
  const [nachname, setNachname] = useState(person?.lastName ?? '');
  const [telefon, setTelefon] = useState(person?.phone ?? '');
  const [anzeigename, setAnzeigename] = useState(person?.displayName ?? '');
  const [vorstellung, setVorstellung] = useState(person?.bio ?? '');
  const [farbe, setFarbe] = useState(person?.colorHex ?? '');
  const [fehler, setFehler] = useState<string | null>(null);

  const gueltig =
    vorname.trim().length >= 1 &&
    nachname.trim().length >= 1 &&
    (!istNeu || /^\S+@\S+\.\S+$/.test(email.trim()));

  const speichern = useMutation({
    mutationFn: async () => {
      const gemeinsam = {
        firstName: vorname.trim(),
        lastName: nachname.trim(),
        phone: telefon.trim(),
        displayName: anzeigename.trim() === '' ? vorname.trim() : anzeigename.trim(),
        bio: vorstellung.trim(),
        colorHex: farbe,
      };
      return istNeu
        ? api.team.anlegen({ ...gemeinsam, email: email.trim().toLowerCase() })
        : api.team.aendern(person.id, gemeinsam);
    },
    onSuccess: onFertig,
    onError: (e) => setFehler(e instanceof ApiFehler ? e.message : 'Speichern fehlgeschlagen.'),
  });

  function absenden(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    speichern.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-tinte mb-6 text-3xl font-semibold">
        {istNeu ? 'Kosmetiker:in anlegen' : `${person.firstName} ${person.lastName} bearbeiten`}
      </h1>

      <form className="karte" onSubmit={absenden} noValidate>
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="feld-beschriftung" htmlFor="vorname">
              Vorname
            </label>
            <input
              id="vorname"
              className="feld-eingabe"
              value={vorname}
              onChange={(e) => setVorname(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
          <div>
            <label className="feld-beschriftung" htmlFor="nachname">
              Nachname
            </label>
            <input
              id="nachname"
              className="feld-eingabe"
              value={nachname}
              onChange={(e) => setNachname(e.target.value)}
              autoComplete="off"
              required
            />
          </div>
        </div>

        <div className="mb-4">
          <label className="feld-beschriftung" htmlFor="email">
            E-Mail-Adresse
          </label>
          <input
            id="email"
            type="email"
            className="feld-eingabe"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="anna@derma-siebenhirten.at"
            autoComplete="off"
            disabled={!istNeu}
            required={istNeu}
          />
          <p className="text-grau-700 mt-1 text-[12px]">
            {istNeu
              ? 'Hierhin geht die Einladung. Die Person vergibt ihr Passwort selbst — Sie sehen es nie.'
              : 'Die Adresse ist die Anmeldung und lässt sich hier nicht ändern.'}
          </p>
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="feld-beschriftung" htmlFor="telefon">
              Telefon <span className="text-grau-500 font-normal">(optional)</span>
            </label>
            <input
              id="telefon"
              type="tel"
              className="feld-eingabe"
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="feld-beschriftung" htmlFor="anzeigename">
              Anzeigename <span className="text-grau-500 font-normal">(optional)</span>
            </label>
            <input
              id="anzeigename"
              className="feld-eingabe"
              value={anzeigename}
              onChange={(e) => setAnzeigename(e.target.value)}
              placeholder={vorname.trim() === '' ? 'Anna' : vorname.trim()}
              autoComplete="off"
            />
            <p className="text-grau-700 mt-1 text-[12px]">
              So steht es bei der Buchung. Leer lassen übernimmt den Vornamen.
            </p>
          </div>
        </div>

        <div className="mb-4">
          <label className="feld-beschriftung" htmlFor="vorstellung">
            Vorstellung <span className="text-grau-500 font-normal">(optional)</span>
          </label>
          <textarea
            id="vorstellung"
            className="feld-eingabe min-h-24"
            value={vorstellung}
            onChange={(e) => setVorstellung(e.target.value)}
            placeholder="Ein, zwei Sätze für die Kundschaft. Dieser Text ist öffentlich sichtbar."
            rows={3}
          />
        </div>

        <fieldset className="mb-6">
          <legend className="feld-beschriftung">Farbe im Kalender</legend>
          <div className="flex flex-wrap gap-2">
            {FARBEN.map((f) => (
              <button
                key={f.wert}
                type="button"
                onClick={() => setFarbe(farbe === f.wert ? '' : f.wert)}
                aria-pressed={farbe === f.wert}
                className={`flex min-h-10 items-center gap-2 rounded-[10px] border px-3 text-sm ${
                  farbe === f.wert ? 'border-tinte' : 'border-creme-tief'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="h-4 w-4 rounded-full"
                  style={{ backgroundColor: f.wert }}
                />
                {f.name}
              </button>
            ))}
          </div>
          <p className="text-grau-700 mt-2 text-[12px]">
            Nur für den Kalender im Admin-Bereich. Nochmal klicken entfernt die Farbe.
          </p>
        </fieldset>

        {fehler !== null && (
          <div className="meldung meldung-fehler mb-4" role="alert">
            {fehler}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="knopf" type="submit" disabled={!gueltig || speichern.isPending}>
            {speichern.isPending
              ? 'Wird gespeichert …'
              : istNeu
                ? 'Anlegen und einladen'
                : 'Speichern'}
          </button>
          <button type="button" className="knopf knopf-still" onClick={onAbbrechen}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
