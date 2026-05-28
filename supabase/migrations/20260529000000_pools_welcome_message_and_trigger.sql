-- Gaffer-authored welcome message that auto-posts to SmackTalk when
-- a new member joins. Powers PR B of the preseason recruiting push —
-- sets Contest culture from the very first message a recruit sees.

-- 1. Schema -----------------------------------------------------------
ALTER TABLE public.pools
  ADD COLUMN welcome_message text
    CHECK (
      welcome_message IS NULL
      OR (char_length(welcome_message) BETWEEN 1 AND 500)
    );

COMMENT ON COLUMN public.pools.welcome_message IS
  'Optional Gaffer-authored welcome message. When non-null and non-empty, a trigger auto-posts this to smack_messages as a message authored by the organizer when a new active member joins. 500 char cap.';

-- 2. Extend the smack_messages message_type whitelist with 'welcome'.
CREATE OR REPLACE FUNCTION public.validate_message_type()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  allowed_types text[] := ARRAY['user','system','pick_lock','score_update','week_result','welcome'];
BEGIN
  IF NOT (NEW.message_type = ANY(allowed_types)) THEN
    RAISE EXCEPTION 'Invalid message_type: %', NEW.message_type;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger function -------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_welcome_message_on_member_join()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_welcome     text;
  v_organizer   uuid;
  v_author_name text;
  v_profile     RECORD;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  SELECT p.welcome_message, p.organizer_id
    INTO v_welcome, v_organizer
  FROM public.pools p
  WHERE p.id = NEW.pool_id;

  IF v_welcome IS NULL
     OR char_length(trim(v_welcome)) = 0
     OR v_organizer IS NULL
  THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id = v_organizer THEN
    RETURN NEW;
  END IF;

  -- Resolve author_name from the organizer's profile, honoring
  -- their display_name_preference ('poolie_name' or 'first_name').
  SELECT first_name, poolie_name, display_name_preference
    INTO v_profile
  FROM public.profiles
  WHERE id = v_organizer;

  IF v_profile.display_name_preference = 'first_name' THEN
    v_author_name := COALESCE(
      NULLIF(trim(v_profile.first_name),  ''),
      NULLIF(trim(v_profile.poolie_name), ''),
      'Organizer'
    );
  ELSE
    v_author_name := COALESCE(
      NULLIF(trim(v_profile.poolie_name), ''),
      NULLIF(trim(v_profile.first_name),  ''),
      'Organizer'
    );
  END IF;

  v_author_name := substr(v_author_name, 1, 80);

  INSERT INTO public.smack_messages
    (pool_id, user_id, author_name, text, message_type)
  VALUES
    (NEW.pool_id, v_organizer, v_author_name, v_welcome, 'welcome');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS post_welcome_message_on_member_join
  ON public.pool_members;

CREATE TRIGGER post_welcome_message_on_member_join
AFTER INSERT ON public.pool_members
FOR EACH ROW
EXECUTE FUNCTION public.post_welcome_message_on_member_join();

-- 4. Extend update_pool_settings RPC to accept welcome_message --------
CREATE OR REPLACE FUNCTION public.update_pool_settings(
  p_pool_id         uuid,
  p_name            text    DEFAULT NULL,
  p_is_public       boolean DEFAULT NULL,
  p_welcome_message text    DEFAULT NULL
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_pool      RECORD;
  v_welcome   text;
BEGIN
  SELECT id, organizer_id, created_by
    INTO v_pool
  FROM pools
  WHERE id = p_pool_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Pool not found');
  END IF;

  IF v_caller_id IS DISTINCT FROM v_pool.organizer_id
     AND v_caller_id IS DISTINCT FROM v_pool.created_by THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the organizer can update pool settings');
  END IF;

  IF p_name IS NOT NULL THEN
    IF LENGTH(TRIM(p_name)) < 3 OR LENGTH(TRIM(p_name)) > 30 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Pool name must be 3-30 characters');
    END IF;
  END IF;

  IF p_welcome_message IS NOT NULL THEN
    v_welcome := NULLIF(trim(p_welcome_message), '');
    IF v_welcome IS NOT NULL AND char_length(v_welcome) > 500 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Welcome message must be 500 characters or fewer');
    END IF;
  END IF;

  UPDATE pools
  SET
    name            = COALESCE(TRIM(p_name), name),
    is_public       = COALESCE(p_is_public, is_public),
    welcome_message = CASE
      WHEN p_welcome_message IS NULL THEN welcome_message
      ELSE v_welcome
    END,
    updated_at = NOW()
  WHERE id = p_pool_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
