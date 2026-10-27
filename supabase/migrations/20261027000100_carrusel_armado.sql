-- LinkedIn carousels, part 2 (design 2026-10-26, D4, D5; plan 2026-10-27, amendments 1, 2 and 10): the ways into
-- rendering, the binding of a carousel's gate 2, and the notices of its slides.

-- A carousel whose render failed waits in error_produccion and Reintentar takes it back to armando_carrusel.
alter table public.piezas drop constraint piezas_estado_antes_del_error_check;
alter table public.piezas add constraint piezas_estado_antes_del_error_check
  check (estado_antes_del_error in ('en_render', 'subtitulando', 'programado', 'armando_carrusel'));

-- A rendered version has every file gate 2 shows and the upload needs.
alter table public.carruseles add constraint listo_con_archivos check (
  estado <> 'listo' or (pdf_clave is not null and cardinality(png_claves) = jsonb_array_length(laminas))
);

-- proteger_pieza as of 20261026000140, plus: a carousel enters armando_carrusel from its signature, a design change
-- (only through cambiar_diseno_de_carrusel) or Reintentar; gate 2 goes back to be rewritten only through
-- pedir_cambio_de_carrusel; a carousel's gate 2 signs the latest rendered version with gate 1's words.
create or replace function public.proteger_pieza()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
declare
  aprueba_puerta1 boolean;
  aprueba_puerta2 boolean;
begin
  if tg_op = 'INSERT' then
    if new.version <> 0 or new.puerta1_hash is not null or new.puerta2_hash_texto is not null
       or new.avatar_id is not null or new.puerta1_formula is not null or new.pedido_de_cambio is not null then
      raise exception using errcode = '42501', message = 'pieza_nueva_invalida';
    end if;
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  if new.tipo is distinct from old.tipo then
    raise exception using errcode = '42501', message = 'tipo_inmutable';
  end if;

  if old.puerta2_hash_texto is not null and new.puerta2_hash_texto is not null
     and (new.texto_linkedin is distinct from old.texto_linkedin or new.destinos is distinct from old.destinos) then
    raise exception using errcode = '42501', message = 'artefacto_aprobado';
  end if;

  aprueba_puerta1 := new.puerta1_hash is not null and new.puerta1_hash is distinct from old.puerta1_hash;
  aprueba_puerta2 := new.puerta2_hash_texto is not null and (
    new.puerta2_hash_texto is distinct from old.puerta2_hash_texto
    or new.puerta2_video_id is distinct from old.puerta2_video_id
    or new.puerta2_carrusel_id is distinct from old.puerta2_carrusel_id
    or new.puerta2_publicar_en is distinct from old.puerta2_publicar_en
  );
  if (aprueba_puerta1 or aprueba_puerta2) and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_aprueba';
  end if;
  if new.estado in ('grabando_voz', 'en_render', 'armando_carrusel', 'programado', 'publicado_a_mano')
     and new.estado is distinct from old.estado and not public.es_coni() then
    -- The publish task may close a mixed piece (one destination by hand, the last one automatic: L7) only when
    -- nothing is left to upload.
    if not (new.estado = 'publicado_a_mano' and old.estado = 'programado'
            and not exists (select 1 from public.publicaciones
                             where pieza_id = new.id and estado in ('esperando', 'para_subir'))) then
      raise exception using errcode = '42501', message = 'solo_coni_entra_a_puerta';
    end if;
  end if;

  -- Her change request counts against three (pedir_cambio_de_carrusel): a session must not get around it, at gate 1
  -- or at gate 2 ("El texto").
  if new.tipo = 'carrusel' and old.estado in ('guion_por_aprobar', 'carrusel_por_aprobar')
     and new.estado = 'guion_en_proceso' and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'cambio_por_funcion';
  end if;
  if new.pedido_de_cambio is distinct from old.pedido_de_cambio and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'pedido_solo_por_funcion';
  end if;
  if new.cambios_de_texto is distinct from old.cambios_de_texto and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'cambios_solo_por_funcion';
  end if;

  if new.avatar_id is distinct from old.avatar_id then
    if not public.es_coni() then
      raise exception using errcode = '42501', message = 'solo_coni_elige_avatar';
    end if;
    if old.estado <> 'guion_por_aprobar' then
      raise exception using errcode = '42501', message = 'avatar_fuera_del_guion';
    end if;
  end if;
  if new.puerta1_formula is distinct from old.puerta1_formula and not aprueba_puerta1 then
    raise exception using errcode = '42501', message = 'formula_solo_con_aprobacion';
  end if;
  if new.puerta2_formula is distinct from old.puerta2_formula
     and new.puerta2_hash_texto is not null and not aprueba_puerta2 then
    raise exception using errcode = '42501', message = 'formula_solo_con_aprobacion';
  end if;
  if new.respaldo is distinct from old.respaldo and current_user in ('authenticated', 'anon') then
    raise exception using errcode = '42501', message = 'respaldo_solo_de_tareas';
  end if;
  if aprueba_puerta1 and new.tipo = 'reel' and new.avatar_id is null then
    raise exception using errcode = '42501', message = 'falta_avatar';
  end if;
  -- A carousel enters armando_carrusel from its gate 1 signature (exigir_revision_limpia checks the review on leaving
  -- guion_por_aprobar), from a design change at gate 2 (only through cambiar_diseno_de_carrusel, which keeps the words)
  -- or from Reintentar after a failed render.
  if new.tipo = 'carrusel' and new.estado = 'armando_carrusel' and new.estado is distinct from old.estado then
    if old.estado not in ('guion_por_aprobar', 'carrusel_por_aprobar', 'error_produccion') then
      raise exception using errcode = '42501', message = 'firma_fuera_de_puerta1';
    end if;
    if old.estado = 'carrusel_por_aprobar' and current_user in ('authenticated', 'anon') then
      raise exception using errcode = '42501', message = 'diseno_por_funcion';
    end if;
  end if;
  -- What she signs is the latest version she read (amendment 4 of part 1): a version written meanwhile is not signed blind.
  if aprueba_puerta1 and new.tipo = 'carrusel' and new.puerta1_hash is distinct from (
    select c.hash_texto from public.carruseles c where c.pieza_id = new.id order by c.version desc limit 1
  ) then
    raise exception using errcode = '42501', message = 'carrusel_no_coincide';
  end if;
  if new.tipo = 'carrusel' and new.estado is distinct from old.estado
     and new.estado in ('armando_carrusel', 'carrusel_por_aprobar', 'programado', 'para_subir_a_mano', 'publicado',
                        'publicado_a_mano', 'error_publicacion')
     and new.puerta1_hash is distinct from (
       select c.hash_texto from public.carruseles c where c.pieza_id = new.id order by c.version desc limit 1
     ) then
    raise exception using errcode = '42501', message = 'carrusel_no_coincide';
  end if;
  -- Gate 2 of a carousel (plan amendment 2): from carrusel_por_aprobar, on the latest version, rendered, with the words
  -- gate 1 signed.
  if aprueba_puerta2 and new.tipo = 'carrusel' and (
    old.estado <> 'carrusel_por_aprobar'
    or not exists (
      select 1 from public.carruseles c
       where c.id = new.puerta2_carrusel_id and c.pieza_id = new.id and c.estado = 'listo'
         and c.hash_texto = new.puerta2_hash_texto and c.hash_texto = new.puerta1_hash
         and c.version = (select max(v.version) from public.carruseles v where v.pieza_id = new.id)
    )
  ) then
    raise exception using errcode = '42501', message = 'carrusel_no_coincide';
  end if;

  if aprueba_puerta1 then
    new.puerta1_por := auth.uid();
  elsif new.puerta1_hash is null then
    new.puerta1_por := null;
  else
    new.puerta1_por := old.puerta1_por;
  end if;
  if aprueba_puerta2 then
    new.puerta2_por := auth.uid();
  elsif new.puerta2_hash_texto is null then
    new.puerta2_por := null;
  else
    new.puerta2_por := old.puerta2_por;
  end if;
  -- The formula describes an approval: without one there is nothing for it to describe.
  if new.puerta2_hash_texto is null then
    new.puerta2_formula := null;
  end if;

  new.actualizada_en := now();
  return new;
