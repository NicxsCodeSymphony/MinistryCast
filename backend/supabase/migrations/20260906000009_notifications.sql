-- In-app notifications + per-user preference toggles.

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  chat boolean NOT NULL DEFAULT true,
  presentation boolean NOT NULL DEFAULT true,
  team boolean NOT NULL DEFAULT true,
  system boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('chat', 'presentation', 'team', 'system')),
  title text NOT NULL,
  body text NOT NULL,
  icon text,
  actor_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  actor_avatar_url text,
  href text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_preferences_own ON public.notification_preferences;
CREATE POLICY notification_preferences_own ON public.notification_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.ensure_notification_preferences(p_user_id uuid DEFAULT auth.uid())
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.notification_preferences;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  INSERT INTO public.notification_preferences (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO row FROM public.notification_preferences WHERE user_id = p_user_id;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_notification_preferences(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_notification_preferences(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_notification_preferences()
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN public.ensure_notification_preferences(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.get_notification_preferences() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_notification_preferences() TO authenticated;

CREATE OR REPLACE FUNCTION public.update_notification_preferences(
  p_enabled boolean DEFAULT NULL,
  p_chat boolean DEFAULT NULL,
  p_presentation boolean DEFAULT NULL,
  p_team boolean DEFAULT NULL,
  p_system boolean DEFAULT NULL
)
RETURNS public.notification_preferences
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row public.notification_preferences;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  PERFORM public.ensure_notification_preferences(auth.uid());
  UPDATE public.notification_preferences
  SET
    enabled = coalesce(p_enabled, enabled),
    chat = coalesce(p_chat, chat),
    presentation = coalesce(p_presentation, presentation),
    team = coalesce(p_team, team),
    system = coalesce(p_system, system),
    updated_at = now()
  WHERE user_id = auth.uid()
  RETURNING * INTO row;
  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_notification_preferences(boolean, boolean, boolean, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_user_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_icon text DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_actor_avatar_url text DEFAULT NULL,
  p_href text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefs public.notification_preferences;
  nid uuid;
  kind_ok boolean;
BEGIN
  IF p_user_id IS NULL OR p_title IS NULL OR p_body IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_kind NOT IN ('chat', 'presentation', 'team', 'system') THEN
    RETURN NULL;
  END IF;

  prefs := public.ensure_notification_preferences(p_user_id);
  IF NOT prefs.enabled THEN
    RETURN NULL;
  END IF;

  kind_ok := CASE p_kind
    WHEN 'chat' THEN prefs.chat
    WHEN 'presentation' THEN prefs.presentation
    WHEN 'team' THEN prefs.team
    ELSE prefs.system
  END;
  IF NOT kind_ok THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (
    user_id, kind, title, body, icon, actor_id, actor_avatar_url, href
  )
  VALUES (
    p_user_id,
    p_kind,
    left(trim(p_title), 160),
    left(trim(p_body), 500),
    nullif(trim(coalesce(p_icon, '')), ''),
    p_actor_id,
    nullif(trim(coalesce(p_actor_avatar_url, '')), ''),
    nullif(trim(coalesce(p_href, '')), '')
  )
  RETURNING id INTO nid;
  RETURN nid;
END;
$$;

-- Internal helper for triggers / other SECURITY DEFINER functions only.
REVOKE ALL ON FUNCTION public.create_user_notification(uuid, text, text, text, text, uuid, text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.list_my_notifications(p_limit int DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT
        n.id,
        n.kind,
        n.title,
        n.body,
        n.icon,
        n.actor_id,
        n.actor_avatar_url,
        n.href,
        n.read_at,
        n.created_at
      FROM public.notifications n
      WHERE n.user_id = me
      ORDER BY n.created_at DESC
      LIMIT greatest(1, least(coalesce(p_limit, 40), 100))
    ) q
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_my_notifications(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_my_notifications(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.notifications
  SET read_at = coalesce(read_at, now())
  WHERE id = p_id AND user_id = auth.uid();
  RETURN found;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.notifications
  SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- Notify other chat members when a message is sent (respects preferences).
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
      '/chat'
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_chat_message_insert ON public.chat_messages;
CREATE TRIGGER trg_notify_chat_message_insert
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_message_insert();

-- Storage deletes: replace photo / account purge.
DROP POLICY IF EXISTS avatars_delete ON storage.objects;
CREATE POLICY avatars_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.is_superadmin()
    )
  );

DROP POLICY IF EXISTS church_photos_delete ON storage.objects;
CREATE POLICY church_photos_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'church-photos'
    AND (
      public.is_superadmin()
      OR (
        public.has_role(ARRAY['admin'])
        AND (storage.foldername(name))[1] = public.app_church_id()::text
      )
    )
  );

DROP POLICY IF EXISTS chat_attachments_delete_superadmin ON storage.objects;
CREATE POLICY chat_attachments_delete_superadmin ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND public.is_superadmin()
  );

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
