// PlayerName — the player's poolie name, auto-fit, rendered identically on the
// left of every header (Home / Picks / Ladder / Chirps). Mirrors the
// IdentityBar name treatment so the player's identity reads the same
// everywhere. Measures the available column width and the name's natural
// rendered width, then scales fontSize to fit (no adjustsFontSizeToFit, which
// clips on Android / is inconsistent for italics).
//
// It's a plain (non-interactive) label — profile access lives in Settings, so
// the name doesn't navigate anywhere.

import React, {useState} from 'react';
import {Text} from '@shared/components/AppText';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {displayType} from '@shared/theme';

const NAME_MAX_FONT = 40;
const NAME_MIN_FONT = 12;
const NAME_LINE = 44;
const NAME_RIGHT_PAD = 6;

export function PlayerName({style}: {style?: StyleProp<ViewStyle>}) {
  const {colors} = useTheme();
  const poolieName = useGlobalStore(s => s.userProfile?.poolie_name ?? '');
  const display = (poolieName || '—').toUpperCase();

  const [colWidth, setColWidth] = useState(0);
  const [naturalWidth, setNaturalWidth] = useState(0);
  const usableWidth = Math.max(0, colWidth - NAME_RIGHT_PAD);
  const scale =
    naturalWidth > 0 && usableWidth > 0 && naturalWidth > usableWidth
      ? usableWidth / naturalWidth
      : 1;
  const fontSize = Math.max(
    NAME_MIN_FONT,
    Math.min(NAME_MAX_FONT, Math.floor(NAME_MAX_FONT * scale)),
  );

  return (
    <View
      style={style}
      onLayout={e => setColWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={poolieName || 'player'}>
      <Text
        style={[displayType.display, styles.name, {color: colors.textPrimary, fontSize}]}
        numberOfLines={1}>
        {display}
      </Text>
      {/* Off-screen sizing probe at NAME_MAX_FONT — reports the name's natural
          width so the visible text can be scaled to fit the column. */}
      <Text
        style={[displayType.display, styles.probe, {fontSize: NAME_MAX_FONT}]}
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
  );
}

const styles = StyleSheet.create({
  name: {
    lineHeight: NAME_LINE,
    paddingRight: NAME_RIGHT_PAD,
  },
  probe: {
    position: 'absolute',
    top: 0,
    left: -100000,
    opacity: 0,
    width: 10000,
  },
});
