-- Workspace bootstrap for new churches, onboarding flag, timestamp defaults, live realtime.

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS onboarded_at timestamptz;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'churches',
    'users',
    'church_settings',
    'output_displays',
    'categories',
    'languages',
    'tags',
    'media_assets',
    'songs',
    'song_lyric_sections',
    'scripture_passages',
    'sermons',
    'sermon_slides',
    'sermon_notes',
    'sermon_attachments',
    'setlists',
    'setlist_items',
    'presentations',
    'presentation_outputs'
  ]
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT now()',
      t
    );
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t
        AND column_name = 'updated_at'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT now()',
        t
      );
    END IF;
  END LOOP;
END $$;

INSERT INTO public.bible_versions (id, code, name)
VALUES
  (gen_random_uuid(), 'ESV', 'English Standard Version'),
  (gen_random_uuid(), 'NIV', 'New International Version'),
  (gen_random_uuid(), 'KJV', 'King James Version'),
  (gen_random_uuid(), 'NLT', 'New Living Translation')
ON CONFLICT (code) DO NOTHING;

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
    SELECT 1 FROM public.categories WHERE church_id = p_church_id
  ) THEN
    INSERT INTO public.categories (church_id, name, description, icon, color, sort_order)
    VALUES
      (p_church_id, 'Call to Worship', 'The opening sequence designed to focus the hearts of the congregation.', 'campaign', 'sky', 0),
      (p_church_id, 'Opening Song', 'High-energy anthems that invite participation and celebration.', 'music_note', 'violet', 1),
      (p_church_id, 'Praise', 'Fast to mid-tempo selections focused on the attributes of God.', 'celebration', 'amber', 2),
      (p_church_id, 'Worship', 'Intimate, slow-tempo songs for deep personal reflection.', 'favorite', 'rose', 3),
      (p_church_id, 'Holy of Holies', 'The peak moments of spiritual encounter and reverence.', 'auto_awesome', 'gold', 4);
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

CREATE OR REPLACE FUNCTION public.complete_onboarding()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  church uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT church_id INTO church
  FROM public.users
  WHERE id = auth.uid()
    AND status = 'active';

  IF church IS NULL THEN
    RAISE EXCEPTION 'account is not active';
  END IF;

  PERFORM public.bootstrap_church(church);

  UPDATE public.churches
  SET onboarded_at = coalesce(onboarded_at, now()), updated_at = now()
  WHERE id = church;

  RETURN public.get_session_profile();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_session_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false, 'user', null, 'church', null);
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'authenticated', true,
      'user', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email,
        'role', u.role,
        'status', u.status
      ) END,
      'church', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'status', c.status,
        'onboarded_at', c.onboarded_at
      ) END
    )
    FROM (SELECT uid AS id) AS x
    LEFT JOIN public.users u ON u.id = x.id
    LEFT JOIN public.churches c ON c.id = u.church_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.review_signup(p_church_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action text := lower(trim(p_action));
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.churches
    WHERE id = p_church_id
      AND status IN ('pending', 'rejected')
      AND id <> '00000000-0000-0000-0000-000000000001'::uuid
  ) THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF action = 'approve' THEN
    UPDATE public.churches
    SET
      status = 'active',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
    WHERE id = p_church_id;

    UPDATE public.users
    SET
      status = 'active',
      updated_at = now()
    WHERE church_id = p_church_id
      AND status <> 'disabled';

    PERFORM public.bootstrap_church(p_church_id);
  ELSE
    UPDATE public.churches
    SET
      status = 'rejected',
      approved_at = NULL,
      approved_by = auth.uid(),
      updated_at = now()
    WHERE id = p_church_id;

    UPDATE public.users
    SET
      status = 'disabled',
      updated_at = now()
    WHERE church_id = p_church_id;
  END IF;

  RETURN public.list_signup_requests();
END;
$$;

UPDATE public.churches
SET onboarded_at = coalesce(onboarded_at, now())
WHERE id = '00000000-0000-0000-0000-000000000001'::uuid;

REVOKE ALL ON FUNCTION public.bootstrap_church(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_onboarding() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_church(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_session_profile() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.review_signup(uuid, text) TO authenticated;

ALTER TABLE public.presentations REPLICA IDENTITY FULL;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.presentations;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
