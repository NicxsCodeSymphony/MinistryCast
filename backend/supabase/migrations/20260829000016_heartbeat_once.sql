-- Record a device install only on the first insert, even under concurrent heartbeats.

CREATE OR REPLACE FUNCTION public.heartbeat_device(
  p_device_id uuid,
  p_platform text,
  p_os_label text,
  p_app_version text,
  p_user_agent text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  member public.users%ROWTYPE;
  is_new boolean := false;
BEGIN
  IF uid IS NULL OR p_device_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO member FROM public.users WHERE id = uid;
  IF member.id IS NULL THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  INSERT INTO public.app_devices (
    id, church_id, user_id, platform, os_label, app_version, user_agent,
    first_seen_at, last_seen_at
  ) VALUES (
    p_device_id,
    member.church_id,
    uid,
    coalesce(nullif(trim(p_platform), ''), 'web'),
    nullif(trim(p_os_label), ''),
    nullif(trim(p_app_version), ''),
    nullif(trim(p_user_agent), ''),
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    church_id = excluded.church_id,
    user_id = excluded.user_id,
    platform = excluded.platform,
    os_label = excluded.os_label,
    app_version = excluded.app_version,
    user_agent = excluded.user_agent,
    last_seen_at = now()
  RETURNING (xmax = 0) INTO is_new;

  IF is_new THEN
    PERFORM public.write_audit(
      'device.installed',
      coalesce(member.name, member.email) || ' installed MinistryCast on ' ||
        coalesce(nullif(trim(p_os_label), ''), p_platform, 'a device'),
      member.church_id,
      'device',
      p_device_id,
      jsonb_build_object(
        'platform', p_platform,
        'os_label', p_os_label,
        'app_version', p_app_version
      ),
      p_device_id
    );
  END IF;

  RETURN jsonb_build_object('id', p_device_id, 'is_new', is_new);
END;
$$;
