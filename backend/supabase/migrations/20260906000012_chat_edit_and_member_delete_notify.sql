-- Chat message editing + notify church team when a member deletes their account.

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

CREATE OR REPLACE FUNCTION public.edit_chat_message(
  p_message_id uuid,
  p_body text,
  p_attachment_url text DEFAULT NULL,
  p_attachment_mime text DEFAULT NULL,
  p_attachment_name text DEFAULT NULL,
  p_clear_attachment boolean DEFAULT false
)
RETURNS public.chat_messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  msg public.chat_messages%ROWTYPE;
  next_body text := coalesce(p_body, '');
  next_url text;
  next_mime text;
  next_name text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO msg FROM public.chat_messages WHERE id = p_message_id;
  IF msg.id IS NULL THEN
    RAISE EXCEPTION 'message not found';
  END IF;
  IF msg.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF msg.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'message deleted';
  END IF;
  IF NOT public.can_access_chat_channel(msg.channel_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_clear_attachment THEN
    next_url := NULL;
    next_mime := NULL;
    next_name := NULL;
  ELSIF p_attachment_url IS NOT NULL AND char_length(trim(p_attachment_url)) > 0 THEN
    next_url := trim(p_attachment_url);
    next_mime := nullif(trim(coalesce(p_attachment_mime, '')), '');
    next_name := nullif(trim(coalesce(p_attachment_name, '')), '');
  ELSE
    next_url := msg.attachment_url;
    next_mime := msg.attachment_mime;
    next_name := msg.attachment_name;
  END IF;

  next_body := trim(next_body);
  IF char_length(next_body) = 0 AND next_url IS NULL THEN
    RAISE EXCEPTION 'message is empty';
  END IF;
  IF char_length(next_body) = 0 AND next_url IS NOT NULL THEN
    next_body := ' ';
  END IF;
  IF char_length(next_body) > 4000 THEN
    RAISE EXCEPTION 'message too long';
  END IF;

  UPDATE public.chat_messages
  SET
    body = next_body,
    attachment_url = next_url,
    attachment_mime = next_mime,
    attachment_name = next_name,
    edited_at = now()
  WHERE id = p_message_id
  RETURNING * INTO msg;

  UPDATE public.chat_channels
  SET updated_at = now()
  WHERE id = msg.channel_id;

  RETURN msg;
END;
$$;

REVOKE ALL ON FUNCTION public.edit_chat_message(uuid, text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.edit_chat_message(uuid, text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  current_role text;
  church uuid;
  member_name text;
  member_avatar text;
  teammate record;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT role, church_id, name, avatar_url
  INTO current_role, church, member_name, member_avatar
  FROM public.users
  WHERE id = uid;

  IF current_role IS NULL THEN
    -- Profile already gone; allow auth cleanup to continue.
    RETURN;
  END IF;

  IF current_role = 'superadmin'
     AND (
       SELECT count(*) FROM public.users
       WHERE role = 'superadmin' AND status = 'active'
     ) <= 1 THEN
    RAISE EXCEPTION 'cannot delete the last superadmin account';
  END IF;

  -- Notify remaining church teammates before the profile row is removed.
  IF church IS NOT NULL THEN
    FOR teammate IN
      SELECT id
      FROM public.users
      WHERE church_id = church
        AND id <> uid
        AND status = 'active'
    LOOP
      PERFORM public.create_user_notification(
        teammate.id,
        'team',
        'notif.memberDeleted',
        coalesce(nullif(trim(member_name), ''), 'A teammate'),
        'person_remove',
        uid,
        member_avatar,
        '/settings#team'
      );
    END LOOP;
  END IF;

  DELETE FROM public.users WHERE id = uid;
END;
$$;
