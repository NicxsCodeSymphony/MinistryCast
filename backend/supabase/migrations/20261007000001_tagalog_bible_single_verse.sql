INSERT INTO public.bible_versions (id, code, name)
VALUES (gen_random_uuid(), 'TL', 'Tagalog (Ang Biblia 1905/1982)')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.presentations
  ALTER COLUMN verse_overlay_take SET DEFAULT 1;

ALTER TABLE public.sermons
  ALTER COLUMN text_size SET DEFAULT 'xl';

NOTIFY pgrst, 'reload schema';
