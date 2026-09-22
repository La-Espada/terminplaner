import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Knopf } from '../components/Knopf';
import { abstand, farben, radius, textStil } from '../theme/tokens';

/** Platzhalter. Der Ablauf entsteht in Schritt 12. */
export default function PasswortVergessen() {
  const router = useRouter();
  return (
    <View style={stile.wurzel}>
      <View style={stile.karte}>
        <Text style={[textStil.titel, stile.titel]}>Passwort vergessen</Text>
        <Text style={[textStil.untertitel, stile.text]}>
          Diese Funktion entsteht in Schritt 12. Danach schicken wir Ihnen einen Link, mit dem Sie
          ein neues Passwort vergeben können.
        </Text>
        <Knopf titel="Zurück zur Anmeldung" variante="gold" onPress={() => router.replace('/')} />
      </View>
    </View>
  );
}

const stile = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: farben.creme, justifyContent: 'center', padding: abstand.l },
  karte: {
    backgroundColor: farben.weiss,
    borderRadius: radius.karte,
    padding: abstand.l,
    borderWidth: 1,
    borderColor: farben.cremeTief,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  titel: { color: farben.tinte, marginBottom: abstand.s },
  text: { color: farben.grau700, marginBottom: abstand.l },
});
