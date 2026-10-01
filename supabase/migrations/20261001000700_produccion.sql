-- Findings of the automatic review (deterministic rules and Claude's), stored with the script they judged.
alter table public.piezas add column revision jsonb not null default '[]'::jsonb;

-- The editorial guide the script writer reads. Versions are append-only; exactly one is current.
create table public.guias (
  version integer primary key,
  texto text not null,
  vigente boolean not null default false,
  creada_en timestamptz not null default now()
);
create unique index guias_una_vigente on public.guias (vigente) where vigente;

alter table public.guias enable row level security;
-- Reading only: tasks write with service_role, which bypasses RLS, and nobody else has a write policy.
create policy "coni y wav leen guias" on public.guias for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

create trigger auditar after insert or update or delete on public.guias
  for each row execute function public.registrar_evento();
