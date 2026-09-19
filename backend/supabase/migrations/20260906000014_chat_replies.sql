-- Chat message replies (Instagram-style reply_to).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.chat_messages (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to
  ON public.chat_messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;
