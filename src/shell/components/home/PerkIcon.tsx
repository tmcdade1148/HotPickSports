import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import {
  Beer,
  Cake,
  Candy,
  Cherry,
  Coffee,
  Cookie,
  Crown,
  Gift,
  Heart,
  IceCream,
  Music,
  Percent,
  Pizza,
  Sandwich,
  Soup,
  Sparkles,
  Star,
  Tag,
  Ticket,
  Trophy,
  Utensils,
  Wine,
  type LucideIcon,
} from 'lucide-react-native';

const ALPHA_ONLY = /^[A-Za-z]+$/;

// Curated set of icons partners are likely to pick for a perk. Anything
// outside this map falls back to Gift — see Bug B handling. Adding a new
// option means importing it above and adding one row here.
const PERK_ICONS: Record<string, LucideIcon> = {
  beer: Beer,
  cake: Cake,
  candy: Candy,
  cherry: Cherry,
  coffee: Coffee,
  cookie: Cookie,
  crown: Crown,
  gift: Gift,
  heart: Heart,
  icecream: IceCream,
  music: Music,
  percent: Percent,
  pizza: Pizza,
  sandwich: Sandwich,
  soup: Soup,
  sparkles: Sparkles,
  star: Star,
  tag: Tag,
  ticket: Ticket,
  trophy: Trophy,
  utensils: Utensils,
  wine: Wine,
};

// Ordered list of the curated perk-icon names, for pickers (e.g. the Chairman's
// perk editor). Rendering any of these through <PerkIcon name={...}/> resolves
// to the matching lucide glyph.
export const PERK_ICON_NAMES: string[] = Object.keys(PERK_ICONS);

export interface PerkIconProps {
  name: string | null | undefined;
  size: number;
  color: string;
  containerStyle?: StyleProp<ViewStyle>;
  emojiStyle?: StyleProp<TextStyle>;
}

export function PerkIcon({name, size, color, containerStyle, emojiStyle}: PerkIconProps) {
  const wrap = (node: React.ReactNode) =>
    containerStyle ? (
      <View style={[styles.center, containerStyle]}>{node}</View>
    ) : (
      <>{node}</>
    );

  const trimmed = name?.trim() ?? '';

  if (trimmed.length === 0) {
    return wrap(<Gift size={size} color={color} strokeWidth={2} />);
  }

  if (ALPHA_ONLY.test(trimmed)) {
    const Resolved = PERK_ICONS[trimmed.toLowerCase()] ?? Gift;
    return wrap(<Resolved size={size} color={color} strokeWidth={2} />);
  }

  return wrap(
    <Text style={[{fontSize: size, color}, emojiStyle]} numberOfLines={1}>
      {trimmed}
    </Text>,
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
