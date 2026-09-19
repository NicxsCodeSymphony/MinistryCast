-- Fix: join-request notifications, one church group chat, auto-join on approve,
-- and sermon_slides RLS for upserts.

-- ---------------------------------------------------------------------------
-- One group chat per church: keep oldest, move members, drop duplicates.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  keep_id uuid;
  dup_id uuid;
BEGIN
  FOR r IN
    SELECT church_id
    FROM public.chat_channels
    WHERE kind = 'church' AND church_id IS NOT NULL
    GROUP BY church_id
    HAVING count(*) > 1
  LOOP
    SELECT id INTO keep_id
    FROM public.chat_channels
    WHERE kind = 'church' AND church_id = r.church_id
    ORDER BY created_at ASC, id ASC
    LIMIT 1;

    FOR dup_id IN
      SELECT id
      FROM public.chat_channels
      WHERE kind = 'church'
        AND church_id = r.church_id
        AND id <> keep_id
    LOOP
      INSERT INTO public.chat_channel_members (channel_id, user_id)
      SELECT keep_id, m.user_id
      FROM public.chat_channel_members m
      WHERE m.channel_id = dup_id
      ON CONFLICT DO NOTHING;

      UPDATE public.chat_messages
      SET channel_id = keep_id
      WHERE channel_id = dup_id;

      DELETE FROM public.chat_channel_hides WHERE channel_id = dup_id;
      DELETE FROM public.chat_channel_members WHERE channel_id = dup_id;
      DELETE FROM public.chat_channels WHERE id = dup_id;
    END LOOP;
  END LOOP;
END $$;

