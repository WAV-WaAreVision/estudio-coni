-- "Llegó una consulta" (Plan 5b, Track B, design Premisa 5): a one-tap counter. Only the moment is kept, never who
-- wrote or why (Ley 21.719: health data is sensitive), so the table has no free text and no patient reference.
create table public.consultas (
  id uuid primary key default gen_random_uuid(),
  anotada_en timestamptz not null default now()
);
create index consultas_anotada_en on public.consultas (anotada_en);

alter table public.consultas enable row level security;

create policy "coni y wav leen consultas" on public.consultas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni anota consultas" on public.consultas for insert to authenticated
  with check (public.es_coni());
-- "Deshacer" right after a mistaken tap; the history of earlier days is not hers to edit.
create policy "coni deshace una consulta reciente" on public.consultas for delete to authenticated
  using (public.es_coni() and anotada_en > now() - interval '1 day');

revoke update, truncate on public.consultas from anon, authenticated;
revoke all on public.consultas from anon;
