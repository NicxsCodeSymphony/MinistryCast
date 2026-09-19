-- Hide orphan/self DMs from inbox (no other member → looked like chatting yourself).

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
    SELECT jsonb_agg(row_data ORDER BY sort_at DESC NULLS LAST)
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
          'last_message_at', last_msg.at,
          'last_sender_id', last_msg.sender_id,
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
        coalesce(last_msg.at, c.updated_at) AS sort_at
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
      LEFT JOIN LATERAL (
        SELECT m.created_at AS at, m.sender_id
        FROM public.chat_messages m
        WHERE m.channel_id = c.id
          AND m.deleted_at IS NULL
        ORDER BY m.created_at DESC
        LIMIT 1
      ) last_msg ON true
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
            AND peer.id IS NOT NULL
            AND peer.id <> me
            AND EXISTS (
              SELECT 1 FROM public.chat_channel_members m2
              WHERE m2.channel_id = c.id AND m2.user_id = me
            )
            AND NOT public.chat_users_blocked(me, peer.id)
          )
        )
    ) q
  ), '[]'::jsonb);
END;
$$;
