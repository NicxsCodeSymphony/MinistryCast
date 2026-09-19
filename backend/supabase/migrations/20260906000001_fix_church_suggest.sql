-- More reliable church name suggestions during signup.

CREATE OR REPLACE FUNCTION public.suggest_churches(p_query text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  q text := lower(trim(both from coalesce(p_query, '')));
  q_compact text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Collapse internal whitespace so "Jesus  Christ" still matches.
  q := regexp_replace(q, '\s+', ' ', 'g');
  q_compact := replace(q, ' ', '');

  IF char_length(q) < 1 THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_data ORDER BY sort_rank, sort_name)
    FROM (
      SELECT
        jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'status', c.status
        ) AS row_data,
        CASE
          WHEN lower(c.name) = q THEN 0
          WHEN lower(c.name) LIKE q || '%' THEN 1
          WHEN lower(c.name) LIKE '%' || q || '%' THEN 2
          WHEN replace(lower(c.name), ' ', '') LIKE '%' || q_compact || '%' THEN 3
          ELSE 4
        END AS sort_rank,
        c.name AS sort_name
      FROM public.churches c
      WHERE c.id <> '00000000-0000-0000-0000-000000000001'::uuid
        AND c.status IN ('active', 'pending', 'offline')
        AND (
          lower(c.name) LIKE '%' || q || '%'
          OR replace(lower(c.name), ' ', '') LIKE '%' || q_compact || '%'
          OR (
            -- Every typed word appears somewhere in the church name.
            SELECT bool_and(lower(c.name) LIKE '%' || w || '%')
            FROM unnest(string_to_array(q, ' ')) AS w
            WHERE w <> ''
          )
        )
      ORDER BY sort_rank, c.name
      LIMIT 8
    ) matched
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.suggest_churches(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_churches(text) TO authenticated;
