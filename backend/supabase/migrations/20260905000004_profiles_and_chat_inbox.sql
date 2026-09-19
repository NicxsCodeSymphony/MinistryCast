-- Profile photos, church profile fields, and chat DM peer helpers.

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS photo_url text;

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
        'status', u.status,
        'avatar_url', u.avatar_url
      ) END,
      'church', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'status', c.status,
        'onboarded_at', c.onboarded_at,
        'address', c.address,
        'phone', c.phone,
        'photo_url', c.photo_url,
        'email', c.email
      ) END
    )
    FROM (SELECT uid AS id) AS x
    LEFT JOIN public.users u ON u.id = x.id
    LEFT JOIN public.churches c ON c.id = u.church_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_name text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  trimmed text := trim(coalesce(p_name, ''));
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  UPDATE public.users
  SET
    name = CASE
      WHEN p_name IS NULL THEN name
      WHEN trimmed = '' OR char_length(trimmed) > 120 THEN name
      ELSE trimmed
    END,
    avatar_url = CASE
      WHEN p_avatar_url IS NULL THEN avatar_url
      WHEN trim(p_avatar_url) = '' THEN NULL
      ELSE trim(p_avatar_url)
    END,
    updated_at = now()
  WHERE id = uid;

  RETURN public.get_session_profile();
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_my_church(
  p_name text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_photo_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  church uuid := public.app_church_id();
  trimmed_name text := trim(coalesce(p_name, ''));
BEGIN
  IF NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT (public.is_superadmin() OR public.has_role(ARRAY['admin'])) THEN
    RAISE EXCEPTION 'only church admins can edit church profile';
  END IF;
  IF church IS NULL THEN
    RAISE EXCEPTION 'no church workspace';
  END IF;

  UPDATE public.churches
  SET
    name = CASE
      WHEN p_name IS NULL THEN name
      WHEN trimmed_name = '' OR char_length(trimmed_name) > 120 THEN name
      ELSE trimmed_name
    END,
    address = CASE WHEN p_address IS NULL THEN address ELSE nullif(trim(p_address), '') END,
    phone = CASE WHEN p_phone IS NULL THEN phone ELSE nullif(trim(p_phone), '') END,
    photo_url = CASE
      WHEN p_photo_url IS NULL THEN photo_url
      WHEN trim(p_photo_url) = '' THEN NULL
      ELSE trim(p_photo_url)
    END,
    updated_at = now()
  WHERE id = church;

  RETURN public.get_session_profile();
END;
$$;

REVOKE ALL ON FUNCTION public.update_my_church(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_my_church(text, text, text, text) TO authenticated;

-- Enrich DM channel listing with the other participant.
CREATE OR REPLACE FUNCTION public.list_chat_inbox()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_data ORDER BY sort_at DESC)
    FROM (
      SELECT
        jsonb_build_object(
          'id', c.id,
          'kind', c.kind,
          'church_id', c.church_id,
          'name', CASE
            WHEN c.kind = 'dm' THEN coalesce(peer.name, c.name)
            ELSE c.name
          END,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'peer_user_id', peer.id,
          'peer_name', peer.name,
          'peer_avatar_url', peer.avatar_url,
          'peer_role', peer.role,
          'peer_church_name', peer_church.name
        ) AS row_data,
        c.updated_at AS sort_at
      FROM public.chat_channels c
      LEFT JOIN LATERAL (
        SELECT u.id, u.name, u.avatar_url, u.role, u.church_id
        FROM public.chat_channel_members m
        JOIN public.users u ON u.id = m.user_id
        WHERE m.channel_id = c.id
          AND m.user_id <> me
        LIMIT 1
      ) peer ON true
      LEFT JOIN public.churches peer_church ON peer_church.id = peer.church_id
      WHERE public.can_access_chat_channel(c.id)
        AND (
          public.is_superadmin()
          OR c.kind = 'church'
          OR (
            c.kind = 'dm'
            AND EXISTS (
              SELECT 1 FROM public.chat_channel_members m2
              WHERE m2.channel_id = c.id AND m2.user_id = me
            )
          )
        )
    ) q
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_chat_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_chat_inbox() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_chat_contacts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', u.id,
      'name', u.name,
      'email', u.email,
      'role', u.role,
      'church_name', c.name,
      'avatar_url', u.avatar_url
    ) ORDER BY u.name)
    FROM public.users u
    LEFT JOIN public.churches c ON c.id = u.church_id
    WHERE u.status = 'active'
      AND u.role <> 'superadmin'
      AND u.id <> auth.uid()
  ), '[]'::jsonb);
END;
$$;

-- Public media buckets for avatars / church photos.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'avatars',
    'avatars',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  ),
  (
    'church-photos',
    'church-photos',
    true,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
  )
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_read ON storage.objects;
CREATE POLICY avatars_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id IN ('avatars', 'church-photos'));

DROP POLICY IF EXISTS avatars_write ON storage.objects;
CREATE POLICY avatars_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_update ON storage.objects;
CREATE POLICY avatars_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS church_photos_write ON storage.objects;
CREATE POLICY church_photos_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'church-photos'
    AND (
      public.is_superadmin()
      OR (
        public.has_role(ARRAY['admin'])
        AND (storage.foldername(name))[1] = public.app_church_id()::text
      )
    )
  );

DROP POLICY IF EXISTS church_photos_update ON storage.objects;
CREATE POLICY church_photos_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'church-photos'
    AND (
      public.is_superadmin()
      OR (
        public.has_role(ARRAY['admin'])
        AND (storage.foldername(name))[1] = public.app_church_id()::text
      )
    )
  )
  WITH CHECK (
    bucket_id = 'church-photos'
    AND (
      public.is_superadmin()
      OR (
        public.has_role(ARRAY['admin'])
        AND (storage.foldername(name))[1] = public.app_church_id()::text
      )
    )
  );
