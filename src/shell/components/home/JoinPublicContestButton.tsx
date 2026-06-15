// Join-the-public-contest button for new users (per Tom, 2026-06-15).
//
// Shown only when the user is in NO contests (visiblePools is empty). Joins the
// designated public contest for the active competition via the join_public_contest
// RPC — no invite code. Self-hides the moment the user is in any pool. HotPick-
// themed (Hard Rule #9); user-facing nouns from @shared/lexicon.

import React, {useState} from 'react';
import {ActivityIndicator, Alert, Pressable, StyleSheet, Text, View} from 'react-native';
import {Users} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {bodyType, spacing, borderRadius} from '@shared/theme';
import {LEXICON} from '@shared/lexicon';

export function JoinPublicContestButton() {
  const {colors} = useTheme();
  const user = useGlobalStore(s => s.user);
  const visiblePools = useGlobalStore(s => s.visiblePools);
  const joinPublicContest = useGlobalStore(s => s.joinPublicContest);
  const [busy, setBusy] = useState(false);

  // Visible until the user joins any other pool.
  if (visiblePools.length > 0 || !user) return null;

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    const res = await joinPublicContest(user.id);
    setBusy(false);
    if (res.error) Alert.alert('Join', res.error);
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onPress}
        disabled={busy}
        style={({pressed}) => [
          styles.btn,
          {backgroundColor: colors.primary, opacity: pressed || busy ? 0.8 : 1},
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Join the public ${LEXICON.contest.singular}`}>
        {busy ? (
          <ActivityIndicator size="small" color={colors.onPrimary} />
        ) : (
          <>
            <Users size={18} color={colors.onPrimary} strokeWidth={2.25} />
            <Text style={[bodyType.bold, styles.label, {color: colors.onPrimary}]}>
              Join the Public {LEXICON.contest.singular}
            </Text>
          </>
        )}
      </Pressable>
      <Text style={[bodyType.regular, styles.note, {color: colors.textSecondary}]}>
        Jump into the open {LEXICON.contest.singular} and start making picks — or use an invite code below.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: borderRadius.lg,
  },
  label: {
    fontSize: 15,
  },
  note: {
    fontSize: 12,
    marginTop: 6,
  },
});
