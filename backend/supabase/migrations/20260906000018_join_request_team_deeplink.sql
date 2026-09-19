-- Join-request notifications: church admins → Team Accounts; superadmins → Approvals.

UPDATE public.notifications n
SET href = '/settings?tab=team'
FROM public.users u
WHERE n.user_id = u.id
  AND n.title = 'notif.joinRequest'
  AND n.href IN (
    '/settings?tab=approvals',
    '/settings#approvals',
    '/settings'
  )
  AND u.role IS DISTINCT FROM 'superadmin';

UPDATE public.notifications n
SET href = '/settings?tab=approvals'
FROM public.users u
WHERE n.user_id = u.id
  AND n.title = 'notif.joinRequest'
  AND n.href IN ('/settings?tab=team', '/settings#team', '/settings')
  AND u.role = 'superadmin';

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

  IF NOT joining THEN
    PERFORM public.church_group_chat_id(new_church_id);
  END IF;

  IF joining THEN
    SELECT avatar_url INTO actor_avatar FROM public.users WHERE id = uid;

    FOR recipient IN
      SELECT u.id, u.role
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
        CASE
          WHEN recipient.role = 'superadmin' THEN '/settings?tab=approvals'
          ELSE '/settings?tab=team'
        END
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
