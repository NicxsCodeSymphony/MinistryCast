-- Church name suggestions during signup + optional join existing church.
-- Shared realtime chat (church groups for all; DMs for superadmin).

CREATE TABLE IF NOT EXISTS public.chat_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind varchar(20) NOT NULL CHECK (kind IN ('church', 'dm')),
  church_id uuid REFERENCES public.churches (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'general',
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_channels_church_kind CHECK (
    (kind = 'church' AND church_id IS NOT NULL)
    OR (kind = 'dm' AND church_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_church_name
  ON public.chat_channels (church_id, lower(name))
  WHERE kind = 'church';

CREATE TABLE IF NOT EXISTS public.chat_channel_members (
  channel_id uuid NOT NULL REFERENCES public.chat_channels (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id uuid NOT NULL REFERENCES public.chat_channels (id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(trim(body)) > 0 AND char_length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created
  ON public.chat_messages (channel_id, created_at DESC);

ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_chat_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_channels c
    WHERE c.id = p_channel_id
      AND (
        public.is_superadmin()
        OR (
          c.kind = 'church'
          AND public.in_church(c.church_id)
          AND public.is_active_member()
        )
        OR (
          c.kind = 'dm'
          AND EXISTS (
            SELECT 1 FROM public.chat_channel_members m
            WHERE m.channel_id = c.id AND m.user_id = auth.uid()
          )
        )
      )
  )
$$;

REVOKE ALL ON FUNCTION public.can_access_chat_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_chat_channel(uuid) TO authenticated;

DROP POLICY IF EXISTS chat_channels_select ON public.chat_channels;
CREATE POLICY chat_channels_select ON public.chat_channels
  FOR SELECT TO authenticated
  USING (public.can_access_chat_channel(id));

DROP POLICY IF EXISTS chat_channels_insert ON public.chat_channels;
CREATE POLICY chat_channels_insert ON public.chat_channels
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin()
    OR (
      kind = 'church'
      AND public.in_church(church_id)
      AND public.has_role(ARRAY['admin', 'producer'])
    )
  );

DROP POLICY IF EXISTS chat_members_select ON public.chat_channel_members;
CREATE POLICY chat_members_select ON public.chat_channel_members
  FOR SELECT TO authenticated
  USING (public.can_access_chat_channel(channel_id));

DROP POLICY IF EXISTS chat_members_insert ON public.chat_channel_members;
CREATE POLICY chat_members_insert ON public.chat_channel_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_superadmin() OR user_id = auth.uid());

DROP POLICY IF EXISTS chat_messages_select ON public.chat_messages;
CREATE POLICY chat_messages_select ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.can_access_chat_channel(channel_id));

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_chat_channel(channel_id)
  );

CREATE OR REPLACE FUNCTION public.suggest_churches(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := lower(trim(coalesce(p_query, '')));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF char_length(q) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'status', c.status
    ) ORDER BY c.name)
    FROM (
      SELECT c.id, c.name, c.status
      FROM public.churches c
      WHERE c.id <> '00000000-0000-0000-0000-000000000001'::uuid
        AND c.status IN ('active', 'pending', 'offline')
        AND lower(c.name) LIKE '%' || q || '%'
      ORDER BY
        CASE WHEN lower(c.name) = q THEN 0
             WHEN lower(c.name) LIKE q || '%' THEN 1
             ELSE 2 END,
        c.name
      LIMIT 8
    ) c
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_churches(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_churches(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_signup(
  p_name text,
  p_church_name text,
  p_church_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  auth_email text;
  new_church_id uuid;
  trimmed_name text := trim(p_name);
  trimmed_church text := trim(p_church_name);
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF trimmed_name = '' OR char_length(trimmed_name) > 120 THEN
    RAISE EXCEPTION 'invalid name';
  END IF;

  IF trimmed_church = '' OR char_length(trimmed_church) > 120 THEN
    RAISE EXCEPTION 'invalid church name';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE id = uid) THEN
    RAISE EXCEPTION 'already registered';
  END IF;

  SELECT email INTO auth_email
  FROM auth.users
  WHERE id = uid;

  IF auth_email IS NULL OR auth_email = '' THEN
    RAISE EXCEPTION 'auth user has no email';
  END IF;

  IF lower(auth_email) = 'edisannico@gmail.com' THEN
    RAISE EXCEPTION 'this account is reserved';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE email = auth_email) THEN
    RAISE EXCEPTION 'email already registered';
  END IF;

  IF p_church_id IS NOT NULL THEN
    SELECT c.id INTO new_church_id
    FROM public.churches c
    WHERE c.id = p_church_id
      AND c.id <> '00000000-0000-0000-0000-000000000001'::uuid
      AND c.status IN ('active', 'pending', 'offline');
    IF new_church_id IS NULL THEN
      RAISE EXCEPTION 'church not found';
    END IF;
  ELSE
    INSERT INTO public.churches (
      id, name, email, status, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      trimmed_church,
      auth_email,
      'pending',
      now(),
      now()
    )
    RETURNING id INTO new_church_id;

    INSERT INTO public.church_settings (
      id,
      church_id,
      interface_language,
      theme,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      new_church_id,
      'en',
      'dark',
      now(),
      now()
    );
  END IF;

  INSERT INTO public.users (
    id,
    church_id,
    name,
    email,
    email_verified_at,
    role,
    status,
    created_at,
    updated_at
  ) VALUES (
    uid,
    new_church_id,
    trimmed_name,
    auth_email,
    now(),
    'admin',
    'pending',
    now(),
    now()
  );

  INSERT INTO public.chat_channels (id, kind, church_id, name, created_by, created_at, updated_at)
  SELECT gen_random_uuid(), 'church', new_church_id, 'general', uid, now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.chat_channels ch
    WHERE ch.kind = 'church' AND ch.church_id = new_church_id AND ch.name = 'general'
  );

  RETURN public.get_session_profile();
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_signup(text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.ensure_church_chat(p_church_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_id uuid;
BEGIN
  IF p_church_id IS NULL THEN
    RAISE EXCEPTION 'church required';
  END IF;
  IF NOT (public.is_superadmin() OR public.in_church(p_church_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT id INTO channel_id
  FROM public.chat_channels
  WHERE kind = 'church' AND church_id = p_church_id AND name = 'general'
  LIMIT 1;

  IF channel_id IS NULL THEN
    INSERT INTO public.chat_channels (kind, church_id, name, created_by)
    VALUES ('church', p_church_id, 'general', auth.uid())
    RETURNING id INTO channel_id;
  END IF;

  RETURN channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_church_chat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_church_chat(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.open_dm_channel(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  channel_id uuid;
  other_name text;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'only superadmin can start direct messages';
  END IF;
  IF p_user_id IS NULL OR p_user_id = me THEN
    RAISE EXCEPTION 'invalid user';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = p_user_id AND u.status = 'active'
  ) THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  SELECT c.id INTO channel_id
  FROM public.chat_channels c
  WHERE c.kind = 'dm'
    AND EXISTS (
      SELECT 1 FROM public.chat_channel_members m1
      WHERE m1.channel_id = c.id AND m1.user_id = me
    )
    AND EXISTS (
      SELECT 1 FROM public.chat_channel_members m2
      WHERE m2.channel_id = c.id AND m2.user_id = p_user_id
    )
  LIMIT 1;

  IF channel_id IS NULL THEN
    SELECT name INTO other_name FROM public.users WHERE id = p_user_id;
    INSERT INTO public.chat_channels (kind, church_id, name, created_by)
    VALUES ('dm', NULL, coalesce(other_name, 'Direct message'), me)
    RETURNING id INTO channel_id;

    INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES
      (channel_id, me),
      (channel_id, p_user_id);
  END IF;

  RETURN channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.open_dm_channel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.open_dm_channel(uuid) TO authenticated;

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
      'church_name', c.name
    ) ORDER BY u.name)
    FROM public.users u
    LEFT JOIN public.churches c ON c.id = u.church_id
    WHERE u.status = 'active'
      AND u.role <> 'superadmin'
      AND u.id <> auth.uid()
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_chat_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_chat_contacts() TO authenticated;

INSERT INTO public.chat_channels (kind, church_id, name, created_by)
SELECT 'church', c.id, 'general', NULL
FROM public.churches c
WHERE c.id <> '00000000-0000-0000-0000-000000000001'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM public.chat_channels ch
    WHERE ch.kind = 'church' AND ch.church_id = c.id AND ch.name = 'general'
  );

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
