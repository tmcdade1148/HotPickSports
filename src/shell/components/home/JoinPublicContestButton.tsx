// Join-the-public-contest button for new users (per Tom, 2026-06-15).
//
// Shown only when the user is in NO contests (visiblePools is empty). Joins the
// designated public contest for the active competition via the join_public_contest
// RPC — no invite code. Self-hides the moment the user is in any pool. Uses the
// shared ContestActionPill so it matches the Join/Create pills elsewhere.

import React, {useState} from 'react';
import {Alert, StyleSheet, Text, View} from 'react-native';
import {Users} from 'lucide-react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {bodyType, spacing} from '@shared/theme';
import {LEXICON} from '@shared/lexicon';
import {ContestActionPill, contestActionPillStyles} from '@shell/components/ContestActionPill';

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
      <View style={contestActionPillStyles.row}>
        <ContestActionPill
          Icon={Users}
          label={`Join the Public ${LEXICON.contest.singular}`}
          sublabel="open to everyone — no code"
          onPress={onPress}
          busy={busy}
          accessibilityLabel={`Join the public ${LEXICON.contest.singular}`}
        />
      </View>
      <Text style={[bodyType.regular, styles.note, {color: colors.textSecondary}]}>
        Jump into the open {LEXICON.contest.singular} and start making picks — or use an invite code below.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  note: {
    fontSize: 12,
    marginTop: 6,
    paddingHorizontal: spacing.lg,
  },
});
