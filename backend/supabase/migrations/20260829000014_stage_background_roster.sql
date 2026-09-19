ALTER TABLE public.church_settings
  ADD COLUMN IF NOT EXISTS stage_background varchar(40) NOT NULL DEFAULT 'sanctuary';

ALTER TABLE public.setlist_items
  ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE public.setlist_items
  DROP CONSTRAINT IF EXISTS chk_setlist_item_ref;

ALTER TABLE public.setlist_items
  ADD CONSTRAINT chk_setlist_item_ref CHECK (
    (item_type = 'song' AND song_id IS NOT NULL)
    OR (item_type = 'sermon' AND sermon_id IS NOT NULL)
    OR (item_type = 'scripture' AND passage_id IS NOT NULL)
    OR (item_type = 'media' AND media_asset_id IS NOT NULL)
    OR (
      item_type = 'roster'
      AND song_id IS NULL
      AND sermon_id IS NULL
      AND passage_id IS NULL
      AND media_asset_id IS NULL
    )
  );

NOTIFY pgrst, 'reload schema';
