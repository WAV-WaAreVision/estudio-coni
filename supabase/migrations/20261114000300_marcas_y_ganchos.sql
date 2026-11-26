-- Change 6a: what each claim carries, per network, from the closed lists (value) with the free phrase that keeps the
-- nuance; and the hook of the claim in three parts. Both hang from the claim: deleting or hiding it covers them.
create table public.afirmacion_marcas (
  id uuid primary key default gen_random_uuid(),
  afirmacion_id uuid not null references public.afirmaciones (id) on delete cascade,
  marca text not null check (marca in ('problema', 'solucion', 'emocion', 'dato', 'caso', 'publico')),
  red text not null check (red in ('linkedin', 'instagram', 'todas')),
  valor text not null,
  frase text,
  certeza text not null check (certeza in ('alta', 'media', 'baja')),
  por_que text,
  version_id integer references public.versiones_de_vocabulario (id),
  origen text not null check (origen in ('extraccion', 'traduccion', 'coni')),
  creada_en timestamptz not null default now(),
  constraint afirmacion_marcas_por_que_check check (valor not in ('otro', 'otra') or coalesce(por_que, '') <> '')
);
create index afirmacion_marcas_afirmacion on public.afirmacion_marcas (afirmacion_id);
create index afirmacion_marcas_valor on public.afirmacion_marcas (marca, red, valor);

create table public.ganchos (
  id uuid primary key default gen_random_uuid(),
  afirmacion_id uuid not null unique references public.afirmaciones (id) on delete cascade,
  frase_exacta text not null,
  frase_sin_gancho text not null,
  tipo text not null,
  certeza text not null check (certeza in ('alta', 'media', 'baja')),
  version_id integer not null references public.versiones_de_vocabulario (id),
  origen text not null check (origen in ('extraccion', 'traduccion', 'coni')),
  creada_en timestamptz not null default now()
);

alter table public.afirmacion_marcas enable row level security;
alter table public.ganchos enable row level security;
revoke all on public.afirmacion_marcas, public.ganchos from anon, authenticated;
grant select on public.afirmacion_marcas, public.ganchos to authenticated;
create policy "coni y wav leen marcas" on public.afirmacion_marcas for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav leen ganchos" on public.ganchos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
grant all on public.afirmacion_marcas, public.ganchos to service_role;
