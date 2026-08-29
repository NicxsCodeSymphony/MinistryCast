-- Row Level Security for MinistryCast roles.
-- public.users.id must equal auth.uid() (create the Auth user first, then insert public.users with that id).
--
-- Role matrix (active users only, same church):
--   admin     — settings, users, library, sermons, setlists, live
--   producer  — library, sermons, setlists, live (no church/user admin)
--   operator  — read church content, write live session
--
-- pending / disabled users cannot read church data. Signup OTP stays service-role only.

-- ---------------------------------------------------------------------------
-- Helpers (SECURITY DEFINER so they can read public.users without RLS recursion)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.app_church_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT church_id
  FROM public.users
  WHERE id = auth.uid()
    AND status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.users
  WHERE id = auth.uid()
    AND status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.is_active_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_role(roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_role() = ANY (roles)
$$;

CREATE OR REPLACE FUNCTION public.in_church(target_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT target_church_id IS NOT NULL
    AND target_church_id = public.app_church_id()
$$;

REVOKE ALL ON FUNCTION public.app_church_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_role() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_active_member() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.in_church(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.app_church_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_member() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.in_church(uuid) TO authenticated;

-- Block non-admins from changing role / status / church_id on their own row.
CREATE OR REPLACE FUNCTION public.protect_user_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(ARRAY['admin']) AND OLD.church_id = public.app_church_id() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.church_id IS DISTINCT FROM OLD.church_id
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'only a church admin can change role, status, church, or email';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_user_privileged_columns ON public.users;
CREATE TRIGGER trg_protect_user_privileged_columns
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_user_privileged_columns();

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.email_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.churches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.church_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.output_displays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.languages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bible_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_lyric_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.song_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scripture_passages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sermons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sermon_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sermon_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sermon_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.setlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.presentation_outputs ENABLE ROW LEVEL SECURITY;

-- email_otps: no client policies (service_role only)

-- bible_versions: shared lookup
CREATE POLICY bible_versions_select ON public.bible_versions
  FOR SELECT TO authenticated
  USING (public.is_active_member());

-- churches
CREATE POLICY churches_select ON public.churches
  FOR SELECT TO authenticated
  USING (id = public.app_church_id());

CREATE POLICY churches_update ON public.churches
  FOR UPDATE TO authenticated
  USING (id = public.app_church_id() AND public.has_role(ARRAY['admin']))
  WITH CHECK (id = public.app_church_id() AND public.has_role(ARRAY['admin']));

-- users
CREATE POLICY users_select_self ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY users_select_church ON public.users
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY users_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin']));

CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY users_update_admin ON public.users
  FOR UPDATE TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin']));

CREATE POLICY users_delete ON public.users
  FOR DELETE TO authenticated
  USING (
    public.in_church(church_id)
    AND public.has_role(ARRAY['admin'])
    AND id <> auth.uid()
  );

-- church_settings (admin write)
CREATE POLICY church_settings_select ON public.church_settings
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY church_settings_mutate ON public.church_settings
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin']));

-- Library / settings displays: admin + producer write, all members read
CREATE POLICY output_displays_select ON public.output_displays
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY output_displays_mutate ON public.output_displays
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']));

CREATE POLICY categories_select ON public.categories
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY categories_mutate ON public.categories
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']));

CREATE POLICY languages_select ON public.languages
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY languages_mutate ON public.languages
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']));

CREATE POLICY tags_select ON public.tags
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY tags_mutate ON public.tags
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']));

CREATE POLICY media_assets_select ON public.media_assets
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY media_assets_mutate ON public.media_assets
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']));

CREATE POLICY songs_select ON public.songs
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY songs_mutate ON public.songs
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']));

CREATE POLICY song_lyric_sections_select ON public.song_lyric_sections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_lyric_sections.song_id
      AND public.in_church(s.church_id)
  ));

CREATE POLICY song_lyric_sections_mutate ON public.song_lyric_sections
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_lyric_sections.song_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_lyric_sections.song_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ));

CREATE POLICY song_tags_select ON public.song_tags
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_tags.song_id
      AND public.in_church(s.church_id)
  ));

CREATE POLICY song_tags_mutate ON public.song_tags
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_tags.song_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.songs s
    WHERE s.id = song_tags.song_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ));

CREATE POLICY scripture_passages_select ON public.scripture_passages
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY scripture_passages_mutate ON public.scripture_passages
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']));

CREATE POLICY sermons_select ON public.sermons
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY sermons_mutate ON public.sermons
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']));

CREATE POLICY sermon_slides_select ON public.sermon_slides
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sermons s
    WHERE s.id = sermon_slides.sermon_id
      AND public.in_church(s.church_id)
  ));

CREATE POLICY sermon_slides_mutate ON public.sermon_slides
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sermons s
    WHERE s.id = sermon_slides.sermon_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sermons s
    WHERE s.id = sermon_slides.sermon_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ));

CREATE POLICY sermon_notes_select ON public.sermon_notes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sermons s
    WHERE s.id = sermon_notes.sermon_id
      AND public.in_church(s.church_id)
  ));

CREATE POLICY sermon_notes_mutate ON public.sermon_notes
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sermons s
    WHERE s.id = sermon_notes.sermon_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sermons s
    WHERE s.id = sermon_notes.sermon_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ));

CREATE POLICY sermon_attachments_select ON public.sermon_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sermons s
    WHERE s.id = sermon_attachments.sermon_id
      AND public.in_church(s.church_id)
  ));

CREATE POLICY sermon_attachments_mutate ON public.sermon_attachments
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sermons s
    WHERE s.id = sermon_attachments.sermon_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sermons s
    WHERE s.id = sermon_attachments.sermon_id
      AND public.in_church(s.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ));

CREATE POLICY setlists_select ON public.setlists
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY setlists_mutate ON public.setlists
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer']));

CREATE POLICY setlist_items_select ON public.setlist_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.setlists sl
    WHERE sl.id = setlist_items.setlist_id
      AND public.in_church(sl.church_id)
  ));

CREATE POLICY setlist_items_mutate ON public.setlist_items
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.setlists sl
    WHERE sl.id = setlist_items.setlist_id
      AND public.in_church(sl.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.setlists sl
    WHERE sl.id = setlist_items.setlist_id
      AND public.in_church(sl.church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
  ));

-- Live: admin, producer, operator can run a session
CREATE POLICY presentations_select ON public.presentations
  FOR SELECT TO authenticated
  USING (public.in_church(church_id));

CREATE POLICY presentations_mutate ON public.presentations
  FOR ALL TO authenticated
  USING (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer', 'operator']))
  WITH CHECK (public.in_church(church_id) AND public.has_role(ARRAY['admin', 'producer', 'operator']));

CREATE POLICY presentation_outputs_select ON public.presentation_outputs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.presentations p
    WHERE p.id = presentation_outputs.presentation_id
      AND public.in_church(p.church_id)
  ));

CREATE POLICY presentation_outputs_mutate ON public.presentation_outputs
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.presentations p
    WHERE p.id = presentation_outputs.presentation_id
      AND public.in_church(p.church_id)
      AND public.has_role(ARRAY['admin', 'producer', 'operator'])
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.presentations p
    WHERE p.id = presentation_outputs.presentation_id
      AND public.in_church(p.church_id)
      AND public.has_role(ARRAY['admin', 'producer', 'operator'])
  ));
