-- The first time Coni opens a ready video she is told how to read what she sees (design Pass 3, step 5). Remembered
-- here, not in the browser, so it is once per person and not once per phone.
alter table public.ajustes add column avatar_visto_en timestamptz;