end $function$;

-- avisar_pieza_lista as of 20261026000120, plus: a carousel's slides are ready (carrusel_por_aprobar), and a carousel
-- back at gate 1 from its render (shortened, or too long) asks for her signature again.
create or replace function public.avisar_pieza_lista() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  tipo_aviso text;
  texto text;
begin
  if new.estado = 'guion_por_aprobar' then
    if old.estado = 'grabando_voz' or public.es_coni() then
      return null;
    end if;
    tipo_aviso := 'guion_listo';
    texto := case
      when new.tipo = 'carrusel' and old.estado = 'armando_carrusel'
        then 'Tu carrusel «' || left(new.titulo, 120) || '» necesita tu firma de nuevo.'
      when new.tipo = 'carrusel'
        then 'Tu carrusel «' || left(new.titulo, 120) || '» está listo para revisar.'
      else 'Tu guion «' || left(new.titulo, 120) || '» está listo para revisar.'
    end;
  elsif new.estado = 'carrusel_por_aprobar' then
    tipo_aviso := 'video_listo';
    texto := 'Tu carrusel «' || left(new.titulo, 120) || '» está listo para verlo y elegir la fecha.';
  else
    tipo_aviso := 'video_listo';
    texto := 'Tu video «' || left(new.titulo, 120) || '» está listo para verlo y aprobarlo.';
  end if;
  -- `version` goes up on every write, so a state is noted once per time the piece enters it.
  insert into public.avisos (tipo, pieza_id, clave, mensaje)
  values (tipo_aviso, new.id, tipo_aviso || ':' || new.id || ':' || new.version, texto)
  on conflict (clave) do nothing;
  return null;
end $$;

drop trigger avisar_pieza_lista on public.piezas;
create trigger avisar_pieza_lista after update of estado on public.piezas
  for each row
  when (new.estado in ('guion_por_aprobar', 'video_por_aprobar', 'carrusel_por_aprobar')
        and new.estado is distinct from old.estado)
  execute function public.avisar_pieza_lista();
