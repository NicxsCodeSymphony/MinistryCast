-- Two-step member join approvals: church admin(s) first, then superadmin.
-- New church creation remains superadmin-only (existing review_signup).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS approval_phase text;

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS chk_users_approval_phase;

ALTER TABLE public.users
  ADD CONSTRAINT chk_users_approval_phase
  CHECK (
    approval_phase IS NULL
    OR approval_phase IN ('church', 'platform')
  );

COMMENT ON COLUMN public.users.approval_phase IS
  'When status=pending: church = await church admin, platform = await superadmin. NULL when not in a join queue.';

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
  trimmed_name text := trim(p_name);
  trimmed_church text := trim(p_church_name);
  joining boolean := p_church_id IS NOT NULL;
  member_role text;
  member_phase text;
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
    SELECT c.id, c.status INTO new_church_id, church_status
    FROM public.churches c
    WHERE c.id = p_church_id
      AND c.id <> '00000000-0000-0000-0000-000000000001'::uuid
      AND c.status = 'active';

    IF new_church_id IS NULL THEN
      RAISE EXCEPTION 'Select an active church to join, or create a new one.';
    END IF;

    -- Joining an existing ministry: church member, wait for church admin then platform.
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

    -- Founding admin of a new church: superadmin reviews the church.
    member_role := 'admin';
    member_phase := NULL;
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

  INSERT INTO public.chat_channels (id, kind, church_id, name, created_by, created_at, updated_at)
  SELECT gen_random_uuid(), 'church', new_church_id, 'general', uid, now(), now()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.chat_channels ch
    WHERE ch.kind = 'church' AND ch.church_id = new_church_id AND ch.name = 'general'
  );

  RETURN public.get_session_profile();
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_signup(text, text, uuid) TO authenticated;

-- Prefer active churches for join suggestions (still show pending for awareness).
CREATE OR REPLACE FUNCTION public.suggest_churches(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := lower(trim(both from coalesce(p_query, '')));
  q_compact text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  q := regexp_replace(q, '\s+', ' ', 'g');
  q_compact := replace(q, ' ', '');

  IF char_length(q) < 1 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_data ORDER BY sort_rank, sort_name)
    FROM (
      SELECT
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'status', c.status
        ) AS row_data,
        CASE
          WHEN c.status = 'active' AND lower(c.name) = q THEN 0
          WHEN c.status = 'active' AND lower(c.name) LIKE q || '%' THEN 1
          WHEN c.status = 'active' THEN 2
          ELSE 5
        END AS sort_rank,
        c.name AS sort_name
      FROM public.churches c
      WHERE c.id <> '00000000-0000-0000-0000-000000000001'::uuid
        AND c.status IN ('active', 'pending', 'offline')
        AND (
          lower(c.name) LIKE '%' || q || '%'
          OR replace(lower(c.name), ' ', '') LIKE '%' || q_compact || '%'
          OR (
            SELECT bool_and(lower(c.name) LIKE '%' || w || '%')
            FROM unnest(string_to_array(q, ' ')) AS w
            WHERE w <> ''
          )
        )
      ORDER BY sort_rank, c.name
      LIMIT 8
    ) matched
  ), '[]'::jsonb);
END;
$$;

-- Unified approval inbox for church admins + superadmin.
CREATE OR REPLACE FUNCTION public.list_approval_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  me uuid := auth.uid();
  my_church uuid;
  rows jsonb := '[]'::jsonb;
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF public.is_superadmin() THEN
    rows := coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', 'church',
        'id', c.id,
        'church_id', c.id,
        'church_name', c.name,
        'church_email', c.email,
        'status', c.status,
        'phase', 'platform',
        'created_at', c.created_at,
        'applicant_id', u.id,
        'applicant_name', u.name,
        'applicant_email', u.email,
        'applicant_role', u.role
      ) ORDER BY c.created_at DESC)
      FROM public.churches c
      JOIN public.users u
        ON u.church_id = c.id
       AND u.role = 'admin'
       AND u.status = 'pending'
      WHERE c.status IN ('pending', 'rejected')
        AND c.id <> '00000000-0000-0000-0000-000000000001'::uuid
    ), '[]'::jsonb);

    rows := rows || coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'kind', 'member',
        'id', u.id,
        'church_id', c.id,
        'church_name', c.name,
        'church_email', c.email,
        'status', u.status,
        'phase', u.approval_phase,
        'created_at', u.created_at,
        'applicant_id', u.id,
        'applicant_name', u.name,
        'applicant_email', u.email,
        'applicant_role', u.role
      ) ORDER BY u.created_at DESC)
      FROM public.users u
      JOIN public.churches c ON c.id = u.church_id
      WHERE u.status = 'pending'
        AND u.approval_phase = 'platform'
        AND u.role <> 'superadmin'
        AND c.id <> '00000000-0000-0000-0000-000000000001'::uuid
    ), '[]'::jsonb);

    RETURN rows;
  END IF;

  IF NOT (
    public.is_active_member()
    AND public.has_role(ARRAY['admin'])
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  my_church := public.app_church_id();
  IF my_church IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'kind', 'member',
      'id', u.id,
      'church_id', c.id,
      'church_name', c.name,
      'church_email', c.email,
      'status', u.status,
      'phase', u.approval_phase,
      'created_at', u.created_at,
      'applicant_id', u.id,
      'applicant_name', u.name,
      'applicant_email', u.email,
      'applicant_role', u.role
    ) ORDER BY u.created_at DESC)
    FROM public.users u
    JOIN public.churches c ON c.id = u.church_id
    WHERE u.church_id = my_church
      AND u.status = 'pending'
      AND u.approval_phase = 'church'
      AND u.id <> me
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.list_approval_requests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_approval_requests() TO authenticated;

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
        approval_phase = 'platform',
        updated_at = now()
      WHERE id = target.id;
    ELSE
      UPDATE public.users
      SET
        status = 'disabled',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;
    END IF;
  ELSIF target.approval_phase = 'platform' THEN
    IF NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'only superadmin can finish member approval';
    END IF;

    IF action = 'approve' THEN
      UPDATE public.users
      SET
        status = 'active',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;
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

REVOKE ALL ON FUNCTION public.review_member_join(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_member_join(uuid, text) TO authenticated;

-- Keep legacy list/review for churches; also return via list_approval_requests.
CREATE OR REPLACE FUNCTION public.list_signup_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.list_approval_requests();
END;
$$;

CREATE OR REPLACE FUNCTION public.review_signup(p_church_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action text := lower(trim(p_action));
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
