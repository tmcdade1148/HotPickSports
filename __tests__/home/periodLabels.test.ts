/**
 * LABELS-01 §7 — preseason period-label vocabulary.
 *
 * Two things are under test, and the FIRST matters more:
 *
 *   1. Called with no label arguments, every helper returns exactly what it
 *      returned before this spec. That is the safety property the whole design
 *      rests on (§3): the new parameters are optional and default to 'W' /
 *      'WEEK' precisely so a missed call site renders today's output instead
 *      of breaking. Six surfaces build week strings; these tests are what make
 *      "a miss is invisible rather than harmful" a checked claim.
 *
 *   2. Passing the preseason vocabulary produces PS01 / PRESEASON WEEK 1.
 *
 * The PLAYOFFS and PRE_SEASON branches are asserted unchanged in both modes:
 * they must ignore the override entirely. PRE_SEASON here is nfl_2026's season
 * PHASE, not the preseason competition — the two are unrelated, which is the
 * confusion §2b exists to prevent.
 */
import {getPeriodLabel} from '@shell/components/home/periodLabel';
import {shortPeriod} from '@shell/components/home/shortPeriod';
import {weekLabel, sectionWeekLabel} from '@shell/components/home/weekRecap';
import {nflPreseason2026, nflSeason} from '@sports/nfl/config';

const PS = nflPreseason2026.periodLabels!;

describe('no arguments — output is byte-identical to before LABELS-01', () => {
  it('getPeriodLabel REGULAR', () => {
    expect(getPeriodLabel('REGULAR', 8)).toBe('WEEK 8');
    expect(getPeriodLabel('REGULAR', null)).toBe('WEEK —');
  });

  it('getPeriodLabel PLAYOFFS and PRE_SEASON', () => {
    expect(getPeriodLabel('PLAYOFFS', 19)).toBe('WILD CARD');
    expect(getPeriodLabel('PLAYOFFS', 20)).toBe('DIVISIONAL');
    expect(getPeriodLabel('PLAYOFFS', 21)).toBe('CONF CHAMPIONSHIP');
    expect(getPeriodLabel('PRE_SEASON', null)).toBe('PRESEASON');
    expect(getPeriodLabel('SEASON_COMPLETE', null)).toBe('SEASON DONE');
  });

  it('shortPeriod REGULAR, PLAYOFFS and PRE_SEASON', () => {
    expect(shortPeriod('REGULAR', 1, 19, 2026)).toBe('NFL26 · W01');
    expect(shortPeriod('REGULAR', 12, 19, 2026)).toBe('NFL26 · W12');
    expect(shortPeriod('PLAYOFFS', 19, 19, 2026)).toBe('NFL26 · WC');
    expect(shortPeriod('PRE_SEASON', null, 19, 2026)).toBe('NFL26 · PRESEASON');
    expect(shortPeriod('OFF_SEASON', null, 19, 2026)).toBe('NFL26 · OFFSEASON');
  });

  it('weekRecap helpers', () => {
    expect(weekLabel(7, false)).toBe('W7');
    expect(sectionWeekLabel(7, false)).toBe('WEEK 7');
    // Playoff rounds read as rounds and never take a prefix.
    expect(weekLabel(19, true)).toBe('WC');
    expect(sectionWeekLabel(22, true)).toBe('SB');
  });
});

