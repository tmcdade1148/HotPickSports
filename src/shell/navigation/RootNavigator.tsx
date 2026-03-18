import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
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
import {MainTabNavigator} from './MainTabNavigator';
import {EventDetailScreen} from '@shell/screens/EventDetailScreen';
import {ProfileScreen} from '@shell/screens/ProfileScreen';
import {SettingsScreen} from '@shell/screens/SettingsScreen';
import {PartnerAdminScreen} from '@shell/screens/PartnerAdminScreen';
import {PoolMembersScreen} from '@shell/screens/PoolMembersScreen';
import {PoolSettingsScreen} from '@shell/screens/PoolSettingsScreen';
import {FlaggedMessagesScreen} from '@shell/screens/FlaggedMessagesScreen';
import {MessageCenterScreen} from '@shell/screens/MessageCenterScreen';
import {AboutScreen} from '@shell/screens/AboutScreen';
import {InstructionsScreen} from '@shell/screens/InstructionsScreen';
import {PrivacyPolicyScreen} from '@shell/screens/PrivacyPolicyScreen';
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
        <Stack.Screen name="Home" component={MainTabNavigator} />
        <Stack.Screen name="EventDetail" component={EventDetailScreen} />
        {/* Settings is now in the MainTabNavigator — no separate stack screen */}
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="PoolMembers" component={PoolMembersScreen} />
        <Stack.Screen name="PoolSettings" component={PoolSettingsScreen} />
        <Stack.Screen name="FlaggedMessages" component={FlaggedMessagesScreen} />
        <Stack.Screen name="MessageCenter" component={MessageCenterScreen} />
        <Stack.Screen name="PartnerAdmin" component={PartnerAdminScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="Instructions" component={InstructionsScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
