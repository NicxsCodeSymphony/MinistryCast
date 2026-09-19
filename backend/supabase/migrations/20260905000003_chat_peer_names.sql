-- Allow chat participants to see each other's display name/role.
DROP POLICY IF EXISTS users_select_chat_peer ON public.users;
CREATE POLICY users_select_chat_peer ON public.users
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_channel_members me
      JOIN public.chat_channel_members peer
        ON peer.channel_id = me.channel_id
      WHERE me.user_id = auth.uid()
        AND peer.user_id = users.id
    )
  );
