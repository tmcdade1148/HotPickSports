# HotPick Sports — Home Screen Smart Widgets Overview

**Last updated:** March 9, 2026
**Purpose:** Reference doc for developing Home Screen widgets without breaking existing work.

---

## Architecture Summary

The Home Screen is a **Smart Home Screen** — not a static dashboard. It's context-aware and surfaces live action based on the current state of active events.

**Key principle:** The Home Screen *reads* from stores. It never computes priority, scores, or intelligence itself.

```
┌──────────────────────────────────────────────┐
│                  HomeScreen                   │
│  ┌────────────────────────────────────────┐  │
│  │         Event Card (max 2)             │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  CardHeader (pool switcher)      │  │  │
│  │  ├──────────────────────────────────┤  │  │
│  │  │  Week State Sub-Card             │  │  │
│  │  │  (PicksOpen/Locked/Live/         │  │  │
│  │  │   Settling/Complete)             │  │  │
│  │  ├──────────────────────────────────┤  │  │
│  │  │  CardFooter (CTA)               │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
│                                              │
│  ┌─────────────┐  ┌──────────────────────┐  │
│  │ ScoreModule  │  │  StandingsBadge      │  │
│  └─────────────┘  └──────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │         SmackTalkNudge                 │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## Data Flow

```
globalStore                     nflStore (sport-scoped)
├── activeEventCards (max 2)    ├── weekState
├── activePoolId                ├── currentWeek / currentPhase
├── userPools                   ├── picksDeadline
├── smackUnreadCounts           ├── userHotPick
└── userProfile                 ├── liveScores
                                ├── weekResult
                                ├── poolStandings
                                ├── highestRankedGame
                                ├── userSeasonTotal
                                ├── userPoolRank
                                └── lastWeekNet
