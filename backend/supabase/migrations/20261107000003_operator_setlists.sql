-- Operators can build setlists: create, edit, reorder items, share and delete
-- setlists in their own church (same setlist rights as producers). They still
-- cannot edit the song / sermon library or church settings.

CREATE OR REPLACE FUNCTION public.can_edit_setlist(p_setlist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR (
      public.has_role(ARRAY['admin', 'producer', 'operator'])
      AND public.can_use_setlist(p_setlist_id)
    )
$$;

DROP POLICY IF EXISTS setlists_insert ON public.setlists;
CREATE POLICY setlists_insert ON public.setlists
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.in_church(church_id)
      AND public.has_role(ARRAY['admin', 'producer', 'operator'])
    )
  );

-- Backups upsert (INSERT .. ON CONFLICT DO UPDATE). Postgres also checks the
-- SELECT policy against the *new* row, and the old policies looked the row up
-- by id (`can_use_setlist(id)` / `can_use_sermon(id)`) — which finds nothing
-- for a brand-new row. So every non-superadmin got
--   new row violates row-level security policy for table "setlists"
-- when backing up a newly created setlist (same for sermons). Evaluate the
-- visibility rule on the row's own columns instead; the meaning is unchanged.

DROP POLICY IF EXISTS setlists_select ON public.setlists;
CREATE POLICY setlists_select ON public.setlists
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.in_church(church_id)
    OR EXISTS (
      SELECT 1
      FROM public.setlist_shares sh
      WHERE sh.setlist_id = setlists.id
        AND public.in_church(sh.church_id)
    )
  );

DROP POLICY IF EXISTS sermons_select ON public.sermons;
CREATE POLICY sermons_select ON public.sermons
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.in_church(church_id)
    OR EXISTS (
      SELECT 1
      FROM public.sermon_shares sh
      WHERE sh.sermon_id = sermons.id
        AND public.in_church(sh.church_id)
    )
  );

NOTIFY pgrst, 'reload schema';
