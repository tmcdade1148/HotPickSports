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
import {TermsOfServiceScreen} from '@shell/screens/TermsOfServiceScreen';
import {CommunityGuidelinesScreen} from '@shell/screens/CommunityGuidelinesScreen';
import {ResetPasswordScreen} from '@shell/screens/ResetPasswordScreen';
import {HardwareAdminScreen} from '@shell/screens/HardwareAdminScreen';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';
import {Linking} from 'react-native';

const Stack = createNativeStackNavigator();

/** Navigation ref for navigating from outside React components (deep links). */
const navigationRef = React.createRef<any>();

/** Deep link configuration for invite codes and password reset. */
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
 * Handle incoming deep links for invite codes and password reset.
 *
 * Invite link: hotpick://join?code=XXXX
 * Invite path: https://hotpick.app/join/XXXX
 * Password reset (PKCE): hotpick://auth/reset?code=XXX
 * Password reset (implicit): hotpick://auth/reset#access_token=...&type=recovery
 */
function handleDeepLink(url: string) {
  try {
    // Password reset — check before invite code parsing to avoid
    // confusing the PKCE `code` param with an invite code
    if (url.includes('auth/reset') || url.includes('type=recovery')) {
      handlePasswordResetLink(url);
      return;
    }

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

/**
 * Extract auth data from Supabase password reset deep link and set the session.
 *
 * Supabase v2 uses PKCE by default for email flows:
 *   hotpick://auth/reset?code=XXX  (PKCE — most common)
 *
 * Fallback for implicit flow:
 *   hotpick://auth/reset#access_token=XXX&refresh_token=XXX&type=recovery
 */
async function handlePasswordResetLink(url: string) {
  try {
    // --- Try PKCE flow first (Supabase v2 default) ---
    // URL format: hotpick://auth/reset?code=XXX
    const parsed = new URL(url);
    const pkceCode = parsed.searchParams.get('code');

    if (pkceCode) {
      const {error} = await supabase.auth.exchangeCodeForSession(pkceCode);
      if (error) return;
      navigateToReset();
      return;
    }

    // --- Fallback: implicit flow (fragment-based tokens) ---
    const fragment = url.split('#')[1];
    if (!fragment) return;

    const fragmentParams = new URLSearchParams(fragment);
    const accessToken = fragmentParams.get('access_token');
    const refreshToken = fragmentParams.get('refresh_token');

    if (!accessToken || !refreshToken) return;

    const {error} = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) return;

    navigateToReset();
  } catch {
    // Invalid URL or network error — ignore
  }
}

/** Navigate to ResetPassword screen — uses reset to force navigation regardless of current state. */
function navigateToReset() {
  setTimeout(() => {
    const nav = navigationRef.current;
    if (!nav) return;
    nav.reset({
      index: 0,
      routes: [{name: 'ResetPassword'}],
    });
  }, 500);
}

export function RootNavigator() {
  return (
    <NavigationContainer ref={navigationRef} linking={linking}>
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
        <Stack.Screen
          name="ResetPassword"
          component={ResetPasswordScreen}
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
        <Stack.Screen name="HardwareAdmin" component={HardwareAdminScreen} />
        <Stack.Screen name="About" component={AboutScreen} />
        <Stack.Screen name="Instructions" component={InstructionsScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="TermsOfService" component={TermsOfServiceScreen} />
        <Stack.Screen name="CommunityGuidelines" component={CommunityGuidelinesScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
