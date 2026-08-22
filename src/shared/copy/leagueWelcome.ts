// League (partner board) welcome copy. Shared so the onboarding ProfileSetup
// screen and the PoolWelcome fallback render the exact same wording without
// drift. Returns null for non-board members (regular Players), who get the
// standard platform welcome instead.
//
// One role since 2026-08-22: Director. The Chairman seat was removed (Hard
// Rule #24, amended) — Directors inherit the whole seat, so this copy is the
// former Chairman wording. The old Director line described "the Chairman's
// second", which no longer describes anyone.

export type LeagueRole = 'director';

export function leagueWelcomeCopy(
  role: LeagueRole | string | null | undefined,
): string | null {
  if (role === 'director') {
    return "Welcome aboard. As Director, you sit at the top of your League. Underneath you, a Roster of Contests, every group that wanted to be Endorsed by your brand. You give those Players a Perk. They give you a room full of people who already chose your name. Broadcast to them whenever you've got something to say. Your League Tools live in Settings whenever you need them.";
  }
  return null;
}
