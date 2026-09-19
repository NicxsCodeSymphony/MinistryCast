-- Church admin approve = activate member immediately (no second platform step required).

CREATE OR REPLACE FUNCTION public.review_member_join(
  p_user_id uuid,
  p_action text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  action text := lower(trim(p_action));
  target public.users%ROWTYPE;
  me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF action NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'invalid action';
  END IF;

  SELECT * INTO target
  FROM public.users
  WHERE id = p_user_id
    AND status = 'pending'
    AND approval_phase IN ('church', 'platform');

  IF target.id IS NULL THEN
    RAISE EXCEPTION 'request not found';
  END IF;

  IF target.approval_phase = 'church' THEN
    IF NOT (
      public.is_active_member()
      AND public.has_role(ARRAY['admin'])
      AND public.app_church_id() = target.church_id
    ) AND NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'only that church''s admins can approve this join';
    END IF;

    IF action = 'approve' THEN
      UPDATE public.users
      SET
        status = 'active',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;
    ELSE
      UPDATE public.users
      SET
        status = 'disabled',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;
    END IF;
  ELSIF target.approval_phase = 'platform' THEN
    -- Legacy queue: still finishable by superadmin (or church admin of that church).
    IF NOT public.is_superadmin()
       AND NOT (
         public.is_active_member()
         AND public.has_role(ARRAY['admin'])
         AND public.app_church_id() = target.church_id
       ) THEN
      RAISE EXCEPTION 'only that church''s admins or superadmin can finish member approval';
    END IF;

    IF action = 'approve' THEN
      UPDATE public.users
      SET
        status = 'active',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;
    ELSE
      UPDATE public.users
      SET
        status = 'disabled',
        approval_phase = NULL,
        updated_at = now()
      WHERE id = target.id;
    END IF;
  END IF;

  RETURN public.list_approval_requests();
END;
$$;
