// League (partner board) welcome copy, keyed by role. Shared so the
// onboarding ProfileSetup screen and the PoolWelcome fallback render the
// exact same wording without drift. Returns null for non-board members
// (regular Players), who get the standard platform welcome instead.

export type LeagueRole = 'chairman' | 'director';

export function leagueWelcomeCopy(
  role: LeagueRole | string | null | undefined,
): string | null {
  if (role === 'chairman') {
    return "Welcome aboard. As Chairman, you sit at the top of your League. Underneath you, a Roster of Contests, every group that wanted to be Endorsed by your brand. You give those Players a Perk. They give you a room full of people who already chose your name. Broadcast to them whenever you've got something to say.";
  }
  if (role === 'director') {
    return "Welcome aboard. As Director, you're the Chairman's second, and the one who actually keeps the League running. The Roster of Contests ahead of you is every group that wanted to be Endorsed by your brand. You give those Players a Perk. They give you a room full of people who already chose your name. Broadcast to them whenever you've got something to say.";
  }
  return null;
}
