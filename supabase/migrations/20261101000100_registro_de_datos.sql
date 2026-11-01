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
-- A row with a deletion rule stays: removing and re-adding it would hide a real rule from Coni (D4).
create policy "wav quita del inventario" on public.inventario_de_datos for delete to authenticated
  using (public.es_mantenedor() and regla_de_borrado is null);
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
   'Se borra a los dos días. El respaldo nocturno guarda una copia hasta 30 días.', 'huella_de_visitas', 1),
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

-- Part 2: «Cómo uso IA en mi contenido». Coni edits and publishes it (D3); every publication is a new version and
-- going back copies an old text into a new one, so the history is never rewritten. Plain text with blank lines
-- between paragraphs (D5). WAV's first draft is version 0, a proposal that can never be the current page.
create table public.transparencia_versiones (
  id uuid primary key default gen_random_uuid(),
  version integer not null unique check (version >= 0),
  texto text not null check (char_length(texto) between 300 and 6000),
  motivo text not null check (char_length(btrim(motivo)) between 3 and 300),
  creada_por uuid references auth.users (id) on delete set null,
  creada_en timestamptz not null default now(),
  propuesta boolean not null default false,
  vigente boolean not null default false,
  constraint propuesta_nunca_vigente check (not (propuesta and vigente))
);
create unique index una_transparencia_vigente on public.transparencia_versiones (vigente) where vigente;

alter table public.transparencia_versiones enable row level security;
create policy "coni y wav leen las versiones" on public.transparencia_versiones for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
-- Written only through publicar_transparencia and volver_a_transparencia.
revoke all on public.transparencia_versiones from anon;
revoke insert, update, delete, truncate on public.transparencia_versiones from authenticated;
grant select on public.transparencia_versiones to authenticated;

-- WAV's draft from Coni's five points (pedido L.16851). Coni rewrites and publishes it.
insert into public.transparencia_versiones (version, texto, motivo, propuesta) values (0, $texto$Uso inteligencia artificial para hacer mi contenido y quiero contarte cómo, con palabras simples.

Algunos de mis reels los hace mi avatar digital: una versión de mí creada con IA a partir de mi rostro y mi voz, con mi autorización. Cada reel hecho así lo dice en su texto y, en Instagram, lleva la etiqueta «Información de IA». Antes de que salga, veo el video completo y lo apruebo yo.

Mis textos los escribo con apoyo de IA. La herramienta me ayuda a ordenar ideas, proponer borradores y revisar la redacción, pero cada texto lo leo, lo corrijo y lo firmo yo. Lo que publico es mi criterio profesional y respondo por él.

Cuando hablo de un estudio o de un dato, cito la fuente para que puedas revisarla tú también. Si algo no tiene una fuente que lo respalde, no lo presento como un hecho.

Nunca uso datos de mis pacientes. Ninguna conversación, historia ni caso de mi consulta entra a estas herramientas ni aparece en mi contenido.

Si uso una imagen hecha con IA que se ve real, la marco como hecha con IA. No publico imágenes hechas con IA que se hagan pasar por fotos reales de una persona, un lugar o una situación.

Mi contenido es educativo y no reemplaza una consulta.$texto$, 'Borrador de WAV para que lo revises', true);

create function public.publicar_transparencia(p_texto text, p_motivo text) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  -- The same normalisation as normalizarTexto in lib/transparencia/texto.ts, so the editor counts what is stored.
  v_texto text := btrim(replace(coalesce(p_texto, ''), E'\r\n', E'\n'), E' \t\n');
  v_motivo text := btrim(coalesce(p_motivo, ''), E' \t\n\r');
  v_version integer;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_publica';
  end if;
  if char_length(v_texto) not between 300 and 6000 then
    raise exception using errcode = '22023', message = 'texto_fuera_de_largo';
  end if;
  if char_length(v_motivo) < 3 then
    raise exception using errcode = '22023', message = 'falta_motivo';
  end if;
  if char_length(v_motivo) > 300 then
    raise exception using errcode = '22023', message = 'motivo_largo';
  end if;
  -- Two taps at once must not take the same number.
  lock table public.transparencia_versiones in share row exclusive mode;
  select coalesce(max(version), 0) + 1 into v_version from public.transparencia_versiones;
  update public.transparencia_versiones set vigente = false where vigente;
  insert into public.transparencia_versiones (version, texto, motivo, creada_por, vigente)
  values (v_version, v_texto, v_motivo, auth.uid(), true);
  return v_version;
end $$;

create function public.volver_a_transparencia(p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_texto text;
  v_propuesta boolean;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_publica';
  end if;
  select texto, propuesta into v_texto, v_propuesta from public.transparencia_versiones where version = p_version;
  if not found then
    raise exception using errcode = '22023', message = 'version_desconocida';
  end if;
  -- WAV's draft was never on the page, so there is nothing to go back to.
  if v_propuesta then
    raise exception using errcode = '22023', message = 'no_publicada';
  end if;
  return public.publicar_transparencia(v_texto, format('Volví a la versión %s', p_version));
end $$;

-- D6: what the public page reads, with the anon key. Only the current published text and its date.
create function public.transparencia_vigente() returns table (texto text, creada_en timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.texto, v.creada_en from public.transparencia_versiones v where v.vigente and not v.propuesta
$$;

revoke execute on function public.publicar_transparencia(text, text) from public, anon;
grant execute on function public.publicar_transparencia(text, text) to authenticated;
revoke execute on function public.volver_a_transparencia(integer) from public, anon;
grant execute on function public.volver_a_transparencia(integer) to authenticated;
revoke execute on function public.transparencia_vigente() from public;
grant execute on function public.transparencia_vigente() to anon, authenticated, service_role;
