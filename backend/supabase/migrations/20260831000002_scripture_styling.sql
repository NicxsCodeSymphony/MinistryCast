-- Add styling columns to scripture_passages
ALTER TABLE public.scripture_passages
  ADD COLUMN IF NOT EXISTS text_size varchar(16) DEFAULT 'md',
  ADD COLUMN IF NOT EXISTS font varchar(80),
  ADD COLUMN IF NOT EXISTS text_style varchar(40),
  ADD COLUMN IF NOT EXISTS color varchar(24);
