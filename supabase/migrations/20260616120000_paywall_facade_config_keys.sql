-- Organizer Paywall Facade (v1.1) — Part 1/3: competition_config keys
-- Spec: docs/ORGANIZER_PAYWALL_FACADE_SPEC.md §4a
--
-- Adds the three display-price keys + the universal founding-pass switch.
-- All values are jsonb (matching the existing competition_config convention).
-- Prices are display-only this season; nothing is charged (facade paywall).
--
-- Verified ABSENT in production before writing (read-only pass, 2026-06-16):
--   paid_small_price / paid_medium_price / paid_large_price / founding_season_active
-- Verified PRESENT (not touched here): free_tier_max_members=10, free_tier_max_pools=1,
--   paid_small_max_members=25, paid_medium_max_members=50, paid_large_max_members=null.

INSERT INTO competition_config (competition, key, value, description) VALUES
  ('global','paid_small_price','19'::jsonb,
     'Display price (USD) for the 11-25 player tier. Shown on the wall; not charged this season.'),
  ('global','paid_medium_price','39'::jsonb,
     'Display price (USD) for the 26-50 player tier. Shown on the wall; not charged this season.'),
  ('global','paid_large_price','69'::jsonb,
     'Display price (USD) for the 51+ player tier. Shown on the wall; not charged this season.'),
  ('global','founding_season_active','true'::jsonb,
     'When true, organizers who exceed their cap are passed through free for the competition (the facade founding comp); the wall is still shown for priming. Flip to false to enforce paid tiers.')
ON CONFLICT (competition, key) DO NOTHING;
