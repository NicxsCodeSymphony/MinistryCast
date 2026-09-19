-- Shared song/category library: every active admin/producer can use and maintain it.

CREATE OR REPLACE FUNCTION public.can_edit_library(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR (
      public.is_active_member()
      AND public.has_role(ARRAY['admin', 'producer'])
    )
$$;

-- Languages/tags used by songs should be visible across churches too.
DROP POLICY IF EXISTS languages_select ON public.languages;
DROP POLICY IF EXISTS languages_mutate ON public.languages;
CREATE POLICY languages_select ON public.languages
  FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY languages_mutate ON public.languages
  FOR ALL TO authenticated
  USING (public.can_edit_library(church_id))
  WITH CHECK (public.can_edit_library(church_id));

DROP POLICY IF EXISTS tags_select ON public.tags;
DROP POLICY IF EXISTS tags_mutate ON public.tags;
CREATE POLICY tags_select ON public.tags
  FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY tags_mutate ON public.tags
  FOR ALL TO authenticated
  USING (public.can_edit_library(church_id))
  WITH CHECK (public.can_edit_library(church_id));
