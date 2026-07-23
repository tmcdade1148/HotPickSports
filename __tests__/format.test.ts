// Tests for the shared format utilities. These are pure functions
// used across many surfaces (Roster Pass redemption / display in
// PartnerAdmin + PartnerDirectory + ClubAdmin, relative-time copy in
// MessageCenter + AdminModerationQueue, ordinal suffixes everywhere).
// Pure-function locks here are cheap insurance against accidental
// drift in any consumer's input handling.

import {
  ordinalSuffix,
  formatRosterPass,
  normalizeRosterPass,
  formatRelativeTime,
  fmtPoints,
} from '../src/shared/utils/format';

describe('ordinalSuffix', () => {
  it('returns st/nd/rd/th for low integers', () => {
    expect(ordinalSuffix(1)).toBe('st');
    expect(ordinalSuffix(2)).toBe('nd');
    expect(ordinalSuffix(3)).toBe('rd');
    expect(ordinalSuffix(4)).toBe('th');
  });

  it('returns th for the teens (11/12/13)', () => {
    // English-language oddity — teens always take "th" even though
    // the last digit suggests st/nd/rd.
    expect(ordinalSuffix(11)).toBe('th');
    expect(ordinalSuffix(12)).toBe('th');
    expect(ordinalSuffix(13)).toBe('th');
  });

  it('returns st/nd/rd for 21/22/23 (and similar)', () => {
    expect(ordinalSuffix(21)).toBe('st');
    expect(ordinalSuffix(22)).toBe('nd');
    expect(ordinalSuffix(23)).toBe('rd');
    expect(ordinalSuffix(101)).toBe('st');
    expect(ordinalSuffix(112)).toBe('th');
    expect(ordinalSuffix(121)).toBe('st');
  });
});

describe('formatRosterPass', () => {
  it('formats an 8-char compact pass as XXXX-XXXX', () => {
    expect(formatRosterPass('SG2HSDDU')).toBe('SG2H-SDDU');
  });

  it('uppercases lowercase input', () => {
    expect(formatRosterPass('sg2hsddu')).toBe('SG2H-SDDU');
  });

  it('strips internal separators before formatting', () => {
    expect(formatRosterPass('SG2H-SDDU')).toBe('SG2H-SDDU');
    expect(formatRosterPass('sg2h sddu')).toBe('SG2H-SDDU');
    expect(formatRosterPass('SG2H.SDDU')).toBe('SG2H-SDDU');
  });

  it('returns "" for input that does not normalize to exactly 8 chars', () => {
    // Empty / null / undefined → empty (callers render placeholder)
    expect(formatRosterPass('')).toBe('');
    expect(formatRosterPass(null)).toBe('');
    expect(formatRosterPass(undefined)).toBe('');
    // Too short (mid-typed)
    expect(formatRosterPass('SG2H')).toBe('');
    expect(formatRosterPass('SG2HSDD')).toBe('');
    // Too long
    expect(formatRosterPass('SG2HSDDUX')).toBe('');
  });
});

describe('normalizeRosterPass', () => {
  it('strips non-alphanumeric + uppercases', () => {
    expect(normalizeRosterPass('sg2h-sddu')).toBe('SG2HSDDU');
    expect(normalizeRosterPass('  SG2H SDDU  ')).toBe('SG2HSDDU');
    expect(normalizeRosterPass('sg.2h_sddu')).toBe('SG2HSDDU');
  });

  it('returns empty string for input without alphanumerics', () => {
    expect(normalizeRosterPass('-----')).toBe('');
    expect(normalizeRosterPass('')).toBe('');
  });

  it('preserves digit-only and letter-only inputs', () => {
    expect(normalizeRosterPass('12345678')).toBe('12345678');
    expect(normalizeRosterPass('abcdefgh')).toBe('ABCDEFGH');
  });
});

describe('fmtPoints', () => {
  // The app-wide sign rule (2026-07-23). Every point value on every surface —
  // the GameChip's FINAL box, the Picks week score, Home's eyebrows, the Recap
  // card — formats through here. A "+" creeping back in is the regression this
  // guards: it makes a settled result read as a swing that could still move.
  it('renders positives BARE — never a leading plus', () => {
    expect(fmtPoints(16)).toBe('16');
    expect(fmtPoints(1)).toBe('1');
    expect(fmtPoints(31)).toBe('31');
  });

  it('renders zero as a plain 0', () => {
    expect(fmtPoints(0)).toBe('0');
  });

  it('keeps the minus on genuine negatives', () => {
    expect(fmtPoints(-16)).toBe('−16');
    expect(fmtPoints(-1)).toBe('−1');
  });

  it('uses U+2212 MINUS SIGN, not a hyphen', () => {
    // A hyphen-minus renders short and high next to full-height digits; the
    // real minus sign is what the design calls for and what every surface must
    // agree on. `-16` (hyphen) is the wrong glyph even though it "looks right".
    expect(fmtPoints(-16)).toBe('−16');
    expect(fmtPoints(-16)).not.toBe('-16');
    expect(fmtPoints(-16).charCodeAt(0)).toBe(0x2212);
  });
});

describe('formatRelativeTime', () => {
  const now = Date.now();

  it('"Just now" for sub-minute', () => {
    expect(formatRelativeTime(new Date(now - 30 * 1000).toISOString())).toBe('Just now');
  });

  it('"Nm ago" for minute granularity', () => {
    expect(formatRelativeTime(new Date(now - 5 * 60 * 1000).toISOString())).toBe('5m ago');
    expect(formatRelativeTime(new Date(now - 59 * 60 * 1000).toISOString())).toBe('59m ago');
  });

  it('"Nh ago" for hour granularity', () => {
    expect(formatRelativeTime(new Date(now - 2 * 60 * 60 * 1000).toISOString())).toBe('2h ago');
    expect(formatRelativeTime(new Date(now - 23 * 60 * 60 * 1000).toISOString())).toBe('23h ago');
  });

  it('"Nd ago" for day granularity (up to 6 days)', () => {
    expect(formatRelativeTime(new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString())).toBe('2d ago');
    expect(formatRelativeTime(new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString())).toBe('6d ago');
  });

  it('falls back to a short Mmm D date for 7+ days', () => {
    const tenDaysAgo = new Date(now - 10 * 24 * 60 * 60 * 1000);
    const expected = tenDaysAgo.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
    expect(formatRelativeTime(tenDaysAgo.toISOString())).toBe(expected);
  });
});
