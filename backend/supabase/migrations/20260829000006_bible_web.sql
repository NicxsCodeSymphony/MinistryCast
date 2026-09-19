INSERT INTO public.bible_versions (id, code, name)
VALUES (gen_random_uuid(), 'WEB', 'World English Bible')
ON CONFLICT (code) DO NOTHING;
