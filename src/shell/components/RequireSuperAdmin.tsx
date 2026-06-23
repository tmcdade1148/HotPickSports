// RequireSuperAdmin — wraps an admin screen so it only renders when the
// signed-in user has profiles.is_super_admin = true.
//
// Why this exists: every admin screen (AdminHome, AdminModerationQueue,
// AdminPoolManagement, AdminBroadcast, AdminPlatformHealth) was
// open-coding the same guard:
//
//   const profile = useGlobalStore(s => s.userProfile);
//   if (!profile?.is_super_admin) {
//     return <Not authorized />;
//   }
//
// Forgetting the check on a new admin screen would expose it to any
// signed-in user who deep-links to the route. Centralizing the gate
// makes "forgot the check" impossible — the screen is opaque unless
// wrapped.
//
// Usage:
//   export function AdminFooScreen() {
//     return (
//       <RequireSuperAdmin>
//         <AdminFooScreenImpl />
//       </RequireSuperAdmin>
//     );
//   }
//
// Settings → HotPick Admin is the only nav entry into the admin
// section, and that row is itself gated on is_super_admin, so this is
// defense-in-depth rather than a primary gate.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useTheme} from '@shell/theme/hooks';
import {bodyType, spacing} from '@shared/theme';

export function RequireSuperAdmin({children}: {children: React.ReactNode}) {
  const {colors} = useTheme();
  const profile = useGlobalStore(s => s.userProfile);

  if (!profile?.is_super_admin) {
    return (
      <SafeAreaView style={[styles.shell, {backgroundColor: colors.background}]} edges={['top']}>
        <View style={styles.center}>
          <Text style={[bodyType.bold, {color: colors.error, fontSize: 16}]}>
            Not authorized
          </Text>
          <Text
            style={[bodyType.regular, {color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center'}]}>
            This screen is restricted to HotPick staff.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  shell: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg},
});
