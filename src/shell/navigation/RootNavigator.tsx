import React, {useState, useCallback} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {SplashScreen} from '@shell/screens/SplashScreen';
import {LoadingScreen} from '@shell/screens/LoadingScreen';
import {WelcomeScreen} from '@shell/screens/WelcomeScreen';
import {EmailEntryScreen} from '@shell/screens/EmailEntryScreen';
import {ForgotPasswordScreen} from '@shell/screens/ForgotPasswordScreen';
import {ProfileSetupScreen} from '@shell/screens/ProfileSetupScreen';
import {PushNotificationScreen} from '@shell/screens/PushNotificationScreen';
import {PoolWelcomeScreen} from '@shell/screens/PoolWelcomeScreen';
import {PoolSelectionScreen} from '@shell/screens/PoolSelectionScreen';
import {CreatePoolScreen} from '@shell/screens/CreatePoolScreen';
import {JoinPoolScreen} from '@shell/screens/JoinPoolScreen';
import {HomeScreen} from '@shell/screens/HomeScreen';
import {EventDetailScreen} from '@shell/screens/EventDetailScreen';
import {ProfileScreen} from '@shell/screens/ProfileScreen';
import {SettingsScreen} from '@shell/screens/SettingsScreen';
import {PartnerAdminScreen} from '@shell/screens/PartnerAdminScreen';
import {PoolMembersScreen} from '@shell/screens/PoolMembersScreen';
import {PoolSettingsScreen} from '@shell/screens/PoolSettingsScreen';
import {useGlobalStore} from '@shell/stores/globalStore';
import {Linking} from 'react-native';

const Stack = createNativeStackNavigator();

/** Deep link configuration for invite codes. */
const linking = {
  prefixes: ['hotpick://', 'https://hotpick.app'],
  config: {
    screens: {},
  },
  getInitialURL: async () => {
    const url = await Linking.getInitialURL();
    if (url) {
      handleDeepLink(url);
    }
    return url;
  },
  subscribe: (listener: (url: string) => void) => {
    const sub = Linking.addEventListener('url', ({url}) => {
      handleDeepLink(url);
      listener(url);
    });
    return () => sub.remove();
  },
};

/**
 * Handle incoming deep links for invite codes.
 *
 * Invite link: hotpick://join?code=XXXX
 * Invite path: https://hotpick.app/join/XXXX
 */
function handleDeepLink(url: string) {
  try {
    const parsed = new URL(url);

    // Invite code — query param style: hotpick://join?code=XXXX
    if (parsed.hostname === 'join') {
      const codeParam = parsed.searchParams.get('code');
      if (codeParam) {
        useGlobalStore.getState().setPendingInviteCode(codeParam.toUpperCase());
      }
      return;
    }

    // Invite code — path style: https://hotpick.app/join/XXXX
    const pathMatch = parsed.pathname.match(/\/join\/([A-Za-z0-9]+)/);
    if (pathMatch) {
      useGlobalStore
        .getState()
        .setPendingInviteCode(pathMatch[1].toUpperCase());
    }
  } catch {
    // Invalid URL — ignore
  }
}

export function RootNavigator() {
  const [splashDone, setSplashDone] = useState(false);

  const handleSplashComplete = useCallback(() => {
    setSplashDone(true);
  }, []);

  // Layer 2: JS animated splash plays before any navigation renders.
  // Once it completes, we show the navigator starting at LoadingScreen
  // which handles auth session check and routing.
  if (!splashDone) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        initialRouteName="Loading"
        screenOptions={{headerShown: false}}>
        {/* Boot */}
        <Stack.Screen name="Loading" component={LoadingScreen} />

        {/* Auth flow */}
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="EmailEntry" component={EmailEntryScreen} />
        <Stack.Screen
          name="ForgotPassword"
          component={ForgotPasswordScreen}
        />

        {/* Onboarding */}
        <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
        <Stack.Screen
          name="PushNotification"
          component={PushNotificationScreen}
        />
        <Stack.Screen name="PoolWelcome" component={PoolWelcomeScreen} />

        {/* Pool management */}
        <Stack.Screen name="PoolSelection" component={PoolSelectionScreen} />
        <Stack.Screen name="CreatePool" component={CreatePoolScreen} />
        <Stack.Screen name="JoinPool" component={JoinPoolScreen} />

        {/* Main app */}
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="EventDetail" component={EventDetailScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="PoolMembers" component={PoolMembersScreen} />
        <Stack.Screen name="PoolSettings" component={PoolSettingsScreen} />
        <Stack.Screen name="PartnerAdmin" component={PartnerAdminScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
