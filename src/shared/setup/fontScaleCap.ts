/**
 * Disable OS font scaling app-wide.
 *
 * HotPick is a fixed-canvas design — big italic display type, auto-fit player
 * names, big-number callouts, fixed-height cards, and lines that mix several
 * font sizes. Honoring the OS "Larger Text" / Dynamic Type slider overflows and
 * clips those layouts no matter how we cap the multiplier, and capping fights
 * `adjustsFontSizeToFit` and the auto-fit probes. So we render at the DESIGNED
 * sizes at every OS setting by defaulting `allowFontScaling = false` on Text and
 * TextInput.
 *
 * Accessibility text scaling is instead offered through a dedicated, tested
 * in-app control (Settings → Text size, fast-follow), decoupled from the
 * unpredictable OS value.
 *
 * Per-element `allowFontScaling` still wins (props spread last), so a specific
 * Text can opt back into OS scaling if ever needed.
 *
 * Mechanism: React 19 ignores `Component.defaultProps` for function components,
 * so we wrap the component's `render` to inject the default. On RN 0.83 +
 * React 19 + New Arch, `Text`/`TextInput` can be exported as
 * `React.memo(forwardRef(...))` — a memo object whose `render` lives on the
 * inner `.type`, NOT the outer object. The earlier version only checked the
 * outer `.render`, so on the memo shape it silently fell through to the ignored
 * `defaultProps` path and the cap became a no-op (OS scaling still applied).
 * This version unwraps the memo and, in dev, WARNS if the render-wrap missed so
 * a future RN/React upgrade can't re-break this silently. Installed once at
 * startup (index.js) before anything renders.
 */
import {Text, TextInput} from 'react-native';

// allowFontScaling=false already disables scaling; maxFontSizeMultiplier=1 is a
// belt-and-suspenders ceiling for any element that re-enables allowFontScaling
// without setting its own multiplier.
const LOCK = {allowFontScaling: false, maxFontSizeMultiplier: 1} as const;

type Patchable = {
  render?: (props: any, ref: any) => unknown;
  type?: Patchable; // React.memo(...) holds the wrapped component here
  defaultProps?: Record<string, unknown>;
};

/**
 * Returns true if the robust render-wrap landed (the only path that actually
 * works under React 19 function components); false if we had to fall back to
 * the `defaultProps` path (ignored by React 19 → effectively a no-op for fn
 * components — surfaced as a dev warning by the caller).
 */
function lockFontScaling(Component: unknown): boolean {
  const c = Component as Patchable | undefined;
  if (!c) return false;

  // Unwrap React.memo: the render function lives on the inner `.type`.
  const target: Patchable =
    typeof c.render === 'function' ? c : c.type ?? c;

  if (typeof target.render === 'function') {
    const original = target.render;
    target.render = function (props: any, ref: any) {
      // `...props` last so an explicit prop on the element overrides the lock.
      return original.call(this, {...LOCK, ...props}, ref);
    };
    return true;
  }

  // Fallback for any other shape (older RN / class component). React 19 ignores
  // defaultProps on function components, so this is best-effort only.
  c.defaultProps = {...(c.defaultProps ?? {}), ...LOCK};
  return false;
}

/**
 * Lock text to its designed size app-wide (ignore the OS text-scaling slider).
 * Call exactly once at app entry, before anything renders.
 */
export function installFontScaleCap(): void {
  const textLocked = lockFontScaling(Text);
  const inputLocked = lockFontScaling(TextInput);

  if (__DEV__ && (!textLocked || !inputLocked)) {
    // A real leak: the render-wrap didn't land, so the OS font slider may still
    // scale type and break fixed layouts. Don't fail silently across upgrades.
    // eslint-disable-next-line no-console
    console.warn(
      `[fontScaleCap] render-wrap missed (Text=${textLocked}, TextInput=${inputLocked}). ` +
        'OS font scaling may still apply — the component export shape changed; ' +
        'update lockFontScaling() to match.',
    );
  }
}
