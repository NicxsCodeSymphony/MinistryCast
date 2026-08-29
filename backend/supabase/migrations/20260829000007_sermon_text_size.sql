ALTER TABLE public.sermons
  ADD COLUMN IF NOT EXISTS text_size varchar(16) NOT NULL DEFAULT 'md';
