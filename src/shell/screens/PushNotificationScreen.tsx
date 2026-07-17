import React, {useState} from 'react';
import {Text} from '@shared/components/AppText';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {spacing, borderRadius} from '@shared/theme';
import {useTheme} from '@shell/theme';
import {useGlobalStore} from '@shell/stores/globalStore';
import {registerForPushNotifications, seedNotificationPreferences} from '@shell/services/pushNotifications';

// Verbatim from HOME_MODULE_MAP "Onboarding 2 — Notifications". Three lines,
// no icons: the old ⏰/🏆/📈 pairing broke on two of the three once the copy
// changed, and the intuitive icon for "Special HotPick Announcements" is 🔥 —
// which rule 1 permanently forbids outside the HotPick card. A pattern that can
// never be completed correctly shouldn't be half-kept.
const BENEFITS = [
  'Pick deadline reminders so you never miss a week',
  'Important messages from your Gaffers and Leagues',
  'Special HotPick Announcements',
];

export function PushNotificationScreen({navigation}: any) {
  const {colors} = useTheme();
  const styles = createStyles(colors);
  const [requesting, setRequesting] = useState(false);
  const userId = useGlobalStore(s => s.user?.id);

  const handleEnable = async () => {
    if (!userId) {
      proceedToNextScreen();
      return;
    }

    setRequesting(true);

    try {
      // Request permission and register the device token
      const token = await registerForPushNotifications(userId);

      if (token) {
        // Seed default notification preferences
        await seedNotificationPreferences(userId);
        console.log('[Push] Registered and preferences seeded');
      } else {
        console.log('[Push] Permission denied or simulator — skipping');
      }
    } catch (err) {
      console.error('[Push] Registration error:', err);
    }

    proceedToNextScreen();
  };

  const handleSkip = () => {
    // Seed preferences even on skip — so the preferences UI has rows to toggle
    if (userId) {
      seedNotificationPreferences(userId).catch(() => {});
    }
    proceedToNextScreen();
  };

  const proceedToNextScreen = () => {
    setRequesting(false);
    navigation.replace('PoolWelcome');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.bellIcon}>{'\u{1F514}'}</Text>
        </View>

        <Text style={styles.title}>Don't miss a moment</Text>
        <Text style={styles.subtitle}>
          Stay in the game with timely updates.
        </Text>

        <View style={styles.benefitsList}>
          {BENEFITS.map((benefit, index) => (
            <Text key={index} style={styles.benefitText}>
              {benefit}
            </Text>
          ))}
        </View>

        <View style={styles.buttonsContainer}>
          <TouchableOpacity
            style={styles.enableButton}
            onPress={handleEnable}
            disabled={requesting}>
            <Text style={styles.enableButtonText}>Turn on notifications</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={requesting}>
            <Text style={styles.skipText}>Maybe later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  bellIcon: {
    fontSize: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  benefitsList: {
    width: '100%',
    marginBottom: spacing.xl,
    gap: spacing.md,
  },
  benefitText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  buttonsContainer: {
    width: '100%',
    gap: spacing.sm,
  },
  enableButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  enableButtonText: {
    color: colors.onPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