```

- **globalStore** = cross-sport shared state (auth, pools, SmackTalk unreads)
- **nflStore** = NFL-specific state (week, scores, standings)
- Sport stores are isolated — nflStore never reads from worldCupStore

---

## Widget-by-Widget Reference

### 1. HomeScreen (Container)
**File:** `src/shell/screens/HomeScreen.tsx`

| What it does | Details |
|---|---|
| Greeting | Time-based: "Good morning/afternoon/evening, {firstName}" |
| Settings button | Top-right gear icon, navigates to Settings stack screen |
| Event cards | Renders up to 2 cards from `activeEventCards`, dispatched by `templateType` |
| Supporting widgets | ScoreModule, StandingsBadge, SmackTalkNudge rendered below cards |
| Empty state | Shown when user has no active events |

**Safe to modify:** Greeting text, layout order, empty state UI.
**Don't touch:** Card dispatch logic (template routing), card cap of 2.

---

### 2. SeasonEventCard (NFL Smart Card)
**File:** `src/shell/components/home/SeasonEventCard.tsx`

The main event card for season-template events. This is the most complex widget.

| What it does | Details |
|---|---|
| Initializes nflStore | Calls `initialize(config.competition)` on mount |
| Fetches data | Pool standings, user season score, user pick status, highest-ranked game |
| Realtime subscription | Listens for `season_picks` INSERT to update "X of Y poolies locked in" count |
| Routes to sub-card | Renders the correct week-state card based on `weekState` |

**Contains:** CardHeader (pool switcher) + week state sub-card + CardFooter (CTA)

**Effects (4 total):**
1. Initialize nflStore
2. Fetch pool standings + user season score when pool changes
3. Fetch user pick status when weekState is `picks_open`
4. Realtime subscription on `season_picks` for poolies count

**Safe to modify:** Visual styling, additional data display.
**Don't touch:** Effect ordering, the nflStore initialization flow, Realtime channel setup.

---

### 3. CardHeader (Pool Switcher)
**Nested in:** SeasonEventCard, TournamentEventCard, SeriesEventCard

| What it does | Details |
|---|---|
| Event label | Small caps event name (e.g., "NFL 2026") |
| Week/phase label | "Week 1 · Regular Season" |
| Pool dropdown | Tap to reveal modal with all user pools |
| Unread indicators | Filled MessageCircle icon next to pools with unread SmackTalk |
| Active pool checkmark | Unicode ✓ next to selected pool |

**Data:** `userPools`, `activePoolId`, `smackUnreadCounts` from globalStore.

**Safe to modify:** Styling, add more metadata per pool row.
**Don't touch:** Pool switching must remain global (updates all tabs via `setActivePoolId`).

---

### 4. Week State Sub-Cards

The card body changes based on `weekState`. These are the five states:

#### 4a. PicksOpenCard
**File:** `src/shell/components/home/PicksOpenCard.tsx`
**Shown when:** `weekState === 'picks_open'`

| Element | Data source | Notes |
|---|---|---|
| Countdown timer | `picksDeadline` | Ticks every second via `useCountdown()` hook. Yellow → red when urgent. |
| Social pressure | `poolPicksSubmittedCount / poolMemberCount` | "X of Y poolies have locked in" |
| Game preview | `highestRankedGame` | Away vs Home + rank badge with 🔥 emoji |
| CTA | `userHasSubmitted` (derived from userPickCount > 0) | "Make Your Picks" or "Edit Your Picks" + "You're locked in ✓" |

**Key behavior:** Realtime subscription updates poolies count when others submit picks.

#### 4b. LockedCard
**File:** `src/shell/components/home/LockedCard.tsx`
**Shown when:** `weekState === 'locked'`

Simple reassurance: "Picks locked in — Games kick off soon." Just shows `currentWeek`.

#### 4c. LiveCard
**File:** `src/shell/components/home/LiveCard.tsx`
**Shown when:** `weekState === 'live'`

| Element | Data source | Notes |
|---|---|---|
| Live indicator | — | Red pulsing dot + "Games in progress" |
| HotPick display | `userHotPick` + `liveScores[game_id]` | Team name, live score, game clock |
| Fallback | — | "Follow your picks live" when no HotPick |

**Future:** Ready for live point impact calculation ("+6 if this holds").

#### 4d. SettlingCard
**File:** `src/shell/components/home/SettlingCard.tsx`
**Shown when:** `weekState === 'settling'`

| Element | Data source | Notes |
|---|---|---|
| Points earned | `weekResult.weekPoints` | "+X points this week" |
| Accuracy | `weekResult.correctPicks / totalPicks` | "X/Y picks correct" |
| Rank movement | `weekResult.rankDelta` | Green for improvement, red for drop |
| Loading | — | "Scores are being finalized..." when weekResult is null |

**Future:** Named players ("You passed Sarah and Jake") — data available but not yet displayed.

#### 4e. CompleteCard
**File:** `src/shell/components/home/CompleteCard.tsx`
**Shown when:** `weekState === 'complete'`

| Element | Data source | Notes |
|---|---|---|
| Pool rank | `poolStandings` + `userId` | "#{rank} in your pool" |
| Race narrative | Derived from standings | "X pts behind 1st. Y weeks left." or "You're in the lead!" |
| Fallback | — | "Next week's picks open soon" when user not in standings |

---

### 5. CardFooter (CTA Button)
**File:** `src/shell/components/home/CardFooter.tsx`

Reusable footer used by all week-state cards.

| Prop | Purpose |
|---|---|
| `label` | CTA button text ("Make Your Picks", "View Board", etc.) |
| `onPress` | Navigation callback |
| `accentColor` | Button background color |
| `secondaryLabel` | Optional status line above button ("You're locked in ✓") |
| `secondaryColor` | Color for secondary label (defaults to success green) |

**Safe to modify:** Styling, add icons to button.
**Don't touch:** The onPress callback chain — it navigates to EventDetail.

---

### 6. ScoreModule
**File:** `src/shell/components/home/ScoreModule.tsx`

| What it does | Details |
|---|---|
| Season total | Big number: "{X} pts" |
| Weekly delta | Context-sensitive line based on weekState |

**Delta line logic:**
| weekState | Shows |
|---|---|
| `picks_open` / `locked` / `complete` | "Last week: +X pts" (null in Week 1) |
| `live` | "This week: +X pts (live)" |
| `settling` | "This week: +X pts" |

**Key rule:** Pool-independent. `userSeasonTotal` is the same regardless of active pool. This widget never reads pool-scoped data.

**Data:** All from `nflStore` — `userSeasonTotal`, `weekState`, `currentWeek`, `lastWeekNet`, `weekResult`.

**Safe to modify:** Styling, add sparkline, add phase label.
**Don't touch:** The pool-independent principle — scores belong to users, not pools.

---

### 7. StandingsBadge
**File:** `src/shell/components/home/StandingsBadge.tsx`

| What it does | Details |
|---|---|
| Score + rank | "{X} pts · {ordinal} of {memberCount}" |
| Pool name | Subtitle showing which pool's standings |
| Tap action | Navigates to Board tab (full leaderboard) |
| No picks state | "— pts · No picks yet · {memberCount} players" |
| Loading state | Skeleton placeholder until standings load |

**Data:** `nflStore` for scores/rank, `globalStore` for pool context.

**Key rule:** Does NOT fetch data itself — SeasonEventCard triggers `fetchPoolStandings()`.

**Future-proofed:** Uses a `contexts` array (currently 1 item). Could show multiple pool standings later.

**Safe to modify:** Styling, add rank delta indicator, expand contexts array.
**Don't touch:** Data fetching responsibility — it stays in SeasonEventCard.

---

### 8. SmackTalkNudge
**File:** `src/shell/components/home/SmackTalkNudge.tsx`

| What it does | Details |
|---|---|
| Cross-pool alerts | "X new message(s) in {poolName}" |
| Filtering | Excludes active pool, only shows unreads > 0 |
| Sort | By unread count descending |
| Max display | Top 3 pools |
| Tap action | Switches pool + navigates to SmackTalk |

**Renders null when:**
- User has only 1 pool
- All other pools have 0 unreads
- Data is loading

**Data:** All from `globalStore` — `smackUnreadCounts`, `userPools`, `activePoolId`.

**Realtime:** Counts update via `subscribeSmackUnread()` in globalStore (listens to all `smack_messages` INSERT events globally).

**Safe to modify:** Styling, increase max from 3, add preview text.
**Don't touch:** The filtering logic (must exclude active pool), the realtime subscription pattern.

---

## Realtime Channels

| Channel | Trigger | What updates |
|---|---|---|
| `smack-unread-global` | Any `smack_messages` INSERT | `smackUnreadCounts` in globalStore |
| `season_picks:{comp}:week{N}` | `season_picks` INSERT for current week | Poolies-locked-in count on PicksOpenCard |
| `smacktalk:{poolId}` | `smack_messages` INSERT for active pool | Message list in SmackTalkScreen |

**Key behavior:** When user is ON SmackTalk, `markPoolAsRead()` fires on open + on each new message arrival. When they leave, new messages increment the unread count again.

---

## Week State Machine

States are sequential and never skip:

```
picks_open → locked → live → settling → complete → picks_open (next week)
```

**Transitions are server-driven** (via `competition_config` in Supabase). The client reads state — it never triggers transitions.

---

## Phase Transitions (Season Template)

```
REGULAR → PLAYOFFS → SUPERBOWL
```

| Transition | Effect on leaderboard |
|---|---|
| REGULAR → PLAYOFFS | Pool leaderboard scores **reset to zero**. Regular season champion recorded. |
| PLAYOFFS → SUPERBOWL | Super Bowl enhanced scoring activates (builds November 2026). |

---

## What's Built vs What's Placeholder

| Widget/Feature | Status | Notes |
|---|---|---|
| PicksOpenCard (countdown, social pressure, game preview) | **Built & working** | Realtime poolies count active |
| LockedCard | **Built & working** | Static reassurance card |
| LiveCard (HotPick, live scores) | **Structure built** | Awaits live score Realtime channel on game days |
| SettlingCard (weekly results, rank delta) | **Structure built** | Awaits scoring Edge Function populating weekResult |
| CompleteCard (race narrative) | **Structure built** | Awaits standings data from real season |
| ScoreModule | **Built & working** | Reads from nflStore, pool-independent |
| StandingsBadge | **Built & working** | Reads from nflStore + globalStore |
| SmackTalkNudge | **Built & working** | Realtime unread counts active |
| Pool switcher + unread dots | **Built & working** | Consistent across Home + EventDetail views |
| Mark-as-read on SmackTalk open | **Built & working** | Upserts smack_read_state, clears indicator |
| TournamentEventCard | **Scaffolded** | Stage-based rendering, awaits World Cup data |
| SeriesEventCard | **Scaffolded** | Round-based rendering, awaits NHL data |

---

## Files Quick Reference

```
src/shell/screens/HomeScreen.tsx                    ← Container
src/shell/components/home/
  SeasonEventCard.tsx                               ← NFL smart card (most complex)
  TournamentEventCard.tsx                           ← World Cup smart card (scaffolded)
  SeriesEventCard.tsx                               ← NHL smart card (scaffolded)
  PicksOpenCard.tsx                                 ← Countdown + social pressure
  LockedCard.tsx                                    ← Waiting state
  LiveCard.tsx                                      ← Live scores + HotPick
  SettlingCard.tsx                                   ← Weekly results
  CompleteCard.tsx                                  ← Season standings race
  CardFooter.tsx                                    ← Reusable CTA button
  ScoreModule.tsx                                   ← Season total + delta (pool-independent)
  StandingsBadge.tsx                                ← Rank + score badge (taps to Board)
  SmackTalkNudge.tsx                                ← Cross-pool unread alerts
src/shell/stores/globalStore.ts                     ← Pools, unreads, active events
src/sports/nfl/stores/nflStore.ts                   ← NFL week state, scores, standings
```

---

## Rules to Protect When Developing

1. **Scores are pool-independent** — ScoreModule never reads pool-scoped data
2. **Pool switching is global** — changing pool updates Home, Board, and SmackTalk simultaneously
3. **Max 2 event cards** — overflow goes to sport switcher
4. **Week state is server-driven** — client reads `competition_config`, never triggers transitions
5. **Realtime channels clean up on unmount** — always return cleanup in useEffect
6. **StandingsBadge doesn't fetch** — SeasonEventCard owns all data fetching
7. **SmackTalkNudge excludes active pool** — only shows OTHER pools with unreads
8. **markPoolAsRead fires on SmackTalk open** — not on pool switch, not on card tap
