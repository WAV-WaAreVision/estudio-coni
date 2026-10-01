-- Daily readings of Instagram's insights (Plan 5b, Track B). Only the `metricas-diarias` task writes them, as
-- service_role; Coni and the maintainer read. One row per reel per day, so the screen can show the newest and a
-- later plan can draw the curve.
create table public.metricas_reel (
  pieza_id uuid not null references public.piezas (id) on delete cascade,
  -- The day of the reading in the app's zone (`ajustes.zona`), not in UTC.
  dia date not null,
  -- Any figure Instagram did not return stays null: "unknown" is not "zero".
  alcance integer check (alcance >= 0),
  guardados integer check (guardados >= 0),
  compartidos integer check (compartidos >= 0),
  comentarios integer check (comentarios >= 0),
  -- `ig_reels_avg_watch_time` exactly as Instagram returns it. Meta's docs name no unit; lib/dominio/metricas.ts reads
  -- it as milliseconds in one place.
  tiempo_promedio numeric(14, 3) check (tiempo_promedio >= 0),
  leido_en timestamptz not null default now(),
  primary key (pieza_id, dia)
);
create index metricas_reel_dia on public.metricas_reel (dia);

-- Account level, one row per day measured. `profile_links_taps` counts taps on the profile's contact buttons (address,
-- call, email, text), not the taps on the link of the bio: those come from `/l`.
create table public.metricas_cuenta (
  dia date primary key,
  toques_perfil integer not null check (toques_perfil >= 0),
  leido_en timestamptz not null default now()
);

alter table public.metricas_reel enable row level security;
alter table public.metricas_cuenta enable row level security;

create policy "coni y wav leen metricas de reels" on public.metricas_reel for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "coni y wav leen metricas de la cuenta" on public.metricas_cuenta for select to authenticated
  using (public.es_coni() or public.es_mantenedor());

-- No write policy for anyone: service_role bypasses row level security and nobody else may write.
revoke insert, update, delete, truncate on public.metricas_reel, public.metricas_cuenta from anon, authenticated;
revoke all on public.metricas_reel, public.metricas_cuenta from anon;
