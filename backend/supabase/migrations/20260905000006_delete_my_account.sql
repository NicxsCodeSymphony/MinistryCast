-- Self-service account deletion (app profile row). Auth user is removed by the delete-account edge function.

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  current_role text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT role INTO current_role FROM public.users WHERE id = uid;
  IF current_role IS NULL THEN
    -- Profile already gone; allow auth cleanup to continue.
    RETURN;
  END IF;

  IF current_role = 'superadmin'
     AND (
       SELECT count(*) FROM public.users
       WHERE role = 'superadmin' AND status = 'active'
     ) <= 1 THEN
    RAISE EXCEPTION 'cannot delete the last superadmin account';
  END IF;

  DELETE FROM public.users WHERE id = uid;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
