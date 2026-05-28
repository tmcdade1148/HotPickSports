// SuspensionGate — when the signed-in user has
// profiles.is_platform_suspended = true, renders a full-screen modal
// that can't be dismissed. Wraps the main app so the user can't
// navigate around it (per April 2026 spec §9.2).
//
// They can still tap "Email Support" to open mailto:support@…

import React from 'react';
import {Linking, Pressable, StyleSheet, Text, View} from 'react-native';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, displayType, spacing, borderRadius} from '@shared/theme';

export function SuspensionGate({children}: {children: React.ReactNode}) {
  const {colors} = useTheme();
  const profile = useGlobalStore(s => s.userProfile);
  const user = useGlobalStore(s => s.user);

  if (!profile?.is_platform_suspended) return <>{children}</>;

  const reason = profile.platform_suspension_reason;

  const openSupport = () => {
    const subject = encodeURIComponent('HotPick — Account suspension');
    const body = encodeURIComponent(
      `\n\n\n---\nUser: ${profile.poolie_name ?? user?.email ?? '(unknown)'}\n` +
      `Email: ${user?.email ?? '(unknown)'}\n` +
      `User ID: ${profile.id}\n` +
      `Suspension reason on record: ${reason ?? '(none)'}\n` +
      `Please describe your appeal above.`,
    );
    Linking.openURL(
      `mailto:support@hotpicksports.com?subject=${subject}&body=${body}`,
    ).catch(() => {});
  };

  return (
    <View style={[styles.shell, {backgroundColor: colors.background}]}>
      <View style={[styles.card, {backgroundColor: colors.surface, borderColor: colors.error}]}>
        <Text style={[displayType.display, styles.title, {color: colors.error}]}>
          ACCOUNT SUSPENDED
        </Text>
        <Text style={[bodyType.regular, styles.body, {color: colors.textPrimary}]}>
          Your account has been suspended.
          {'\n\n'}
          For more information contact HotPick Sports at{' '}
          <Text style={{fontWeight: '700'}}>support@hotpicksports.com</Text>.
        </Text>
        <Pressable
          onPress={openSupport}
          style={[styles.btn, {backgroundColor: colors.primary}]}>
          <Text style={[bodyType.bold, {color: colors.onPrimary}]}>Email Support</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg},
  card: {
    width: '100%',
    maxWidth: 380,
    padding: spacing.lg,
    borderRadius: borderRadius.lg,
    borderWidth: 2,
  },
  title: {fontSize: 22, textAlign: 'center'},
  body: {fontSize: 14, lineHeight: 21, marginTop: spacing.md, textAlign: 'center'},
  btn: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
  },
});
