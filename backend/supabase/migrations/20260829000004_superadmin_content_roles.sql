-- Superadmin may use the same content/settings as church admin/producer/operator.
CREATE OR REPLACE FUNCTION public.has_role(roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_superadmin()
    OR public.app_role() = ANY (roles)
$$;

NOTIFY pgrst, 'reload schema';
