-- proponer_fechas as of 20261017000400, plus the two carousel states before gate 2 (ORDEN_SIN_FECHA of
-- lib/calendario/propuestas.ts): a signed carousel without a proposal made Repartir fail for every piece.
create or replace function public.proponer_fechas(p_piezas uuid[], p_fechas timestamptz[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'sin_permiso';
  end if;
  if p_piezas is null or p_fechas is null or cardinality(p_piezas) <> cardinality(p_fechas)
     or cardinality(p_piezas) not between 1 and 200
     or array_position(p_piezas, null) is not null or array_position(p_fechas, null) is not null
     or (select count(distinct p) from unnest(p_piezas) as p) <> cardinality(p_piezas) then
    raise exception using errcode = '22023', message = 'lote_invalido';
  end if;
  -- One writer at a time (A8): two sessions that both read a time as free cannot both store it.
  perform pg_advisory_xact_lock(hashtext('fechas_propuestas'));
  -- for share holds the pieces until this commits: gate 2 cannot sign one between the check and the insert, and a
  -- piece signed while this waited is re-read in its new state and fails the check.
  select count(*) into v_n
    from (select p.id from public.piezas p
           where p.id = any (p_piezas)
             and p.estado in ('guion_en_proceso', 'guion_por_aprobar', 'guion_aprobado', 'grabando_voz', 'en_render',
                              'subtitulando', 'error_produccion', 'video_por_aprobar', 'armando_carrusel',
                              'carrusel_por_aprobar')
             for share) s;
  -- A8: at least 2 h ahead (the Agenda's margin), one piece per time, never the signed time of a piece still to go out
  -- (scheduled or waiting to be uploaded by hand), never the time
  -- another piece's live proposal holds. A proposal is live while its piece is before gate 2 and it is 2 h ahead; the
  -- pieces of this call give theirs up, so a batch may swap times among them.
  if exists (select 1 from unnest(p_fechas) as f where f < now() + interval '2 hours')
     or (select count(distinct f) from unnest(p_fechas) as f) <> cardinality(p_fechas)
     or exists (select 1 from public.piezas p
                 where p.estado in ('programado', 'para_subir_a_mano') and p.puerta2_publicar_en = any (p_fechas))
     or exists (select 1 from public.fechas_propuestas r join public.piezas p on p.id = r.pieza_id
                 where r.publicar_en = any (p_fechas)
                   and r.pieza_id <> all (p_piezas)
                   and r.publicar_en >= now() + interval '2 hours'
                   and p.estado in ('guion_en_proceso', 'guion_por_aprobar', 'guion_aprobado', 'grabando_voz',
                                    'en_render', 'subtitulando', 'error_produccion', 'video_por_aprobar',
                                    'armando_carrusel', 'carrusel_por_aprobar'))
     or v_n <> cardinality(p_piezas) then
    raise exception using errcode = '22023', message = 'propuesta_invalida';
  end if;
  insert into public.fechas_propuestas (pieza_id, publicar_en)
  select * from unnest(p_piezas, p_fechas)
  on conflict (pieza_id) do update set publicar_en = excluded.publicar_en, propuesta_en = now();
end $$;

-- proteger_pieza as of 20261026000130, plus: a carousel enters armando_carrusel only from guion_por_aprobar.
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

  -- Her change request counts against three (pedir_cambio_de_carrusel): a session must not get around it.
  if new.tipo = 'carrusel' and old.estado = 'guion_por_aprobar' and new.estado = 'guion_en_proceso'
     and current_user in ('authenticated', 'anon') then
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
  -- A carousel is signed only from gate 1: from guion_en_proceso, with a change pending, the signature would skip
  -- exigir_revision_limpia, which checks the review only on leaving guion_por_aprobar.
  if new.tipo = 'carrusel' and new.estado = 'armando_carrusel' and new.estado is distinct from old.estado
     and old.estado <> 'guion_por_aprobar' then
    raise exception using errcode = '42501', message = 'firma_fuera_de_puerta1';
  end if;
  -- What she signs is the latest version she read (amendment 4): a version written meanwhile is not signed blind.
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
