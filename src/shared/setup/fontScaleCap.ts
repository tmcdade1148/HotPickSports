/**
 * Global cap on OS font scaling.
 *
 * iOS "Larger Text" / Dynamic Type and Android font-size accessibility settings
 * scale every <Text> with no upper bound (iOS goes well past 3x). Unbounded, that
 * overflows fixed-height rows, buttons, tab-bar labels, and cards across the whole
 * app — which is what users with large display text were hitting. Previously only
 * the three header components capped `maxFontSizeMultiplier`; everything else was
 * unbounded.
 *
 * This installs ONE app-wide ceiling on `Text` and `TextInput` so OS scaling can
 * still enlarge our type (accessibility), but only up to MAX_FONT_SCALE — past
 * that, layouts hold. Run once at startup (from index.js) before anything renders.
 *
 * Per-element `maxFontSizeMultiplier` still wins: the wrap spreads incoming props
 * LAST, so an explicit value (e.g. the headers' tighter 1.2) overrides this
 * default. Pass `maxFontSizeMultiplier={0}` on a specific Text to opt out entirely.
 *
 * Mechanism: React 19 ignores `Component.defaultProps` for function components, so
 * we wrap the forwardRef render to inject the default (the version-safe approach),
 * with a defaultProps fallback for any other component shape.
 */
import {Text, TextInput} from 'react-native';

// The ceiling. 1.2 ≈ allow up to 120% of our designed size before clamping. This
// is a fixed-canvas design, so headroom past ~1.2 starts overflowing composed
// layouts. Tune here; it's the single source of truth for the app-wide cap.
// (Fixed single-line chrome — IdentityBar, the test banner, the Join/Create
// pills — caps tighter still, at 1.1, via per-element maxFontSizeMultiplier.)
export const MAX_FONT_SCALE = 1.2;

function capFontScaling(Component: unknown): void {
  if (!Component) return;
  const c = Component as {
    render?: (props: any, ref: any) => unknown;
    defaultProps?: Record<string, unknown>;
  };

  // Primary path (React 19 safe): wrap the forwardRef render so every instance
  // gets a default maxFontSizeMultiplier. Spreading `...props` last means an
  // explicit prop on the element overrides this default.
  if (typeof c.render === 'function') {
    const original = c.render;
    c.render = function (props: any, ref: any) {
      // Skip Text that already auto-fits via adjustsFontSizeToFit. Forcing a
      // maxFontSizeMultiplier onto such Text triggers a long-standing iOS bug
      // where it shrinks toward minimumFontScale even at normal OS scale (the
      // "text too small at normal size" regression). Those elements already
      // bound their own size, so leave them untouched.
      if (props && props.adjustsFontSizeToFit) {
        return original.call(this, props, ref);
      }
      return original.call(this, {maxFontSizeMultiplier: MAX_FONT_SCALE, ...props}, ref);
    };
    return;
  }

  // Fallback for any other shape (older RN / class component).
  c.defaultProps = {...(c.defaultProps ?? {}), maxFontSizeMultiplier: MAX_FONT_SCALE};
}

/**
 * Install the global font-scale cap. Idempotent-ish: call exactly once at app
 * entry. (Calling twice would double-wrap render harmlessly, but don't.)
 */
export function installFontScaleCap(): void {
  capFontScaling(Text);
  capFontScaling(TextInput);
}
