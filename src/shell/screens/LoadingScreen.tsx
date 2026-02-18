import React, {useEffect} from 'react';
import {View, Text, ActivityIndicator, StyleSheet} from 'react-native';
import {supabase} from '@shared/config/supabase';
import {useGlobalStore} from '@shell/stores/globalStore';
import {colors, spacing} from '@shared/theme';

export function LoadingScreen({navigation}: any) {
  const setUser = useGlobalStore(s => s.setUser);
  const setAuthLoading = useGlobalStore(s => s.setAuthLoading);
  const loadPersistedPoolId = useGlobalStore(s => s.loadPersistedPoolId);
  const fetchProfile = useGlobalStore(s => s.fetchProfile);

  useEffect(() => {
    // Load persisted pool ID before checking auth
    loadPersistedPoolId();

    supabase.auth.getSession().then(async ({data: {session}}) => {
      setAuthLoading(false);
      if (session) {
        setUser(session.user);
        // Fetch profile data (display name) in background
        fetchProfile(session.user.id);
        navigation.replace('Home');
      } else {
        navigation.replace('SignIn');
      }
    });

    const {
      data: {subscription},
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [navigation, setUser, setAuthLoading]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>HotPick</Text>
      <Text style={styles.subtitle}>Sports</Text>
      <ActivityIndicator
        size="large"
        color={colors.primary}
        style={styles.spinner}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.primary,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: '300',
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  spinner: {
    marginTop: spacing.lg,
  },
});
