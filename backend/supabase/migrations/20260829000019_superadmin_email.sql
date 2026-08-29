-- Reserve the production superadmin email from church signup.

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

  IF lower(auth_email) = 'edisannico@gmail.com' THEN
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
