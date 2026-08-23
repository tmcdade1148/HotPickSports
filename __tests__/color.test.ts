import {readableOn, wcagContrast, hexToRgba} from '../src/shared/utils/color';

// The Natural's brand red — the color that started this. Dark enough to read
// fine on white and to disappear on a dark page.
const BRAND_DARK_RED = '#b73138';
const DARK_BG = '#101216';
const LIGHT_BG = '#FFFFFF';

describe('readableOn()', () => {
  it('leaves a brand color alone when it already passes on the background', () => {
    // Dark red on white is ~7:1 — untouched, so light mode is unaffected.
    expect(wcagContrast(BRAND_DARK_RED, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
    expect(readableOn(BRAND_DARK_RED, LIGHT_BG)).toBe(BRAND_DARK_RED);
  });

  it('lifts a dark brand color until it is legible on a dark background', () => {
    expect(wcagContrast(BRAND_DARK_RED, DARK_BG)).toBeLessThan(4.5);
    const fixed = readableOn(BRAND_DARK_RED, DARK_BG);
    expect(fixed).not.toBe(BRAND_DARK_RED);
    expect(wcagContrast(fixed, DARK_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('darkens a light brand color on a light background', () => {
    const paleYellow = '#FFE680';
    expect(wcagContrast(paleYellow, LIGHT_BG)).toBeLessThan(4.5);
    const fixed = readableOn(paleYellow, LIGHT_BG);
    expect(wcagContrast(fixed, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the hue — this nudges the brand, it does not replace it', () => {
    // Red in, red out: the red channel stays dominant over green and blue.
    const fixed = readableOn(BRAND_DARK_RED, DARK_BG).replace('#', '');
    const r = parseInt(fixed.substring(0, 2), 16);
    const g = parseInt(fixed.substring(2, 4), 16);
    const b = parseInt(fixed.substring(4, 6), 16);
    expect(r).toBeGreaterThan(g);
    expect(r).toBeGreaterThan(b);
  });

  it('respects a caller-supplied ratio', () => {
    const relaxed = readableOn(BRAND_DARK_RED, DARK_BG, 3);
    expect(wcagContrast(relaxed, DARK_BG)).toBeGreaterThanOrEqual(3);
  });

  it('falls back to the background for a missing brand color', () => {
    expect(readableOn(null, DARK_BG)).toBe(DARK_BG);
    expect(readableOn(undefined, DARK_BG)).toBe(DARK_BG);
  });

  it('returns a malformed input unchanged rather than throwing', () => {
    expect(readableOn('not-a-hex', DARK_BG)).toBe('not-a-hex');
  });

  it('returns its best attempt when no lightness can clear the bar', () => {
    // Nothing clears 21:1 except black on white, so this exercises the
    // exhausted-loop path: it must still return a usable color.
    const best = readableOn(BRAND_DARK_RED, DARK_BG, 21);
    expect(best).toMatch(/^#[0-9a-f]{6}$/i);
    expect(wcagContrast(best, DARK_BG)).toBeGreaterThan(
      wcagContrast(BRAND_DARK_RED, DARK_BG),
    );
  });
});

describe('hexToRgba()', () => {
  it('raises a tint to a real alpha instead of an opaque-hex suffix', () => {
    // The old code appended '14'/'33' to the hex. This is the replacement.
    expect(hexToRgba(BRAND_DARK_RED, 0.22)).toBe('rgba(183, 49, 56, 0.22)');
  });
});
