// src/shared/theme/fonts.ts
// HotPick Sports font family configuration.
//
// Note (2026-05-13): expo-font + @expo-google-fonts was tried first but
// crashed at bundle-load time with "Cannot read property 'EventEmitter'
// of undefined" — the native side of expo-font isn't bound on this bare
// RN setup despite expo-modules-core being present.
//
// Until proper native font linking is wired up (TTFs in assets/fonts/
// + react-native.config.js + native rebuild), the FONTS constants below
// are just string references. Components style with fontFamily values
// like 'SairaCondensed_900Black'; when those names don't resolve at
// runtime, the system substitutes its default — design degrades to
// system fonts but the app launches and is fully functional.

export const FONTS = {
  display:  'SairaCondensed_900Black',
  body:     'Manrope_400Regular',
  bodyBold: 'Manrope_700Bold',
  mono:     undefined as string | undefined,
} as const;

/**
 * No-op shim — kept so the App.tsx import still resolves while we
 * sort out native font linking. Returns immediately "loaded" so any
 * remaining caller doesn't hang.
 */
export function useAppFonts(): {fontsLoaded: boolean; fontError: Error | null} {
  return {fontsLoaded: true, fontError: null};
}
