/**
 * Design-Tokens des Dermazentrums.
 *
 * Quelle: docs/DESIGN.md — ausgelesen aus der Website, nicht geschätzt.
 * Änderungen bitte dort zuerst, damit App und Admin-Web nicht auseinanderlaufen.
 */

export const farben = {
  /** Akzent. Nur als Fläche oder auf dunklem Grund — siehe `goldText`. */
  gold: '#c2a05a',
  goldHell: '#dcb96e',
  /**
   * Gold als Schriftfarbe auf Hellem. Das volle Gold erreicht auf Weiß nur
   * 2,48:1 und fällt durch WCAG AA; diese abgedunkelte Variante schafft 5,04:1
   * bei gleichem Farbton.
   */
  goldText: '#846c2e',

  tinte: '#161614',
  tinteWeich: '#1f1f1d',
  tinteSanft: '#2a2a27',

  weiss: '#ffffff',
  creme: '#fdfbf7',
  cremeTief: '#f3ede1',

  grau700: '#6f6f69',
  grau500: '#a3a39d',
  grau300: '#c9c9c5',
  grau100: '#e7e7e5',

  /** Fehler. Rotton, der zum warmen Gold passt statt gegen es zu schreien. */
  fehler: '#a8323c',
  fehlerFlaeche: '#fdf2f3',
} as const;

export const schrift = {
  light: 'Poppins-Light',
  regular: 'Poppins-Regular',
  medium: 'Poppins-Medium',
  semibold: 'Poppins-SemiBold',
} as const;

/**
 * In React Native wirkt `fontWeight` nicht auf eingebundene Schriften. Der
 * Schnitt wird über `fontFamily` gewählt — siehe assets/fonts/poppins/README.md.
 */
export const textStil = {
  titel: { fontFamily: schrift.semibold, fontSize: 28, lineHeight: 36 },
  untertitel: { fontFamily: schrift.regular, fontSize: 16, lineHeight: 24 },
  beschriftung: { fontFamily: schrift.medium, fontSize: 14, lineHeight: 20 },
  eingabe: { fontFamily: schrift.regular, fontSize: 16, lineHeight: 24 },
  knopf: { fontFamily: schrift.semibold, fontSize: 16, lineHeight: 24 },
  hinweis: { fontFamily: schrift.regular, fontSize: 13, lineHeight: 18 },
} as const;

export const abstand = {
  xs: 4,
  s: 8,
  m: 16,
  l: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  knopf: 8,
  feld: 8,
  karte: 16,
} as const;

/**
 * Mindestgröße für alles, was angetippt wird. 44 Punkte ist die
 * Apple-Empfehlung, Android nennt 48 dp — wir nehmen den größeren Wert.
 */
export const TIPPFLAECHE_MIN = 48;
