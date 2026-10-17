-- LinkedIn numbers, by hand now and from an API later (spec 2026-10-17, part 3, decisions 18 to 21; plan amendments
-- A1 and A6). WAV notes them inside Coni's session (the app only opens for her), so both members may write manual
-- rows; api and metricool rows come only from the service role. Who wrote a row is sealed by the trigger, never sent.

create table public.metricas_linkedin (
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  -- The day it was read, in the app's zone (`ajustes.zona`).
  medido_en date not null,
  -- An unknown figure stays null: "unknown" is not "zero". The form asks for all four.
  impresiones integer check (impresiones >= 0),
  reacciones integer check (reacciones >= 0),
  comentarios integer check (comentarios >= 0),
  compartidos integer check (compartidos >= 0),
  origen text not null check (origen in ('manual', 'api', 'metricool')),
  anotado_por uuid,
  anotado_en timestamptz not null default now(),
  primary key (pieza_id, medido_en)
);

create table public.metricas_linkedin_cuenta (
  -- The Monday of the week counted.
  semana date primary key check (extract(isodow from semana) = 1),
  seguidores integer not null check (seguidores >= 0),
  origen text not null check (origen in ('manual', 'api', 'metricool')),
  anotado_por uuid,
  anotado_en timestamptz not null default now()
);

create function public.sellar_anotacion() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Null for the service role: an automated row has no person behind it.
  new.anotado_por := auth.uid();
  new.anotado_en := now();
  return new;
end $$;

create trigger sellar before insert or update on public.metricas_linkedin
  for each row execute function public.sellar_anotacion();
create trigger sellar before insert or update on public.metricas_linkedin_cuenta
  for each row execute function public.sellar_anotacion();

alter table public.metricas_linkedin enable row level security;
alter table public.metricas_linkedin_cuenta enable row level security;

create policy "coni y wav leen metricas de linkedin" on public.metricas_linkedin for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav anotan metricas de linkedin" on public.metricas_linkedin for insert to authenticated
  with check ((public.es_coni() or public.es_mantenedor()) and origen = 'manual');
create policy "coni y wav corrigen metricas de linkedin" on public.metricas_linkedin for update to authenticated
  using (public.es_coni() or public.es_mantenedor())
  with check ((public.es_coni() or public.es_mantenedor()) and origen = 'manual');

create policy "coni y wav leen la cuenta de linkedin" on public.metricas_linkedin_cuenta for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav anotan la cuenta de linkedin" on public.metricas_linkedin_cuenta for insert
  to authenticated with check ((public.es_coni() or public.es_mantenedor()) and origen = 'manual');
create policy "coni y wav corrigen la cuenta de linkedin" on public.metricas_linkedin_cuenta for update
  to authenticated using (public.es_coni() or public.es_mantenedor())
  with check ((public.es_coni() or public.es_mantenedor()) and origen = 'manual');

revoke all on public.metricas_linkedin, public.metricas_linkedin_cuenta from anon;
revoke delete, truncate on public.metricas_linkedin, public.metricas_linkedin_cuenta from authenticated;
grant select, insert, update on public.metricas_linkedin, public.metricas_linkedin_cuenta to authenticated;

-- The newest reading of every post, read with the caller's rights (as metricas_reel_ultima).
create view public.metricas_linkedin_ultima with (security_invoker = true) as
  select distinct on (pieza_id) pieza_id, medido_en, impresiones, reacciones, comentarios, compartidos, origen
  from public.metricas_linkedin
  order by pieza_id, medido_en desc;

revoke all on public.metricas_linkedin_ultima from anon;
grant select on public.metricas_linkedin_ultima to authenticated, service_role;
