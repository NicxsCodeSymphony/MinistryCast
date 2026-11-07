-- Superadmin can manage a church's full profile: name, email, status,
-- address, phone, and logo (photo_url). Storage policies on the
-- 'church-photos' bucket already allow superadmin writes/deletes.

CREATE OR REPLACE FUNCTION public.admin_list_churches()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(q)::jsonb ORDER BY q.created_at DESC)
    FROM (
      SELECT
        c.id,
        c.name,
        c.email,
        c.status,
        c.address,
        c.phone,
        c.photo_url,
        c.created_at,
        c.onboarded_at,
        c.approved_at,
        (SELECT count(*) FROM public.users u WHERE u.church_id = c.id) AS account_count,
        (SELECT count(*) FROM public.audit_events e WHERE e.church_id = c.id) AS action_count,
        (SELECT count(*) FROM public.app_devices d WHERE d.church_id = c.id) AS device_count
      FROM public.churches c
    ) q
  ), '[]'::jsonb);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_update_church(uuid, text, text, text);

-- NULL means "leave unchanged". For address / phone / photo_url an empty
-- string clears the value; name and email can never be blanked.
CREATE OR REPLACE FUNCTION public.admin_update_church(
  p_church_id uuid,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_address text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_photo_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_status text;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_church_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'the platform church cannot be changed';
  END IF;

  next_status := nullif(trim(coalesce(p_status, '')), '');
  IF next_status IS NOT NULL
     AND next_status NOT IN ('pending', 'active', 'suspended', 'offline', 'rejected') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  IF p_name IS NOT NULL AND length(trim(p_name)) > 120 THEN
    RAISE EXCEPTION 'church name is too long';
  END IF;

  UPDATE public.churches
  SET
    name = coalesce(nullif(trim(p_name), ''), name),
    email = coalesce(nullif(trim(p_email), ''), email),
    status = coalesce(next_status, status),
    address = CASE WHEN p_address IS NULL THEN address ELSE nullif(trim(p_address), '') END,
    phone = CASE WHEN p_phone IS NULL THEN phone ELSE nullif(trim(p_phone), '') END,
    photo_url = CASE WHEN p_photo_url IS NULL THEN photo_url ELSE nullif(trim(p_photo_url), '') END,
    updated_at = now()
  WHERE id = p_church_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'church not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_church(uuid, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_church(uuid, text, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
