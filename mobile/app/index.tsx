import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feld } from '../components/Feld';
import { Knopf } from '../components/Knopf';
import { abstand, farben, textStil } from '../theme/tokens';

/**
 * Anmeldung.
 *
 * Der Endpunkt entsteht erst in Schritt 9. Die Maske ist vollständig, die
 * Anmeldung meldet bis dahin, dass sie noch nicht möglich ist — bewusst
 * sichtbar statt stillschweigend ohne Wirkung.
 */
export default function Anmeldung() {
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [hinweis, setHinweis] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  const vollstaendig = email.trim().length > 0 && passwort.length > 0;

  async function anmelden() {
    setLaedt(true);
    setHinweis(null);
    // Platzhalter bis Schritt 9.
    await new Promise((r) => setTimeout(r, 400));
    setHinweis('Die Anmeldung ist noch nicht verfügbar — der Endpunkt entsteht in Schritt 9.');
    setLaedt(false);
  }

  return (
    <KeyboardAvoidingView
      style={stile.wurzel}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={stile.inhalt}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={stile.kopf}>
          <Text style={stile.marke}>DERMAZENTRUM</Text>
          <Text style={stile.markeZusatz}>Siebenhirten</Text>
        </View>

        <View style={stile.karte}>
          <Text style={[textStil.titel, stile.titel]}>Willkommen zurück</Text>
          <Text style={[textStil.untertitel, stile.untertitel]}>
            Melden Sie sich an, um Ihre Termine zu verwalten.
          </Text>

          <Feld
            beschriftung="E-Mail-Adresse"
            value={email}
            onChangeText={setEmail}
            placeholder="ihre@adresse.at"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />

          <Feld
            beschriftung="Passwort"
            value={passwort}
            onChangeText={setPasswort}
            placeholder="Ihr Passwort"
            istPasswort
            autoComplete="current-password"
            textContentType="password"
          />

          {hinweis !== null && (
            <View style={stile.hinweisFlaeche} accessibilityLiveRegion="polite">
              <Text style={[textStil.hinweis, { color: farben.tinteSanft }]}>{hinweis}</Text>
            </View>
          )}

          <View style={stile.knopfAbstand}>
            <Knopf titel="Anmelden" onPress={anmelden} laedt={laedt} deaktiviert={!vollstaendig} />
          </View>

          <View style={stile.mitte}>
            <Link href="/passwort-vergessen" style={stile.linkHinweis}>
              Passwort vergessen?
            </Link>
          </View>
        </View>

        <View style={stile.fussbereich}>
          <Text style={[textStil.hinweis, { color: farben.grau700 }]}>Noch kein Konto?</Text>
          <Link href="/registrieren" style={stile.linkBetont}>
            Jetzt registrieren
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const stile = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: farben.creme },
  inhalt: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: abstand.l,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  kopf: { alignItems: 'center', marginBottom: abstand.xl },
  marke: {
    fontFamily: 'Poppins-SemiBold',
    fontSize: 20,
    letterSpacing: 2,
    color: farben.tinte,
  },
  markeZusatz: {
    fontFamily: 'Poppins-Light',
    fontSize: 15,
    letterSpacing: 4,
    color: farben.goldText,
  },
  karte: {
    backgroundColor: farben.weiss,
    borderRadius: 16,
    padding: abstand.l,
    borderWidth: 1,
    borderColor: farben.cremeTief,
  },
  titel: { color: farben.tinte, marginBottom: abstand.xs },
  untertitel: { color: farben.grau700, marginBottom: abstand.l },
  hinweisFlaeche: {
    backgroundColor: farben.creme,
    borderRadius: 8,
    padding: abstand.m,
    borderLeftWidth: 3,
    borderLeftColor: farben.gold,
    marginBottom: abstand.m,
  },
  knopfAbstand: { marginTop: abstand.s },
  mitte: { alignItems: 'center', marginTop: abstand.m },
  linkHinweis: { ...textStil.hinweis, color: farben.goldText },
  linkBetont: { ...textStil.beschriftung, color: farben.goldText },
  fussbereich: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: abstand.s,
    marginTop: abstand.l,
  },
});
