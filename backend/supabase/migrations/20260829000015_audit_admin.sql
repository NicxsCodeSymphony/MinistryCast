-- Superadmin audit trail, device installs, and church/account management.

CREATE TABLE public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid,
  actor_id uuid,
  actor_email varchar(255),
  actor_name varchar(120),
  action varchar(80) NOT NULL,
  entity_type varchar(40),
  entity_id uuid,
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_audit_events_church_id
    FOREIGN KEY (church_id) REFERENCES public.churches (id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_events_actor_id
    FOREIGN KEY (actor_id) REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE INDEX idx_audit_events_created ON public.audit_events (created_at DESC);
CREATE INDEX idx_audit_events_church ON public.audit_events (church_id, created_at DESC);
CREATE INDEX idx_audit_events_actor ON public.audit_events (actor_id, created_at DESC);
CREATE INDEX idx_audit_events_action ON public.audit_events (action, created_at DESC);

CREATE TABLE public.app_devices (
  id uuid PRIMARY KEY,
  church_id uuid,
  user_id uuid,
  platform varchar(40) NOT NULL DEFAULT 'web',
  os_label varchar(80),
  app_version varchar(40),
  user_agent text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fk_app_devices_church_id
    FOREIGN KEY (church_id) REFERENCES public.churches (id) ON DELETE SET NULL,
  CONSTRAINT fk_app_devices_user_id
    FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE SET NULL
);

CREATE INDEX idx_app_devices_last_seen ON public.app_devices (last_seen_at DESC);
CREATE INDEX idx_app_devices_church ON public.app_devices (church_id);
CREATE INDEX idx_app_devices_user ON public.app_devices (user_id);

ALTER TABLE public.audit_events
  ADD CONSTRAINT fk_audit_events_device_id
  FOREIGN KEY (device_id) REFERENCES public.app_devices (id) ON DELETE SET NULL;

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_events_select_superadmin ON public.audit_events
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY app_devices_select_superadmin ON public.app_devices
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY churches_delete_superadmin ON public.churches
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE POLICY users_delete_superadmin ON public.users
  FOR DELETE TO authenticated
  USING (public.is_superadmin());

CREATE OR REPLACE FUNCTION public.write_audit(
  p_action text,
  p_summary text,
  p_church_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_device_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  actor public.users%ROWTYPE;
  event_id uuid;
BEGIN
  IF uid IS NOT NULL THEN
    SELECT * INTO actor FROM public.users WHERE id = uid;
  END IF;

  INSERT INTO public.audit_events (
    church_id,
    actor_id,
    actor_email,
    actor_name,
    action,
    entity_type,
    entity_id,
    summary,
    metadata,
    device_id
  ) VALUES (
    coalesce(p_church_id, actor.church_id),
    actor.id,
    actor.email,
    actor.name,
    left(p_action, 80),
    left(p_entity_type, 40),
    p_entity_id,
    coalesce(nullif(trim(p_summary), ''), p_action),
    coalesce(p_metadata, '{}'::jsonb),
    p_device_id
  )
  RETURNING id INTO event_id;

  RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_audit_event(
  p_action text,
  p_summary text,
  p_church_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_device_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  RETURN public.write_audit(
    p_action,
    p_summary,
    p_church_id,
    p_entity_type,
    p_entity_id,
    p_metadata,
    p_device_id
  );
END;
$$;

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
  existing public.app_devices%ROWTYPE;
  is_new boolean := false;
BEGIN
  IF uid IS NULL OR p_device_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT * INTO member FROM public.users WHERE id = uid;
  IF member.id IS NULL THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  SELECT * INTO existing FROM public.app_devices WHERE id = p_device_id;
  is_new := existing.id IS NULL;

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
    last_seen_at = now();

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

CREATE OR REPLACE FUNCTION public.trg_audit_churches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(
      'church.create',
      'Church “' || NEW.name || '” was created (' || NEW.status || ')',
      NEW.id,
      'church',
      NEW.id,
      jsonb_build_object('status', NEW.status, 'email', NEW.email)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      PERFORM public.write_audit(
        'church.status',
        'Church “' || NEW.name || '” status: ' || OLD.status || ' → ' || NEW.status,
        NEW.id,
        'church',
        NEW.id,
        jsonb_build_object('from', OLD.status, 'to', NEW.status)
      );
    ELSIF OLD.name IS DISTINCT FROM NEW.name OR OLD.email IS DISTINCT FROM NEW.email THEN
      PERFORM public.write_audit(
        'church.update',
        'Church “' || NEW.name || '” was updated',
        NEW.id,
        'church',
        NEW.id,
        jsonb_build_object(
          'name_from', OLD.name,
          'name_to', NEW.name,
          'email_from', OLD.email,
          'email_to', NEW.email
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.write_audit(
    'church.delete',
    'Church “' || OLD.name || '” was deleted',
    NULL,
    'church',
    OLD.id,
    jsonb_build_object('name', OLD.name, 'email', OLD.email, 'status', OLD.status)
  );
  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_audit_users()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.write_audit(
      'account.create',
      coalesce(NEW.name, NEW.email) || ' joined as ' || NEW.role || ' (' || NEW.status || ')',
      NEW.church_id,
      'account',
      NEW.id,
      jsonb_build_object('role', NEW.role, 'status', NEW.status, 'email', NEW.email)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status OR OLD.role IS DISTINCT FROM NEW.role THEN
      PERFORM public.write_audit(
        'account.status',
        coalesce(NEW.name, NEW.email) || ': ' ||
          OLD.role || '/' || OLD.status || ' → ' || NEW.role || '/' || NEW.status,
        NEW.church_id,
        'account',
        NEW.id,
        jsonb_build_object(
          'role_from', OLD.role,
          'role_to', NEW.role,
          'status_from', OLD.status,
          'status_to', NEW.status
        )
      );
    ELSIF OLD.name IS DISTINCT FROM NEW.name OR OLD.email IS DISTINCT FROM NEW.email THEN
      PERFORM public.write_audit(
        'account.update',
        coalesce(NEW.name, NEW.email) || ' was updated',
        NEW.church_id,
        'account',
        NEW.id,
        jsonb_build_object(
          'name_from', OLD.name,
          'name_to', NEW.name,
          'email_from', OLD.email,
          'email_to', NEW.email
        )
      );
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.write_audit(
    'account.delete',
    coalesce(OLD.name, OLD.email) || ' was deleted',
    OLD.church_id,
    'account',
    OLD.id,
    jsonb_build_object('name', OLD.name, 'email', OLD.email, 'role', OLD.role)
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_churches ON public.churches;
CREATE TRIGGER trg_audit_churches
  AFTER INSERT OR UPDATE OR DELETE ON public.churches
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_churches();

DROP TRIGGER IF EXISTS trg_audit_users ON public.users;
CREATE TRIGGER trg_audit_users
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.trg_audit_users();

CREATE OR REPLACE FUNCTION public.admin_overview()
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

  RETURN jsonb_build_object(
    'churches_total', (SELECT count(*) FROM public.churches),
    'churches_active', (SELECT count(*) FROM public.churches WHERE status = 'active'),
    'churches_suspended', (SELECT count(*) FROM public.churches WHERE status = 'suspended'),
    'accounts_total', (SELECT count(*) FROM public.users),
    'accounts_active', (SELECT count(*) FROM public.users WHERE status = 'active'),
    'devices_total', (SELECT count(*) FROM public.app_devices),
    'actions_total', (SELECT count(*) FROM public.audit_events),
    'actions_today', (
      SELECT count(*) FROM public.audit_events
      WHERE created_at >= date_trunc('day', now())
    )
  );
END;
$$;

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

CREATE OR REPLACE FUNCTION public.admin_list_accounts(p_church_id uuid DEFAULT NULL)
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
        u.id,
        u.name,
        u.email,
        u.role,
        u.status,
        u.church_id,
        c.name AS church_name,
        u.created_at,
        (SELECT count(*) FROM public.audit_events e WHERE e.actor_id = u.id) AS action_count,
        (SELECT count(*) FROM public.app_devices d WHERE d.user_id = u.id) AS device_count,
        (
          SELECT max(d.last_seen_at)
          FROM public.app_devices d
          WHERE d.user_id = u.id
        ) AS last_seen_at
      FROM public.users u
      JOIN public.churches c ON c.id = u.church_id
      WHERE p_church_id IS NULL OR u.church_id = p_church_id
    ) q
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_devices()
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
    SELECT jsonb_agg(row_to_json(q)::jsonb ORDER BY q.last_seen_at DESC)
    FROM (
      SELECT
        d.id,
        d.church_id,
        c.name AS church_name,
        d.user_id,
        u.name AS user_name,
        u.email AS user_email,
        d.platform,
        d.os_label,
        d.app_version,
        d.first_seen_at,
        d.last_seen_at
      FROM public.app_devices d
      LEFT JOIN public.churches c ON c.id = d.church_id
      LEFT JOIN public.users u ON u.id = d.user_id
    ) q
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_events(
  p_church_id uuid DEFAULT NULL,
  p_actor_id uuid DEFAULT NULL,
  p_query text DEFAULT NULL,
  p_limit int DEFAULT 80,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  needle text := lower(trim(coalesce(p_query, '')));
  lim int := greatest(1, least(coalesce(p_limit, 80), 200));
  off int := greatest(0, coalesce(p_offset, 0));
  total int;
  items jsonb;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT count(*) INTO total
  FROM public.audit_events e
  LEFT JOIN public.churches c ON c.id = e.church_id
  WHERE (p_church_id IS NULL OR e.church_id = p_church_id)
    AND (p_actor_id IS NULL OR e.actor_id = p_actor_id)
    AND (
      needle = ''
      OR lower(e.summary) LIKE '%' || needle || '%'
      OR lower(e.action) LIKE '%' || needle || '%'
      OR lower(coalesce(e.actor_email, '')) LIKE '%' || needle || '%'
      OR lower(coalesce(e.actor_name, '')) LIKE '%' || needle || '%'
      OR lower(coalesce(c.name, '')) LIKE '%' || needle || '%'
    );

  SELECT coalesce(jsonb_agg(row_to_json(q)::jsonb), '[]'::jsonb)
  INTO items
  FROM (
    SELECT
      e.id,
      e.church_id,
      c.name AS church_name,
      e.actor_id,
      e.actor_email,
      e.actor_name,
      e.action,
      e.entity_type,
      e.entity_id,
      e.summary,
      e.metadata,
      e.device_id,
      e.created_at
    FROM public.audit_events e
    LEFT JOIN public.churches c ON c.id = e.church_id
    WHERE (p_church_id IS NULL OR e.church_id = p_church_id)
      AND (p_actor_id IS NULL OR e.actor_id = p_actor_id)
      AND (
        needle = ''
        OR lower(e.summary) LIKE '%' || needle || '%'
        OR lower(e.action) LIKE '%' || needle || '%'
        OR lower(coalesce(e.actor_email, '')) LIKE '%' || needle || '%'
        OR lower(coalesce(e.actor_name, '')) LIKE '%' || needle || '%'
        OR lower(coalesce(c.name, '')) LIKE '%' || needle || '%'
      )
    ORDER BY e.created_at DESC
    LIMIT lim
    OFFSET off
  ) q;

  RETURN jsonb_build_object('items', items, 'total', total, 'limit', lim, 'offset', off);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_church(
  p_church_id uuid,
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_status text DEFAULT NULL
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

  UPDATE public.churches
  SET
    name = coalesce(nullif(trim(p_name), ''), name),
    email = coalesce(nullif(trim(p_email), ''), email),
    status = coalesce(next_status, status),
    updated_at = now()
  WHERE id = p_church_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'church not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_church(p_church_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_church_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'the platform church cannot be deleted';
  END IF;

  DELETE FROM public.churches WHERE id = p_church_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'church not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_account(
  p_user_id uuid,
  p_name text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_role text := nullif(trim(coalesce(p_role, '')), '');
  next_status text := nullif(trim(coalesce(p_status, '')), '');
  current_role text;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT role INTO current_role FROM public.users WHERE id = p_user_id;
  IF current_role IS NULL THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  IF next_role IS NOT NULL
     AND next_role NOT IN ('superadmin', 'admin', 'producer', 'operator') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;

  IF next_status IS NOT NULL
     AND next_status NOT IN ('pending', 'active', 'disabled') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  IF current_role = 'superadmin'
     AND (
       (next_role IS NOT NULL AND next_role <> 'superadmin')
       OR (next_status IS NOT NULL AND next_status <> 'active')
     )
     AND (
       SELECT count(*) FROM public.users
       WHERE role = 'superadmin' AND status = 'active'
     ) <= 1 THEN
    RAISE EXCEPTION 'cannot disable the last superadmin';
  END IF;

  UPDATE public.users
  SET
    name = coalesce(nullif(trim(p_name), ''), name),
    role = coalesce(next_role, role),
    status = coalesce(next_status, status),
    updated_at = now()
  WHERE id = p_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_account(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_role text;
BEGIN
  IF NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'you cannot delete your own account';
  END IF;

  SELECT role INTO current_role FROM public.users WHERE id = p_user_id;
  IF current_role IS NULL THEN
    RAISE EXCEPTION 'account not found';
  END IF;

  IF current_role = 'superadmin'
     AND (
       SELECT count(*) FROM public.users
       WHERE role = 'superadmin' AND status = 'active'
     ) <= 1 THEN
    RAISE EXCEPTION 'cannot delete the last superadmin';
  END IF;

  DELETE FROM public.users WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit(text, text, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_audit_event(text, text, uuid, text, uuid, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.heartbeat_device(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_overview() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_churches() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_accounts(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_devices() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_events(uuid, uuid, text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_church(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_church(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_account(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_account(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_audit_event(text, text, uuid, text, uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_device(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_churches() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_accounts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_devices() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_events(uuid, uuid, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_church(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_church(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_account(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_account(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
