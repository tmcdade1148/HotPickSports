// src/shell/components/home/IdentityBar.tsx
// Spec §6.4.2 — Identity Bar at the top of Home.
//
// Reference (May 13 2026 v2):
//   CLOCK'S RUNNING                       ← mood eyebrow (small, muted)
//   ELBOWSOUP                             ← huge poolie name, white italic
//
// Tap on the name → Profile screen.
// Points + week label live elsewhere now (stat blocks + top-bar pill).

import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {displayType, bodyType, spacing} from '@shared/theme';
import {getContextGreeting} from './salutation';

export function IdentityBar() {
  const {colors} = useTheme();
  const navigation = useNavigation<any>();

  const poolieName     = useGlobalStore(s => s.userProfile?.poolie_name ?? '');
  const currentPhase   = useNFLStore(s => s.currentPhase);
  const weekState      = useNFLStore(s => s.weekState);
  const userPickCount  = useNFLStore(s => s.userPickCount);
  const picksDeadline  = useNFLStore(s => s.picksDeadline);

  const greeting = getContextGreeting(currentPhase, weekState, userPickCount, picksDeadline);

  return (
    <View style={styles.container}>
      <Text style={[bodyType.bold, styles.mood, {color: colors.textTertiary}]}>
        {greeting.toUpperCase()}
      </Text>
      <Pressable
        onPress={() => navigation.navigate('Profile')}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Profile of ${poolieName || 'player'}`}>
        <Text
          style={[
            displayType.display,
            styles.name,
            {color: colors.textPrimary, lineHeight: 56 * 0.95},
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit>
          {(poolieName || '—').toUpperCase()}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  mood: {
    fontSize: 11,
    letterSpacing: 1.8,
    marginBottom: 4,
  },
  name: {
    fontSize: 56,
  },
});
