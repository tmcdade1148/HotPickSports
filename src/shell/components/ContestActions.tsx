// ContestActions — the shared Join + Start "ContestActionPill" pair, extracted so
// the affordance can't drift across the Home footer, the off/pre-season screens,
// and Settings (Slice 7c). ContestActionPill is the atomic button; this owns the
// PAIR: the two icons, labels, sublabels, row layout, and the default nav targets.
//
// Single source of truth — recoloring the pill (secondary/amber) moves every site
// at once. HotPick-themed via the pill (Hard Rule #9).

import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {KeyRound, Plus} from 'lucide-react-native';
import {ContestActionPill} from './ContestActionPill';

interface ContestActionsProps {
  /** Join pill sublabel (italic). */
  joinSublabel?: string;
  /** Start pill sublabel (italic). */
  startSublabel?: string;
  /** Hide the Join pill — Settings hides it for super-admins (creators only). */
  showJoin?: boolean;
  /** Override the Join tap (default: navigate to JoinPool). */
  onJoinPress?: () => void;
  /** Override the Start tap (default: navigate to CreatePool; Settings passes its
   *  own tier-checked create handler). */
  onStartPress?: () => void;
  /** Passed through to both pills — the docked Home footer uses a translucent
   *  frosted fill so the pills read as panels over the clear bar. */
  fillColor?: string;
  /** Extra style on the row container (e.g. Settings' margins). */
  style?: StyleProp<ViewStyle>;
}

export function ContestActions({
  joinSublabel = 'with invite code',
  startSublabel = 'and invite friends',
  showJoin = true,
  onJoinPress,
  onStartPress,
  fillColor,
  style,
}: ContestActionsProps) {
  const navigation = useNavigation<any>();
  const join = onJoinPress ?? (() => navigation.navigate('JoinPool'));
  const start = onStartPress ?? (() => navigation.navigate('CreatePool'));

  return (
    <View style={[styles.row, style]}>
      {showJoin && (
        <ContestActionPill
          Icon={KeyRound}
          label="Join a Contest"
          sublabel={joinSublabel}
          fillColor={fillColor}
          onPress={join}
          accessibilityLabel="Join a Contest with an invite code"
        />
      )}
      <ContestActionPill
        Icon={Plus}
        label="Start a Contest"
        sublabel={startSublabel}
        fillColor={fillColor}
        onPress={start}
        accessibilityLabel="Start a new Contest and invite friends"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', gap: 10},
});
