-- Multi-church sermon sharing, same model as setlist_shares.

CREATE TABLE public.sermon_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sermon_id uuid NOT NULL,
  church_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_sermon_shares_sermon_id
    FOREIGN KEY (sermon_id) REFERENCES public.sermons (id) ON DELETE CASCADE,
  CONSTRAINT fk_sermon_shares_church_id
    FOREIGN KEY (church_id) REFERENCES public.churches (id) ON DELETE CASCADE,
  CONSTRAINT uq_sermon_shares UNIQUE (sermon_id, church_id)
);

CREATE INDEX idx_sermon_shares_church ON public.sermon_shares (church_id);
CREATE INDEX idx_sermon_shares_sermon ON public.sermon_shares (sermon_id);

ALTER TABLE public.sermon_shares ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_use_sermon(p_sermon_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.sermons s
      WHERE s.id = p_sermon_id
        AND (
          public.in_church(s.church_id)
          OR EXISTS (
            SELECT 1
            FROM public.sermon_shares sh
            WHERE sh.sermon_id = s.id
              AND public.in_church(sh.church_id)
          )
        )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_edit_sermon(p_sermon_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR (
      public.has_role(ARRAY['admin', 'producer'])
      AND public.can_use_sermon(p_sermon_id)
    )
$$;

REVOKE ALL ON FUNCTION public.can_use_sermon(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_sermon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_use_sermon(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_sermon(uuid) TO authenticated;

DROP POLICY IF EXISTS sermons_select ON public.sermons;
DROP POLICY IF EXISTS sermons_mutate ON public.sermons;
CREATE POLICY sermons_select ON public.sermons
  FOR SELECT TO authenticated
  USING (public.can_use_sermon(id));
CREATE POLICY sermons_insert ON public.sermons
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  );
CREATE POLICY sermons_update ON public.sermons
  FOR UPDATE TO authenticated
  USING (public.can_edit_sermon(id))
  WITH CHECK (public.can_edit_sermon(id));
CREATE POLICY sermons_delete ON public.sermons
  FOR DELETE TO authenticated
  USING (public.can_edit_sermon(id));

DROP POLICY IF EXISTS sermon_slides_select ON public.sermon_slides;
DROP POLICY IF EXISTS sermon_slides_mutate ON public.sermon_slides;
CREATE POLICY sermon_slides_select ON public.sermon_slides
  FOR SELECT TO authenticated
  USING (public.can_use_sermon(sermon_id));
CREATE POLICY sermon_slides_mutate ON public.sermon_slides
  FOR ALL TO authenticated
  USING (public.can_edit_sermon(sermon_id))
  WITH CHECK (public.can_edit_sermon(sermon_id));

DROP POLICY IF EXISTS sermon_notes_select ON public.sermon_notes;
DROP POLICY IF EXISTS sermon_notes_mutate ON public.sermon_notes;
CREATE POLICY sermon_notes_select ON public.sermon_notes
  FOR SELECT TO authenticated
  USING (public.can_use_sermon(sermon_id));
CREATE POLICY sermon_notes_mutate ON public.sermon_notes
  FOR ALL TO authenticated
  USING (public.can_edit_sermon(sermon_id))
  WITH CHECK (public.can_edit_sermon(sermon_id));

DROP POLICY IF EXISTS sermon_attachments_select ON public.sermon_attachments;
DROP POLICY IF EXISTS sermon_attachments_mutate ON public.sermon_attachments;
CREATE POLICY sermon_attachments_select ON public.sermon_attachments
  FOR SELECT TO authenticated
  USING (public.can_use_sermon(sermon_id));
CREATE POLICY sermon_attachments_mutate ON public.sermon_attachments
  FOR ALL TO authenticated
  USING (public.can_edit_sermon(sermon_id))
  WITH CHECK (public.can_edit_sermon(sermon_id));

CREATE POLICY sermon_shares_select ON public.sermon_shares
  FOR SELECT TO authenticated
  USING (public.can_use_sermon(sermon_id) OR public.is_superadmin());
CREATE POLICY sermon_shares_mutate ON public.sermon_shares
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR public.can_edit_sermon(sermon_id))
  WITH CHECK (public.is_superadmin() OR public.can_edit_sermon(sermon_id));

-- Always treat a share row for the viewer's church as access, including the home church.
CREATE OR REPLACE FUNCTION public.can_use_setlist(p_setlist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR EXISTS (
      SELECT 1
      FROM public.setlists sl
      WHERE sl.id = p_setlist_id
        AND (
          public.in_church(sl.church_id)
          OR EXISTS (
            SELECT 1
            FROM public.setlist_shares sh
            WHERE sh.setlist_id = sl.id
              AND public.in_church(sh.church_id)
          )
        )
    )
$$;

NOTIFY pgrst, 'reload schema';
