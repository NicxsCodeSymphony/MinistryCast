ALTER TABLE public.presentations
  ADD COLUMN IF NOT EXISTS verse_overlay_page integer NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
