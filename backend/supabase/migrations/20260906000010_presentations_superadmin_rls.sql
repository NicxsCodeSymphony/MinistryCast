-- Allow superadmin to sync/run presentations for any church.
-- Previously presentations_* policies required in_church(), which fails when
-- app_church_id() is null (typical for platform superadmin).

DROP POLICY IF EXISTS presentations_select ON public.presentations;
CREATE POLICY presentations_select ON public.presentations
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR public.in_church(church_id)
  );

DROP POLICY IF EXISTS presentations_mutate ON public.presentations;
CREATE POLICY presentations_mutate ON public.presentations
  FOR ALL TO authenticated
  USING (
    public.is_superadmin()
    OR (
      public.in_church(church_id)
      AND public.has_role(ARRAY['admin', 'producer', 'operator'])
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR (
      public.in_church(church_id)
      AND public.has_role(ARRAY['admin', 'producer', 'operator'])
    )
  );

DROP POLICY IF EXISTS presentation_outputs_select ON public.presentation_outputs;
CREATE POLICY presentation_outputs_select ON public.presentation_outputs
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.presentations p
      WHERE p.id = presentation_outputs.presentation_id
        AND public.in_church(p.church_id)
    )
  );

DROP POLICY IF EXISTS presentation_outputs_mutate ON public.presentation_outputs;
CREATE POLICY presentation_outputs_mutate ON public.presentation_outputs
  FOR ALL TO authenticated
  USING (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.presentations p
      WHERE p.id = presentation_outputs.presentation_id
        AND public.in_church(p.church_id)
        AND public.has_role(ARRAY['admin', 'producer', 'operator'])
    )
  )
  WITH CHECK (
    public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.presentations p
      WHERE p.id = presentation_outputs.presentation_id
        AND public.in_church(p.church_id)
        AND public.has_role(ARRAY['admin', 'producer', 'operator'])
    )
  );
