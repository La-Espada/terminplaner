# Design-Tokens

Abgeleitet von der bestehenden Website **https://www.derma-siebenhirten.at/**
(Dermazentrum Siebenhirten, Dr. Aynur Aslan, Porschestraße 29/13, 1230 Wien).

Stand: 2026-09-21. Ausgelesen aus den gerenderten Stilen der Startseite, nicht geschätzt.

---

## Die Marke in einem Satz

Warmes Gold auf fast schwarzem Grund, viel Weißraum, eine einzige Schrift. Zurückhaltend
und hochwertig — kein Klinikweiß, aber auch nichts Verspieltes.

---

## Farben

### Akzent — Gold

| Token       | Wert      | Verwendung                                               |
| ----------- | --------- | -------------------------------------------------------- |
| `gold`      | `#c2a05a` | Flächen: Knopfhintergrund, Icons, Trennlinien            |
| `gold-hell` | `#dcb96e` | Rahmen, Hover auf dunklem Grund                          |
| `gold-text` | `#846c2e` | **Gold als Schriftfarbe auf Weiß** — siehe Warnung unten |

### Dunkel

| Token         | Wert      | Verwendung                    |
| ------------- | --------- | ----------------------------- |
| `tinte`       | `#161614` | Dunkle Bänder, primärer Knopf |
| `tinte-weich` | `#1f1f1d` | Fließtext                     |
| `tinte-sanft` | `#2a2a27` | sekundärer Text auf Weiß      |

### Flächen

| Token        | Wert      | Verwendung                              |
| ------------ | --------- | --------------------------------------- |
| `weiss`      | `#ffffff` | Karten, Hauptfläche                     |
| `creme`      | `#fdfbf7` | abgesetzte Abschnitte, sehr warmes Weiß |
| `creme-tief` | `#f3ede1` | Rahmen und Trennlinien, warmes Beige    |

### Grautöne

| Token      | Wert      | Kontrast auf Weiß | Verwendung                    |
| ---------- | --------- | ----------------- | ----------------------------- |
| `grau-700` | `#6f6f69` | 5,06 ✓            | Hilfstexte, Beschriftungen    |
| `grau-500` | `#a3a39d` | 2,54 ✗            | nur auf dunklem Grund         |
| `grau-300` | `#c9c9c5` | —                 | deaktivierte Elemente, Rahmen |
| `grau-100` | `#e7e7e5` | —                 | Trennlinien                   |

---

## Warnung: Gold trägt keine Schrift auf hellem Grund

Das gemessene Markengold erreicht gegen Weiß nur **2,48:1**. WCAG AA verlangt 4,5:1 für
normalen Text und 3:1 für Bedienelemente. Die Website setzt aktuell weiße Schrift auf
goldenen Grund ein (Knopf „Online Termin buchen") — das erfüllt die Anforderung nicht.

| Kombination                           | Kontrast | Urteil               |
| ------------------------------------- | -------- | -------------------- |
| Weiße Schrift auf `#c2a05a`           | 2,48     | durchgefallen        |
| **Dunkle Schrift `#161614` auf Gold** | **7,31** | **besteht deutlich** |
| `#c2a05a` als Schrift auf Weiß        | 2,48     | durchgefallen        |
| **`#846c2e` als Schrift auf Weiß**    | **5,04** | **besteht**          |
| `#c2a05a` auf dunkel `#161614`        | 7,31     | besteht              |

**Die drei Regeln, die daraus folgen:**

1. Goldener Knopf bekommt **dunkle Schrift**, nicht weiße.
2. Gold als Schriftfarbe auf Weiß nur in der dunklen Variante `#846c2e`.
3. Auf dunklem Grund ist das volle Gold `#c2a05a` als Schrift unproblematisch.

Das ist keine Kosmetik. Die App wird auch von Menschen mit eingeschränktem Sehvermögen
bei ungünstigem Licht bedient, und bei einer Gesundheitseinrichtung ist Barrierefreiheit
zusätzlich ein Thema, das man nicht offen stehen lassen will.

---

## Schrift

**Poppins** — durchgehend, keine zweite Schriftfamilie auf der gesamten Website.

```
font-family: Poppins, ui-sans-serif, system-ui, sans-serif;
```

**Liegt bereits lokal im Projekt:** `assets/fonts/poppins/` — WOFF2 fürs Web, TTF für
Expo, dazu die Lizenzdatei. Vier Schnitte (300, 400, 500, 600), keine Kursiven; genau
die, die die Website verwendet.

Bewusst **nicht** vom Google-CDN geladen: Das würde die IP-Adresse jeder Besucherin an
Google in die USA übertragen — ein vermeidbarer Drittlandtransfer, der in die
Datenschutzerklärung müsste. Einbindung und Stolperfallen stehen in
`assets/fonts/poppins/README.md`.

---

## Formen

| Element               | Radius           |
| --------------------- | ---------------- |
| Knopf                 | `8px`            |
| Karte                 | `16px`           |
| Hervorgehobener Knopf | vollständig rund |

---

## Logo

`https://www.derma-siebenhirten.at/logo.svg` — SVG, 250 × 69, Wortmarke mit Bildzeichen.

Vom Studio die Originaldatei erbitten, möglichst mit heller Variante für dunklen Grund
und einem quadratischen Bildzeichen für das App-Symbol. Das gerenderte SVG von der
Website ist für ein App-Icon zu breit.

---

## Zum Kopieren: Tailwind-Theme

Für Schritt 14, wenn `web-admin/` entsteht.

```js
// tailwind.config.js
export default {
  theme: {
    extend: {
      colors: {
        gold: { DEFAULT: '#c2a05a', hell: '#dcb96e', text: '#846c2e' },
        tinte: { DEFAULT: '#161614', weich: '#1f1f1d', sanft: '#2a2a27' },
        creme: { DEFAULT: '#fdfbf7', tief: '#f3ede1' },
        grau: { 100: '#e7e7e5', 300: '#c9c9c5', 500: '#a3a39d', 700: '#6f6f69' },
      },
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: { knopf: '8px', karte: '16px' },
    },
  },
};
```

---

## Noch offen

- [ ] Logo als Originaldatei vom Studio, plus helle Variante und quadratisches Bildzeichen
- [x] ~~Poppins als Schriftdateien ins Projekt legen~~ — erledigt, `assets/fonts/poppins/`
- [ ] Klären, ob die App optisch zur Website gehören soll oder bewusst eigenständig auftritt
- [ ] Dunkelmodus: Die Marke bringt bereits eine dunkle Fläche mit, das lässt sich gut
      nutzen — aber die Goldtöne müssen dort erneut geprüft werden
