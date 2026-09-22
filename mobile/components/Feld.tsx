import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { TIPPFLAECHE_MIN, abstand, farben, radius, textStil } from '../theme/tokens';

interface Props extends Omit<TextInputProps, 'style'> {
  beschriftung: string;
  fehler?: string;
  /** Zeigt einen Umschalter zum Sichtbarmachen des Passworts. */
  istPasswort?: boolean;
}

/**
 * Eingabefeld mit Beschriftung und Fehlermeldung.
 *
 * Der Fehler steht **unter** dem Feld und ist per `accessibilityLiveRegion` mit
 * dem Feld verknüpft, damit Screenreader ihn vorlesen. Ein roter Rahmen allein
 * würde für Menschen mit Rotsehschwäche nichts aussagen — deshalb immer auch Text.
 */
export function Feld({ beschriftung, fehler, istPasswort, ...rest }: Props) {
  const [sichtbar, setSichtbar] = useState(false);
  const hatFehler = typeof fehler === 'string' && fehler.length > 0;

  return (
    <View style={stile.gruppe}>
      <Text style={[textStil.beschriftung, stile.beschriftung]}>{beschriftung}</Text>

      <View style={stile.reihe}>
        <TextInput
          {...rest}
          secureTextEntry={istPasswort === true && !sichtbar}
          placeholderTextColor={farben.grau500}
          accessibilityLabel={beschriftung}
          style={[
            textStil.eingabe,
            stile.feld,
            istPasswort === true && stile.feldMitKnopf,
            hatFehler && stile.feldFehler,
          ]}
        />

        {istPasswort === true && (
          <Pressable
            onPress={() => setSichtbar((s) => !s)}
            accessibilityRole="button"
            accessibilityLabel={sichtbar ? 'Passwort verbergen' : 'Passwort anzeigen'}
            style={stile.augeKnopf}
          >
            <Text style={[textStil.hinweis, { color: farben.goldText }]}>
              {sichtbar ? 'verbergen' : 'anzeigen'}
            </Text>
          </Pressable>
        )}
      </View>

      {hatFehler && (
        <Text
          style={[textStil.hinweis, stile.fehler]}
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
        >
          {fehler}
        </Text>
      )}
    </View>
  );
}

const stile = StyleSheet.create({
  gruppe: { marginBottom: abstand.m },
  beschriftung: { color: farben.tinteSanft, marginBottom: abstand.xs },
  reihe: { position: 'relative', justifyContent: 'center' },
  feld: {
    minHeight: TIPPFLAECHE_MIN,
    borderWidth: 1,
    borderColor: farben.grau300,
    borderRadius: radius.feld,
    paddingHorizontal: abstand.m,
    paddingVertical: abstand.s,
    color: farben.tinteWeich,
    backgroundColor: farben.weiss,
  },
  feldMitKnopf: { paddingRight: 96 },
  feldFehler: { borderColor: farben.fehler, backgroundColor: farben.fehlerFlaeche },
  augeKnopf: {
    position: 'absolute',
    right: abstand.s,
    height: TIPPFLAECHE_MIN,
    justifyContent: 'center',
    paddingHorizontal: abstand.s,
  },
  fehler: { color: farben.fehler, marginTop: abstand.xs },
});
