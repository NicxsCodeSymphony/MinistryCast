-- Superadmin sync/backup was failing one table at a time because most content
-- policies require in_church(church_id), and platform superadmins often have
-- church_id = NULL. Treat superadmin as in any real church for RLS checks.

CREATE OR REPLACE FUNCTION public.in_church(target_church_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT target_church_id IS NOT NULL
    AND (
      public.is_superadmin()
      OR target_church_id = public.app_church_id()
    )
$$;

REVOKE ALL ON FUNCTION public.in_church(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.in_church(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
