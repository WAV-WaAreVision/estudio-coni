-- A carousel past gate 1 always carries the signature of its latest version's words (review of part 1, finding 1).
-- Before, carrusel_no_coincide was checked only when the signature changed: signing v1, asking for a change and
-- getting v2 let the piece reach armando_carrusel with v1's signature. Now a change request takes the signature back,
-- and entering any state past gate 1 requires the signature to match the latest version.

-- Every "Pedir cambio" she made, counted when she asks (review of part 1, finding 2): a change Claude declined writes no
-- version but still counts toward the three, so the count cannot be the versions written.
alter table public.piezas
  add column cambios_de_texto smallint not null default 0,
  add constraint cambios_de_texto_validos check (cambios_de_texto between 0 and 3),
  add constraint cambios_solo_de_carrusel check (tipo = 'carrusel' or cambios_de_texto = 0);

update public.piezas p
   set cambios_de_texto = least(3, (select count(*) from public.carruseles c
                                     where c.pieza_id = p.id and c.origen = 'cambio_texto')
                                  + case when p.pedido_de_cambio is null then 0 else 1 end),
       version = version + 1
 where p.tipo = 'carrusel';

-- proteger_pieza as of 20261026000120, plus: entering a state past gate 1 needs the latest version's hash_texto, and
-- the count of her changes moves only through pedir_cambio_de_carrusel.
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

-- pedir_cambio_de_carrusel as of 20261026000120, plus: her request takes back any signature on the version it replaces,
-- and the three are counted on the piece (cambios_de_texto).
create or replace function public.pedir_cambio_de_carrusel(p_pieza uuid, p_version integer, p_pedido text)
returns public.piezas
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_pedido text := btrim(coalesce(p_pedido, ''));
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
  if v_pieza.cambios_de_texto >= 3 then
    raise exception using errcode = 'P0001', message = 'sin_cambios_de_texto';
  end if;

  update public.piezas
     set estado = 'guion_en_proceso', intento = intento + 1, pedido_de_cambio = v_pedido, explicacion = null,
         cambios_de_texto = cambios_de_texto + 1, puerta1_hash = null, puerta1_en = null, puerta1_por = null,
         version = version + 1
   where id = p_pieza
  returning * into v_pieza;
  return v_pieza;
end $$;
