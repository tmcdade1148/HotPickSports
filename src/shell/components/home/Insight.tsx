// Season-long HotPick hit rate line. Hides the percentage until at
// least one HotPick attempt has been settled.

import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {useTheme} from '@shell/theme/hooks';
import {useGlobalStore} from '@shell/stores/globalStore';
import {bodyType, spacing} from '@shared/theme';

interface InsightProps {
  text?: string;
}

export function Insight({text}: InsightProps) {
  const {colors} = useTheme();
  const hitRate = useGlobalStore(s => s.hotPickHitRate);

  const message = (() => {
    if (text) return text;
    if (hitRate && hitRate.total > 0) {
      const pct = Math.round((hitRate.hits / hitRate.total) * 100);
      return `Your HotPick hit rate this season: ${pct}%.`;
    }
    return "Your HotPick hit rate this season: updates after Week 1.";
  })();

  return (
    <View style={styles.wrap}>
      <Text style={[bodyType.regular, styles.text, {color: colors.textTertiary}]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  text: {
    fontSize: 12.5,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },
});
