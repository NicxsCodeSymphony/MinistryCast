-- Chat UX: church-named group channels, clear messages (keep chat), inbox church photo.

CREATE OR REPLACE FUNCTION public.ensure_church_chat(p_church_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_id uuid;
  church_name text;
BEGIN
  IF p_church_id IS NULL THEN
    RAISE EXCEPTION 'church required';
  END IF;
  IF NOT (public.is_superadmin() OR public.in_church(p_church_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT name INTO church_name
  FROM public.churches
  WHERE id = p_church_id;

  church_name := nullif(trim(coalesce(church_name, '')), '');
  IF church_name IS NULL THEN
    church_name := 'Church';
  END IF;

  SELECT id INTO channel_id
  FROM public.chat_channels
  WHERE kind = 'church' AND church_id = p_church_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF channel_id IS NULL THEN
    INSERT INTO public.chat_channels (kind, church_id, name, created_by)
    VALUES ('church', p_church_id, church_name, auth.uid())
    RETURNING id INTO channel_id;
  ELSE
    UPDATE public.chat_channels
    SET name = church_name, updated_at = now()
    WHERE id = channel_id
      AND name IS DISTINCT FROM church_name;
  END IF;

  RETURN channel_id;
END;
$$;

-- Backfill existing "general" (and any stale) church channels to the church name.
UPDATE public.chat_channels ch
SET name = c.name, updated_at = now()
FROM public.churches c
WHERE ch.kind = 'church'
  AND ch.church_id = c.id
  AND ch.name IS DISTINCT FROM c.name;

-- Delete chat = wipe messages, keep the conversation in the inbox.
CREATE OR REPLACE FUNCTION public.clear_chat_messages(p_channel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.can_access_chat_channel(p_channel_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  DELETE FROM public.chat_reactions
  WHERE message_id IN (
    SELECT id FROM public.chat_messages WHERE channel_id = p_channel_id
  );

  DELETE FROM public.chat_messages
  WHERE channel_id = p_channel_id;

  UPDATE public.chat_channels
  SET updated_at = now()
  WHERE id = p_channel_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_chat_messages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.clear_chat_messages(uuid) TO authenticated;

-- Needed so realtime DELETE payloads include channel_id for filters.
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;

-- Keep old name as an alias that now clears messages (does not hide the chat).
CREATE OR REPLACE FUNCTION public.delete_chat_for_me(p_channel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.clear_chat_messages(p_channel_id);
END;
$$;

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
            ELSE coalesce(own_church.name, c.name)
          END,
          'created_at', c.created_at,
          'updated_at', c.updated_at,
          'peer_user_id', peer.id,
          'peer_name', peer.name,
          'peer_avatar_url', peer.avatar_url,
          'peer_role', peer.role,
          'peer_church_name', peer_church.name,
          'church_photo_url', CASE
            WHEN c.kind = 'church' THEN own_church.photo_url
            ELSE NULL
          END
        ) AS row_data,
        c.updated_at AS sort_at
      FROM public.chat_channels c
      LEFT JOIN public.churches own_church ON own_church.id = c.church_id
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
        AND NOT EXISTS (
          SELECT 1 FROM public.chat_channel_hides h
          WHERE h.channel_id = c.id AND h.user_id = me
        )
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
            AND (
              peer.id IS NULL
              OR NOT public.chat_users_blocked(me, peer.id)
            )
          )
        )
    ) q
  ), '[]'::jsonb);
END;
$$;

-- Allow members to hear roster changes for their church (contacts refresh).
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
