// Small circular tinted mark for partner/team initials.

import React from 'react';
import {Text} from '@shared/components/AppText';
import {StyleSheet, View} from 'react-native';
import {displayType} from '@shared/theme';
import {hexToRgba} from '@shared/utils/color';

interface LogoMarkProps {
  initials: string;
  tint: string;
  size?: number;
}

export function LogoMark({initials, tint, size = 28}: LogoMarkProps) {
  return (
    <View
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: hexToRgba(tint, 0.18),
          borderColor: tint,
        },
      ]}>
      <Text
        style={[
          displayType.display,
          {
            fontSize: size * 0.4,
            color: tint,
            letterSpacing: 0.2,
            lineHeight: size * 0.4 * 1.05,
          },
        ]}>
        {initials.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mark: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
});
