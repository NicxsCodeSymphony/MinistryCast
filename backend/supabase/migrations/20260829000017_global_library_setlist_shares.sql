-- Shared song/category library for every church, plus multi-church setlist sharing.

CREATE TABLE public.setlist_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setlist_id uuid NOT NULL,
  church_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_setlist_shares_setlist_id
    FOREIGN KEY (setlist_id) REFERENCES public.setlists (id) ON DELETE CASCADE,
  CONSTRAINT fk_setlist_shares_church_id
    FOREIGN KEY (church_id) REFERENCES public.churches (id) ON DELETE CASCADE,
  CONSTRAINT uq_setlist_shares UNIQUE (setlist_id, church_id)
);

CREATE INDEX idx_setlist_shares_church ON public.setlist_shares (church_id);
CREATE INDEX idx_setlist_shares_setlist ON public.setlist_shares (setlist_id);

ALTER TABLE public.setlist_shares ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_edit_library(p_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR (
      public.in_church(p_church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
    )
$$;

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

CREATE OR REPLACE FUNCTION public.can_edit_setlist(p_setlist_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR (
      public.has_role(ARRAY['admin', 'producer'])
      AND public.can_use_setlist(p_setlist_id)
    )
$$;

REVOKE ALL ON FUNCTION public.can_edit_library(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_setlist(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_edit_setlist(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_edit_library(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_setlist(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_setlist(uuid) TO authenticated;

DROP POLICY IF EXISTS categories_select ON public.categories;
DROP POLICY IF EXISTS categories_mutate ON public.categories;
CREATE POLICY categories_select ON public.categories
  FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY categories_mutate ON public.categories
  FOR ALL TO authenticated
  USING (public.can_edit_library(church_id))
  WITH CHECK (public.can_edit_library(church_id));

DROP POLICY IF EXISTS songs_select ON public.songs;
DROP POLICY IF EXISTS songs_mutate ON public.songs;
CREATE POLICY songs_select ON public.songs
  FOR SELECT TO authenticated
  USING (public.is_active_member());
CREATE POLICY songs_mutate ON public.songs
  FOR ALL TO authenticated
  USING (public.can_edit_library(church_id))
  WITH CHECK (public.can_edit_library(church_id));

DROP POLICY IF EXISTS song_lyric_sections_select ON public.song_lyric_sections;
DROP POLICY IF EXISTS song_lyric_sections_mutate ON public.song_lyric_sections;
CREATE POLICY song_lyric_sections_select ON public.song_lyric_sections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_lyric_sections.song_id
      AND public.is_active_member()
  ));
CREATE POLICY song_lyric_sections_mutate ON public.song_lyric_sections
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_lyric_sections.song_id
      AND public.can_edit_library(s.church_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_lyric_sections.song_id
      AND public.can_edit_library(s.church_id)
  ));

DROP POLICY IF EXISTS song_tags_select ON public.song_tags;
DROP POLICY IF EXISTS song_tags_mutate ON public.song_tags;
CREATE POLICY song_tags_select ON public.song_tags
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_tags.song_id
      AND public.is_active_member()
  ));
CREATE POLICY song_tags_mutate ON public.song_tags
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_tags.song_id
      AND public.can_edit_library(s.church_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_tags.song_id
      AND public.can_edit_library(s.church_id)
  ));

DROP POLICY IF EXISTS setlists_select ON public.setlists;
DROP POLICY IF EXISTS setlists_mutate ON public.setlists;
CREATE POLICY setlists_select ON public.setlists
  FOR SELECT TO authenticated
  USING (public.can_use_setlist(id));
CREATE POLICY setlists_insert ON public.setlists
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  );
CREATE POLICY setlists_update ON public.setlists
  FOR UPDATE TO authenticated
  USING (public.can_edit_setlist(id))
  WITH CHECK (public.can_edit_setlist(id));
CREATE POLICY setlists_delete ON public.setlists
  FOR DELETE TO authenticated
  USING (public.can_edit_setlist(id));

DROP POLICY IF EXISTS setlist_items_select ON public.setlist_items;
DROP POLICY IF EXISTS setlist_items_mutate ON public.setlist_items;
CREATE POLICY setlist_items_select ON public.setlist_items
  FOR SELECT TO authenticated
  USING (public.can_use_setlist(setlist_id));
CREATE POLICY setlist_items_mutate ON public.setlist_items
  FOR ALL TO authenticated
  USING (public.can_edit_setlist(setlist_id))
  WITH CHECK (public.can_edit_setlist(setlist_id));

CREATE POLICY setlist_shares_select ON public.setlist_shares
  FOR SELECT TO authenticated
  USING (public.can_use_setlist(setlist_id) OR public.is_superadmin());
CREATE POLICY setlist_shares_mutate ON public.setlist_shares
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR public.can_edit_setlist(setlist_id))
  WITH CHECK (public.is_superadmin() OR public.can_edit_setlist(setlist_id));

CREATE OR REPLACE FUNCTION public.list_church_names()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
    FROM public.churches c
    WHERE c.id <> '00000000-0000-0000-0000-000000000001'::uuid
      AND c.status IN ('active', 'pending', 'offline')
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_church_names() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_church_names() TO authenticated;

-- New churches use the shared category catalog instead of copying defaults.
CREATE OR REPLACE FUNCTION public.bootstrap_church(p_church_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_church_id IS NULL THEN
    RAISE EXCEPTION 'church required';
  END IF;

  INSERT INTO public.church_settings (
    church_id,
    interface_language,
    theme,
    default_font,
    default_transition,
    transition_ms,
    backup_frequency
  )
  VALUES (
    p_church_id,
    'en',
    'dark',
    'Arial',
    'dissolve',
    400,
    'hourly'
  )
  ON CONFLICT (church_id) DO UPDATE
  SET
    default_font = coalesce(public.church_settings.default_font, 'Arial'),
    default_transition = coalesce(public.church_settings.default_transition, 'dissolve'),
    transition_ms = coalesce(public.church_settings.transition_ms, 400),
    backup_frequency = coalesce(public.church_settings.backup_frequency, 'hourly'),
    updated_at = now();

  IF NOT EXISTS (
    SELECT 1 FROM public.output_displays WHERE church_id = p_church_id
  ) THEN
    INSERT INTO public.output_displays (
      church_id, name, kind, is_default, sort_order
    ) VALUES
      (p_church_id, 'Projector Main', 'projector', true, 0),
      (p_church_id, 'NDI Stream', 'ndi', false, 1),
      (p_church_id, 'Stage Confidence', 'stage', false, 2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.languages WHERE church_id = p_church_id
  ) THEN
    INSERT INTO public.languages (church_id, name, code) VALUES
      (p_church_id, 'English', 'en'),
      (p_church_id, 'Tagalog', 'tl'),
      (p_church_id, 'Visayan', 'ceb');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.tags WHERE church_id = p_church_id
  ) THEN
    INSERT INTO public.tags (church_id, name) VALUES
      (p_church_id, 'Worship'),
      (p_church_id, 'Praise'),
      (p_church_id, 'Hymns');
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
