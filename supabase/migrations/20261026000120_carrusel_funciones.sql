-- Gate 1 and the writer for carousels (design 2026-10-26, D2, D3; plan amendments 3 and 4).

-- proteger_pieza as of 20261007000110, plus: the type never changes; a carousel's gate 1 needs no avatar but must sign
-- the latest version's hash_texto; armando_carrusel is Coni's to enter; a carousel goes back to be rewritten, and its
-- request is written, only through pedir_cambio_de_carrusel; puerta2_carrusel_id is part of gate 2.
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
  -- What she signs is the latest version she read (amendment 4): a version written meanwhile is not signed blind.
  if aprueba_puerta1 and new.tipo = 'carrusel' and new.puerta1_hash is distinct from (
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

-- exigir_revision_limpia as of 20261006000105, plus the carousel's gate 1 (its only destination is LinkedIn, so every
-- blocking finding counts).
create or replace function public.exigir_revision_limpia() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Only server tasks write the review; otherwise Coni could clear it in the same update that approves.
  if new.revision is distinct from old.revision and public.es_coni() and current_user = 'authenticated' then
    raise exception using errcode = '42501', message = 'revision_solo_servidor';
  end if;
  if (
    (old.estado = 'guion_por_aprobar' and new.estado in ('guion_aprobado', 'en_render', 'armando_carrusel'))
    or (old.estado = 'video_por_aprobar' and new.estado = 'programado')
  ) and exists (
    select 1 from jsonb_array_elements(new.revision) as hallazgo
    where hallazgo ->> 'tipo' = 'bloquea'
      and (hallazgo ->> 'campo' is distinct from 'linkedin' or 'linkedin' = any (new.destinos))
  ) then
    raise exception using errcode = '42501', message = 'revision_bloquea';
  end if;
  return new;
end $$;

-- avisar_pieza_lista as of 20261016000210, plus the carousel's own words.
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
    texto := case when new.tipo = 'carrusel'
      then 'Tu carrusel «' || left(new.titulo, 120) || '» está listo para revisar.'
      else 'Tu guion «' || left(new.titulo, 120) || '» está listo para revisar.'
    end;
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

-- The carousel writer's guardar_borrador: the new version, the review, the backing and the confirmation of the spend
-- that paid for them, in one transaction. The origin comes from the piece: with a pending request it is that change.
create function public.guardar_carrusel(
  p_pieza uuid,
  p_version integer,
  p_laminas jsonb,
  p_texto_post text,
  p_hash_texto text,
  p_revision jsonb,
  p_clave text,
  p_real numeric,
  p_respaldo jsonb default null
) returns public.piezas
language plpgsql set search_path = '' as $$
declare
  v_pieza public.piezas;
begin
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.tipo <> 'carrusel' or v_pieza.estado <> 'guion_en_proceso' then
    raise exception using errcode = 'P0001', message = 'carrusel_no_se_escribe';
  end if;
  -- Only her request starts a second round; a second version without one is a bug.
  if v_pieza.pedido_de_cambio is null and exists (select 1 from public.carruseles where pieza_id = p_pieza) then
    raise exception using errcode = 'P0001', message = 'carrusel_ya_escrito';
  end if;

  insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, origen, pedido)
  values (
    p_pieza,
    coalesce((select max(version) from public.carruseles where pieza_id = p_pieza), 0) + 1,
    p_laminas,
    p_texto_post,
    p_hash_texto,
    case when v_pieza.pedido_de_cambio is null then 'inicial' else 'cambio_texto' end,
    v_pieza.pedido_de_cambio
  );

  update public.piezas
     set revision = p_revision, respaldo = p_respaldo, pedido_de_cambio = null, version = version + 1
   where id = p_pieza
  returning * into v_pieza;

  -- Without a reserved spend there is nothing to confirm; raising rolls back the writes above as well.
  update public.gastos set estado = 'confirmado', real_usd = p_real
    where clave = p_clave and estado = 'reservado';
  if not found then
    raise exception using errcode = 'P0001', message = 'gasto_no_reservado';
  end if;

  return v_pieza;
end $$;

revoke execute on function public.guardar_carrusel(uuid, integer, jsonb, text, text, jsonb, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.guardar_carrusel(uuid, integer, jsonb, text, text, jsonb, text, numeric, jsonb)
  to service_role;

-- "Pedir cambio" on a carousel at gate 1 (C8): her sentence waits on the piece for the writer, as a new attempt. At most
-- three per piece, counted here so two devices cannot pass it; MAXIMO_CAMBIOS_DE_TEXTO (lib/dominio/carrusel.ts) and
-- MAXIMO_DEL_PEDIDO mirror the numbers.
create function public.pedir_cambio_de_carrusel(p_pieza uuid, p_version integer, p_pedido text)
returns public.piezas
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_pedido text := btrim(coalesce(p_pedido, ''));
  v_cambios integer;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_pide_cambios';
  end if;
  if v_pedido = '' or char_length(v_pedido) > 500 then
    raise exception using errcode = '22023', message = 'pedido_invalido';
  end if;
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.tipo <> 'carrusel' or v_pieza.estado <> 'guion_por_aprobar' then
    raise exception using errcode = 'P0001', message = 'estado_no_cambiable';
  end if;
  select count(*) into v_cambios from public.carruseles where pieza_id = p_pieza and origen = 'cambio_texto';
  if v_cambios >= 3 then
    raise exception using errcode = 'P0001', message = 'sin_cambios_de_texto';
  end if;

  update public.piezas
     set estado = 'guion_en_proceso', intento = intento + 1, pedido_de_cambio = v_pedido, explicacion = null,
         version = version + 1
   where id = p_pieza
  returning * into v_pieza;
  return v_pieza;
end $$;

revoke execute on function public.pedir_cambio_de_carrusel(uuid, integer, text) from public, anon;
grant execute on function public.pedir_cambio_de_carrusel(uuid, integer, text) to authenticated;
