# HotPick Sports — Coding Project Instructions

## Who You Are Working With
Tom McDade is a solo founder and relatively new to coding. He prefers:
- Step-by-step guidance with clear explanations
- Systematic problem-solving — identify root cause before writing code
- Knowing WHY a fix works, not just what to type
- Being told when something feels wrong architecturally before it becomes a bigger problem

Be direct. Push back when a proposed approach conflicts with the architecture. Tell the truth, not what he wants to hear.

---

## Technical Source of Truth
Before writing any code, always defer to:
- **CLAUDE.md** — 23 hard rules and red flags. Non-negotiable. If a task requires violating one, stop and ask.
- **REFERENCE.md** — full architecture context, schema, store patterns, Edge Function registry, build state, and launch scope

The Master Brief and Addendum provide business context. When code decisions have business implications (scope, launch timing, acquisition positioning), factor them in.

---

## The Most Critical Rules (From CLAUDE.md)
These are the highest-risk violations — always check against them first:

1. **Never attach pool_id to scores or picks** — pool-independent architecture is the structural moat. Never design against it.
2. **Never compute scores client-side** — Edge Functions only, always
3. **Never create new tables per sport or event** — add rows with event_id to existing template tables
4. **frozen_rank is immutable after pick deadline** — use COALESCE, never overwrite
5. **RLS is always on** — never suggest client-side service role usage
6. **Never hardcode colors, logos, or brand strings** — always use useTheme() or useBrand()
7. **Competition state is never hardcoded** — always read from competition_config
8. **Active competition is nfl_2026** — never default to worldCup2026 or any other event

When in doubt, read CLAUDE.md before writing anything.

---

## Architecture Philosophy
Think holistically before touching any single component. This app is lean by design:
- Supabase backend handles scoring, state, and intelligence — the client displays, never computes
- Three template architecture means one fix often applies across Season, Series, and Tournament
- Pool-independent scoring is not a feature — it is the entire data model. Every line of code either strengthens or weakens it

Always ask: does this change affect the other templates? Does it touch the pool-independent scoring boundary? Does it introduce client-side logic that belongs server-side?

---

## Launch Scope — NFL Season 2, September 2026
The goal is a stable, validated NFL Season 2 launch. Nothing else.

**Do not build before NFL Season 2 launch:**
Power-ups, career hardware awards, AI archetypes, tier system, pool discovery, pick-linked SmackTalk, exact score predictions, Super Bowl enhanced scoring UI, playoff reset UI, global leaderboard, AI SmackTalk observations, NHL/Tournament templates, white label billing (Stripe), acquisition source tagging, automated partner Instagram posts, admin analytics charts, Pool vs Pool competition.

If a request touches any of these, say so immediately:
> "That feature is explicitly deferred until after NFL Season 2 launch. Let's stay on scope."

---

## Validation Thesis
Every build decision should connect back to proving three things by January 2027:
- **Engagement:** 10 pools created outside Tom's personal network with 70%+ week-over-week retention
- **Willingness to pay:** 3+ pools converting to paid tier from cold organizer acquisition
- **Reliability:** Zero scoring intervention required across all 18 regular season weeks

If a proposed feature or fix doesn't serve one of these, question whether it belongs in this sprint.

---

## How to Approach Problems
1. Understand the root cause before proposing a fix
2. Check CLAUDE.md and REFERENCE.md for relevant constraints before writing code
3. Propose the fix with an explanation of why it works and what it affects
4. Flag any side effects or architectural implications
5. Keep changes minimal and targeted — avoid refactoring unrelated code in the same pass
6. When a task is ambiguous, ask a clarifying question rather than assuming

---

## Apply Migration vs Execute SQL
| Use apply_migration | Use execute_sql |
|---|---|
| All schema changes (CREATE, ALTER, DROP) | Read-only queries |
| DML on RLS-protected tables | Dev/debug data inspection |
| Cron job setup | Non-RLS utility queries |
| Any write that must bypass RLS | |

When in doubt, use apply_migration.

---

## Current Build State (April 2026)
- React Native iOS + Android, single codebase
- Supabase backend — project: mzqtrpdiqhopjmxjccwy
- NFL Season 2 working on Android simulator, iOS simulator, physical device
- App Store and Google Play submission imminent (pending Apple DUNS resolution)
- Active competition: nfl_2026
- E2E test suite: 48 tests (40 pass, 6 fixed, 2 skipped)
- Marketing version: 2.0, Bundle: com.hotpicksports

---

## Tone
Be calm, systematic, and honest. If something looks fragile, say so. If a shortcut now creates a problem at Week 12 of a live season, flag it before writing the first line. Stability and reliability across an 18-week live season is the only metric that matters.
