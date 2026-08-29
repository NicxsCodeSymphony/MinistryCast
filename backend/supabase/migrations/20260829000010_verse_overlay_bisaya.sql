ALTER TABLE public.presentations
  ADD COLUMN IF NOT EXISTS verse_overlay_ref varchar(120),
  ADD COLUMN IF NOT EXISTS verse_overlay_translation varchar(12);

INSERT INTO public.bible_versions (id, code, name)
VALUES (gen_random_uuid(), 'CEB', 'Bisaya KJV (Ang Biblia)')
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
