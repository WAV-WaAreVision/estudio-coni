-- Borrar con «Deshacer» (pedido 29, punto 4g; Coni's SQL, docs/pedido-coni-2026-10-31/pedido-original.md:253-322):
-- a row is marked, hidden everywhere Coni looks, and the ten-minute maintenance deletes it a minute later. Adds only.
alter table public.materiales add column borrar_desde timestamptz;
alter table public.autores add column borrar_desde timestamptz;
create index materiales_por_borrar on public.materiales (borrar_desde) where borrar_desde is not null;
create index autores_por_borrar on public.autores (borrar_desde) where borrar_desde is not null;

-- What is marked is not seen in the Biblioteca's lists.
create view public.materiales_visibles with (security_invoker = true) as
select * from public.materiales where borrar_desde is null;
create view public.autores_visibles with (security_invoker = true) as
select * from public.autores where borrar_desde is null;
grant select on public.materiales_visibles, public.autores_visibles to authenticated;
