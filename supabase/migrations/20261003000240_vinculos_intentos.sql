-- Failed attempts at the embedding and links of a material. The sweep stops insisting at the limit
-- (MAXIMO_INTENTOS_VINCULOS) and WAV is told once. Not in any `grant update (...)` list of materiales, so only the
-- service role writes it.
alter table public.materiales add column vinculos_intentos smallint not null default 0 check (vinculos_intentos >= 0);