-- Rename remaining church channels to the church name.
UPDATE public.chat_channels ch
SET name = c.name, updated_at = now()
FROM public.churches c
WHERE ch.kind = 'church'
  AND ch.church_id = c.id
  AND ch.name IS DISTINCT FROM c.name;

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_channels_one_per_church
  ON public.chat_channels (church_id)
  WHERE kind = 'church' AND church_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.church_group_chat_id(p_church_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_id uuid;
  church_name text;
BEGIN
  IF p_church_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT name INTO church_name FROM public.churches WHERE id = p_church_id;
  church_name := nullif(trim(coalesce(church_name, '')), '');
  IF church_name IS NULL THEN
    church_name := 'Church';
  END IF;

  SELECT id INTO channel_id
  FROM public.chat_channels
  WHERE kind = 'church' AND church_id = p_church_id
  ORDER BY created_at ASC, id ASC
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

REVOKE ALL ON FUNCTION public.church_group_chat_id(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.join_user_to_church_chat(
  p_user_id uuid,
  p_church_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channel_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_church_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_channel_id := public.church_group_chat_id(p_church_id);
  IF v_channel_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.chat_channel_members (channel_id, user_id)
  VALUES (v_channel_id, p_user_id)
  ON CONFLICT DO NOTHING;

  DELETE FROM public.chat_channel_hides
  WHERE channel_id = v_channel_id AND user_id = p_user_id;

  RETURN v_channel_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_user_to_church_chat(uuid, uuid) FROM PUBLIC;

-- Ensure every active church member is in their church group chat.
DO $$
DECLARE
  u record;
BEGIN
  FOR u IN
    SELECT id, church_id
    FROM public.users
    WHERE status = 'active'
      AND church_id IS NOT NULL
      AND role <> 'superadmin'
  LOOP
    PERFORM public.join_user_to_church_chat(u.id, u.church_id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.ensure_church_chat(p_church_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_id uuid;
  me uuid := auth.uid();
BEGIN
  IF p_church_id IS NULL THEN
    RAISE EXCEPTION 'church required';
  END IF;
  IF NOT (public.is_superadmin() OR public.in_church(p_church_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  channel_id := public.church_group_chat_id(p_church_id);

  IF me IS NOT NULL AND public.is_active_member() THEN
    INSERT INTO public.chat_channel_members (channel_id, user_id)
    VALUES (channel_id, me)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN channel_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Signup: never create a second church chat when joining; notify team.
-- ---------------------------------------------------------------------------
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
        '/settings#approvals'
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

-- ---------------------------------------------------------------------------
-- Approve → activate + auto-join the single church group chat.
-- ---------------------------------------------------------------------------
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

      PERFORM public.join_user_to_church_chat(target.id, target.church_id);

      SELECT name INTO church_label FROM public.churches WHERE id = target.church_id;
      PERFORM public.create_user_notification(
        target.id,
        'team',
        'notif.joinApproved',
        coalesce(church_label, 'Your church'),
        'check_circle',
        me,
        NULL,
        '/chat'
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

      PERFORM public.join_user_to_church_chat(target.id, target.church_id);

      SELECT name INTO church_label FROM public.churches WHERE id = target.church_id;
      PERFORM public.create_user_notification(
        target.id,
        'team',
        'notif.joinApproved',
        coalesce(church_label, 'Your church'),
        'check_circle',
        me,
        NULL,
        '/chat'
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

-- When a new church is approved, ensure the founder is in the group chat.
CREATE OR REPLACE FUNCTION public.review_signup(p_church_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action text := lower(trim(p_action));
  founder record;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.churches
    WHERE id = p_church_id
      AND status IN ('pending', 'rejected')
      AND id <> '00000000-0000-0000-0000-000000000001'::uuid
  ) THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF action = 'approve' THEN
    UPDATE public.churches
    SET
      status = 'active',
      approved_at = now(),
      approved_by = auth.uid(),
      updated_at = now()
    WHERE id = p_church_id;

    UPDATE public.users
    SET
      status = 'active',
      approval_phase = NULL,
      updated_at = now()
    WHERE church_id = p_church_id
      AND status = 'pending'
      AND approval_phase IS NULL;

    PERFORM public.church_group_chat_id(p_church_id);

    FOR founder IN
      SELECT id FROM public.users
      WHERE church_id = p_church_id AND status = 'active'
    LOOP
      PERFORM public.join_user_to_church_chat(founder.id, p_church_id);
    END LOOP;
  ELSE
    UPDATE public.churches
    SET
      status = 'rejected',
      approved_at = NULL,
      approved_by = auth.uid(),
      updated_at = now()
    WHERE id = p_church_id;

    UPDATE public.users
    SET
      status = 'disabled',
      approval_phase = NULL,
      updated_at = now()
    WHERE church_id = p_church_id;
  END IF;

  RETURN public.list_approval_requests();
END;
$$;

-- ---------------------------------------------------------------------------
-- sermon_slides RLS: split policies so upserts (INSERT+UPDATE) succeed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_edit_sermon(p_sermon_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_sermon_id IS NOT NULL
    AND (
      public.is_superadmin()
      OR (
        public.has_role(ARRAY['admin', 'producer'])
        AND public.can_use_sermon(p_sermon_id)
      )
    )
$$;

DROP POLICY IF EXISTS sermon_slides_mutate ON public.sermon_slides;
DROP POLICY IF EXISTS sermon_slides_insert ON public.sermon_slides;
DROP POLICY IF EXISTS sermon_slides_update ON public.sermon_slides;
DROP POLICY IF EXISTS sermon_slides_delete ON public.sermon_slides;

CREATE POLICY sermon_slides_insert ON public.sermon_slides
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_sermon(sermon_id));

CREATE POLICY sermon_slides_update ON public.sermon_slides
  FOR UPDATE TO authenticated
  USING (public.can_edit_sermon(sermon_id))
  WITH CHECK (public.can_edit_sermon(sermon_id));

CREATE POLICY sermon_slides_delete ON public.sermon_slides
  FOR DELETE TO authenticated
  USING (public.can_edit_sermon(sermon_id));

DROP POLICY IF EXISTS sermon_notes_mutate ON public.sermon_notes;
DROP POLICY IF EXISTS sermon_notes_insert ON public.sermon_notes;
DROP POLICY IF EXISTS sermon_notes_update ON public.sermon_notes;
DROP POLICY IF EXISTS sermon_notes_delete ON public.sermon_notes;

CREATE POLICY sermon_notes_insert ON public.sermon_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_sermon(sermon_id));

CREATE POLICY sermon_notes_update ON public.sermon_notes
  FOR UPDATE TO authenticated
  USING (public.can_edit_sermon(sermon_id))
  WITH CHECK (public.can_edit_sermon(sermon_id));

CREATE POLICY sermon_notes_delete ON public.sermon_notes
  FOR DELETE TO authenticated
  USING (public.can_edit_sermon(sermon_id));

NOTIFY pgrst, 'reload schema';
