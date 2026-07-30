# HotPick — Home Screen Module Map
**v4 · 2026-07-16 · Source of truth for Home · supersedes v1–v3 · no open questions**
**v4.1 — HotPick flame handoff moved complete → settling per Tom's decision, 2026-07-21. Matches shipped code + HISTORY.**

Home is not a screen. It's **nine modules and two state machines.**

**The week machine** says what the screen is for (make picks, watch, review).
**The game machine** says what an individual game card shows (PRE, LIVE, FINAL).
They are independent — a "live" week holds games in all three states at once.

Every phase and week state is a **row**. Every game rendering is a **chip state**.
Nothing gets redesigned; cells get filled.

**Canonical scope.** This file owns Home's modules, state→content mapping, copy,
and brand rules. `REFERENCE.md §11` owns architecture only. **Nothing lives in both.**
Split live as of 2026-07-16 (commit `3cfb175`).

> **Trade made knowingly:** `check-home-spec-sync.mjs` can't guard this file — it
> lives in CLAUDE HQ, outside CI's checkout. Home copy has no automated drift
> guard. Worth it: the robot was guarding two copies of a thing that shouldn't
> have been copied. But it's a trade, and this is where it's recorded.

---

## The rules that never bend

### 1. The flame rule
🔥 appears **only** on the Player's current HotPick card. Not the contextual line,
not live tiles, not Ladder rows, not notifications, not non-HotPick Picks even
greyed out. **Flame = HotPick designation, nothing else.** Flame audit every mockup.
*(One of four UI patterns behind the April 2026 Apple rejection.)*

### 2. Signed points only after the fact
`14 PTS` before and during. **`+14` / `−14` after FINAL** — correct and encouraged.
Before the game a signed number reads as a potential swing (flagged). After, it's
a result. **The moment the sign appears is the moment the risk resolves.** The
compliance line and the drama are the same line.

### 3. Never project points during live play
Score and clock, yes. Points already banked, yes. **"+13 if this holds," never.**
No red/green point animation while live — displays hold still until FINAL.

### 4. No percentages on Picks
Records, not rates. `HotPick record 8-7`, never `53%`.

### 5. Height is the week. Colour is the flame.
History bars: height = net points, colour = did the flame hit.
**Orange = hit. Blue = missed.** Never positive/negative — height says that already.

### 6. Locked lexicon
**Contest · Player · Gaffer · League · Partner · Ladder · Chirps · Perks · Picks · HotPick**
Never: pool, organizer, leaderboard, smack talk, members, games (as nav label).
**Picks and HotPick are different words** — never explain it in a parenthetical.

### 7. Silent on money
Zero occurrences, affirmed **or denied**: *stakes, wager, bet, gamble, odds,
money, entry fee, prize, buy-in, winner takes all, skin in the game, redeem.*

### 8. Declaration, not punishment
"Plant your flag" yes. "Get burned" no.

### 9. Results come from the server
Win/loss reads **`is_correct`**. Never derive by comparing scores client-side.

### 10. Status reads are case-insensitive
Production holds `FINAL`, `final`, `SCHEDULED`, `scheduled` at once — ESPN writes
upper, sim writes lower. Exact matching works in one and breaks in the other.

### 11. Home's lock comes from `isWeekLocked()` — nowhere else
`isWeekLocked()` (`weekLock.ts:30`) = `MIN(kickoff_at)` across the week's games,
mirroring the server's `enforce_pick_lock`. **The only correct answer to "are
picks locked."**

Three wrong sources, each of which looks right:

| Wrong source | Why it fails |
|---|---|
| **Per-game status** | Later games still read `SCHEDULED` after the server locked the week. `WeekLockStrip` did this — "EDITABLE PICKS" and *"11 of 16 still editable"* when all sixteen were shut. |
| **`week_state`** | It lags. ESPN reports on a 5-min cron, so there's a window where kickoff has passed, the server rejects writes, and `week_state` still says `picks_open`. |
| **`season_games.lock_at`** | A phantom. `nfl-open-picks` writes it weekly; `enforce_pick_lock` ignores it. |

**One function. Home and Picks call the same one.** Picks already does. Nothing in
`src/shell/components/home/` ever imported it — that gap *was* the bug: two
screens answering one question from two places.

> **The exception that isn't one.** Per-game status is **correct** for the
> GameChip — the chip is about *its* game. It's wrong only for the **week lock**,
> which is about the week. **Chip = its game. Lock = the week. Never cross them.**

