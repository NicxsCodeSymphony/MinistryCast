-- Add styling columns to presentations for verse overlay
ALTER TABLE public.presentations
  ADD COLUMN IF NOT EXISTS verse_overlay_text_style varchar(80),
  ADD COLUMN IF NOT EXISTS verse_overlay_color varchar(24);

NOTIFY pgrst, 'reload schema';
