import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { ApiFehler, api, type Leistung } from '../api/client';

interface Props {
  /** `null` bedeutet: neu anlegen. */
  leistung: Leistung | null;
  onFertig: () => void;
  onAbbrechen: () => void;
}

/**
 * Preis in Euro als Text zu Cent.
 *
 * Gerechnet wird über Zeichen, nicht über Kommazahlen: `parseFloat('89,90') * 100`
 * liefert 8989.999999999998 — und gerundet landet man mal einen Cent daneben.
 * Siehe E-08.
 */
function euroTextZuCent(text: string): number | null {
  const bereinigt = text.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{0,2})?$/.test(bereinigt)) return null;

  const [ganz, nachkomma = ''] = bereinigt.split('.');
  const cent = nachkomma.padEnd(2, '0').slice(0, 2);
  return Number(ganz) * 100 + Number(cent);
}

function centZuEuroText(cent: number): string {
  return (cent / 100).toFixed(2).replace('.', ',');
}

export function LeistungsFormular({ leistung, onFertig, onAbbrechen }: Props) {
  const istNeu = leistung === null;

  const [name, setName] = useState(leistung?.name ?? '');
  const [beschreibung, setBeschreibung] = useState(leistung?.description ?? '');
  const [dauer, setDauer] = useState(String(leistung?.durationMinutes ?? 60));
  const [puffer, setPuffer] = useState(String(leistung?.bufferMinutes ?? 0));
  const [preis, setPreis] = useState(leistung !== null ? centZuEuroText(leistung.priceCents) : '');
  const [reihenfolge, setReihenfolge] = useState(String(leistung?.sortOrder ?? 0));
  const [fehler, setFehler] = useState<string | null>(null);

  const preisCent = euroTextZuCent(preis);
  const dauerZahl = Number.parseInt(dauer, 10);
  const pufferZahl = Number.parseInt(puffer, 10);

  const preisUngueltig = preis.trim() !== '' && preisCent === null;
  const gueltig =
    name.trim().length >= 2 &&
    Number.isInteger(dauerZahl) &&
    dauerZahl >= 5 &&
    Number.isInteger(pufferZahl) &&
    pufferZahl >= 0 &&
    preisCent !== null;

  const speichern = useMutation({
    mutationFn: async () => {
      const daten = {
        name: name.trim(),
        description: beschreibung.trim(),
        durationMinutes: dauerZahl,
        bufferMinutes: pufferZahl,
        priceCents: preisCent as number,
        sortOrder: Number.parseInt(reihenfolge, 10) || 0,
      };
      return istNeu ? api.leistungen.anlegen(daten) : api.leistungen.aendern(leistung.id, daten);
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
        {istNeu ? 'Leistung anlegen' : 'Leistung bearbeiten'}
      </h1>

      <form className="karte" onSubmit={absenden} noValidate>
        <div className="mb-4">
          <label className="feld-beschriftung" htmlFor="name">
            Bezeichnung
          </label>
          <input
            id="name"
            className="feld-eingabe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Gesichtsbehandlung"
            required
          />
        </div>

        <div className="mb-4">
          <label className="feld-beschriftung" htmlFor="beschreibung">
            Beschreibung <span className="text-grau-500 font-normal">(optional)</span>
          </label>
          <textarea
            id="beschreibung"
            className="feld-eingabe min-h-24"
            value={beschreibung}
            onChange={(e) => setBeschreibung(e.target.value)}
            placeholder="Was umfasst die Behandlung? Diesen Text sieht die Kundschaft."
            rows={3}
          />
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="feld-beschriftung" htmlFor="dauer">
              Dauer in Minuten
            </label>
            <input
              id="dauer"
              type="number"
              inputMode="numeric"
              className="feld-eingabe"
              value={dauer}
              onChange={(e) => setDauer(e.target.value)}
              min={5}
              max={600}
              required
            />
          </div>

          <div>
            <label className="feld-beschriftung" htmlFor="puffer">
              Puffer in Minuten
            </label>
            <input
              id="puffer"
              type="number"
              inputMode="numeric"
              className="feld-eingabe"
              value={puffer}
              onChange={(e) => setPuffer(e.target.value)}
              min={0}
              max={240}
            />
            <p className="text-grau-700 mt-1 text-[12px]">
              Aufräumzeit danach. Blockiert den Kalender, wird nicht mitgebucht.
            </p>
          </div>
        </div>

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="feld-beschriftung" htmlFor="preis">
              Preis in Euro
            </label>
            <input
              id="preis"
              inputMode="decimal"
              className="feld-eingabe"
              value={preis}
              onChange={(e) => setPreis(e.target.value)}
              placeholder="89,00"
              aria-invalid={preisUngueltig}
              required
            />
            {preisUngueltig && (
              <p className="text-fehler mt-1 text-[13px]" role="alert">
                Bitte einen Betrag wie 89,00 eingeben.
              </p>
            )}
          </div>

          <div>
            <label className="feld-beschriftung" htmlFor="reihenfolge">
              Reihenfolge
            </label>
            <input
              id="reihenfolge"
              type="number"
              inputMode="numeric"
              className="feld-eingabe"
              value={reihenfolge}
              onChange={(e) => setReihenfolge(e.target.value)}
              min={0}
            />
            <p className="text-grau-700 mt-1 text-[12px]">
              Kleinere Zahl steht weiter oben in der App.
            </p>
          </div>
        </div>

        {fehler !== null && (
          <div className="meldung meldung-fehler mb-4" role="alert">
            {fehler}
          </div>
        )}

        {!istNeu && leistung.terminAnzahl > 0 && (
          <div className="meldung mb-4">
            Diese Leistung wurde bereits {leistung.terminAnzahl}-mal gebucht. Eine Preisänderung
            gilt nur für neue Buchungen — bestehende Termine behalten ihren vereinbarten Preis.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button className="knopf" type="submit" disabled={!gueltig || speichern.isPending}>
            {speichern.isPending ? 'Wird gespeichert …' : 'Speichern'}
          </button>
          <button type="button" className="knopf knopf-still" onClick={onAbbrechen}>
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
