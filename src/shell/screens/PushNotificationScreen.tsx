import React, {useState} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {colors, spacing, borderRadius} from '@shared/theme';

const BENEFITS = [
  {icon: '\u{23F0}', text: 'Pick deadline reminders so you never miss a week'},
  {icon: '\u{1F3C6}', text: 'Score alerts when your picks land'},
  {icon: '\u{1F4C8}', text: 'Know instantly when you move up the leaderboard'},
];

export function PushNotificationScreen({navigation}: any) {
  const [requesting, setRequesting] = useState(false);

  const handleEnable = async () => {
    setRequesting(true);

    // On iOS, this will trigger the system permission dialog.
    // Actual push token registration (Expo Push / APNs / FCM) will be
    // wired when the push notification dependency is added.
    // For now, we request the permission and proceed.
    if (Platform.OS === 'ios') {
      // iOS: The system dialog can only be shown once. After that, user
      // must go to Settings. We're using the priming screen to maximize
      // the grant rate on that single shot.
      try {
        // Use the native Notification API when available
        // For now, just proceed — token registration happens when infra is ready
        Alert.alert(
          'Notifications',
          'Push notification support is being configured. You can enable notifications in Settings later.',
          [{text: 'OK', onPress: () => proceedToNextScreen()}],
        );
      } catch {
        proceedToNextScreen();
      }
    } else {
      // Android: notifications are enabled by default (API < 33) or
      // require runtime permission (API 33+)
      proceedToNextScreen();
    }
  };

  const handleSkip = () => {
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
            <View key={index} style={styles.benefitRow}>
              <Text style={styles.benefitIcon}>{benefit.icon}</Text>
              <Text style={styles.benefitText}>{benefit.text}</Text>
            </View>
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

const styles = StyleSheet.create({
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
    color: colors.text,
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
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  benefitIcon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  benefitText: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
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
    color: '#FFFFFF',
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
