// Floating-pill geometry — ONE named source for every pill that floats at the
// bottom of a screen.
//
// Two pills stack there today: the bottom nav (AppTabBar in MainTabNavigator)
// and the Picks submit button (SubmitPicksFooter). They must read as the same
// object at two heights, which means their inset, radius, height and lift have
// to match exactly. These constants exist so that match is structural — change
// the nav's shape here and the submit pill follows, and vice versa. Two copies
// of `14` and `28` in two files is how they drift.
//
// The height is also the reserve every scrolling screen leaves at its bottom;
// `useNavReserve()` is built from PILL_HEIGHT for that reason.

import {Platform} from 'react-native';

/** Side inset — how far the floating pill sits in from each screen edge. */
export const PILL_INSET = 14;

/** Pill height. Also the base of useNavReserve(). */
export const PILL_HEIGHT = 56;

/** Corner radius — exactly height/2, so the shape is a true pill. */
export const PILL_RADIUS = PILL_HEIGHT / 2;

/**
 * The lift (drop shadow) shared by both pills.
 *
 * MUST be applied to the layer that carries the BACKGROUND, never to a
 * transparent wrapper: an elevated transparent View casts a rectangular
 * shadow on its own bounds on Android (the documented "weird box" — see
 * HomeScreen's footerOverlay).
 *
 * iOS gets a directional right+down shadow. Android gets `elevation: 0`
 * deliberately: elevation has no direction, so it can't match the iOS offset —
 * it would cast evenly on all four sides, and with the 14px inset every side is
 * exposed to the grey-rectangle artifact. Change to `elevation: 2` for a faint
 * even lift if that's ever preferred; change it HERE so both pills move together.
 *
 * @param shadowColor Usually `colors.ink` from useTheme().
 */
export const pillLift = (shadowColor: string) =>
  Platform.select({
    ios: {
      shadowColor,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: {width: 3, height: 3},
    },
    android: {elevation: 0},
  });
