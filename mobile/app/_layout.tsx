import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { farben } from '../theme/tokens';

export default function WurzelLayout() {
  // Poppins liegt lokal im Projekt, nicht beim Google-CDN — siehe
  // assets/fonts/poppins/README.md.
  const [schriftenGeladen] = useFonts({
    'Poppins-Light': require('../../assets/fonts/poppins/ttf/Poppins-Light.ttf'),
    'Poppins-Regular': require('../../assets/fonts/poppins/ttf/Poppins-Regular.ttf'),
    'Poppins-Medium': require('../../assets/fonts/poppins/ttf/Poppins-Medium.ttf'),
    'Poppins-SemiBold': require('../../assets/fonts/poppins/ttf/Poppins-SemiBold.ttf'),
  });

  if (!schriftenGeladen) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: farben.creme,
        }}
      >
        <ActivityIndicator color={farben.gold} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: farben.creme } }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="registrieren" />
      </Stack>
    </>
  );
}
