import {useSafeAreaInsets} from 'react-native-safe-area-context';

/**
 * The floating bottom nav overlays screen content (slice 2 #9/#10). Screens add
 * this reserve to the bottom of their scrollable content so the last row can be
 * scrolled clear of the bar at rest.
 *
 * Reserve = tab bar height + bottom safe-area inset. PoweredByHotPick renders
 * null in the shell (useBrand is always unbranded per Hard Rule #25), so it adds
 * nothing here. 0.85-alpha rgba background and the exact height are Tom's to
 * tune on device.
 */
export const NAV_BAR_HEIGHT = 56;

export function useNavReserve(): number {
  const insets = useSafeAreaInsets();
  return NAV_BAR_HEIGHT + insets.bottom;
}
