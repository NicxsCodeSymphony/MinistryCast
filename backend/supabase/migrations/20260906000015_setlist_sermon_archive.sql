-- Archive finished setlists / sermons after a live session ends.

ALTER TABLE public.setlists
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

ALTER TABLE public.sermons
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_setlists_archived_at
  ON public.setlists (church_id, archived_at);

CREATE INDEX IF NOT EXISTS idx_sermons_archived_at
  ON public.sermons (church_id, archived_at);
