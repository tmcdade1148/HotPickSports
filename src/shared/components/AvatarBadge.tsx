import React from 'react';
import {View, Text, StyleSheet} from 'react-native';
import {SYSTEM_AVATARS} from '@shell/components/AvatarSelector';
import {useTheme} from '@shell/theme';

/** O(1) lookup by avatar_key instead of .find() on every render. */
const AVATAR_MAP = new Map(SYSTEM_AVATARS.map(a => [a.key, a]));

interface AvatarBadgeProps {
  avatarKey: string | null | undefined;
  name: string;
  /** Diameter in pixels. Defaults to 22. */
  size?: number;
}

/**
 * Small inline avatar circle — colored emoji from SYSTEM_AVATARS,
 * or a neutral circle with the user's first initial as fallback.
 */
export function AvatarBadge({avatarKey, name, size = 22}: AvatarBadgeProps) {
  const {colors} = useTheme();
  const avatar = avatarKey ? AVATAR_MAP.get(avatarKey) : undefined;
  const fontSize = Math.round(size * 0.5);

  if (avatar) {
    return (
      <View style={[styles.circle, {width: size, height: size, borderRadius: size / 2, backgroundColor: avatar.color}]}>
        <Text style={{fontSize, lineHeight: fontSize + 2}}>{avatar.emoji}</Text>
      </View>
    );
  }

  const initial = (name ?? '?').charAt(0).toUpperCase();
  return (
    <View style={[styles.circle, {width: size, height: size, borderRadius: size / 2, backgroundColor: colors.textSecondary}]}>
      <Text style={[styles.initialText, {fontSize: fontSize - 1}]}>{initial}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initialText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
