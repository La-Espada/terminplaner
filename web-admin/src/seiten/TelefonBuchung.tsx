import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiFehler, api } from '../api/client';
import { langesDatum, ortszeit } from '../kalender/zeit';

interface Props {
  /** Vorbelegtes Datum aus dem Kalender. */
  datum: string;
  onFertig: () => void;
  onAbbrechen: () => void;
}

/**
 * Termin im Namen einer Kundin anlegen.
 *
 * Der häufigste Weg, auf dem Termine entstehen — am Telefon. Die Reihenfolge
 * folgt dem Gespräch: wer ruft an, was möchte sie, bei wem, wann. Eine andere
 * Reihenfolge zwänge die Person am Telefon, die Kundin warten zu lassen.
 *
 * Die freien Zeiten kommen aus derselben Berechnung wie in der App. Eine Liste
 * „was ginge theoretisch" und eine zweite „was geht wirklich" wären zwei
 * Wahrheiten, und die liefen auseinander.
 */
export function TelefonBuchung({ datum, onFertig, onAbbrechen }: Props) {
  const [suche, setSuche] = useState('');
  const [kundin, setKundin] = useState<{ id: string; name: string } | null>(null);
  const [serviceId, setServiceId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [tag, setTag] = useState(datum);
  const [fehler, setFehler] = useState<string | null>(null);

  const treffer = useQuery({
    queryKey: ['kundensuche', suche],
    queryFn: () => api.termine.kundinnenSuchen(suche),
    enabled: suche.trim().length >= 3 && kundin === null,
  });

  const leistungen = useQuery({ queryKey: ['leistungen'], queryFn: () => api.leistungen.liste() });

  const anbieter = useQuery({
    queryKey: ['anbieter', serviceId],
    queryFn: () => api.leistungen.anbieter(serviceId),
    enabled: serviceId !== '',
  });

  const slots = useQuery({
    queryKey: ['slots', serviceId, staffId, tag],
    queryFn: () => api.slots(serviceId, staffId, tag),
    enabled: serviceId !== '' && staffId !== '',
  });

  const buchen = useMutation({
    mutationFn: (startsAt: string) =>
      api.termine.buchenFuer({ customerId: kundin?.id ?? '', serviceId, staffId, startsAt }),
    onSuccess: onFertig,
    onError: (e) =>
      setFehler(e instanceof ApiFehler ? e.message : 'Die Buchung ist fehlgeschlagen.'),
  });

  return (
    <div className="karte mb-6">
      <h2 className="text-tinte mb-4 text-lg font-semibold">Termin am Telefon anlegen</h2>

      {/* 1 — wer ruft an */}
      <div className="mb-4">
        <label className="feld-beschriftung" htmlFor="kundensuche">
          Kundin
        </label>
        {kundin !== null ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-creme-tief text-tinte rounded px-3 py-2 text-sm">
              {kundin.name}
            </span>
            <button
              type="button"
              className="knopf knopf-still min-h-10 px-3 text-sm"
              onClick={() => {
                setKundin(null);
                setSuche('');
              }}
            >
              Ändern
            </button>
          </div>
        ) : (
          <>
            <input
              id="kundensuche"
              className="feld-eingabe"
              value={suche}
              onChange={(e) => setSuche(e.target.value)}
              placeholder="Name, E-Mail oder Telefonnummer"
              autoComplete="off"
            />
            <p className="text-grau-700 mt-1 text-[12px]">
              Ab drei Zeichen wird gesucht. Es gibt bewusst keine durchblätterbare Kundenliste — das
              wäre ein Verzeichnis aller Patientinnen.
            </p>

            {treffer.data !== undefined && treffer.data.length > 0 && (
              <ul className="border-creme-tief mt-2 divide-y divide-[var(--color-creme-tief)] rounded-[10px] border">
                {treffer.data.map((k) => (
                  <li key={k.id}>
                    <button
                      type="button"
                      className="hover:bg-creme w-full px-3 py-2 text-left text-sm"
                      onClick={() => setKundin({ id: k.id, name: `${k.vorname} ${k.nachname}` })}
                    >
                      <div className="text-tinte font-medium">
                        {k.vorname} {k.nachname}
                      </div>
                      <div className="text-grau-700 text-[12px]">
                        {k.email}
                        {k.telefon !== null && k.telefon !== '' ? ` · ${k.telefon}` : ''}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {treffer.data?.length === 0 && suche.trim().length >= 3 && (
              <p className="text-grau-700 mt-2 text-[13px]">
                Niemand gefunden. Wer noch kein Konto hat, legt es in der App selbst an — hier
                lassen sich keine Kundenkonten anlegen.
              </p>
            )}
          </>
        )}
      </div>

      {/* 2 — was möchte sie */}
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="feld-beschriftung" htmlFor="leistung">
            Leistung
          </label>
          <select
            id="leistung"
            className="feld-eingabe"
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setStaffId('');
            }}
          >
            <option value="">auswählen …</option>
            {(leistungen.data ?? [])
              .filter((l) => l.buchbar)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} · {l.durationMinutes} min
                </option>
              ))}
          </select>
        </div>

        <div>
          <label className="feld-beschriftung" htmlFor="bei">
            Bei
          </label>
          <select
            id="bei"
            className="feld-eingabe"
            value={staffId}
            disabled={serviceId === ''}
            onChange={(e) => setStaffId(e.target.value)}
          >
            <option value="">auswählen …</option>
            {(anbieter.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.displayName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3 — wann */}
      <div className="mb-4">
        <label className="feld-beschriftung" htmlFor="tag">
          Tag
        </label>
        <input
          id="tag"
          type="date"
          className="feld-eingabe max-w-48"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
        />
      </div>

      {serviceId !== '' && staffId !== '' && (
        <div className="mb-4">
          <div className="feld-beschriftung">Freie Zeiten am {langesDatum(tag)}</div>

          {slots.isPending && <p className="text-grau-700 text-sm">Wird geladen …</p>}

          {slots.data?.length === 0 && (
            <p className="text-grau-700 text-sm">
              An diesem Tag ist nichts frei. Die Aufräumzeit nach jeder Behandlung ist dabei schon
              berücksichtigt.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {(slots.data ?? []).map((s) => (
              <button
                key={s.startsAt}
                type="button"
                className="knopf knopf-still min-h-10 px-3 text-sm"
                disabled={kundin === null || buchen.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Termin für ${kundin?.name} am ${langesDatum(tag)} um ` +
                        `${ortszeit(s.startsAt).zeit} buchen?`,
                    )
                  ) {
                    buchen.mutate(s.startsAt);
                  }
                }}
              >
                {ortszeit(s.startsAt).zeit}
              </button>
            ))}
          </div>

          {kundin === null && (slots.data ?? []).length > 0 && (
            <p className="text-grau-700 mt-2 text-[13px]">Wählen Sie zuerst die Kundin aus.</p>
          )}
        </div>
      )}

      {fehler !== null && (
        <div className="meldung meldung-fehler mb-4" role="alert">
          {fehler}
        </div>
      )}

      <button type="button" className="knopf knopf-still" onClick={onAbbrechen}>
        Abbrechen
      </button>
    </div>
  );
}
