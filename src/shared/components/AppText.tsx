// The ONLY app file (besides the fontScaleCap backstop) allowed to import
// Text / TextInput from 'react-native'. Everything else imports from here.
// Enforced by ESLint `no-restricted-imports` (see .eslintrc.js).
//
// Why this exists: HotPick is a fixed-canvas design. Honoring the OS
// "Larger Text" / Dynamic Type slider overflows and clips those layouts, so we
// render at the DESIGNED sizes regardless of the OS font-size setting by
// forcing `allowFontScaling={false}` on every owned Text/TextInput. The
// `fontScaleCap` startup patch is the backstop for text we don't own
// (Animated.Text, third-party libraries); this wrapper is the enforceable
// source of truth for our own screens.
//
// Accessibility note: the two legal screens (Privacy Policy + Terms) use
// `LegalText`, which KEEPS scaling on — dense legal copy is the one place a
// low-vision user genuinely needs to enlarge text, and the screen's ScrollView
// absorbs the extra height.
import React from 'react';
import {Text as RNText, TextInput as RNTextInput} from 'react-native';
import type {TextProps, TextInputProps} from 'react-native';

type TextRef = React.ElementRef<typeof RNText>;
type TextInputRef = React.ElementRef<typeof RNTextInput>;

// Locked: never scales with the OS font-size setting. `allowFontScaling` is set
// AFTER {...props} so a stray caller prop can never re-enable scaling.
// forwardRef is required — the PoolHeader/PicksHeader auto-fit probes measure
// through refs, and TextInput callers rely on .focus()/.blur().
export const Text = React.forwardRef<TextRef, TextProps>((props, ref) => (
  <RNText ref={ref} {...props} allowFontScaling={false} />
));
Text.displayName = 'AppText';

export const TextInput = React.forwardRef<TextInputRef, TextInputProps>(
  (props, ref) => <RNTextInput ref={ref} {...props} allowFontScaling={false} />,
);
TextInput.displayName = 'AppTextInput';

// Carve-out: LEGAL SCREENS ONLY. Scales freely for accessibility; the
// ScrollView on those screens handles the extra height.
export const LegalText = React.forwardRef<TextRef, TextProps>((props, ref) => (
  <RNText ref={ref} {...props} allowFontScaling={true} />
));
LegalText.displayName = 'LegalText';
