ALTER TABLE public.presentations
  ADD COLUMN IF NOT EXISTS verse_overlay_take integer NOT NULL DEFAULT 5;

NOTIFY pgrst, 'reload schema';
