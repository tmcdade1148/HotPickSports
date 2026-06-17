-- drop_auto_join_public_beta_pool_trigger
--
-- Remove the legacy early-beta auto-join. An AFTER INSERT trigger on profiles
-- (on_profile_created_join_pool → auto_join_public_beta_pool) enrolled EVERY new
-- account into the oldest is_public pool — in practice "Sonny's NFL" — so brand-
-- new and test accounts got unwanted contest + affiliated-club associations
-- (e.g. Big Tree / Mes Que showing in YOUR CLUBS).
--
-- This predates and conflicts with the intended opt-in model: join_public_contest
-- (the Home "join the public contest" prompt, which tags joins as 'PUBLIC').
-- New users should start clean and choose for themselves; the hidden Platform
-- Pool enrollment (trigger_auto_enroll_global_pools) is unaffected.
--
-- Drop the trigger and its single-purpose function. Applied to production first;
-- this file keeps the repo in sync.

DROP TRIGGER IF EXISTS on_profile_created_join_pool ON public.profiles;
DROP FUNCTION IF EXISTS public.auto_join_public_beta_pool();
