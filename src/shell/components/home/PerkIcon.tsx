// Resolves partner.perk_icon to a renderable element.
// Input contract: a lucide-react-native icon name in any case ("beer",
// "Beer", "BEER"), an emoji ("🎁"), or null. Never render the raw
// alpha string — that's the bug Spec 260519 §6.1 Bug B targets.

import React from 'react';
import {Text, type StyleProp, type TextStyle} from 'react-native';
import * as LucideIcons from 'lucide-react-native';

const ALPHA_ONLY = /^[A-Za-z]+$/;

export interface PerkIconProps {
  name: string | null | undefined;
  size: number;
  color: string;
  emojiStyle?: StyleProp<TextStyle>;
}

export function PerkIcon({name, size, color, emojiStyle}: PerkIconProps) {
  const Gift = (LucideIcons as unknown as Record<string, React.ComponentType<any>>).Gift;

  if (!name || name.trim().length === 0) {
    return <Gift size={size} color={color} strokeWidth={2} />;
  }

  const trimmed = name.trim();

  if (ALPHA_ONLY.test(trimmed)) {
    const pascal = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    const Resolved = (LucideIcons as unknown as Record<string, React.ComponentType<any>>)[pascal];
    if (typeof Resolved === 'function' || typeof Resolved === 'object') {
      return <Resolved size={size} color={color} strokeWidth={2} />;
    }
    return <Gift size={size} color={color} strokeWidth={2} />;
  }

  return (
    <Text style={[{fontSize: size, color}, emojiStyle]} numberOfLines={1}>
      {trimmed}
    </Text>
  );
}
