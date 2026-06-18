-- drop_auto_welcome_trigger
--
-- Retire the per-join auto-welcome. post_welcome_message_on_member_join (AFTER
-- INSERT on pool_members) posted one 'welcome' Chirp for EVERY non-organizer who
-- joined a Contest that had a pools.welcome_message set — the once-per-joiner
-- spam reported in testing. The welcome becomes a one-time, Gaffer-authored
-- opener the Gaffer posts themselves (client: composer pre-fill + Gaffer badge,
-- still message_type='welcome' as the one-time marker).
--
-- Drop the trigger before the function (the function backs the trigger).
-- pools.welcome_message is left in place (off-season cleanup, not this build).

DROP TRIGGER IF EXISTS post_welcome_message_on_member_join ON public.pool_members;
DROP FUNCTION IF EXISTS public.post_welcome_message_on_member_join();
