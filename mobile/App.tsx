import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { DarkTheme, NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { MatchOverlay, Toast } from './src/components/Overlays';
import { fontSources } from './src/fonts';
import { initServices } from './src/lib/services';
import { useApp } from './src/lib/store';
import { TabBar, type RootStack, type Tabs } from './src/navigation';
import { AccountScreen } from './src/screens/Account';
import { AroundScreen } from './src/screens/Around';
import { ChatScreen } from './src/screens/Chat';
import { ChatsScreen } from './src/screens/Chats';
import { MeScreen } from './src/screens/Me';
import { NearbyScreen } from './src/screens/Nearby';
import { Onboarding } from './src/screens/Onboarding';
import { PersonScreen } from './src/screens/Person';
import { EditProfileScreen } from './src/screens/Profile';
import { LocationScreen } from './src/screens/Location';
import { ReportScreen } from './src/screens/Report';
import { SettingsScreen } from './src/screens/Settings';
import { C } from './src/theme';

const Stack = createNativeStackNavigator<RootStack>();
const Tab = createBottomTabNavigator<Tabs>();
const navRef = createNavigationContainerRef<RootStack>();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.midnight, card: C.midnight, text: C.cream, border: C.haze, primary: C.hibiscus },
};

function TabsScreen() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.midnight } }} tabBar={(p) => <TabBar {...p} />}>
      <Tab.Screen name="Nearby" component={NearbyScreen} />
      <Tab.Screen name="Around" component={AroundScreen} />
      <Tab.Screen name="Chats" component={ChatsScreen} />
      <Tab.Screen name="Me" component={MeScreen} />
    </Tab.Navigator>
  );
}

function useHydrated() {
  const [done, setDone] = useState(() => useApp.persist.hasHydrated());
  useEffect(() => {
    const unsub = useApp.persist.onFinishHydration(() => setDone(true));
    setDone(useApp.persist.hasHydrated());
    return unsub;
  }, []);
  return done;
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontSources);
  const hydrated = useHydrated();
  const onboarded = useApp((s) => !!s.profile);

  useEffect(() => {
    if (hydrated) initServices();
  }, [hydrated]);

  if (!hydrated || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, backgroundColor: C.midnight, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={C.blue} />
      </View>
    );
  }

  return (
    // On a wide browser window the web preview stays phone-shaped.
    <View style={{ flex: 1, backgroundColor: Platform.OS === 'web' ? C.ink : C.midnight, alignItems: 'center' }}>
      <View style={{ flex: 1, width: '100%', maxWidth: Platform.OS === 'web' ? 480 : undefined }}>
    <SafeAreaProvider style={{ backgroundColor: C.midnight }}>
      <StatusBar style="light" />
      <NavigationContainer ref={navRef} theme={theme}>
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.midnight }, animation: 'slide_from_right' }}>
          {!onboarded ? (
            <Stack.Screen name="Onboarding" component={Onboarding} />
          ) : (
            <>
              <Stack.Screen name="Tabs" component={TabsScreen} />
              <Stack.Screen name="Chat" component={ChatScreen} />
              <Stack.Screen name="EditProfile" component={EditProfileScreen} />
              <Stack.Screen name="Settings" component={SettingsScreen} />
              <Stack.Screen name="Account" component={AccountScreen} />
              <Stack.Screen name="Person" component={PersonScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="Report" component={ReportScreen} options={{ animation: 'slide_from_bottom' }} />
              <Stack.Screen name="Location" component={LocationScreen} />
            </>
          )}
        </Stack.Navigator>
        {onboarded ? <MatchOverlay onChat={(id) => navRef.isReady() && navRef.navigate('Chat', { id })} /> : null}
        <Toast />
      </NavigationContainer>
    </SafeAreaProvider>
      </View>
    </View>
  );
}
