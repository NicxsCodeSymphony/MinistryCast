-- Platform church + superadmin. Login as edisannico@gmail.com / otp-only
-- Local codes appear in Mailpit (http://127.0.0.1:54324).

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
  '00000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'edisannico@gmail.com',
  extensions.crypt('otp-only', extensions.gen_salt('bf')),
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

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000002',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000000002',
    'email', 'edisannico@gmail.com',
    'email_verified', true
  ),
  'email',
  '00000000-0000-0000-0000-000000000002',
  now(),
  now(),
  now()
);

INSERT INTO public.churches (
  id, name, email, status, created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'MinistryCast Platform',
  'edisannico@gmail.com',
  'active',
  now(),
  now()
);

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
  '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000001',
  'Super Admin',
  'edisannico@gmail.com',
  now(),
  'superadmin',
  'active',
  now(),
  now()
);

SELECT public.bootstrap_church('00000000-0000-0000-0000-000000000001');

INSERT INTO public.songs (
  id, church_id, title, artist, musical_key, bpm, time_signature,
  created_at, updated_at
) VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  'Here As In Heaven',
  'Elevation Worship',
  'C',
  74,
  '4/4',
  now(),
  now()
);

INSERT INTO public.song_lyric_sections (
  song_id, section, content, sort_order, created_at, updated_at
) VALUES
  ('00000000-0000-0000-0000-000000000010', 'Intro', '[C]  [G]  [Am]  [F]', 0, now(), now()),
  ('00000000-0000-0000-0000-000000000010', 'Verse 1', E'You are here, moving in our midst\nI worship You, I worship You', 1, now(), now()),
  ('00000000-0000-0000-0000-000000000010', 'Pre-Chorus', E'I stand in awe of You\nLet my heart be still', 2, now(), now()),
  ('00000000-0000-0000-0000-000000000010', 'Chorus', E'I worship You, I worship You\nYou are here, You are here', 3, now(), now()),
  ('00000000-0000-0000-0000-000000000010', 'Bridge', E'I will wait for You\nI will wait for You', 4, now(), now()),
  ('00000000-0000-0000-0000-000000000010', 'Outro', '[C]  [G]  [Am]  [F]', 5, now(), now());
