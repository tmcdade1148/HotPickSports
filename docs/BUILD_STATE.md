# Build State & Launch Scope

> Extracted from `REFERENCE.md` §20 (and the White Label build-status table from
> §15). This is **point-in-time status** that goes stale — it lives here, out of
> the evergreen architecture reference, so REFERENCE.md stays trustworthy. Update
> this file per milestone.

### Current State (March 2026)
- DB completely restructured supporting all three templates
- NFL Season 2 working on Android simulator, iOS simulator, physical device
- Successfully deployed to physical iPhone via Xcode (TestFlight upload tested)
- Edge Functions rebuilt for simplicity and efficiency
- Scoring rebuild complete — addresses all Season 1 failures
- E2E test suite: 48 tests (40 pass, 6 fixed, 2 skipped)
- Marketing version: 2.0, Bundle: `com.hotpicksports`
- Game Day Engagement System: live pick splits, HotPick concentration, Path Back narrative
- History & Hardware System: 11 award types, History tab, Hardware Admin
- Push notifications: expo-notifications SDK, `process-notification-queue` cron
- Account deletion: two-step confirmation, `anonymize_deleted_user()` RPC
- User blocking: platform-wide via `user_blocks` table, long-press Block in SmackTalk

### Launch Sequence
- **NFL Season 2 — September 2026** (primary validation event)
- **NHL Playoffs — April 2027** (first multi-sport proof; spec session October 2026)
- **World Cup / Tournament — TBD**

### Do Not Build Before NFL Season 2 Launch
Power-ups, career hardware, AI archetypes, tier system, pool discovery, pick-linked SmackTalk, exact score predictions, Super Bowl enhanced scoring UI (November 2026), playoff reset UI (November 2026), global leaderboard (post 500 users), AI SmackTalk observations, NHL/Tournament templates, white label billing (Stripe), acquisition source tagging, automated partner Instagram posts, admin analytics charts.

### Accessibility — Font Scaling (decision, June 2026)
OS "Larger Text" / Dynamic Type is **disabled app-wide**: `allowFontScaling = false` is defaulted on every `Text`/`TextInput` at startup (`src/shared/setup/fontScaleCap.ts`, installed from `index.js`). HotPick is a fixed-canvas design (big italic display type, auto-fit player names, big-number callouts, fixed-height cards, multi-size lines), so honoring the OS slider overflows/clips those layouts no matter how the multiplier is capped — and capping fights `adjustsFontSizeToFit` + the auto-fit measure-probes (a per-element-cap experiment was tried and reverted, PRs #319 → #321). The app therefore renders at its **designed sizes at every OS setting**. Per-element `allowFontScaling` still wins if a specific Text ever needs to opt back in.

**Deferred to post-launch:** a dedicated **in-app Text-size control** (Settings → Text size), decoupled from the OS slider — built *together with* making the 2–3 highest-traffic screens (Home hero, identity row, pick flow) reflow gracefully. Scaling text *up* re-breaks the fixed layouts the same way the OS slider did, so a real "Large" option needs fluid screens first. A token ±10% slider was explicitly rejected (minimal accessibility benefit, re-break + high-blast-radius mechanism risk during launch).

---

## White Label Build Status

> Moved from `REFERENCE.md` §15 (architecture). The architectural rules for partner
> theming stay in §15; this status table is point-in-time and lives here.

| Phase | Status | Notes |
|---|---|---|
| 1 | ✅ Done | DB schema: `partners` table + columns above, `pools.partner_id`, `pools.invite_slug` |
| 2 | ✅ Done | ThemeProvider + useBrand() wiring |
| 3 | ⏳ Deferred | Branch.io SDK — requires real device, high risk |
| 4 | ⏳ Deferred | Deep link handler (basic handler exists, needs Branch.io + partner slug lookup) |
| 5 | ⏳ Deferred | Branded pool join flow (3 screens) |
| 6 | ✅ Done | PoweredByHotPick component |
| 7 | ✅ Done | Partner Admin Screen (super_admin only) — creates partners, sets type, creates Club Pool |
| 8 | ✅ Done | QR code generation in Partner Admin |
| 9 | ✅ Done | Partner color editing (4 colors + `deriveFullBrandColors()` auto-compute) |
| 10 | ✅ Done | Partner logo library (per-slug folder, Photos + URL ingestion, in-app delete) |
| 11 | ✅ Done | Roster model: organizers add their pool to a partner's roster via PartnerDirectoryScreen |
| 12 | ✅ Done | Club Pool concept (`partners.club_pool_id`) — Club Pool organizer = de facto Partner Admin |
| 13 | ✅ Done | Inline perk editor + partner-broadcast composer in PoolSettings (Club Pool only) |
