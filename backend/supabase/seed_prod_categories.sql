-- Default worship-flow categories for churches that have none.

INSERT INTO public.categories (church_id, name, description, icon, color, sort_order)
SELECT
  c.id,
  seed.name,
  seed.description,
  seed.icon,
  seed.color,
  seed.sort_order
FROM public.churches c
CROSS JOIN (
  VALUES
    ('Call to Worship', 'The opening sequence designed to focus the hearts of the congregation.', 'campaign', 'sky', 0),
    ('Opening Song', 'High-energy anthems that invite participation and celebration.', 'music_note', 'violet', 1),
    ('Praise', 'Fast to mid-tempo selections focused on the attributes of God.', 'celebration', 'amber', 2),
    ('Worship', 'Intimate, slow-tempo songs for deep personal reflection.', 'favorite', 'rose', 3),
    ('Holy of Holies', 'The peak moments of spiritual encounter and reverence.', 'auto_awesome', 'gold', 4)
) AS seed(name, description, icon, color, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories cat WHERE cat.church_id = c.id
);
