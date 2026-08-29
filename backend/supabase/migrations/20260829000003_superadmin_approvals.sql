-- Superadmin role, church reject status, approval RPCs.
-- Seeded account: edisannico+superadmin@gmail.com (see supabase/seed.sql)

ALTER TABLE public.users DROP CONSTRAINT chk_users_role;
ALTER TABLE public.users ADD CONSTRAINT chk_users_role
  CHECK (role IN ('superadmin', 'admin', 'producer', 'operator'));

ALTER TABLE public.churches DROP CONSTRAINT chk_churches_status;
ALTER TABLE public.churches ADD CONSTRAINT chk_churches_status
  CHECK (status IN ('pending', 'active', 'suspended', 'offline', 'rejected'));

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND role = 'superadmin'
      AND status = 'active'
  )
$$;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, anon, service_role;

CREATE OR REPLACE FUNCTION public.protect_user_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'role', '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_superadmin() THEN
    RETURN NEW;
  END IF;

  IF public.has_role(ARRAY['admin']) AND OLD.church_id = public.app_church_id() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.church_id IS DISTINCT FROM OLD.church_id
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'only a church admin can change role, status, church, or email';
  END IF;

  RETURN NEW;
END;
$$;

CREATE POLICY churches_select_superadmin ON public.churches
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY churches_update_superadmin ON public.churches
  FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY users_select_superadmin ON public.users
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY users_update_superadmin ON public.users
  FOR UPDATE TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE OR REPLACE FUNCTION public.complete_signup(p_name text, p_church_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  auth_email text;
  new_church_id uuid;
  trimmed_name text := trim(p_name);
  trimmed_church text := trim(p_church_name);
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

  IF lower(auth_email) = 'edisannico+superadmin@gmail.com' THEN
    RAISE EXCEPTION 'this account is reserved';
  END IF;

  IF EXISTS (SELECT 1 FROM public.users WHERE email = auth_email) THEN
    RAISE EXCEPTION 'email already registered';
  END IF;

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

  INSERT INTO public.users (
    id,
    church_id,
    name,
    email,
    email_verified_at,
    role,
    status,
    created_at,
    updated_at
  ) VALUES (
    uid,
    new_church_id,
    trimmed_name,
    auth_email,
    now(),
    'admin',
    'pending',
    now(),
    now()
  );

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

  RETURN public.get_session_profile();
END;
$$;

CREATE OR REPLACE FUNCTION public.list_signup_requests()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'church_id', q.church_id,
      'church_name', q.church_name,
      'church_email', q.church_email,
      'status', q.status,
      'created_at', q.created_at,
      'applicant_id', q.applicant_id,
      'applicant_name', q.applicant_name,
      'applicant_email', q.applicant_email
    ) ORDER BY q.created_at DESC)
    FROM (
      SELECT
        c.id AS church_id,
        c.name AS church_name,
        c.email AS church_email,
        c.status,
        c.created_at,
        u.id AS applicant_id,
        u.name AS applicant_name,
        u.email AS applicant_email
      FROM public.churches c
      JOIN public.users u ON u.church_id = c.id AND u.role = 'admin'
      WHERE c.status IN ('pending', 'rejected')
        AND c.id <> '00000000-0000-0000-0000-000000000001'::uuid
    ) q
  ), '[]'::jsonb);
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
      updated_at = now()
    WHERE church_id = p_church_id
      AND status <> 'disabled';
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
      updated_at = now()
    WHERE church_id = p_church_id;
  END IF;

  RETURN public.list_signup_requests();
END;
$$;

REVOKE ALL ON FUNCTION public.list_signup_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_signup(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_signup(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_signup_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_signup(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
