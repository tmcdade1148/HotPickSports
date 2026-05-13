// src/shared/theme/fonts.ts
// HotPick Sports font family configuration + loader hook.
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.3
//
// Three font roles per spec:
//   • display — Saira Condensed Italic Black. Player name, hero numbers.
//                Currently faux-italic on upright 900Black; true italic TTF
//                is a future enhancement (see commit notes).
//   • body    — Manrope. Running text, button labels, microcopy.
//   • mono    — System monospace (SF Mono on iOS, Roboto Mono on Android).
//                Scores, deltas, countdown digits.

import {useFonts as useSairaCondensed, SairaCondensed_900Black} from '@expo-google-fonts/saira-condensed';
import {useFonts as useManrope, Manrope_400Regular, Manrope_700Bold} from '@expo-google-fonts/manrope';

/**
 * Canonical font-family names (post-load) for use in StyleSheets and tokens.
 * These match the keys passed to expo-font's load map.
 */
export const FONTS = {
  display: 'SairaCondensed_900Black',
  body: 'Manrope_400Regular',
  bodyBold: 'Manrope_700Bold',
  // System monospace — RN auto-resolves via Platform.select if needed.
  // No custom load required.
  mono: undefined as string | undefined,
} as const;

/**
 * Hook: load all HotPick fonts. Returns `[fontsLoaded, fontError]`.
 *
 * Mount once at App.tsx root; gate the navigator render on fontsLoaded.
 * Splash stays visible until both font families succeed. If either
 * fails, the app still renders — system fonts as a graceful fallback.
 */
export function useAppFonts(): {fontsLoaded: boolean; fontError: Error | null} {
  const [sairaLoaded, sairaError] = useSairaCondensed({
    SairaCondensed_900Black,
  });
  const [manropeLoaded, manropeError] = useManrope({
    Manrope_400Regular,
    Manrope_700Bold,
  });

  const fontsLoaded = sairaLoaded && manropeLoaded;
  const fontError = sairaError ?? manropeError ?? null;

  return {fontsLoaded, fontError};
}