---

## The scoring truth copy must never contradict

| | Points |
|---|---|
| HotPick, correct, rank 14 | **+14** |
| HotPick, wrong, rank 14 | **−14** |
| Any Pick, correct | **+1** |

The HotPick earns its rank **instead of** a base point. A 20-point week is
`14 + 6` and reads **"6 of 15 Picks"** — never "7 of 16," or the arithmetic on
screen stops adding up.

**The HotPick is the only thing that can subtract.** Perfect week 31, worst −16.
Every dip in the History chart is a flame that missed.

---

## The GameChip — one component, three states

Same chip anywhere a game renders. Build once. State from `status`,
**case-insensitively** (rule 10).

### PRE — `scheduled`
```
ARIZONA CARDINALS  4-3
@ New Orleans Saints  2-5
Sun 1:00 PM
```
`kickoff_at`, `home_record` / `away_record`. No score. No signed number near it.

### LIVE — in progress
```
● LIVE · Q3 · 4:12
ARI 17 — NO 13
```
`home_score` / `away_score`, `current_period`, `game_clock`. The ● badge
**pulses** (opacity animation on the dot only) — DECIDED July 18 build: Tom
overrode the original "steady" spec; the pulse is the shipped behavior. The dot
is the ONLY animated element in the chip. Nothing else moves.

### FINAL — `final`
```
FINAL
ARI 24 — NO 17  ✓
```
Result mark and colour from **`is_correct`** (rule 9). Signed points may now
appear — the game happened.

---

## Module inventory

Nine modules. Five never change with state.

### 1 · HEADER — invariant
Logo · competition/phase badge. **Settings is gone** — it lives in the nav.

### 2 · IDENTITY — invariant
Player Name · SEASON PTS. **One season total on the screen.** If History shows a
season number too, they're the same number or one is a lie.

### 3 · CONTEXTUAL LINE — varies
One line. Nudge, news, or taunt. **No flame, ever.** When ACTION shows the lock
time, this line doesn't. The voice slot: Ted Lasso ceiling, Gervais floor.

### 4 · ACTION — varies — the hero
- **No eyebrow.** `EDITABLE PICKS` / `LOCKED PICKS` retired; `WeekLockStrip` goes
  with it. It was the rule-11 violation.
- **One countdown, ever.** Whole week locks at first kickoff. "GAMES LOCK IN" is
  correct: one moment, all sixteen.
- **Lock state reads `isWeekLocked()`.** Rule 11.
- Big number and headline **count the same thing.**
- Neutral styling — no pulsing, no red flash.

### 5 · HOTPICK — varies — the second decision
Picking winners is one task. Deciding **where the risk goes** is another, and it's
the only one that can hurt you.

**The module is a GameChip wearing a flame:**

| Week state | Shows |
|---|---|
| picks_open, no flame | **The nudge.** "5/16 · HotPick not set." |
| picks_open, flame set | 🔥 + `14 PTS` (unsigned) + chip **PRE** |
| locked | Same, now public — everyone sees your call |
| live, this game live | 🔥 + `14 PTS` (unsigned, static) + chip **LIVE** |
| live, this game not yet / done | 🔥 + chip PRE or FINAL — **chip tracks its game, not the week** |
| settling | Gone — HISTORY owns it (handoff at settling) |
| complete | **Gone.** History owns it. |

**The handoff:** at settling the flame stops being your call and becomes your
story — it moves to the History recap. Never both.

**The empty state is load-bearing.** Nothing on the server can require a HotPick —
a per-row trigger can't enforce a whole-slate rule. Until the batch-submit spec
lands, **this nudge is the only thing between a Player and a zero-downside week.**

### 6 · HISTORY — varies — the season made visible
The canon: *"the season is the unit, not the week"* and *"the good read loses about
half the time."* Real number: **51%**. This is the only module where that thesis is
visible. ~48% of bars go blue. **That's the argument, not a bug.**

**Chart:** height = week, colour = flame.

**Recap** (most recent **finished** week — signed values correct here):
```
LAST WEEK · 20 PTS
🔥 HotPick    WIN    Cardinals over Saints    +14
   Picks      6 of 15                          +6
```

**Big number:**
| State | Shows |
|---|---|
| picks_open, locked, any idle | most recent finished week |
| live, settling | this week, **actual earned only** — ticks as games go FINAL |
| complete | this week, final |

