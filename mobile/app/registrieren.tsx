import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ApiFehler, api } from '../api/client';
import { Feld } from '../components/Feld';
import { Knopf } from '../components/Knopf';
import { TIPPFLAECHE_MIN, abstand, farben, radius, textStil } from '../theme/tokens';

/** Kontrollkästchen. Die gesamte Zeile ist antippbar, nicht nur das Kästchen. */
function Haken({
  an,
  onToggle,
  children,
}: {
  an: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: an }}
      style={stile.hakenZeile}
    >
      <View style={[stile.kaestchen, an && stile.kaestchenAn]}>
        {an && <Text style={stile.hakenZeichen}>✓</Text>}
      </View>
      <View style={stile.hakenText}>{children}</View>
    </Pressable>
  );
}

export default function Registrieren() {
  const router = useRouter();

  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [passwort, setPasswort] = useState('');

  // Einwilligungen sind bewusst NICHT vorangekreuzt (Art. 7 Abs. 2 DSGVO).
  const [agb, setAgb] = useState(false);
  const [datenschutz, setDatenschutz] = useState(false);
  const [marketing, setMarketing] = useState(false);

  const [felderFehler, setFelderFehler] = useState<Record<string, string>>({});
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  const [laedt, setLaedt] = useState(false);

  const pflichtErfuellt =
    vorname.trim() !== '' &&
    nachname.trim() !== '' &&
    email.trim() !== '' &&
    passwort.length >= 12 &&
    agb &&
    datenschutz;

  async function registrieren() {
    setLaedt(true);
    setFehler(null);
    setFelderFehler({});

    try {
      await api.registrieren({
        email: email.trim(),
        password: passwort,
        firstName: vorname.trim(),
        lastName: nachname.trim(),
        phone: telefon.trim() === '' ? undefined : telefon.trim(),
        acceptedTerms: agb,
        acceptedPrivacy: datenschutz,
        acceptedMarketing: marketing,
      });
      setFertig(true);
    } catch (e) {
      if (e instanceof ApiFehler) {
        setFehler(e.message);
        if (e.felder) setFelderFehler(e.felder);
      } else {
        setFehler('Es ist ein unerwarteter Fehler aufgetreten.');
      }
    } finally {
      setLaedt(false);
    }
  }

  if (fertig) {
    return (
      <View style={[stile.wurzel, stile.mitteVoll]}>
        <View style={stile.karte}>
          <View style={stile.erfolgKreis}>
            <Text style={stile.erfolgZeichen}>✓</Text>
          </View>
          <Text style={[textStil.titel, stile.titelMitte]}>Fast geschafft</Text>
          <Text style={[textStil.untertitel, stile.untertitelMitte]}>
            Wir haben Ihnen eine E-Mail geschickt. Bitte bestätigen Sie darin Ihre Adresse, dann
            können Sie Termine buchen.
          </Text>
          <Knopf titel="Zur Anmeldung" variante="gold" onPress={() => router.replace('/')} />
        </View>
      </View>
    );
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
        <View style={stile.karte}>
          <Text style={[textStil.titel, stile.titel]}>Konto anlegen</Text>
          <Text style={[textStil.untertitel, stile.untertitel]}>
            Damit buchen Sie Termine und sehen Ihre Historie.
          </Text>

          <View style={stile.zweiSpalten}>
            <View style={stile.spalte}>
              <Feld
                beschriftung="Vorname"
                value={vorname}
                onChangeText={setVorname}
                placeholder="Lea"
                autoComplete="given-name"
                fehler={felderFehler.firstName}
              />
            </View>
            <View style={stile.spalte}>
              <Feld
                beschriftung="Nachname"
                value={nachname}
                onChangeText={setNachname}
                placeholder="Muster"
                autoComplete="family-name"
                fehler={felderFehler.lastName}
              />
            </View>
          </View>

          <Feld
            beschriftung="E-Mail-Adresse"
            value={email}
            onChangeText={setEmail}
            placeholder="ihre@adresse.at"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            fehler={felderFehler.email}
          />

          <Feld
            beschriftung="Telefon (optional)"
            value={telefon}
            onChangeText={setTelefon}
            placeholder="+43 660 1234567"
            keyboardType="phone-pad"
            autoComplete="tel"
            fehler={felderFehler.phone}
          />

          <Feld
            beschriftung="Passwort"
            value={passwort}
            onChangeText={setPasswort}
            placeholder="Mindestens 12 Zeichen"
            istPasswort
            autoComplete="new-password"
            fehler={felderFehler.password}
          />

          <Text style={[textStil.hinweis, stile.passwortHinweis]}>
            Mindestens 12 Zeichen. Eine Wortfolge, die Sie sich merken können, ist sicherer als ein
            kurzes Passwort mit Sonderzeichen.
          </Text>

          <View style={stile.einwilligungen}>
            <Haken an={agb} onToggle={() => setAgb((v) => !v)}>
              <Text style={[textStil.hinweis, stile.hakenSchrift]}>
                Ich akzeptiere die <Text style={stile.link}>AGB</Text>.
              </Text>
            </Haken>

            <Haken an={datenschutz} onToggle={() => setDatenschutz((v) => !v)}>
              <Text style={[textStil.hinweis, stile.hakenSchrift]}>
                Ich habe die <Text style={stile.link}>Datenschutzerklärung</Text> gelesen.
              </Text>
            </Haken>

            <Haken an={marketing} onToggle={() => setMarketing((v) => !v)}>
              <Text style={[textStil.hinweis, stile.hakenSchrift]}>
                Ich möchte Angebote per E-Mail erhalten.{' '}
                <Text style={stile.freiwillig}>Freiwillig, jederzeit widerrufbar.</Text>
              </Text>
            </Haken>
          </View>

          {fehler !== null && (
            <View style={stile.fehlerFlaeche} accessibilityLiveRegion="assertive">
              <Text style={[textStil.hinweis, { color: farben.fehler }]}>{fehler}</Text>
            </View>
          )}

          <Knopf
            titel="Konto anlegen"
            onPress={registrieren}
            laedt={laedt}
            deaktiviert={!pflichtErfuellt}
          />
        </View>

        <View style={stile.fussbereich}>
          <Text style={[textStil.hinweis, { color: farben.grau700 }]}>Schon ein Konto?</Text>
          <Link href="/" style={stile.linkBetont}>
            Anmelden
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const stile = StyleSheet.create({
  wurzel: { flex: 1, backgroundColor: farben.creme },
  mitteVoll: { justifyContent: 'center', padding: abstand.l },
  inhalt: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: abstand.l,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  karte: {
    backgroundColor: farben.weiss,
    borderRadius: radius.karte,
    padding: abstand.l,
    borderWidth: 1,
    borderColor: farben.cremeTief,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  titel: { color: farben.tinte, marginBottom: abstand.xs },
  titelMitte: { color: farben.tinte, textAlign: 'center', marginBottom: abstand.s },
  untertitel: { color: farben.grau700, marginBottom: abstand.l },
  untertitelMitte: { color: farben.grau700, textAlign: 'center', marginBottom: abstand.l },
  zweiSpalten: { flexDirection: 'row', gap: abstand.m },
  spalte: { flex: 1 },
  passwortHinweis: { color: farben.grau700, marginTop: -abstand.s, marginBottom: abstand.l },
  einwilligungen: { gap: abstand.s, marginBottom: abstand.l },
  hakenZeile: { flexDirection: 'row', alignItems: 'flex-start', minHeight: TIPPFLAECHE_MIN - 12 },
  kaestchen: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: farben.grau300,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: abstand.s,
    marginTop: 2,
    backgroundColor: farben.weiss,
  },
  kaestchenAn: { backgroundColor: farben.gold, borderColor: farben.gold },
  // Dunkles Häkchen auf Gold: 7,31:1. Weiß wäre 2,48:1 und würde durchfallen.
  hakenZeichen: { color: farben.tinte, fontSize: 15, lineHeight: 18, fontWeight: '700' },
  hakenText: { flex: 1 },
  hakenSchrift: { color: farben.tinteSanft },
  freiwillig: { color: farben.grau700 },
  link: { color: farben.goldText, textDecorationLine: 'underline' },
  linkBetont: { ...textStil.beschriftung, color: farben.goldText },
  fehlerFlaeche: {
    backgroundColor: farben.fehlerFlaeche,
    borderRadius: radius.feld,
    padding: abstand.m,
    borderLeftWidth: 3,
    borderLeftColor: farben.fehler,
    marginBottom: abstand.m,
  },
  erfolgKreis: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: farben.gold,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: abstand.m,
  },
  erfolgZeichen: { color: farben.tinte, fontSize: 30, lineHeight: 36 },
  fussbereich: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: abstand.s,
    marginTop: abstand.l,
  },
});
