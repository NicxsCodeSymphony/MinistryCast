-- Per-session Bible verse overlay typography.
ALTER TABLE public.presentations
  ADD COLUMN IF NOT EXISTS verse_overlay_font varchar(80),
  ADD COLUMN IF NOT EXISTS verse_overlay_text_size varchar(24);

NOTIFY pgrst, 'reload schema';