**Never a zero for an unplayed week.**

**Season line:** `HotPick record 8-7 · average rank 14.7`
Record = are you good. Average rank = **who you are** — the one stat no other
pick'em app can compute. Real spread: hit rate **19–75%**, average rank **6.8–14.7**.
Season-scoped, past-tense, always.

### 7 · CONTESTS — invariant
Carousel, quarter-peek. Empty = Join/Create carries it.

### 8 · LEAGUES — invariant
Perks from endorsing Leagues.

### 9 · NAV + JOIN/CREATE — nav invariant; Join/Create phase rule pending
**Home · Picks · Ladder · Chirp · Settings** — every screen. "Picks," never
"Games." Join/Create attach above the nav, currently always visible behind a
single boolean (`showJoinCreate`, hardcoded true — July 18 build). PHASE RULE
PENDING (Tom, July): visible off-season / preseason / early weeks; after the
first few weeks they read as stale and should hide or be replaced — pairs with
the future mid-season-start-date Contest feature. Slice 7 may wire the boolean;
the rule itself is a product decision to finalize.

---

## The week-state table

| # | State | Trigger | Badge | Action | HotPick | History № |
|---|---|---|---|---|---|---|
| 1 | Off-season, far | `OFF_SEASON`, >7d to picks-open | NFL26 · OFFSEASON | days-to-kickoff | — | last finished wk (hide if none) |
| 2 | Off-season, near | `OFF_SEASON`, ≤7d | NFL26 · OFFSEASON | days-to-**picks-open** | — | same |
| 3 | Preseason bridge | `PRE_SEASON` | NFL26 · PRESEASON | resting card, no countdown | — | same |
| 4 | Picks open | `picks_open` | NFL26 · W01 | lock countdown + FINISH YOUR PICKS + n/16 | nudge or 🔥+PRE | last finished wk |
| 5 | Locked | `locked` | NFL26 · W01 | locked confirmation | 🔥+PRE, public | last finished wk |
| 6 | Live | `live` | NFL26 · W01 | week status | 🔥+chip per **its** game | this wk, earned |
| 7 | Settling | `settling` | NFL26 · W01 | settling | Handoff — HISTORY owns it | this wk, earned |
| 8 | Complete | `complete` | NFL26 · W01 | week done | **gone — handoff** | this wk, final |
| 9 | Regular complete | `REGULAR_COMPLETE` | NFL26 · REG DONE | bridge | — | last finished wk |
| 10 | SB intro | `SUPERBOWL_INTRO` | NFL26 · SB | bridge | — | last finished wk |
| 11 | Season complete | `SEASON_COMPLETE` | NFL26 · DONE | champion + podium | — | final wk |

**Every idle row (1, 2, 3, 9, 10, 11) must look different from every other.** The
contextual line is what separates them.

