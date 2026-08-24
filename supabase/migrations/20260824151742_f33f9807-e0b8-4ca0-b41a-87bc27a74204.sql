REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_profiles_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_account_slots() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_member(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;