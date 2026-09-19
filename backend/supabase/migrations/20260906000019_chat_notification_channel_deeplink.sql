-- Backfill chat notification hrefs with channel when possible; ensure trigger uses channel deep link.

UPDATE public.notifications n
SET href = '/chat?channel=' || m.channel_id::text
FROM public.chat_messages m
WHERE n.kind = 'chat'
  AND n.actor_id IS NOT NULL
  AND (n.href IS NULL OR n.href = '/chat' OR n.href LIKE '/chat?peer=%')
  AND m.sender_id = n.actor_id
  AND m.created_at BETWEEN n.created_at - interval '2 minutes' AND n.created_at + interval '2 minutes'
  AND m.deleted_at IS NULL;

-- Fallback: still point at chat with peer so the client can open the DM.
UPDATE public.notifications
SET href = '/chat?peer=' || actor_id::text
WHERE kind = 'chat'
  AND actor_id IS NOT NULL
  AND (href IS NULL OR href = '/chat');

CREATE OR REPLACE FUNCTION public.notify_chat_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor public.users%ROWTYPE;
  member record;
  preview text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO actor FROM public.users WHERE id = NEW.sender_id;
  preview := nullif(trim(coalesce(NEW.body, '')), '');
  IF preview IS NULL AND NEW.attachment_url IS NOT NULL THEN
    preview := 'Sent a photo';
  END IF;
  IF preview IS NULL THEN
    preview := 'New message';
  END IF;
  preview := left(preview, 120);

  FOR member IN
    SELECT m.user_id
    FROM public.chat_channel_members m
    WHERE m.channel_id = NEW.channel_id
      AND m.user_id <> NEW.sender_id
  LOOP
    PERFORM public.create_user_notification(
      member.user_id,
      'chat',
      coalesce(actor.name, 'New chat message'),
      preview,
      'chat',
      NEW.sender_id,
      actor.avatar_url,
      '/chat?channel=' || NEW.channel_id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
