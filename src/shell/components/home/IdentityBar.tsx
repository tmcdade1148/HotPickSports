// Two-column identity bar: poolie name (left) + SEASON PTS total (right).
// Points pulses gray↔primary while the week is settling.

import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Text} from '@shared/components/AppText';
import {Animated, StyleSheet, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {useNFLStore} from '@sports/nfl/stores/nflStore';
import {isFinalStatus} from '@sports/nfl/utils/gameStatus';
import {useSeasonStore} from '@templates/season/stores/seasonStore';
import {displayType, bodyType, spacing} from '@shared/theme';

const POINTS_FONT = 36;
const POINTS_LINE = 44;
const NAME_MAX_FONT = 40;
const NAME_MIN_FONT = 12;
// Matching the points lineHeight keeps the visual bottoms of the name and
// the points number flush when both are top-aligned by the row.
const NAME_LINE = POINTS_LINE;
const NAME_RIGHT_PAD = 6;

export function IdentityBar() {
  const {colors} = useTheme();

  const userId      = useGlobalStore(s => s.user?.id);
  const userProfile = useGlobalStore(s => s.userProfile);
  const poolieName  = userProfile?.poolie_name ?? '';
  const seasonTotal = useSeasonStore(
    s => (userId ? s.getUserScore(userId)?.total_points : undefined) ?? 0,
  );

  // When every game in the current week is final, the week total has
  // just been rolled into the season total — pulse the SEASON PTS
  // number (gray → primary text → gray) to celebrate.
  const liveScores = useNFLStore(s => s.liveScores);
  const weekComplete = useMemo(() => {
    const games = Object.values(liveScores);
    return games.length > 0 && games.every(g => isFinalStatus(g.status));
  }, [liveScores]);

  const pointsPulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!weekComplete) {
      pointsPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pointsPulse, {toValue: 0, duration: 900, useNativeDriver: false}),
        Animated.timing(pointsPulse, {toValue: 1, duration: 900, useNativeDriver: false}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [weekComplete, pointsPulse]);
  const pointsColor = weekComplete
    ? pointsPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [colors.textTertiary, colors.textPrimary],
      })
    : colors.textPrimary;

  const display = (poolieName || '—').toUpperCase();

  // True auto-fit: measure both the available column width and the
  // natural (unconstrained) rendered width of the name at NAME_MAX_FONT,
  // then scale fontSize to fit exactly. No char-width approximation, no
  // adjustsFontSizeToFit (which clips on Android and is inconsistent on
  // iOS for italics). Works identically on both platforms because we let
  // each platform's text engine report the actual rendered width.
  const [leftWidth, setLeftWidth] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const usableWidth = Math.max(0, leftWidth - NAME_RIGHT_PAD);
  const scale = naturalWidth > 0 && usableWidth > 0 && naturalWidth > usableWidth
    ? usableWidth / naturalWidth
    : 1;
  const nameFontSize = Math.max(
    NAME_MIN_FONT,
    Math.min(NAME_MAX_FONT, Math.floor(NAME_MAX_FONT * scale)),
  );

  return (
    <View style={styles.container}>
      <View
        style={styles.left}
        onLayout={e => setLeftWidth(e.nativeEvent.layout.width)}
        accessibilityLabel={poolieName || 'player'}>
        <Text
          style={[
            displayType.display,
            styles.name,
            {color: colors.textPrimary, fontSize: nameFontSize},
          ]}
          numberOfLines={1}>
          {display}
        </Text>
        {/* Hidden sizing probe — renders the name at NAME_MAX_FONT with no
            width constraint (absolute, off-screen) so we can read its
            natural rendered width and scale the visible text to fit. */}
        <Text
          style={[
            displayType.display,
            styles.nameProbe,
            {fontSize: NAME_MAX_FONT},
          ]}
          numberOfLines={1}
          onTextLayout={e => {
            const w = e.nativeEvent.lines?.[0]?.width;
            if (typeof w === 'number') setNaturalWidth(w);
          }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none">
          {display}
        </Text>
      </View>

      <View style={styles.right}>
        <Animated.Text
          // Animated.Text can't route through the @shared/components/AppText
          // wrapper (it's Animated.createAnimatedComponent of RN's Text), so the
          // font-scaling lock must be set explicitly here — otherwise the
          // SEASON PTS number scales with the OS font-size slider while the rest
          // of the bar (locked via the wrapper) does not.
          allowFontScaling={false}
          style={[
            displayType.display,
            styles.points,
            {color: pointsColor},
          ]}
          numberOfLines={1}>
          {seasonTotal.toLocaleString()}
        </Animated.Text>
        <Text
          style={[bodyType.bold, styles.pointsLabel, {color: colors.textTertiary}]}
          numberOfLines={1}>
          SEASON PTS
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: 0,
    paddingBottom: spacing.sm,
    gap: 16,
  },
  // Hard-cap the name column at half the row width using maxWidth + flex:1.
  // adjustsFontSizeToFit on the Text inside shrinks the font to fit within
  // this width. Right column keeps its natural width and never gets
  // squeezed — that fixes SEASON PTS wrapping/cropping.
  left: {
    flex: 1,
    maxWidth: '50%',
    minWidth: 0,
  },
  // Italic shear: reserve a little right padding so the trailing glyph
  // doesn't clip. Matching the points lineHeight keeps the visual bottoms
  // flush when the row is top-aligned.
  // fontSize is set inline (width-driven by onLayout). lineHeight stays
  // fixed at the points lineHeight so visual bottoms align regardless of
  // the resolved font size.
  name: {
    lineHeight: NAME_LINE,
    paddingRight: NAME_RIGHT_PAD,
  },
  // Off-screen sizing probe — positioned absolutely with no width bound
  // so the text engine reports its true natural width via onLayout.
  // opacity:0 keeps it invisible; pointerEvents:'none' keeps it inert.
  nameProbe: {
    position: 'absolute',
    top: 0,
    // Off-screen (not overlapping the visible name): an opacity:0 copy sitting
    // directly over the name composites into a grey box on Android. onTextLayout
    // still reports the natural width from off-screen.
    left: -100000,
    opacity: 0,
    // A huge implicit max width so wrapping doesn't kick in.
    width: 10000,
  },
  // Cap the points column at half so 4-5 digit totals can't push past
  // the screen edge. adjustsFontSizeToFit on the points Text shrinks the
  // number to fit within this cap. 3 digits fit comfortably with room.
  right: {
    alignItems: 'flex-end',
    flexShrink: 0,
    maxWidth: '50%',
  },
  points: {
    fontSize: POINTS_FONT,
    lineHeight: POINTS_LINE,
  },
  pointsLabel: {
    fontSize: 10,
    letterSpacing: 1.4,
    marginTop: -2,
  },
});
