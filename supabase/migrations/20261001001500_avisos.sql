-- Notices to Coni (Plan 6, design "Avisos a Coni"): one row per thing she is told, whether it went out as a push, as an
-- email, or is still waiting for the 08:30 summary. The row is also what the "Avisos" entry of Inicio lists.
create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
    'instagram_por_vencer', 'recordatorio_48h'
  )),
  -- Only the database owner deletes pieces (the app never does); a notice about a deleted piece means nothing.
  pieza_id uuid references public.piezas (id) on delete cascade,
  -- What a retried run would repeat: the same notice has the same key, so it is stored once.
  clave text not null unique,
  -- What Coni reads in the app and in an email. A push never carries it (a lock screen can be read by anybody).
  mensaje text not null check (length(mensaje) between 1 and 600),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  canal text check (canal in ('push', 'correo')),
  leido_en timestamptz,
  constraint envio_con_canal check ((enviado_en is null) = (canal is null))
);
create index avisos_pendientes on public.avisos (creado_en) where enviado_en is null;
create index avisos_sin_leer on public.avisos (creado_en desc) where leido_en is null;

alter table public.avisos enable row level security;

create policy "coni y wav leen avisos" on public.avisos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
-- Only the read mark is hers; the notice itself is written by the tasks (service_role bypasses RLS).
create policy "coni marca avisos como leidos" on public.avisos for update to authenticated
  using (public.es_coni()) with check (public.es_coni());

revoke all on public.avisos from anon, authenticated;
grant select on public.avisos to authenticated;
grant update (leido_en) on public.avisos to authenticated;

create trigger auditar after insert or update or delete on public.avisos
  for each row execute function public.registrar_evento();
