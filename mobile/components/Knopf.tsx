import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { TIPPFLAECHE_MIN, abstand, farben, radius, textStil } from '../theme/tokens';

interface Props {
  titel: string;
  onPress: () => void;
  variante?: 'primaer' | 'gold' | 'text';
  laedt?: boolean;
  deaktiviert?: boolean;
}

/**
 * Knopf in drei Varianten.
 *
 * Die goldene Variante trägt **dunkle** Schrift, nicht weiße. Weiß auf Gold
 * erreicht nur 2,48:1 und fällt durch WCAG AA; dunkel auf Gold schafft 7,31:1.
 * Siehe docs/DESIGN.md.
 */
export function Knopf({ titel, onPress, variante = 'primaer', laedt, deaktiviert }: Props) {
  const aus = deaktiviert === true || laedt === true;

  const flaeche =
    variante === 'gold' ? farben.gold : variante === 'text' ? 'transparent' : farben.tinte;
  const schriftfarbe =
    variante === 'gold' ? farben.tinte : variante === 'text' ? farben.goldText : farben.weiss;

  return (
    <Pressable
      onPress={onPress}
      disabled={aus}
      accessibilityRole="button"
      accessibilityState={{ disabled: aus, busy: laedt === true }}
      style={({ pressed }) => [
        stile.basis,
        { backgroundColor: flaeche },
        variante === 'text' && stile.text,
        pressed && !aus && stile.gedrueckt,
        aus && stile.aus,
      ]}
    >
      <View style={stile.inhalt}>
        {laedt === true && <ActivityIndicator size="small" color={schriftfarbe} />}
        <Text style={[textStil.knopf, { color: schriftfarbe }]}>{titel}</Text>
      </View>
    </Pressable>
  );
}

const stile = StyleSheet.create({
  basis: {
    minHeight: TIPPFLAECHE_MIN,
    borderRadius: radius.knopf,
    paddingHorizontal: abstand.l,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    minHeight: TIPPFLAECHE_MIN,
    paddingHorizontal: abstand.s,
  },
  inhalt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: abstand.s,
  },
  gedrueckt: { opacity: 0.85 },
  aus: { opacity: 0.45 },
});
