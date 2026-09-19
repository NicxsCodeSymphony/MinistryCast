-- Align bible_versions with MinistryCast translation sources.

UPDATE public.bible_versions
SET name = 'Visayan (Bisaya)'
WHERE code = 'CEB';

UPDATE public.bible_versions
SET name = 'English (KJV)'
WHERE code = 'KJV';

UPDATE public.bible_versions
SET name = 'World English Bible'
WHERE code = 'WEB';

INSERT INTO public.bible_versions (id, code, name)
VALUES (gen_random_uuid(), 'CEB', 'Visayan (Bisaya)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.bible_versions (id, code, name)
VALUES (gen_random_uuid(), 'WEB', 'World English Bible')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.bible_versions (id, code, name)
VALUES (gen_random_uuid(), 'KJV', 'English (KJV)')
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
