-- Restyle the default worship-flow categories with distinct icons and colors.

UPDATE public.categories
SET icon = 'campaign', color = 'sky', updated_at = now()
WHERE lower(btrim(name)) IN ('call to worship', 'call-to-worship');

UPDATE public.categories
SET icon = 'music_note', color = 'violet', updated_at = now()
WHERE lower(btrim(name)) IN ('opening song', 'opening songs');

UPDATE public.categories
SET icon = 'celebration', color = 'amber', updated_at = now()
WHERE lower(btrim(name)) = 'praise';

UPDATE public.categories
SET icon = 'favorite', color = 'rose', updated_at = now()
WHERE lower(btrim(name)) = 'worship';

UPDATE public.categories
SET icon = 'auto_awesome', color = 'gold', updated_at = now()
WHERE lower(btrim(name)) IN ('holy of holies', 'holy holies', 'holy-holies');
