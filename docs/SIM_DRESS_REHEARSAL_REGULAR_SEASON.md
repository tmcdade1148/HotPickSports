# Sim Dress-Rehearsal Checklist — Regular Season (`nfl_2025_sim`)

**Goal:** Run a full regular season (Weeks 1–18) through the Operator Console and confirm, *by hand*, that **scores**, **HotPick swings**, and the **Ladder** are all correct — plus four forced edge cases: a **tie**, a **rank‑16 HotPick loss**, a **mid‑season pool start**, and a **deliberate double‑run** (proving scoring can't double‑count).

**Scope:** Regular season only (Weeks 1–18). Playoffs/Super Bowl are out of scope.

**Who does what:**
- 🧑 **YOU** — click the Operator Console and read/compare numbers on screen.
- 🛠 **CLAUDE/CODE** — one‑time setup that can't be done from the Console (creating rehearsal accounts, forcing a tie, generating the answer key). Steps marked 🛠 are handed to Claude/Code; you just confirm they're done.

> **Why setup is needed:** the simulator does **not** let you type in game results. It **copies each game's real result from the live `nfl_2025` schedule** (game `sim_12345` ← source game `12345`). So "running a week" = advancing its state and letting the real results flow in. To verify by hand we use a few **controlled rehearsal accounts** with simple, fixed pick strategies, plus a pre‑computed **answer key**.

---

## 1. Scoring cheat‑sheet (your hand‑math)

Every regular‑season week has **16 games**, ranked **1 (coin‑flip) → 16 (biggest favorite)**. You pick all 16 and tag exactly **one** as your **HotPick**.

| Pick type | Correct | Wrong **or tie** |
|---|---|---|
| Normal pick | **+1** | **0** |
| HotPick (rank *R*) | **+R** | **−R** |

- **A TIE counts as a LOSS** for everyone who picked that game (a normal pick → 0, a HotPick → −R). It is *not* a push or a void.
- **Week score** = (normal picks correct × 1) **+** HotPick swing (**+R** or **−R**).
- **Best possible week = +31** (15 normal wins + a correct rank‑16 HotPick). **Worst = −16** (0 wins + a wrong rank‑16 HotPick).
- **`is_hotpick_correct` stays blank (null)** until that game is FINAL — then it flips to ✓ or ✗.
- **The Ladder = the SUM of your weekly scores**, counted from **your pool's start week** forward (not always Week 1 — see edge case 3).

*Constants verified in `supabase/functions/_shared/scoring.ts` and `REFERENCE.md`.*

---

## 2. One‑time setup 🛠 (Claude/Code)

- [ ] **Reset the sim** to a clean state: `OFF_SEASON`, Week 1, no picks/scores/totals. *(sim‑operator `reset_to_off_season`.)*
- [ ] **Create 3 rehearsal accounts** with fixed, deterministic strategies (so the math is trivial to predict), and auto‑submit their picks each week:
  - **`REH-HOME`** — picks the **home** team in all 16 games every week; **HotPick = the rank‑16 game** (on home).
  - **`REH-AWAY`** — picks the **away** team in all 16 games every week; **HotPick = the rank‑1 game** (on away).
  - **`REH-LOSEHP`** — same as `REH-HOME`, but its **HotPick is deliberately set to the team that LOSES the rank‑16 game** (for edge case 2). *(Code reads the source result and picks the loser.)*
- [ ] **Create two pools:**
  - **`Full-Season`** — starts **Week 1**. Members: `REH-HOME`, `REH-AWAY`, `REH-LOSEHP`.
  - **`Mid-Season`** — `pool_start_date` set **inside Week 8's window**. Member: `REH-HOME` (for edge case 3).
- [ ] **Force a tie (edge case 1):** for **one chosen week** (suggest **Week 5**), set **one source `nfl_2025` game** to `home_score = away_score`, `winner_team = NULL`. Note which game (and its rank) so we can predict the swing.
- [ ] **Generate the ANSWER KEY:** from the real source outcomes + the fixed pick strategies, produce a table of **expected week score** and **expected running Ladder total** for each rehearsal account, Weeks 1–18. *(This is the sheet you'll compare against.)*

> After setup you should have: 3 accounts, 2 pools, a known forced tie in Week 5, and an answer‑key sheet. Everything below is **yours to run and check**.

---

## 3. The weekly Operator Console loop 🧑

For each week, advance the week's **state** one step at a time. The Console walks this fixed path (underlying action: `advance_week_state`):

```
picks_open → locked → live → settling → complete → (next week) picks_open
```

| Step | What you click | What it does | State after |
|---|---|---|---|
| 1 | **Open Picks** | opens the week for picks | `picks_open` |
| 2 | **Lock Picks** | closes picks; freezes ranks | `locked` |
| 3 | **Kickoff** | starts all games (sets them in‑progress) | `live` |
| 4 | **End Week** | pulls all real results from source **and scores the week** | `settling` |
| 5 | **Settle & Award** | finalizes the week, writes awards | `complete` |
| 6 | **Next Week** | bumps to the next week, reopens picks | `picks_open` |

- **Scoring happens automatically** at Step 4 (`live → settling`). You don't run a separate "score" button.
- *(Optional)* instead of one big **End Week**, you can click **Advance Game Day** to finalize results wave‑by‑wave (Thu → Sun early → Sun late → SNF → MNF) and watch scores tick up live. Either path reaches the same totals.

---

## 4. Verifying each week 🧑

After **Step 5 (complete)** for a week:

1. **Read the 16 results** for that week (Operator Console game list, or the Board): each game's winner + which game is **rank 16** and **rank 1**.
2. **Compare each rehearsal account's week score to the answer key.** Tick the box if they match.
3. **Spot‑check the math yourself on one account** so you trust the key. Example for `REH-HOME`:
   - Count how many **home** teams won this week → call it **H** (out of all 16).
   - Look at the **rank‑16** game: did **home** win it?
   - If the rank‑16 home team **won**: week score = **(H − 1) + 16** *(the −1 removes the rank‑16 game from the +1 pile, since it scores as the HotPick instead)*.
   - If the rank‑16 home team **lost/tied**: week score = **H + (−16)** = **H − 16**.
   - This number must equal the app's displayed Week score for `REH-HOME`.
4. **Check the Ladder:** in the **Full‑Season** pool, each account's Ladder total = **sum of its Week 1…N scores** so far. Confirm it equals the running total on the answer key.

**Per‑week sign‑off:**

```
Week ___  □ scores match key   □ I hand‑checked one account   □ Ladder total matches   □ HotPick ✓/✗ shows correctly
```

Repeat Weeks 1 → 18.

---

## 5. The four forced edge cases

### ⓵ A TIE (set up in Week 5)
- **Setup:** 🛠 one source game in Week 5 was set to a tie (home = away, winner NULL).
- **Run Week 5** normally (Section 3).
- **Expect:**
  - Every account that picked **either** team in the tied game gets **0** for it (a normal pick), **not** +1.
  - If the tied game is a rehearsal account's **HotPick**, that account gets **−R** (the tie is a loss) and its `is_hotpick_correct` shows **✗**.
- **Verify by hand:** find the tied game in the Week 5 results (no winner shown). Confirm `REH-HOME`'s Week 5 score is exactly **1 lower** than "if home had won that game," and that the answer key already reflects the tie. ✅ if it matches.

```
□ Tie scores as a loss (0 for normal pick)   □ HotPick‑on‑tie = −R and shows ✗   □ matches answer key
```

### ⓶ A RANK‑16 HOTPICK LOSS
- **Setup:** 🛠 `REH-LOSEHP`'s HotPick is set to the **losing** team of the **rank‑16** game (pre‑read from source).
- **Run any normal week** (suggest **Week 3**).
- **Expect:** `REH-LOSEHP`'s week score = **(its normal‑pick wins) − 16**. Its HotPick shows **✗**. This is the maximum single‑week penalty.
- **Verify by hand:** confirm the rank‑16 game's actual winner is **not** the team `REH-LOSEHP` HotPicked, and that its week score sits exactly **16 below** the same account's score *without* the HotPick penalty (i.e., `REH-HOME` minus 32 if `REH-HOME` had the same normal picks and a *correct* rank‑16 HotPick — easier: just confirm the −16 swing against the key).

```
□ Wrong rank‑16 HotPick = −16 swing   □ HotPick shows ✗   □ week score matches key
```

### ⓷ A MID‑SEASON POOL START (Week 8)
- **Setup:** 🛠 the **`Mid-Season`** pool starts inside Week 8; `REH-HOME` is a member of **both** pools.
- **After Week 8+ are run**, open `REH-HOME` in **both** pools and compare its Ladder totals.
- **Expect:**
  - **Full‑Season pool:** Ladder = sum of `REH-HOME` Weeks **1…N**.
  - **Mid‑Season pool:** Ladder = sum of `REH-HOME` Weeks **8…N only** — Weeks 1–7 are **excluded**.
  - Same person, same picks, **two different Ladder totals**, differing by exactly the Weeks 1–7 subtotal.
- **Verify by hand:** `Full‑Season total − Mid‑Season total` should equal `REH-HOME`'s combined Weeks 1–7 score from the key.

```
□ Mid‑Season Ladder excludes Weeks 1–7   □ difference = Weeks 1–7 subtotal   □ scores themselves are identical (only the start week differs)
```

### ⓸ A DELIBERATE DOUBLE‑RUN (scoring can't double‑count)
- **Pick any completed week** (suggest **Week 2**). Note every account's Week 2 score and Ladder total.
- **Re‑run the settle/scoring for that same week a second time.** *(The forward state machine won't re‑enter `settling` on its own, so this is a 🛠 Code step: invoke the week's finalize/score function once more — or click **Advance Game Day** again on an already‑final wave.)*
- **Expect:** **every number is byte‑identical** — no doubling, no drift. *(Mechanism: `season_user_totals` is keyed one row per user/week and re‑written with `ON CONFLICT … DO UPDATE`, so a second run **replaces** rather than adds; the finalizer also exits early once the week is already marked finalized.)*
- **Verify by hand:** Week 2 scores and Ladder totals after the second run **==** before. If any number changed, **stop — that's a bug.**

```
□ Re‑ran settle on a complete week   □ all week scores identical   □ all Ladder totals identical   □ no row counts changed
```

---

## 6. Final sign‑off

```
□ Weeks 1–18 all run to `complete`
□ Every week's scores matched the answer key
□ I personally hand‑checked the math on ≥3 different weeks
□ HotPick ✓/✗ correct every week; blank (null) until games were final
□ Ladder totals correct in the Full‑Season pool, all weeks
□ Edge ⓵ Tie  → scored as a loss
□ Edge ⓶ Rank‑16 HotPick loss → −16 swing
□ Edge ⓷ Mid‑season pool → counts only from its start week
□ Edge ⓸ Double‑run → totals unchanged (no double‑count)
```

If all boxes are ticked, the regular‑season scoring engine is verified end‑to‑end by hand. 🎯

---

### Appendix — sources for the rules above
- Scoring constants & HotPick swing: `supabase/functions/_shared/scoring.ts`
- Operator state machine & "copies results from source": `supabase/functions/sim-operator/index.ts`
- Ladder = sum from pool start week; double‑run idempotency (`ON CONFLICT DO UPDATE`, `is_finalized` early‑exit): leaderboard/finalize RPCs in `supabase/migrations/`
- Hard rules (frozen_rank immutable, scores never pool‑scoped, etc.): `CLAUDE.md` + `REFERENCE.md`
