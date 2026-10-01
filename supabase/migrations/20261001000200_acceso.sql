create table public.miembros (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rol text not null check (rol in ('coni', 'mantenedor')),
  creado_en timestamptz not null default now()
);
-- Exactly one Coni: the access rules are written against her id, not "any signed-in user".
create unique index miembros_una_coni on public.miembros (rol) where rol = 'coni';

create function public.es_coni() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where user_id = auth.uid() and rol = 'coni')
$$;

create function public.es_mantenedor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.miembros where user_id = auth.uid() and rol = 'mantenedor')
$$;

revoke execute on function public.es_coni(), public.es_mantenedor() from public, anon;
grant execute on function public.es_coni(), public.es_mantenedor() to authenticated, service_role;

alter table public.miembros enable row level security;
alter table public.ideas enable row level security;
alter table public.piezas enable row level security;
alter table public.ajustes enable row level security;
alter table public.eventos enable row level security;
alter table public.intervenciones enable row level security;
alter table public.gastos enable row level security;

create policy "cada miembro ve su fila" on public.miembros for select to authenticated using (user_id = auth.uid());

create policy "coni y wav leen ideas" on public.ideas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni crea ideas" on public.ideas for insert to authenticated with check (public.es_coni());
create policy "coni edita ideas" on public.ideas for update to authenticated
  using (public.es_coni()) with check (public.es_coni());

create policy "coni y wav leen piezas" on public.piezas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni crea piezas" on public.piezas for insert to authenticated with check (public.es_coni());
-- The maintainer never acts on pieces (A7); there is no delete policy: discarding is a state.
create policy "coni edita piezas" on public.piezas for update to authenticated
  using (public.es_coni()) with check (public.es_coni());

create policy "coni y wav leen ajustes" on public.ajustes for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni edita ajustes" on public.ajustes for update to authenticated
  using (public.es_coni()) with check (public.es_coni());

create policy "coni y wav leen eventos" on public.eventos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

create policy "coni y wav leen intervenciones" on public.intervenciones for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "wav registra intervenciones" on public.intervenciones for insert to authenticated
  with check (public.es_mantenedor());

create policy "coni y wav leen gastos" on public.gastos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
