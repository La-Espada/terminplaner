# Poppins

Hausschrift des Dermazentrums, lokal im Projekt statt vom Google-CDN.

**Warum lokal:** Ein Aufruf von `fonts.googleapis.com` überträgt die IP-Adresse jeder
Besucherin an Google in die USA. Das wäre ein vermeidbarer Drittlandtransfer, der in der
Datenschutzerklärung stehen müsste — und bei einer Gesundheitseinrichtung ist genau das
der Ärger, den man sich nicht einhandeln will. Lokal eingebunden entfällt die Frage.

## Was hier liegt

| Ordner   | Format | Wofür                                 |
| -------- | ------ | ------------------------------------- |
| `woff2/` | WOFF2  | `web-admin/` — klein, alle Browser    |
| `ttf/`   | TTF    | `mobile/` — Expo braucht TTF oder OTF |

Vier Schnitte, keine Kursiven: **300 Light, 400 Regular, 500 Medium, 600 SemiBold.**
Genau die, die auf der Website des Studios verwendet werden — geprüft an den gerenderten
Stilen, nicht geraten.

Die WOFF2-Dateien sind nach Zeichensatz getrennt (`latin` und `latin-ext`). Der Browser
lädt nur, was er braucht: für deutschen Text meist nur `latin` mit rund 5,5 kB je
Schnitt. `latin-ext` mit 39 kB kommt nur dazu, wenn tatsächlich Zeichen daraus vorkommen.

## Lizenz

SIL Open Font License 1.1, siehe `OFL.txt`. Weitergabe im Projekt ist ausdrücklich
erlaubt, auch kommerziell. Die Lizenzdatei muss mitgeliefert werden — deshalb liegt sie
hier und darf nicht gelöscht werden.

Herkunft: <https://github.com/google/fonts/tree/main/ofl/poppins> (TTF) und
`fonts.gstatic.com` über die Google-Fonts-CSS-Schnittstelle (WOFF2, einmalig
heruntergeladen).

## Einbinden im Web (`web-admin/`)

```css
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/Poppins-400-latin.woff2') format('woff2');
  unicode-range:
    U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329,
    U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Poppins';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('/fonts/Poppins-400-latin-ext.woff2') format('woff2');
  unicode-range:
    U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329,
    U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F,
    U+A720-A7FF;
}
```

Für 300, 500 und 600 dasselbe mit angepasstem `font-weight` und Dateinamen.

`font-display: swap` sorgt dafür, dass Text sofort sichtbar ist und nicht erst, wenn die
Schrift geladen hat.

## Einbinden in der App (`mobile/`)

```ts
import { useFonts } from 'expo-font';

const [fontsGeladen] = useFonts({
  'Poppins-Light': require('../../assets/fonts/poppins/ttf/Poppins-Light.ttf'),
  'Poppins-Regular': require('../../assets/fonts/poppins/ttf/Poppins-Regular.ttf'),
  'Poppins-Medium': require('../../assets/fonts/poppins/ttf/Poppins-Medium.ttf'),
  'Poppins-SemiBold': require('../../assets/fonts/poppins/ttf/Poppins-SemiBold.ttf'),
});
```

**Achtung, häufige Stolperfalle:** In React Native gibt es kein `fontWeight` für
eingebundene Schriften. Man wählt den Schnitt über `fontFamily: 'Poppins-SemiBold'`.
Wer `fontFamily: 'Poppins'` mit `fontWeight: '600'` schreibt, bekommt auf Android eine
falsch gerechnete Fettschrift und auf iOS gar keine Wirkung.
