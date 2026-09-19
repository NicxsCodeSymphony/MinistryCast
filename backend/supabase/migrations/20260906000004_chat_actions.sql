-- Chat: soft-delete messages, reactions, attachments, blocks, hide/leave conversation.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_mime text,
  ADD COLUMN IF NOT EXISTS attachment_name text;

ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_body_check;
ALTER TABLE public.chat_messages
  ADD CONSTRAINT chat_messages_body_or_attachment CHECK (
    deleted_at IS NOT NULL
    OR (
      char_length(body) <= 4000
      AND (
        char_length(trim(body)) > 0
        OR (
          attachment_url IS NOT NULL
          AND char_length(trim(attachment_url)) > 0
        )
      )
    )
  );

CREATE TABLE IF NOT EXISTS public.chat_reactions (
  message_id uuid NOT NULL REFERENCES public.chat_messages (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  emoji text NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message
  ON public.chat_reactions (message_id);

CREATE TABLE IF NOT EXISTS public.chat_blocks (
  blocker_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id),
  CONSTRAINT chat_blocks_no_self CHECK (blocker_id <> blocked_id)
);

CREATE TABLE IF NOT EXISTS public.chat_channel_hides (
  channel_id uuid NOT NULL REFERENCES public.chat_channels (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE public.chat_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_hides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chat_reactions_select ON public.chat_reactions;
CREATE POLICY chat_reactions_select ON public.chat_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = message_id
        AND public.can_access_chat_channel(m.channel_id)
    )
  );

DROP POLICY IF EXISTS chat_reactions_insert ON public.chat_reactions;
CREATE POLICY chat_reactions_insert ON public.chat_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.chat_messages m
      WHERE m.id = message_id
        AND m.deleted_at IS NULL
        AND public.can_access_chat_channel(m.channel_id)
    )
  );

DROP POLICY IF EXISTS chat_reactions_update ON public.chat_reactions;
CREATE POLICY chat_reactions_update ON public.chat_reactions
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_reactions_delete ON public.chat_reactions;
CREATE POLICY chat_reactions_delete ON public.chat_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_blocks_select ON public.chat_blocks;
CREATE POLICY chat_blocks_select ON public.chat_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR blocked_id = auth.uid());

DROP POLICY IF EXISTS chat_blocks_insert ON public.chat_blocks;
CREATE POLICY chat_blocks_insert ON public.chat_blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid() AND blocker_id <> blocked_id);

DROP POLICY IF EXISTS chat_blocks_delete ON public.chat_blocks;
CREATE POLICY chat_blocks_delete ON public.chat_blocks
  FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS chat_hides_select ON public.chat_channel_hides;
CREATE POLICY chat_hides_select ON public.chat_channel_hides
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_hides_insert ON public.chat_channel_hides;
CREATE POLICY chat_hides_insert ON public.chat_channel_hides
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_hides_delete ON public.chat_channel_hides;
CREATE POLICY chat_hides_delete ON public.chat_channel_hides
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS chat_messages_update ON public.chat_messages;
CREATE POLICY chat_messages_update ON public.chat_messages
  FOR UPDATE TO authenticated
  USING (
    sender_id = auth.uid()
    AND public.can_access_chat_channel(channel_id)
  )
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_chat_channel(channel_id)
  );

