-- Same-church direct messages for all active members (not only superadmin).

CREATE OR REPLACE FUNCTION public.open_dm_channel(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_church uuid;
  peer_church uuid;
  peer_status text;
  channel_id uuid;
  other_name text;
BEGIN
  IF me IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_user_id IS NULL OR p_user_id = me THEN
    RAISE EXCEPTION 'invalid user';
  END IF;

  SELECT u.church_id, u.status, u.name
  INTO peer_church, peer_status, other_name
  FROM public.users u
  WHERE u.id = p_user_id;

  IF peer_church IS NULL OR peer_status <> 'active' THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF public.is_superadmin() THEN
    -- Platform support may DM any active account.
    NULL;
  ELSE
    my_church := public.app_church_id();
    IF my_church IS NULL OR peer_church IS DISTINCT FROM my_church THEN
      RAISE EXCEPTION 'you can only message people in your church';
    END IF;
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

CREATE OR REPLACE FUNCTION public.list_chat_contacts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_church uuid;
BEGIN
  IF me IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.is_superadmin() THEN
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
        AND u.id <> me
    ), '[]'::jsonb);
  END IF;

  my_church := public.app_church_id();
  IF my_church IS NULL THEN
    RETURN '[]'::jsonb;
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
      AND u.church_id = my_church
      AND u.role <> 'superadmin'
      AND u.id <> me
  ), '[]'::jsonb);
END;
$$;

-- Ensure church members always see their own DMs in the inbox.
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
          (
            c.kind = 'church'
            AND (
              public.is_superadmin()
              OR public.in_church(c.church_id)
            )
          )
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
