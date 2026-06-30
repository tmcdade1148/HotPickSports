// src/shell/components/home/salutation.ts
// Context-aware salutation library — rendered above the State Hero eyebrow.
// Spec: 260513_HotPick_HomeRedesign_Spec.docx §6.4.3 (salutation rule) and
// REFERENCE.md §11 (salutation pool definitions).
//
// Originally inline in HomeScreen.tsx as getContextGreeting; extracted here
// so multiple components (StateHero, IdleHero, bridge heroes) can consume.
//
// Deterministic per-hour: picks one greeting from each pool using the hour
// as a seed so the copy doesn't flicker on re-renders but does evolve
// throughout the day.
//
// Note (2026-05-14): the legacy "weekly picksDeadline" is deprecated.
// Picks now lock per-game at each game's kickoff. The "last call" copy
// keys off `firstKickoff` (first game of the week) — once that's within
// 24h, at least some picks are about to lock individually.
//
// SYNC: the Operator Console (tools/hotpick-operator-console_v2.html) AND
// REFERENCE.md §11 hand-mirror this copy. If you change a salutation here,
// update both and run `node tools/check-home-spec-sync.mjs` (it guards both).

export function getContextGreeting(
  phase: string | null,
  weekState: string,
  userPickCount: number,
  firstKickoff: Date | null,
): string {
  const hour = new Date().getHours();
  const pick = (arr: string[]) => arr[hour % arr.length];

  // Dead period / pre-season
  if (!phase || phase === 'PRE_SEASON') {
    return pick(["Nothing on yet. Enjoy it", "Offseason. It won't last", "Season's coming"]);
  }

  // Season complete
  if (phase === 'SEASON_COMPLETE') {
    return pick(['What a ride', "That's a wrap", 'See you next season']);
  }

  // Transition phases
  if (phase === 'REGULAR_COMPLETE' || phase === 'SUPERBOWL_INTRO') {
    return pick(['Dust settling', 'Big things ahead', 'Stay sharp']);
  }

  // Active season — use week state
  switch (weekState) {
    case 'picks_open': {
      // User has submitted picks
      if (userPickCount > 0) {
        return pick(['On record. No edits', 'Said what you said', 'Locked in']);
      }
      // First-game kickoff within 24 hours → some picks are about to
      // lock individually. This is the new "last call" trigger now that
      // there's no single weekly deadline.
      if (firstKickoff) {
        const hoursLeft = (firstKickoff.getTime() - Date.now()) / 3_600_000;
        if (hoursLeft > 0 && hoursLeft <= 24) {
          return pick(['Last call', 'Closing time', 'You sure about this?']);
        }
      }
      return pick(['Picks are open', 'Your move', "Clock's running"]);
    }
    case 'locked':
      return pick(['On record. No edits', 'Said what you said', 'Locked in']);
    case 'live':
      return pick(["It's happening", 'Too late to change anything', 'Watching or refreshing?']);
    case 'settling':
    case 'complete':
      return pick(["The record doesn't lie", "It's official", 'Week closed']);
    default:
      return pick(['Nothing today', 'Rest day', 'Back at it soon']);
  }
}
