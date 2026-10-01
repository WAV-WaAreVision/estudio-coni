-- "Usar esta" in the idea bank adds an idea to the week's ideas on Inicio without starting a script (and without
-- spending): the idea keeps its state and gets the moment she pinned it. Clearing it is "Deshacer".
alter table public.ideas add column fijada_en timestamptz;