describe('preseason vocabulary', () => {
  it('config carries both forms on nfl_2026_pre only', () => {
    expect(PS).toEqual({short: 'PS', long: 'PRESEASON WEEK'});
    // The real season must not inherit it — nflPreseason2026 spreads nflSeason,
    // so this guards the spread direction, not just the value.
    expect(nflSeason.periodLabels).toBeUndefined();
  });

  it('pill reads NFL26 · PS01', () => {
    expect(shortPeriod('REGULAR', 1, 19, 2026, PS.short, PS.long)).toBe(
      'NFL26 · PS01',
    );
    expect(shortPeriod('REGULAR', 3, 19, 2026, PS.short, PS.long)).toBe(
      'NFL26 · PS03',
    );
  });

  it('pill stays at the FULL font — exactly on the compact threshold', () => {
    // COMPACT_PERIOD_LENGTH is 12 and steps down labels LONGER than that.
    // 'NFL26 · PS01' is exactly 12, so it renders at the full pill size like
    // 'NFL26 · W01' does (§2d). One character more and it would shrink, so
    // this pins the boundary rather than trusting it.
    const pill = shortPeriod('REGULAR', 1, 19, 2026, PS.short, PS.long);
    expect(pill).toHaveLength(12);
  });

  it('spelled-out label reads PRESEASON WEEK 1', () => {
    expect(getPeriodLabel('REGULAR', 1, 19, PS.long)).toBe('PRESEASON WEEK 1');
    expect(sectionWeekLabel(1, false, PS.long)).toBe('PRESEASON WEEK 1');
  });

  it('history bars read PS1', () => {
    expect(weekLabel(1, false, PS.short)).toBe('PS1');
    expect(weekLabel(3, false, PS.short)).toBe('PS3');
  });

  it('shortPeriod threads the long form into its fallback path', () => {
    // The final branch delegates to getPeriodLabel. Without the sixth
    // parameter this path would keep saying WEEK while every other surface
    // said PRESEASON WEEK — the drift §5c calls out explicitly.
    expect(shortPeriod('REGULAR', null, 19, 2026, PS.short, PS.long)).toBe(
      'NFL26 · PRESEASON WEEK —',
    );
  });

  it('leaves playoff rounds alone even when the override is passed', () => {
    expect(getPeriodLabel('PLAYOFFS', 19, 19, PS.long)).toBe('WILD CARD');
    expect(weekLabel(19, true, PS.short)).toBe('WC');
    expect(sectionWeekLabel(22, true, PS.long)).toBe('SB');
  });
});

/**
 * The short form is used where a surface has no room (LABELS-01, revised):
 * the pill, the WeekSelector chips, both SeasonBoardScreen strings, and the
 * submit footer. These pin the string ARITHMETIC for the tight ones — the
 * components themselves are verified on device (§7), but the length claims
 * that justified choosing short over long are checkable here.
 */
describe('short form keeps the tight surfaces inside their limits', () => {
  const wrap = (prefix: string | undefined, week: number) =>
    `THAT'S A WRAP ON ${prefix ? `${prefix}${week}` : `WEEK ${week}`}`;

  it('submit footer is SHORTER in the preseason than it is today', () => {
    // SubmitPicksFooter clamps to numberOfLines={1}, so this is the one
    // surface where the long form would truncate rather than wrap. The short
    // form makes the preseason string shorter than the regular-season one it
    // replaces, which is why no exception was needed.
    const today = wrap(undefined, 1);
    const preseason = wrap(PS.short, 1);
    expect(today).toBe("THAT'S A WRAP ON WEEK 1");
    expect(preseason).toBe("THAT'S A WRAP ON PS1");
    expect(preseason.length).toBeLessThan(today.length);
  });

  it('WeekSelector chips stay at 3 characters across the whole preseason', () => {
    // 3 weeks (nflPreseason2026.totalWeeks), 52pt chips at 13px. The 2-char
    // prefix concern only bites at double-digit weeks, which cannot occur.
    expect(nflPreseason2026.totalWeeks).toBe(3);
    for (let w = 1; w <= nflPreseason2026.totalWeeks; w++) {
      expect(`${PS.short}${w}`).toHaveLength(3);
    }
  });

  it('Board banner is shorter with the prefix than spelled out', () => {
    const short = `${PS.short}1 PICKS LOCK IN 2 DAYS`;
    const long = `${PS.long} 1 PICKS LOCK IN 2 DAYS`;
    expect(short).toBe('PS1 PICKS LOCK IN 2 DAYS');
    expect(short.length).toBeLessThan(long.length);
  });

  it('IdentityBar range chip retires the third abbreviation', () => {
    // The chip built its own string and used a THIRD prefix — "WK" — alongside
    // W and WEEK. It is gated on currentPhase === 'REGULAR', which the
    // preseason satisfies (Hard Rule #22), so it was live there reading
    // "PTS THRU WK 1". Short form, because "PTS" beside it is already
    // abbreviated and the spelled-out version would be 25 characters.
    const chip = (prefix: string | undefined, week: number) =>
      prefix ? `PTS THRU ${prefix}${week}` : `PTS THRU WK ${week}`;
    expect(chip(undefined, 1)).toBe('PTS THRU WK 1');
    expect(chip(PS.short, 1)).toBe('PTS THRU PS1');
    expect(chip(PS.short, 1).length).toBeLessThan(
      `PTS THRU ${PS.long} 1`.length,
    );
  });

  it('Board toggle tab keeps its existing sentence casing', () => {
    // "PS1 Points", not "PS1 POINTS" — the caps inconsistency on this tab is
    // pre-existing and has its own ticket. A labels change must not smuggle a
    // copy fix in with it.
    expect(`${PS.short}1 Points`).toBe('PS1 Points');
  });
});
