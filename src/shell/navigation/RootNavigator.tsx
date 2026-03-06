import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {LoadingScreen} from '@shell/screens/LoadingScreen';
import {WelcomeScreen} from '@shell/screens/WelcomeScreen';
import {EmailEntryScreen} from '@shell/screens/EmailEntryScreen';
import {MagicLinkScreen} from '@shell/screens/MagicLinkScreen';
import {ProfileSetupScreen} from '@shell/screens/ProfileSetupScreen';
import {PushNotificationScreen} from '@shell/screens/PushNotificationScreen';
import {PoolWelcomeScreen} from '@shell/screens/PoolWelcomeScreen';
import {PoolSelectionScreen} from '@shell/screens/PoolSelectionScreen';
import {CreatePoolScreen} from '@shell/screens/CreatePoolScreen';
import {JoinPoolScreen} from '@shell/screens/JoinPoolScreen';
import {HomeScreen} from '@shell/screens/HomeScreen';
import {EventDetailScreen} from '@shell/screens/EventDetailScreen';
import {ProfileScreen} from '@shell/screens/ProfileScreen';
import {useGlobalStore} from '@shell/stores/globalStore';
import {Linking} from 'react-native';

const Stack = createNativeStackNavigator();

/** Deep link configuration for invite codes. */
const linking = {
  prefixes: ['hotpick://', 'https://hotpick.app'],
  config: {
    screens: {
      // hotpick://join?code=XXXX → handled via onReady + initial URL
      // Deep link joining is handled imperatively in LoadingScreen
    },
  },
  // Parse invite codes from incoming URLs
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

/** Extract invite code from deep link and store in global state. */
function handleDeepLink(url: string) {
  // hotpick://join?code=XXXX
  // https://hotpick.app/join/XXXX
  try {
    const parsed = new URL(url);

    // Query param style: ?code=XXXX
    const codeParam = parsed.searchParams.get('code');
    if (codeParam) {
      useGlobalStore.getState().setPendingInviteCode(codeParam.toUpperCase());
      return;
    }

    // Path style: /join/XXXX
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
  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        initialRouteName="Loading"
        screenOptions={{headerShown: false}}>
        {/* Boot */}
        <Stack.Screen name="Loading" component={LoadingScreen} />

        {/* Onboarding flow */}
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="EmailEntry" component={EmailEntryScreen} />
        <Stack.Screen name="MagicLink" component={MagicLinkScreen} />
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}
