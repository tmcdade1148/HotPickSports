-- Make the platform-wide admin-broadcast cadence configurable (per Tom,
-- 2026-06-15). The admin-broadcast Edge Function reads this global key and
-- falls back to 24h when absent. One shared window across all targets/admins.
-- Value stored as a NATIVE jsonb number (not a quoted string).

INSERT INTO public.competition_config (competition, key, value, description, updated_at)
VALUES (
  'global',
  'admin_broadcast_rate_limit_hours',
  to_jsonb(24),
  'Minimum hours between platform-wide super-admin broadcasts (admin-broadcast Edge Function). Shared window across all targets and admins; defaults to 24 if unset.',
  now()
)
ON CONFLICT (competition, key) DO NOTHING;
