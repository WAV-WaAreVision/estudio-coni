-- Pairs of topics the nightly merge already asked Claude about and got "not the same". They are not asked again.
-- Merging a rejected pair needs a manual path (not built yet): the pair is only forgotten when either topic goes away.
create table public.temas_fusion_rechazada (
  tema_a uuid not null references public.temas (id) on delete cascade,
  tema_b uuid not null references public.temas (id) on delete cascade,
  rechazada_en timestamptz not null default now(),
  primary key (tema_a, tema_b),
  check (tema_a < tema_b)
);
create index temas_fusion_rechazada_b on public.temas_fusion_rechazada (tema_b);

alter table public.temas_fusion_rechazada enable row level security;
revoke all on public.temas_fusion_rechazada from anon, authenticated;
grant select, insert on public.temas_fusion_rechazada to service_role;

-- Redefined so the candidates leave out the rejected pairs.
create or replace function public.temas_parecidos(p_umbral float)
returns table (a uuid, b uuid, similitud float)
language sql stable set search_path = '' as $$
  select x.id, y.id, 1 - (x.centroide operator(extensions.<=>) y.centroide)
  from public.temas x
  join public.temas y on x.id < y.id
  where x.fusionado_en is null
    and y.fusionado_en is null
    and 1 - (x.centroide operator(extensions.<=>) y.centroide) >= p_umbral
    and not exists (
      select 1 from public.temas_fusion_rechazada r where r.tema_a = x.id and r.tema_b = y.id
    )
  order by 3 desc, x.id, y.id
$$;
