import { useSitzung } from '../auth/SitzungsKontext';

/** Startseite der Verwaltung. Inhalte kommen mit den jeweiligen Schritten. */
export function Uebersicht() {
  const { person } = useSitzung();
  const istAdmin = person?.role === 'ADMIN';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-tinte text-3xl font-semibold">Guten Tag, {person?.firstName}</h1>
        <p className="text-grau-700 mt-1">
          {istAdmin
            ? 'Hier verwalten Sie Termine, Leistungen und Ihr Team.'
            : 'Hier sehen Sie Ihren Kalender und Ihre Termine.'}
        </p>
      </div>

      <div className="karte">
        <h2 className="text-tinte text-lg font-semibold">Was als Nächstes entsteht</h2>
        <p className="text-grau-700 mt-1 text-sm">
          Die Verwaltung wächst schrittweise. Die ausgegrauten Menüpunkte zeigen, was geplant ist.
        </p>
        <ul className="text-tinte-sanft mt-4 space-y-2 text-sm">
          <li>
            <span className="text-gold-text font-medium">Stammdaten</span> — Leistungen,
            Kosmetiker:innen und Arbeitszeiten pflegen
          </li>
          <li>
            <span className="text-gold-text font-medium">Kalender</span> — Termine sehen, anlegen
            und per Drag &amp; Drop verschieben
          </li>
          <li>
            <span className="text-gold-text font-medium">Kundinnen</span> — Historie und
            Behandlungsnotizen
          </li>
        </ul>
      </div>

      <div className="meldung">
        Ab dem Kalender ist die Verwaltung eigenständig nutzbar: Telefonisch vereinbarte Termine
        lassen sich dann digital führen, auch bevor die App für die Kundschaft fertig ist.
      </div>
    </div>
  );
}
