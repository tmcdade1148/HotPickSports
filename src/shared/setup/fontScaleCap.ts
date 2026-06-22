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
 * so we wrap the forwardRef render to inject the default, with a defaultProps
 * fallback for any other component shape. Installed once at startup (index.js)
 * before anything renders.
 */
import {Text, TextInput} from 'react-native';

function lockFontScaling(Component: unknown): void {
  if (!Component) return;
  const c = Component as {
    render?: (props: any, ref: any) => unknown;
    defaultProps?: Record<string, unknown>;
  };

  // Primary path (React 19 safe): wrap the forwardRef render so every instance
  // defaults to allowFontScaling=false. `...props` last means an explicit prop
  // on the element overrides this default.
  if (typeof c.render === 'function') {
    const original = c.render;
    c.render = function (props: any, ref: any) {
      return original.call(this, {allowFontScaling: false, ...props}, ref);
    };
    return;
  }

  // Fallback for any other shape (older RN / class component).
  c.defaultProps = {...(c.defaultProps ?? {}), allowFontScaling: false};
}

/**
 * Lock text to its designed size app-wide (ignore the OS text-scaling slider).
 * Call exactly once at app entry, before anything renders.
 */
export function installFontScaleCap(): void {
  lockFontScaling(Text);
  lockFontScaling(TextInput);
}
