import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {supabase} from '@shared/config/supabase';

export function TosVersionGateScreen({navigation, route}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const [loading, setLoading] = useState(false);
  const user = useGlobalStore(s => s.user);
  const acceptTos = useGlobalStore(s => s.acceptTos);
  const isNewUser = route?.params?.isNewUser ?? false;
  const providerName = route?.params?.providerName ?? undefined;

  const handleAgree = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const success = await acceptTos(user.id);
      if (success) {
        if (isNewUser) {
          navigation.replace('ProfileSetup', {providerName});
        } else {
          navigation.replace('Home');
        }
      } else {
        Alert.alert('Error', 'Could not accept terms. Please try again.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogOut = async () => {
    await supabase.auth.signOut();
    useGlobalStore.getState().setUser(null);
    navigation.replace('Welcome');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.heading}>
          {isNewUser ? 'Terms of Service' : "We've updated our Terms"}
        </Text>

        <Text style={styles.body}>
          {isNewUser
            ? 'Before getting started, please review and accept our Terms of Service.'
            : "We've made changes to our Terms of Service to better protect you and clarify how HotPick Sports works. Please review and accept the updated terms to continue."}
        </Text>

        <TouchableOpacity
          onPress={() => navigation.navigate('TermsOfService')}
          activeOpacity={0.7}>
          <Text style={styles.reviewLink}>Review full Terms of Service</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.agreeButton}
          onPress={handleAgree}
          disabled={loading}
          activeOpacity={0.8}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.agreeButtonText}>I Agree</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={handleLogOut} activeOpacity={0.7}>
          <Text style={styles.logOutLink}>Log out instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: '20%',
      alignItems: 'center',
    },
    heading: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.textPrimary,
      marginBottom: spacing.lg,
      textAlign: 'center',
    },
    body: {
      fontSize: 15,
      color: colors.textSecondary,
      lineHeight: 22,
      textAlign: 'center',
      marginBottom: spacing.lg,
      paddingHorizontal: spacing.sm,
    },
    reviewLink: {
      fontSize: 14,
      color: colors.primary,
      textDecorationLine: 'underline',
      marginBottom: spacing.xxl,
    },
    agreeButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: borderRadius.md,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 50,
      marginBottom: spacing.lg,
    },
    agreeButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    logOutLink: {
      fontSize: 13,
      color: colors.textSecondary,
      textDecorationLine: 'underline',
    },
  });
