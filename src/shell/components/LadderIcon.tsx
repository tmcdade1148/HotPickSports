import React from 'react';
import Svg, {Path} from 'react-native-svg';

/**
 * LadderIcon — custom tab icon (lucide ships no ladder). Path drawn by Tom in
 * Illustrator and remapped to lucide's 24px grid, proportions preserved.
 * Three rungs is deliberate — four merge at tab size, so don't add one.
 *
 * Takes the same `{color, size}` props MainTabNavigator hands every other tab
 * icon (lucide's shape), so it tints active/inactive and follows the theme.
 */
export function LadderIcon({
  color = 'currentColor',
  size = 24,
  strokeWidth = 2,
}: {
  color?: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round">
      <Path d="M8 3v18M16 3v18M8 7h8M8 12h8M8 17h8" />
    </Svg>
  );
}
