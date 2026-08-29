-- Auth helpers: after Supabase email OTP (verifyOtp), create church + public.users.
-- public.users.id is always auth.uid(). Email is treated as confirmed by the OTP itself.

CREATE OR REPLACE FUNCTION public.get_session_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('authenticated', false);
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'authenticated', true,
      'user', CASE WHEN u.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'email', u.email,
        'role', u.role,
        'status', u.status
      ) END,
      'church', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'status', c.status
      ) END
    )
    FROM (SELECT uid AS id) AS x
    LEFT JOIN public.users u ON u.id = x.id
    LEFT JOIN public.churches c ON c.id = u.church_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_signup(p_name text, p_church_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  auth_email text;
  church_id uuid;
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
  RETURNING id INTO church_id;

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
    church_id,
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
    church_id,
    'en',
    'dark',
    now(),
    now()
  );

  RETURN public.get_session_profile();
END;
$$;

REVOKE ALL ON FUNCTION public.get_session_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_signup(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_session_profile() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_signup(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