> **Preseason — two things, one word.**
> `PRE_SEASON` the *phase* is row 3: resting card, no picks (the RPC forces
> `week_state='idle'`, `picks_open=false`).
> **The August preseason is a different object:** `nfl_2026_pre` running as
> **REGULAR**, weeks 1–3, `espn_season_type='1'`. It uses rows 4–8. Isolation comes
> from the competition string, never `current_phase`.
> *(CLAUDE.md #22 claimed PRE_SEASON allowed practice picks. Corrected 2026-07-16.)*

---

## Copy library — verbatim

### Row 1 — off-season, far
```
YEP, WE'RE COUNTING THE DAYS TOO.
Plenty of time to set up your Contest and get everyone in before kickoff.
[57]
DAYS UNTIL NFL 2026 KICKS OFF
```

### Row 2 — off-season, near — **LOCKED: A**
```
ALMOST TIME.
Good time to get your Contest together, so nobody's scrambling on a Thursday.
[7]
DAYS UNTIL PICKS OPEN
```

### Row 4 — picks open (week 1 variant)
```
PICKS ARE OPEN.
Week 1 is up. Everything locks at first kickoff.
[9]
DAYS UNTIL WEEK 1 PICKS LOCK
```
*Free accident: picks lock **at** first kickoff, so days-to-kickoff and
days-to-lock are the same timestamp. The label matures as it approaches.*

### Standing
```
Pick once. Live everywhere.
One set of calls, playing in every Contest you're in. No picking twice.
Plenty of second guessing.
```
```
YOUR LEAGUES
Nothing here yet. Leagues are the bars, brands, and organizations that endorse
Contests. When one endorses yours, their Perks show up here.
```

### Onboarding 1 — Profile
```
Welcome!
Set up your profile by filling in your name and your Player Name.
```
Reuse the Settings profile page, avatars on top. **Founding-code section removed.**

### Onboarding 2 — Notifications
```
Pick deadline reminders so you never miss a week
Important messages from your Gaffers and Leagues
Special HotPick Announcements
```
**All three are true.** See Operations below — pick reminders ship manually as
HotPick Announcements typed `picks_deadline`, so the promise is kept even though
no automated producer exists yet.

### Onboarding 3 — Welcome
```
Hey [Player Name]

Your Picks. On the record. Bragging rights TBD.

How HotPick works
Pick winners every week. Designate one as your HotPick. That's where you plant
your flag. Picks lock at first kickoff and everyone sees everyone else's call.
Make picks once and they play in every Contest you're in. The longer you play,
the more it means.

Have a Contest invite code?
A Contest is your group. Family, coworkers, the middle school group text. Invite
codes come from a Contest's Gaffer, whoever runs it. Join as many as you want.
The record comes with you.

[ Enter code ]  [ Join ]

Don't have an invite code? Then you should be the Gaffer and start your own Contest.

I'll do this later
```
Zero flagged words. **Public Contest line removed** — the live screen invited
Players into a Contest the Privacy Policy states is not visible in the app.

---

## Operations — HotPick Announcements

**Decided 2026-07-16.** "Picks are open" and "Picks lock in an hour" ship
**manually**, as platform-wide Announcements, until a producer exists.

**Type: `picks_deadline`.** Not `system`, not `organizer_broadcast`.
- Already legal in the CHECK constraint
- **Has a preference column** — so the Settings toggle actually controls it
- Semantically exactly what it is

**Side effect worth knowing:** this turns `picks_deadline` from a phantom toggle
into a real one. No producer built, switch works anyway.

**The one to watch.** "Picks are open" is Tuesday morning while you're already
checking the machine — easy. **"Picks lock in an hour" is Thursday 7:20pm,
precisely, for 18 weeks plus playoffs.** That's a standing alarm, not a habit —
and it's the message that does the real work. *"Picks are open"* is information;
*"one hour"* is the save. **If a Thursday gets missed, that's the producer telling
you it wants to exist.** Signal, not failure.

---

## Build order

Modules are independent. Each slice ships and gets verified on device before the
next. **DONE = seen on a physical device — never "it compiles."**

| # | Slice | Why here |
|---|---|---|
| 1 | **Onboarding (3 screens)** | Independent of Home, smallest, and it's the **first thing Aug 11 testers see** |
| 2 | **Nav + Settings move** | Invariant, no state logic, touches every screen |
| 3 | **GameChip** | Dependency for #4. Testable alone. |
| 4 | **ACTION + delete `WeekLockStrip`** | Kills the punch-list bug by deletion |
| 5 | **HOTPICK module** | Needs GameChip |
| 6 | **HISTORY module** | The new one — chart, recap, season line |
| 7 | **State wiring** | Contextual line + the row table. Needs all modules to exist. |

**All of it is `[OTA]`** once the 1.1.0 store build ships — no store review, no
rush, no conflict with the build.

**The loop, every slice:** Code proposes against this file → Tom approves → Code
builds → Tom verifies on device → commit. Code never designs; the map already did.

---

## Known holes — mark, don't chase

| What | Why |
|---|---|
| Pick split % on game cards | `game_pick_stats` — 0 rows ever |
| Pool intelligence | `pool_pulse` — 0 rows ever |
| Drama Digest | `event_recaps` — 0 rows ever |
| Automated pick reminders | no producer — manual via Announcements for now |
| HotPick requirement | client-side, dismissible; needs the batch-submit spec |
| `salutation.ts:14` | stale comment: *"Picks now lock per-game at each game's kickoff."* Same lie as old REFERENCE.md:564, in code. |
| `season_games.lock_at` | phantom column — written weekly, read by nobody who matters |

## Not on Home
Settings (→ nav) · the `EDITABLE PICKS` eyebrow / `WeekLockStrip` · Founding
code · Public Contest CTA · live point projections · percentages on Picks ·
a second flame · point animations during live play
