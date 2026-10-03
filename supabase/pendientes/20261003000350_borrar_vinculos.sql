-- Drops the last tables of the retired links. Applied only after C1 is verified in production (see the plan checklist).
drop table if exists public.vinculos;
drop table if exists public.embeddings_ficha;
