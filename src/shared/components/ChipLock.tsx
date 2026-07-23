import React from 'react';
import {View} from 'react-native';
import Svg, {Path} from 'react-native-svg';

interface ChipLockProps {
  /** Height in points — width auto-scales to preserve aspect ratio. */
  size?: number;
  /** Fill colour — pass a theme token; never a baked hex. */
  color: string;
}

// ChipLock — the lock on a locked chip (muted on non-HotPick, strong on the HotPick).
// Single-fill silhouette: the fill comes from the theme so it adapts to light
// and dark. Do NOT bake a colour into this file. viewBox 0 0 42.27 54.01.
const VBW = 42.27;
const VBH = 54.01;

export function ChipLock({size = 40, color}: ChipLockProps) {
  const width = size * (VBW / VBH);
  return (
    <View accessible={false} focusable={false} collapsable={false}>
      <Svg width={width} height={size} viewBox="0 0 42.27 54.01">
        <Path fill={color} d="M32.7,53.94l-30.18-7.18c-1.48-.35-2.82-2.01-2.46-3.53l5.86-24.72,3.95.89,1.87-7.74c.94-3.89,3.32-7.11,6.58-9.26C25.26-2.17,34.35,0,38.47,7.2c1.94,3.39,2.61,7.34,1.7,11.23l-1.83,7.77,3.93.94-5.91,24.74c-.33,1.38-2.15,2.42-3.66,2.06ZM33.29,25l1.79-7.55c.66-2.79.26-5.63-1.15-8.04-2.59-4.49-8.19-5.83-12.52-2.98-2.35,1.52-3.99,3.87-4.66,6.66l-1.81,7.54,18.36,4.37h-.01ZM20.76,40.96l.82-3.47c1.35-.25,2.23-1.35,2.19-2.63-.04-1.16-.9-2.19-2.07-2.42s-2.33.39-2.82,1.45-.17,2.35.85,3.16l-.83,3.49,1.85.42h0Z" />
      </Svg>
    </View>
  );
}
