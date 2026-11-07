-- Optional per-setlist stage background. NULL = use the church default
-- (church_settings.stage_background). Values are built-in ids or
-- "img:<media_assets.id>" for uploaded background images.
ALTER TABLE public.setlists
  ADD COLUMN IF NOT EXISTS stage_background varchar(40);
