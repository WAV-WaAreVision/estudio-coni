-- Personal data register and AI transparency page (spec 2026-11-01, change 26 of Coni's request). Part 1: the
-- register, the log of what the app deletes by itself, the yearly review and its notice.

-- What the app handles, in Coni's words (D2: WAV keeps it from Ingesta, Coni reads it in Ajustes). The register
-- describes and the code deletes (D4): `regla_de_borrado` is a key of REGLAS_DE_BORRADO in
-- lib/datos-personales/reglas.ts, set only by migrations; a different `plazo_dias` is shown as a mismatch.
create table public.inventario_de_datos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z][a-z_]{2,39}$'),
  dato text not null check (char_length(btrim(dato)) between 3 and 120),
  para_que text not null check (char_length(btrim(para_que)) between 3 and 300),
  proveedor text not null check (char_length(btrim(proveedor)) between 2 and 120),
  pais text not null check (char_length(btrim(pais)) between 2 and 80),
  pais_confirmado boolean not null default false,
  plazo text not null check (char_length(btrim(plazo)) between 3 and 200),
  regla_de_borrado text check (regla_de_borrado ~ '^[a-z][a-z_]{2,39}$'),
  plazo_dias integer check (plazo_dias is null or plazo_dias >= 0),
  orden integer not null check (orden between 0 and 999),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null,
  constraint regla_con_plazo check (regla_de_borrado is null or plazo_dias is not null)
);

create function public.sellar_inventario() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  return new;
end $$;

create trigger sellar_inventario before insert or update on public.inventario_de_datos
  for each row execute function public.sellar_inventario();

alter table public.inventario_de_datos enable row level security;
create policy "coni y wav leen el inventario" on public.inventario_de_datos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create policy "wav agrega al inventario" on public.inventario_de_datos for insert to authenticated
  with check (public.es_mantenedor());
create policy "wav corrige el inventario" on public.inventario_de_datos for update to authenticated
  using (public.es_mantenedor()) with check (public.es_mantenedor());
create policy "wav quita del inventario" on public.inventario_de_datos for delete to authenticated
  using (public.es_mantenedor());
revoke all on public.inventario_de_datos from anon;
revoke insert, update, delete, truncate on public.inventario_de_datos from authenticated;
grant select, delete on public.inventario_de_datos to authenticated;
grant insert (clave, dato, para_que, proveedor, pais, pais_confirmado, plazo, plazo_dias, orden)
  on public.inventario_de_datos to authenticated;
grant update (dato, para_que, proveedor, pais, pais_confirmado, plazo, plazo_dias, orden)
  on public.inventario_de_datos to authenticated;

-- What exists today (scope A). Followers, reposts and comments get their rows with their own changes (8, 13, 27).
-- Countries and periods wait for the legal review: WAV confirms them from Ingesta.
insert into public.inventario_de_datos
  (clave, orden, dato, para_que, proveedor, pais, plazo, regla_de_borrado, plazo_dias)
