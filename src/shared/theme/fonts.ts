// src/shared/theme/fonts.ts
// HotPick Sports font family configuration.
//
// Fonts are bundled as native assets via react-native.config.js:
//   ./assets/fonts/SairaCondensed-Black.ttf
//   ./assets/fonts/Manrope-Bold.ttf
//   ./assets/fonts/Manrope-Regular.ttf
//
// TTF files were renamed so their basename matches the iOS PostScript
// name. That way the same fontFamily string works on both platforms
// (iOS resolves by PostScript name, Android by filename-without-extension).
//
// After any change to assets/fonts/, run:
//   npx react-native-asset
//   bundle exec pod install   (iOS — picks up Info.plist UIAppFonts)
//   Native rebuild on both platforms.

export const FONTS = {
  /** Display — Saira Condensed Black. Italic via fontStyle: 'italic'. */
  display: 'SairaCondensed-Black',
  /** Body — Manrope Bold (for emphasized body text and CTAs). */
  bodyBold: 'Manrope-Bold',
  /** Body — Manrope Regular (running text). */
  body: 'Manrope-Regular',
  /** Mono — system monospace; RN auto-selects SF Mono / Roboto Mono. */
  mono: undefined as string | undefined,
} as const;

/**
 * No-op shim kept so any caller that still imports it doesn't break.
 * Fonts are now bundled natively, so no async load is required.
 */
export function useAppFonts(): {fontsLoaded: boolean; fontError: Error | null} {
  return {fontsLoaded: true, fontError: null};
}
