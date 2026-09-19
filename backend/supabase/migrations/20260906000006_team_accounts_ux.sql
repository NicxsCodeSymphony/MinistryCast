-- Team accounts: richer roster fields + safer admin updates (no email/password).

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS phone text;

CREATE OR REPLACE FUNCTION public.church_list_accounts()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  church uuid := public.app_church_id();
BEGIN
  IF NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT (public.is_superadmin() OR public.has_role(ARRAY['admin'])) THEN
    RAISE EXCEPTION 'only church admins can manage accounts';
  END IF;
  IF church IS NULL AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'no church workspace';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(q)::jsonb ORDER BY q.created_at DESC)
    FROM (
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.avatar_url,
        u.role,
        u.status,
        u.approval_phase,
        u.church_id,
        c.name AS church_name,
        u.created_at,
        u.updated_at
      FROM public.users u
      JOIN public.churches c ON c.id = u.church_id
      WHERE u.church_id = church
        AND u.role <> 'superadmin'
    ) q
  ), '[]'::jsonb);
END;
$$;

DROP FUNCTION IF EXISTS public.church_update_account(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.church_update_account(
  p_user_id uuid,
  p_name text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  church uuid := public.app_church_id();
  me uuid := auth.uid();
  next_role text := nullif(trim(coalesce(p_role, '')), '');
  next_status text := nullif(trim(coalesce(p_status, '')), '');
  next_phone text;
  target public.users%ROWTYPE;
  admin_count int;
  touch_phone boolean := p_phone IS NOT NULL;
BEGIN
  IF me IS NULL OR NOT public.is_active_member() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT (public.is_superadmin() OR public.has_role(ARRAY['admin'])) THEN
    RAISE EXCEPTION 'only church admins can manage accounts';
  END IF;
  IF church IS NULL THEN
    RAISE EXCEPTION 'no church workspace';
  END IF;

  SELECT * INTO target
  FROM public.users
  WHERE id = p_user_id
    AND church_id = church
    AND role <> 'superadmin';

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'account not found in your church';
  END IF;

  IF next_role IS NOT NULL
     AND next_role NOT IN ('admin', 'producer', 'operator') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  IF next_status IS NOT NULL
     AND next_status NOT IN ('pending', 'active', 'disabled') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  IF touch_phone THEN
    next_phone := nullif(trim(p_phone), '');
  END IF;

  -- Keep at least one active church admin.
  IF target.role = 'admin' AND target.status = 'active' THEN
    SELECT count(*) INTO admin_count
    FROM public.users
    WHERE church_id = church
      AND role = 'admin'
      AND status = 'active';

    IF admin_count <= 1 THEN
      IF next_role IS NOT NULL AND next_role <> 'admin' THEN
        RAISE EXCEPTION 'cannot demote the last church admin';
      END IF;
      IF next_status IS NOT NULL AND next_status <> 'active' THEN
        RAISE EXCEPTION 'cannot disable the last church admin';
      END IF;
    END IF;
  END IF;

  IF p_user_id = me AND next_status IS NOT NULL AND next_status <> 'active' THEN
    RAISE EXCEPTION 'you cannot disable your own account here';
  END IF;

  -- Email and password are never changed here — members update those on their own profile.
  UPDATE public.users
  SET
    name = coalesce(nullif(trim(coalesce(p_name, '')), ''), name),
    phone = CASE WHEN touch_phone THEN next_phone ELSE phone END,
    role = coalesce(next_role, role),
    status = coalesce(next_status, status),
    approval_phase = CASE
      WHEN coalesce(next_status, status) = 'active' THEN NULL
      ELSE approval_phase
    END,
    updated_at = now()
  WHERE id = p_user_id;

  RETURN public.church_list_accounts();
END;
$$;

REVOKE ALL ON FUNCTION public.church_update_account(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.church_update_account(uuid, text, text, text, text) TO authenticated;
