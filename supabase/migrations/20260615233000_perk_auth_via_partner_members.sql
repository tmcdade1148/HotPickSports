-- update_partner_perk authorized via _caller_can_manage_partner (partner_members)
--
-- The perk editor (ClubAdminScreen / League Tools) is reachable by any partner
-- board member — Chairman or Director (partner_members) — per Hard Rule #24.
-- But update_partner_perk still gated on the OLD model: super-admin OR an
-- organizer/admin of the partner's Club Pool (pool_members). A seeded Chairman
-- who isn't the Club Pool organizer therefore hit
--   "Not authorized to update this partner's perk"
-- on Save Perk. Route authorization through _caller_can_manage_partner, the same
-- gate send-partner-broadcast already uses (super-admin OR partner_members).

CREATE OR REPLACE FUNCTION public.update_partner_perk(
  p_partner_id uuid,
  p_perk_text  text,
  p_perk_icon  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clean_text text;
  v_clean_icon text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public._caller_can_manage_partner(p_partner_id) THEN
    RAISE EXCEPTION 'Not authorized to update this partner''s perk';
  END IF;

  v_clean_text := NULLIF(trim(coalesce(p_perk_text, '')), '');
  v_clean_icon := NULLIF(trim(coalesce(p_perk_icon, '')), '');

  IF v_clean_text IS NOT NULL AND char_length(v_clean_text) > 120 THEN
    RAISE EXCEPTION 'Perk text must be 120 characters or fewer';
  END IF;

  UPDATE partners
     SET perk_text = v_clean_text,
         perk_icon = v_clean_icon
   WHERE id = p_partner_id;
END;
$function$;
