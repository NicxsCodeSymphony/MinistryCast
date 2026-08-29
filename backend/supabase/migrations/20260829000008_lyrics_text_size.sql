ALTER TABLE public.church_settings
  ADD COLUMN IF NOT EXISTS lyrics_text_size varchar(20);
