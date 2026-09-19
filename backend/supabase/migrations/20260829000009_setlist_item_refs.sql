-- Keep setlist_items in sync with sermons/songs/scripture/media.
-- Orphaned sermon_id values were failing backup with:
--   fk_setlist_items_sermon_id
-- ON DELETE SET NULL also conflicted with chk_setlist_item_ref.

DELETE FROM public.setlist_items AS item
WHERE item.item_type = 'sermon'
  AND (
    item.sermon_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.sermons AS sermon WHERE sermon.id = item.sermon_id
    )
  );

DELETE FROM public.setlist_items AS item
WHERE item.item_type = 'song'
  AND (
    item.song_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.songs AS song WHERE song.id = item.song_id
    )
  );

DELETE FROM public.setlist_items AS item
WHERE item.item_type = 'scripture'
  AND (
    item.passage_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.scripture_passages AS passage WHERE passage.id = item.passage_id
    )
  );

DELETE FROM public.setlist_items AS item
WHERE item.item_type = 'media'
  AND (
    item.media_asset_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.media_assets AS media WHERE media.id = item.media_asset_id
    )
  );

ALTER TABLE public.setlist_items
  DROP CONSTRAINT IF EXISTS fk_setlist_items_sermon_id,
  DROP CONSTRAINT IF EXISTS fk_setlist_items_song_id,
  DROP CONSTRAINT IF EXISTS fk_setlist_items_passage_id,
  DROP CONSTRAINT IF EXISTS fk_setlist_items_media_asset_id;

ALTER TABLE public.setlist_items
  ADD CONSTRAINT fk_setlist_items_sermon_id
    FOREIGN KEY (sermon_id) REFERENCES public.sermons (id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_setlist_items_song_id
    FOREIGN KEY (song_id) REFERENCES public.songs (id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_setlist_items_passage_id
    FOREIGN KEY (passage_id) REFERENCES public.scripture_passages (id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_setlist_items_media_asset_id
    FOREIGN KEY (media_asset_id) REFERENCES public.media_assets (id) ON DELETE CASCADE;

ALTER TABLE public.sermons
  ADD COLUMN IF NOT EXISTS text_size varchar(16) NOT NULL DEFAULT 'md';

NOTIFY pgrst, 'reload schema';
