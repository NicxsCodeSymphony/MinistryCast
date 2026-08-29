-- Idempotent: confirmed superadmin on hosted Auth (no confirmation email).
-- Email: edisannico@gmail.com
-- Password: otp-only  (same as local seed; change after first login)

DO $$
DECLARE
  uid uuid;
  church_id uuid := '00000000-0000-0000-0000-000000000001';
  admin_email text := 'edisannico@gmail.com';
  old_email text := 'edisannico+superadmin@gmail.com';
  pass_hash text := extensions.crypt('otp-only', extensions.gen_salt('bf'));
BEGIN
  SELECT id INTO uid
  FROM auth.users
  WHERE lower(email) IN (admin_email, old_email)
  ORDER BY CASE WHEN lower(email) = admin_email THEN 0 ELSE 1 END
  LIMIT 1;

  IF uid IS NULL THEN
    uid := '00000000-0000-0000-0000-000000000002';
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      uid,
      'authenticated',
      'authenticated',
      admin_email,
      pass_hash,
      now(),
      '{"provider":"email","providers":["email"]}',
      '{"name":"Super Admin"}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  ELSE
    UPDATE auth.users
    SET
      email = admin_email,
      encrypted_password = pass_hash,
      email_confirmed_at = coalesce(email_confirmed_at, now()),
      raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
        || '{"provider":"email","providers":["email"]}'::jsonb,
      updated_at = now()
    WHERE id = uid;
  END IF;

  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
  )
  SELECT
    gen_random_uuid(),
    uid,
    jsonb_build_object(
      'sub', uid::text,
      'email', admin_email,
      'email_verified', true
    ),
    'email',
    uid::text,
    now(),
    now(),
    now()
  WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = uid AND provider = 'email'
  );

  UPDATE auth.identities
  SET
    identity_data = identity_data || jsonb_build_object('email', admin_email, 'email_verified', true),
    updated_at = now()
  WHERE user_id = uid AND provider = 'email';

  INSERT INTO public.churches (
    id, name, email, status, created_at, updated_at
  ) VALUES (
    church_id,
    'MinistryCast Platform',
    admin_email,
    'active',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    name = excluded.name,
    email = excluded.email,
    status = 'active',
    updated_at = now();

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
    'Super Admin',
    admin_email,
    now(),
    'superadmin',
    'active',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    church_id = excluded.church_id,
    name = excluded.name,
    email = excluded.email,
    email_verified_at = coalesce(public.users.email_verified_at, now()),
    role = 'superadmin',
    status = 'active',
    updated_at = now();
END $$;
