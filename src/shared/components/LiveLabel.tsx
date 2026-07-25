// Live indicators that breathe. The pulse (opacity 1 → 0.3 → 1 over 550ms) is
// shared so the "LIVE" word (Big Games tiles + the HotPick chip) and the
// "GAMES IN PROGRESS" header line all pulse on the same cadence.
//
// Animated.Text can't route through the @shared/components/AppText wrapper (it's
// Animated.createAnimatedComponent of RN's Text), so the font-scaling lock is
// set explicitly here — same pattern as IdentityBar's animated points.

import React, {useEffect, useRef} from 'react';
import {Animated, type StyleProp, type TextStyle} from 'react-native';

/** The shared 550ms breathe — one Animated.Value, looping. */
export function usePulse() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 0.3, duration: 550, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 1, duration: 550, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return pulse;
}

interface PulsingTextProps {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}

/** A pulsing text (opacity breathe). Font-scaling locked (see header note). */
export function PulsingText({
  children,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: PulsingTextProps) {
  const pulse = usePulse();
  return (
    <Animated.Text
      allowFontScaling={false}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
      style={[style, {opacity: pulse}]}>
      {children}
    </Animated.Text>
  );
}

/**
 * The "LIVE" signal — it stays full size on ONE line and never shrinks or wraps
 * (flexShrink 0 + numberOfLines 1). Anything beside it (the clock) is what yields
 * the remaining width, not LIVE.
 */
export function LiveLabel({style}: {style?: StyleProp<TextStyle>}) {
  return (
    <PulsingText numberOfLines={1} style={[style, {flexShrink: 0}]}>
      LIVE
    </PulsingText>
  );
}
