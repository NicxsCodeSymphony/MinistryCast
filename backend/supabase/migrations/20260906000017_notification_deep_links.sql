-- Notification deep links: query tabs (HashRouter-safe) + chat channel targets.

-- Rewrite legacy hash hrefs already stored.
UPDATE public.notifications
SET href = '/settings?tab=approvals'
WHERE href = '/settings#approvals';

UPDATE public.notifications
SET href = '/settings?tab=team'
WHERE href = '/settings#team';

UPDATE public.notifications
SET href = '/settings?tab=notifications'
WHERE href IN ('/settings#notifications', '/settings#general');

-- Normalize legacy hash hrefs if any caller still passes them.
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
  v_href text := nullif(trim(coalesce(p_href, '')), '');
BEGIN
  IF p_user_id IS NULL OR p_title IS NULL OR p_body IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_kind NOT IN ('chat', 'presentation', 'team', 'system') THEN
    RETURN NULL;
  END IF;

  -- Hash fragments fight createHashRouter (#/path). Prefer ?tab=.
  IF v_href = '/settings#approvals' THEN
    v_href := '/settings?tab=approvals';
  ELSIF v_href = '/settings#team' THEN
    v_href := '/settings?tab=team';
  ELSIF v_href IN ('/settings#notifications', '/settings#general') THEN
    v_href := '/settings?tab=notifications';
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
    v_href
  )
  RETURNING id INTO nid;
  RETURN nid;
END;
$$;

-- Chat alerts open the exact channel.
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

-- Member-deleted alerts → Team tab.
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
    RETURN;
  END IF;

  IF current_role = 'superadmin'
     AND (
       SELECT count(*) FROM public.users
       WHERE role = 'superadmin' AND status = 'active'
     ) <= 1 THEN
    RAISE EXCEPTION 'cannot delete the last superadmin account';
  END IF;

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
        '/settings?tab=team'
      );
    END LOOP;
  END IF;

  DELETE FROM public.users WHERE id = uid;
END;
$$;

-- Join / approve notifications → Settings tabs or church chat channel.
CREATE OR REPLACE FUNCTION public.review_member_join(
  p_user_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action text := lower(trim(p_action));
  target public.users%ROWTYPE;
  me uuid := auth.uid();
  church_label text;
  channel_id uuid;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  SELECT * INTO target
  FROM public.users
  WHERE id = p_user_id
    AND status = 'pending'
    AND approval_phase IN ('church', 'platform');

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF target.approval_phase = 'church' THEN
    IF NOT (
      public.is_active_member()
      AND public.has_role(ARRAY['admin'])
      AND public.app_church_id() = target.church_id
    ) AND NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'only that church''s admins can approve this join';
    END IF;

    IF action = 'approve' THEN
      UPDATE public.users
      SET
        status = 'active',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;

      channel_id := public.join_user_to_church_chat(target.id, target.church_id);

      SELECT name INTO church_label FROM public.churches WHERE id = target.church_id;
      PERFORM public.create_user_notification(
        target.id,
        'team',
        'notif.joinApproved',
        coalesce(church_label, 'Your church'),
        'check_circle',
        me,
        NULL,
        CASE
          WHEN channel_id IS NOT NULL THEN '/chat?channel=' || channel_id::text
          ELSE '/chat'
        END
      );
    ELSE
      UPDATE public.users
      SET
        status = 'disabled',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;
    END IF;
  ELSIF target.approval_phase = 'platform' THEN
    IF NOT public.is_superadmin()
       AND NOT (
         public.is_active_member()
         AND public.has_role(ARRAY['admin'])
         AND public.app_church_id() = target.church_id
       ) THEN
      RAISE EXCEPTION 'only that church''s admins or superadmin can finish member approval';
    END IF;

    IF action = 'approve' THEN
      UPDATE public.users
      SET
        status = 'active',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;

      channel_id := public.join_user_to_church_chat(target.id, target.church_id);

      SELECT name INTO church_label FROM public.churches WHERE id = target.church_id;
      PERFORM public.create_user_notification(
        target.id,
        'team',
        'notif.joinApproved',
        coalesce(church_label, 'Your church'),
        'check_circle',
        me,
        NULL,
        CASE
          WHEN channel_id IS NOT NULL THEN '/chat?channel=' || channel_id::text
          ELSE '/chat'
        END
      );
    ELSE
      UPDATE public.users
      SET
        status = 'disabled',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;
    END IF;
  END IF;

  RETURN public.list_approval_requests();
END;
$$;

-- complete_signup join-request href (normalization also covers # → ?tab=).
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
  church_status text;
  church_label text;
  trimmed_name text := trim(p_name);
  trimmed_church text := trim(p_church_name);
  joining boolean := p_church_id IS NOT NULL;
  member_role text;
  member_phase text;
  recipient record;
  actor_avatar text;
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

  IF joining THEN
    SELECT c.id, c.status, c.name
    INTO new_church_id, church_status, church_label
    FROM public.churches c
    WHERE c.id = p_church_id
      AND c.id <> '00000000-0000-0000-0000-000000000001'::uuid
      AND c.status = 'active';

    IF new_church_id IS NULL THEN
      RAISE EXCEPTION 'Select an active church to join, or create a new one.';
    END IF;

    member_role := 'operator';
    member_phase := 'church';
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

    member_role := 'admin';
    member_phase := NULL;
    church_label := trimmed_church;
  END IF;

  INSERT INTO public.users (
    id,
    church_id,
    name,
    email,
    email_verified_at,
    role,
    status,
    approval_phase,
    created_at,
    updated_at
  ) VALUES (
    uid,
    new_church_id,
    trimmed_name,
    auth_email,
    now(),
    member_role,
    'pending',
    member_phase,
    now(),
    now()
  );

  -- Only brand-new churches get a group chat here. Joining reuses the existing one.
  IF NOT joining THEN
    PERFORM public.church_group_chat_id(new_church_id);
  END IF;

  IF joining THEN
    SELECT avatar_url INTO actor_avatar FROM public.users WHERE id = uid;

    FOR recipient IN
      SELECT u.id
      FROM public.users u
      WHERE u.status = 'active'
        AND (
          (u.church_id = new_church_id AND u.role = 'admin')
          OR u.role = 'superadmin'
        )
    LOOP
      PERFORM public.create_user_notification(
        recipient.id,
        'team',
        'notif.joinRequest',
        trimmed_name || ' · ' || coalesce(church_label, trimmed_church),
        'person_add',
        uid,
        actor_avatar,
        '/settings?tab=approvals'
      );
    END LOOP;
  ELSE
    FOR recipient IN
      SELECT u.id
      FROM public.users u
      WHERE u.status = 'active' AND u.role = 'superadmin'
    LOOP
      PERFORM public.create_user_notification(
        recipient.id,
        'team',
        'notif.newChurch',
        coalesce(church_label, trimmed_church) || ' · ' || trimmed_name,
        'church',
        uid,
        NULL,
        '/admin'
      );
    END LOOP;
  END IF;

  RETURN public.get_session_profile();
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_signup(text, text, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
