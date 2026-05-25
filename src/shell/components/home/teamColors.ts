// src/shell/components/home/teamColors.ts
// NFL team brand color lookup — drives HotPickCinematic's team-color
// diagonal split. Sports data, not theme. Lives outside hotpickDefaults.ts
// per Hard Rule #9 separation (theme vs. sports data).
//
// Source: design handoff (HomeScreens.jsx TEAMS const) + ESPN team palettes.
// Expand as new teams enter the league. Missing keys fall back to dark gray.

export interface TeamColors {
  primary: string;
  city: string;
  name: string;
}

const NFL_TEAMS: Record<string, TeamColors> = {
  ARI: {primary: '#97233F', city: 'ARIZONA',       name: 'CARDINALS'},
  ATL: {primary: '#A71930', city: 'ATLANTA',       name: 'FALCONS'},
  BAL: {primary: '#241773', city: 'BALTIMORE',     name: 'RAVENS'},
  BUF: {primary: '#00338D', city: 'BUFFALO',       name: 'BILLS'},
  CAR: {primary: '#0085CA', city: 'CAROLINA',      name: 'PANTHERS'},
  CHI: {primary: '#0B162A', city: 'CHICAGO',       name: 'BEARS'},
  CIN: {primary: '#FB4F14', city: 'CINCINNATI',    name: 'BENGALS'},
  CLE: {primary: '#311D00', city: 'CLEVELAND',     name: 'BROWNS'},
  DAL: {primary: '#041E42', city: 'DALLAS',        name: 'COWBOYS'},
  DEN: {primary: '#FB4F14', city: 'DENVER',        name: 'BRONCOS'},
  DET: {primary: '#0076B6', city: 'DETROIT',       name: 'LIONS'},
  GB:  {primary: '#203731', city: 'GREEN BAY',     name: 'PACKERS'},
  HOU: {primary: '#03202F', city: 'HOUSTON',       name: 'TEXANS'},
  IND: {primary: '#002C5F', city: 'INDIANAPOLIS',  name: 'COLTS'},
  JAX: {primary: '#006778', city: 'JACKSONVILLE',  name: 'JAGUARS'},
  KC:  {primary: '#E31837', city: 'KANSAS CITY',   name: 'CHIEFS'},
  LAC: {primary: '#0080C6', city: 'LOS ANGELES',   name: 'CHARGERS'},
  LAR: {primary: '#003594', city: 'LOS ANGELES',   name: 'RAMS'},
  LV:  {primary: '#000000', city: 'LAS VEGAS',     name: 'RAIDERS'},
  MIA: {primary: '#008E97', city: 'MIAMI',         name: 'DOLPHINS'},
  MIN: {primary: '#4F2683', city: 'MINNESOTA',     name: 'VIKINGS'},
  NE:  {primary: '#002244', city: 'NEW ENGLAND',   name: 'PATRIOTS'},
  NO:  {primary: '#D3BC8D', city: 'NEW ORLEANS',   name: 'SAINTS'},
  NYG: {primary: '#0B2265', city: 'NEW YORK',      name: 'GIANTS'},
  NYJ: {primary: '#125740', city: 'NEW YORK',      name: 'JETS'},
  PHI: {primary: '#004C54', city: 'PHILADELPHIA',  name: 'EAGLES'},
  PIT: {primary: '#101820', city: 'PITTSBURGH',    name: 'STEELERS'},
  SEA: {primary: '#002244', city: 'SEATTLE',       name: 'SEAHAWKS'},
  SF:  {primary: '#AA0000', city: 'SAN FRANCISCO', name: '49ERS'},
  TB:  {primary: '#D50A0A', city: 'TAMPA BAY',     name: 'BUCCANEERS'},
  TEN: {primary: '#0C2340', city: 'TENNESSEE',     name: 'TITANS'},
  WAS: {primary: '#5A1414', city: 'WASHINGTON',    name: 'COMMANDERS'},
};

const FALLBACK: TeamColors = {primary: '#1A1A1A', city: '', name: ''};

export function getTeamColors(abbr: string | null | undefined): TeamColors {
  if (!abbr) return FALLBACK;
  return NFL_TEAMS[abbr.toUpperCase()] ?? FALLBACK;
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

/** "BAL" → "Baltimore Ravens"; unknown abbrs surface the raw code. */
export function fullTeamName(abbr: string | null | undefined): string | null {
  if (!abbr) return null;
  const t = getTeamColors(abbr);
  if (!t.city) return abbr;
  return `${titleCase(t.city)} ${titleCase(t.name)}`;
}

/** Two-letter initials for a partner/team name fallback ("Miller's Tavern" → "MT"). */
export function partnerInitials(name: string | null | undefined): string {
  if (!name) return '··';
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '··';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