CREATE OR REPLACE FUNCTION public.chat_users_blocked(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;

REVOKE ALL ON FUNCTION public.chat_users_blocked(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_users_blocked(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_chat_message(p_message_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg public.chat_messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO msg FROM public.chat_messages WHERE id = p_message_id;
  IF msg.id IS NULL THEN
    RAISE EXCEPTION 'message not found';
  END IF;
  IF msg.sender_id <> auth.uid() AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'only the sender can delete this message';
  END IF;
  IF NOT public.can_access_chat_channel(msg.channel_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.chat_messages
  SET
    deleted_at = now(),
    body = '',
    attachment_url = NULL,
    attachment_mime = NULL,
    attachment_name = NULL
  WHERE id = p_message_id;

  DELETE FROM public.chat_reactions WHERE message_id = p_message_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_chat_message(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_chat_message(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_chat_reaction(
  p_message_id uuid,
  p_emoji text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg public.chat_messages%ROWTYPE;
  emoji text := trim(p_emoji);
  existing text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF emoji IS NULL OR char_length(emoji) < 1 OR char_length(emoji) > 16 THEN
    RAISE EXCEPTION 'invalid reaction';
  END IF;

  SELECT * INTO msg FROM public.chat_messages WHERE id = p_message_id;
  IF msg.id IS NULL OR msg.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'message not found';
  END IF;
  IF NOT public.can_access_chat_channel(msg.channel_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT r.emoji INTO existing
  FROM public.chat_reactions r
  WHERE r.message_id = p_message_id AND r.user_id = auth.uid();

  IF existing IS NOT NULL AND existing = emoji THEN
    DELETE FROM public.chat_reactions
    WHERE message_id = p_message_id AND user_id = auth.uid();
  ELSE
    INSERT INTO public.chat_reactions (message_id, user_id, emoji)
    VALUES (p_message_id, auth.uid(), emoji)
    ON CONFLICT (message_id, user_id)
    DO UPDATE SET emoji = excluded.emoji, created_at = now();
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'emoji', q.emoji,
      'count', q.cnt,
      'mine', q.mine
    ) ORDER BY q.emoji)
    FROM (
      SELECT
        r.emoji,
        count(*)::int AS cnt,
        bool_or(r.user_id = auth.uid()) AS mine
      FROM public.chat_reactions r
      WHERE r.message_id = p_message_id
      GROUP BY r.emoji
    ) q
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_chat_reaction(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.toggle_chat_reaction(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.block_chat_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_user_id IS NULL OR p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'invalid user';
  END IF;

  INSERT INTO public.chat_blocks (blocker_id, blocked_id)
  VALUES (auth.uid(), p_user_id)
  ON CONFLICT DO NOTHING;

  -- Hide any shared DM from my inbox.
  INSERT INTO public.chat_channel_hides (channel_id, user_id)
  SELECT c.id, auth.uid()
  FROM public.chat_channels c
  JOIN public.chat_channel_members m1 ON m1.channel_id = c.id AND m1.user_id = auth.uid()
  JOIN public.chat_channel_members m2 ON m2.channel_id = c.id AND m2.user_id = p_user_id
  WHERE c.kind = 'dm'
  ON CONFLICT DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.block_chat_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.block_chat_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.unblock_chat_user(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  DELETE FROM public.chat_blocks
  WHERE blocker_id = auth.uid() AND blocked_id = p_user_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.unblock_chat_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unblock_chat_user(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_chat_for_me(p_channel_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ch public.chat_channels%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT public.can_access_chat_channel(p_channel_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO ch FROM public.chat_channels WHERE id = p_channel_id;
  IF ch.id IS NULL THEN
    RAISE EXCEPTION 'chat not found';
  END IF;

  INSERT INTO public.chat_channel_hides (channel_id, user_id)
  VALUES (p_channel_id, auth.uid())
  ON CONFLICT DO NOTHING;

  IF ch.kind = 'dm' THEN
    DELETE FROM public.chat_channel_members
    WHERE channel_id = p_channel_id AND user_id = auth.uid();
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_chat_for_me(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_chat_for_me(uuid) TO authenticated;

-- Soft-unhide when reopening a DM (preserves same-church / superadmin rules).
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
  found_id uuid;
  other_name text;
BEGIN
  IF me IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_user_id IS NULL OR p_user_id = me THEN
    RAISE EXCEPTION 'invalid user';
  END IF;
  IF public.chat_users_blocked(me, p_user_id) THEN
    RAISE EXCEPTION 'you cannot message this person';
  END IF;

  SELECT u.church_id, u.status, u.name
  INTO peer_church, peer_status, other_name
  FROM public.users u
  WHERE u.id = p_user_id;

  IF peer_church IS NULL OR peer_status <> 'active' THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  IF public.is_superadmin() THEN
    NULL;
  ELSE
    my_church := public.app_church_id();
    IF my_church IS NULL OR peer_church IS DISTINCT FROM my_church THEN
      RAISE EXCEPTION 'you can only message people in your church';
    END IF;
  END IF;

  SELECT c.id INTO found_id
  FROM public.chat_channels c
  WHERE c.kind = 'dm'
    AND EXISTS (
      SELECT 1 FROM public.chat_channel_members m2
      WHERE m2.channel_id = c.id AND m2.user_id = p_user_id
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.chat_channel_members m1
        WHERE m1.channel_id = c.id AND m1.user_id = me
      )
      OR EXISTS (
        SELECT 1 FROM public.chat_channel_hides h
        WHERE h.channel_id = c.id AND h.user_id = me
      )
      OR c.created_by = me
    )
  LIMIT 1;

  IF found_id IS NULL THEN
    INSERT INTO public.chat_channels (kind, church_id, name, created_by)
    VALUES ('dm', NULL, coalesce(other_name, 'Direct message'), me)
    RETURNING id INTO found_id;

    INSERT INTO public.chat_channel_members (channel_id, user_id) VALUES
      (found_id, me),
      (found_id, p_user_id);
  ELSE
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (found_id, me)
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.chat_channel_hides
  WHERE channel_id = found_id AND user_id = me;

  RETURN found_id;
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
        AND NOT public.chat_users_blocked(me, u.id)
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
      AND NOT public.chat_users_blocked(me, u.id)
  ), '[]'::jsonb);
END;
$$;

-- Block messaging when either party blocked the other.
CREATE OR REPLACE FUNCTION public.chat_assert_can_send(p_channel_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  peer uuid;
BEGIN
  IF NOT public.can_access_chat_channel(p_channel_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT m.user_id INTO peer
  FROM public.chat_channels c
  JOIN public.chat_channel_members m ON m.channel_id = c.id AND m.user_id <> auth.uid()
  WHERE c.id = p_channel_id AND c.kind = 'dm'
  LIMIT 1;

  IF peer IS NOT NULL AND public.chat_users_blocked(auth.uid(), peer) THEN
    RAISE EXCEPTION 'you cannot message this person';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_assert_can_send(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.chat_assert_can_send(uuid) TO authenticated;

DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
CREATE POLICY chat_messages_insert ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_access_chat_channel(channel_id)
    AND NOT EXISTS (
      SELECT 1
      FROM public.chat_channels c
      JOIN public.chat_channel_members m
        ON m.channel_id = c.id AND m.user_id <> auth.uid()
      WHERE c.id = channel_id
        AND c.kind = 'dm'
        AND public.chat_users_blocked(auth.uid(), m.user_id)
    )
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  true,
  15728640,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'audio/mpeg',
    'audio/wav',
    'video/mp4'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS chat_attachments_read ON storage.objects;
CREATE POLICY chat_attachments_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'chat-attachments');

DROP POLICY IF EXISTS chat_attachments_write ON storage.objects;
CREATE POLICY chat_attachments_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS chat_attachments_update ON storage.objects;
CREATE POLICY chat_attachments_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS chat_attachments_delete ON storage.objects;
CREATE POLICY chat_attachments_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_reactions;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