values
  ('rostro_de_coni', 1, 'Tu rostro (biometría)', 'Crear y animar tu avatar digital en los reels.', 'HeyGen',
   'Estados Unidos', 'Mientras uses el avatar. Se borra si se lo pides a HeyGen.', null, null),
  ('voz_de_coni', 2, 'Tu voz (biometría)', 'Crear la voz de tu avatar y leer tus guiones.', 'ElevenLabs',
   'Estados Unidos', 'Mientras uses la voz. Se borra si se lo pides a ElevenLabs.', null, null),
  ('conexiones_de_cuentas', 3, 'Las conexiones con tus cuentas de Instagram y LinkedIn',
   'Publicar tus piezas y leer sus números.', 'Meta y LinkedIn', 'Estados Unidos e Irlanda',
   'Mientras estén conectadas. Se borran al desconectarlas.', null, null),
  ('metricas_de_cuentas', 4, 'Los números de tus cuentas y de tus piezas',
   'Mostrarte cómo le va a cada pieza y a cada red.', 'Supabase', 'Por confirmar', 'Mientras uses la app.', null,
   null),
  ('material_y_afirmaciones', 5, 'Tu material de referencia y sus afirmaciones (sin datos de pacientes)',
   'Armar tu biblioteca y escribir tus piezas con fuentes.', 'Supabase y Cloudflare R2', 'Por confirmar',
   'Mientras exista tu biblioteca. Se borra al borrar el material.', null, null),
  ('textos_enviados_a_ia', 6, 'Textos enviados a IA', 'Escribir, revisar y buscar en tu material.',
   'Anthropic (Claude) y Voyage', 'Estados Unidos', 'Según cada proveedor, por confirmar.', null, null),
  ('audios_a_transcribir', 7, 'Audios y videos enviados a transcribir', 'Pasar a texto el material que subes.',
   'ElevenLabs', 'Estados Unidos', 'Según ElevenLabs, por confirmar.', null, null),
  ('videos_de_piezas', 8, 'Videos y voces de tus piezas', 'Grabar, revisar y publicar tus reels.', 'Cloudflare R2',
   'Por confirmar', 'El video final, 30 días después de publicar o descartar la pieza. La voz, 30 días después de descartarla.',
   'videos_de_piezas', 30),
  ('respaldos', 9, 'Respaldo nocturno de la base', 'Recuperar la app si algo se pierde.', 'Cloudflare R2',
   'Por confirmar', 'Se guardan los últimos 30 días.', 'respaldos', 30),
  ('huella_de_visitas', 10, 'Huella diaria de quien toca tus enlaces de /l',
   'Contar un clic por persona y día, sin guardar su dirección ni su aparato.', 'Supabase', 'Por confirmar',
   'Se borra al día siguiente.', 'huella_de_visitas', 1),
  ('suscripciones_a_avisos', 11, 'Los aparatos donde recibes avisos', 'Mandarte avisos al celular.', 'Supabase',
   'Por confirmar', 'Mientras no los quites en Ajustes.', null, null);

-- One row per rule per night that deleted something: which rule, how many, when. Never what was deleted.
create table public.registro_de_borrados (
  id uuid primary key default gen_random_uuid(),
  regla text not null check (regla ~ '^[a-z][a-z_]{2,39}$'),
  cantidad integer not null check (cantidad > 0),
  borrado_en timestamptz not null default now()
);
create index registro_de_borrados_recientes on public.registro_de_borrados (borrado_en desc);

alter table public.registro_de_borrados enable row level security;
create policy "coni y wav leen los borrados" on public.registro_de_borrados for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
-- Written only by the nightly maintenance, as service_role.
revoke all on public.registro_de_borrados from anon;
revoke insert, update, delete, truncate on public.registro_de_borrados from authenticated;
grant select on public.registro_de_borrados to authenticated;

-- Coni's yearly "Lo revisé". Written only through marcar_inventario_revisado().
create table public.revisiones_de_inventario (
  id uuid primary key default gen_random_uuid(),
  revisado_por uuid references auth.users (id) on delete set null,
  revisado_en timestamptz not null default now()
);

alter table public.revisiones_de_inventario enable row level security;
create policy "coni y wav leen las revisiones" on public.revisiones_de_inventario for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
revoke all on public.revisiones_de_inventario from anon;
revoke insert, update, delete, truncate on public.revisiones_de_inventario from authenticated;
grant select on public.revisiones_de_inventario to authenticated;

alter table public.ajustes
  -- The first yearly review is due a year after the register started: the day this migration runs.
  add column inventario_desde date not null default current_date,
  -- The due date Coni and WAV were already told about: the nightly run tells them once per due date.
  add column revision_de_inventario_avisada date;

create function public.marcar_inventario_revisado() returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_revisado_en timestamptz;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_revisa';
  end if;
  insert into public.revisiones_de_inventario (revisado_por) values (auth.uid())
    returning revisado_en into v_revisado_en;
  -- The yearly notice has done its job once she reviewed.
  update public.avisos set leido_en = now() where tipo = 'revision_de_inventario' and leido_en is null;
  return v_revisado_en;
end $$;

revoke execute on function public.marcar_inventario_revisado() from public, anon;
grant execute on function public.marcar_inventario_revisado() to authenticated;

-- `revision_de_inventario`: the yearly review. The full list (20261007000100_linkedin_conexion.sql plus this type);
-- tests/integration/datos-personales-esquema.test.ts checks it equals TIPOS_DE_AVISO.
alter table public.avisos drop constraint avisos_tipo_check;
alter table public.avisos add constraint avisos_tipo_check check (tipo in (
  'ideas_propuestas', 'guion_listo', 'video_listo', 'error_definitivo', 'publicado', 'tope_alcanzado',
  'instagram_por_vencer', 'recordatorio_48h', 'listo_para_subir', 'linkedin_por_vencer', 'revision_de_inventario'
));
