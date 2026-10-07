-- LinkedIn phase 2 (design 2026-10-07, L5, L6, L7): per-row publishing state for the LinkedIn row.
alter table public.publicaciones
  add column video_urn text,
  add column enviado_en timestamptz,
  add column post_urn text,
  add column hash_enviado text,
  add column intentos smallint not null default 0,
  add column explicacion text,
  add column ultimo_error text,
  add constraint linkedin_publicado_con_urn check (destino <> 'linkedin' or estado <> 'publicado' or post_urn is not null),
  add constraint post_urn_es_de_post check (post_urn is null or post_urn ~ '^urn:li:(share|ugcPost):[0-9]+$'),
  add constraint intentos_no_negativos check (intentos >= 0);

-- Right before POST /rest/posts: one transaction locks the piece, checks the version the run holds, marks the row as
-- sent and bumps the version. From here on the post is never sent again (L10).
create function public.reservar_envio_linkedin(p_pieza uuid, p_version integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_nueva integer;
begin
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado <> 'programado' then
    raise exception using errcode = 'P0001', message = 'estado_no_publicable';
  end if;
  update public.publicaciones
     set enviado_en = now()
   where pieza_id = p_pieza and destino = 'linkedin' and estado = 'esperando'
     and video_urn is not null and enviado_en is null and post_urn is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'linkedin_no_espera';
  end if;
  update public.piezas set version = version + 1 where id = p_pieza returning version into v_nueva;
  return v_nueva;
end $$;

revoke execute on function public.reservar_envio_linkedin(uuid, integer) from public, anon, authenticated;
grant execute on function public.reservar_envio_linkedin(uuid, integer) to service_role;

-- marcar_subido_como_coni as of 20261006000110, plus the linkedin_se_publica_solo block.
create or replace function public.marcar_subido_como_coni(p_pieza uuid, p_version integer, p_destino text, p_enlace text)
 returns public.piezas
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_pieza public.piezas;
  v_resultado public.piezas;
  v_quedan integer;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_marca_subido';
  end if;

  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado not in ('programado', 'para_subir_a_mano') then
    raise exception using errcode = 'P0001', message = 'estado_no_marcable';
  end if;

  -- A connected Instagram publishes by itself at the approved time: saying it was uploaded by hand now would make the
  -- scheduled publication skip it, or double it. Once handed over (para_subir_a_mano) it is hers to upload.
  if p_destino = 'instagram' and v_pieza.estado = 'programado'
     and exists (select 1 from public.ajustes where nullif(btrim(meta_cuenta_id), '') is not null) then
    raise exception using errcode = 'P0001', message = 'instagram_se_publica_solo';
  end if;

  -- A connected LinkedIn posts by itself at the approved time (design 2026-10-07, L5). Once its row fell back to
  -- `para_subir` it is hers again.
  if p_destino = 'linkedin' and public.linkedin_conectado()
     and exists (select 1 from public.publicaciones
                  where pieza_id = p_pieza and destino = 'linkedin' and estado = 'esperando') then
    raise exception using errcode = 'P0001', message = 'linkedin_se_publica_solo';
  end if;

  update public.publicaciones
     set estado = 'subido_a_mano', enlace = nullif(btrim(p_enlace), ''), marcado_en = now(), marcado_por = auth.uid()
   where pieza_id = p_pieza and destino = p_destino and estado in ('esperando', 'para_subir');
  if not found then
    raise exception using errcode = 'P0001', message = 'destino_no_pendiente';
  end if;

  select count(*) into v_quedan from public.publicaciones
   where pieza_id = p_pieza and estado in ('esperando', 'para_subir');

  update public.piezas
     set estado = case when v_quedan = 0 then 'publicado_a_mano'::public.estado_pieza else estado end,
         permalink = case when p_destino = 'instagram' and nullif(btrim(p_enlace), '') is not null
                          then btrim(p_enlace) else permalink end,
         version = version + 1
   where id = p_pieza
  returning * into v_resultado;
  return v_resultado;
end $function$;

-- sincronizar_publicaciones as of 20261006000110, plus: a LinkedIn row that was sent is never reset or deleted.
create or replace function public.sincronizar_publicaciones() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_destino text;
begin
  if old.puerta2_hash_texto is null and new.puerta2_hash_texto is not null then
    foreach v_destino in array new.destinos loop
      insert into public.publicaciones (pieza_id, destino, estado)
      values (new.id, v_destino, 'esperando')
      -- What she already uploaded stays as it is: a finished destination is never waiting again.
      on conflict (pieza_id, destino) do update
        set estado = 'esperando', enlace = null, marcado_en = null, marcado_por = null
        where public.publicaciones.estado in ('esperando', 'para_subir')
          and public.publicaciones.enviado_en is null and public.publicaciones.post_urn is null;
    end loop;
  elsif old.puerta2_hash_texto is not null and new.puerta2_hash_texto is null then
    -- A LinkedIn row that was sent (or may have been) stays: a post that may be live is never forgotten.
    delete from public.publicaciones
     where pieza_id = new.id and estado in ('esperando', 'para_subir')
       and enviado_en is null and post_urn is null;
  end if;

  if old.estado = 'programado' and new.estado = 'para_subir_a_mano' then
    foreach v_destino in array new.destinos loop
      insert into public.publicaciones (pieza_id, destino, estado)
      values (new.id, v_destino, 'para_subir')
      on conflict (pieza_id, destino) do nothing;
    end loop;
    update public.publicaciones set estado = 'para_subir' where pieza_id = new.id and estado = 'esperando';
    if new.media_id is not null then
      update public.publicaciones
         set estado = 'publicado', enlace = new.permalink, marcado_en = now()
       where pieza_id = new.id and destino = 'instagram';
    end if;
  end if;

  if old.estado = 'programado' and new.estado = 'publicado' then
    update public.publicaciones
       set estado = 'publicado', enlace = new.permalink, marcado_en = now()
     where pieza_id = new.id and destino = 'instagram';
  end if;

  if old.estado is distinct from new.estado and new.estado = 'publicado_a_mano' then
    update public.publicaciones
       set estado = 'subido_a_mano', marcado_en = now(), marcado_por = auth.uid()
     where pieza_id = new.id and estado in ('esperando', 'para_subir');
  end if;
  return null;
end $$;

-- proteger_pieza as of 20261006000100, plus: the system may close a mixed piece as publicado_a_mano when nothing is pending.
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
       or new.avatar_id is not null or new.puerta1_formula is not null then
      raise exception using errcode = '42501', message = 'pieza_nueva_invalida';
    end if;
    return new;
  end if;

  if new.version <> old.version + 1 then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;

  if old.puerta2_hash_texto is not null and new.puerta2_hash_texto is not null
     and (new.texto_linkedin is distinct from old.texto_linkedin or new.destinos is distinct from old.destinos) then
    raise exception using errcode = '42501', message = 'artefacto_aprobado';
  end if;

  aprueba_puerta1 := new.puerta1_hash is not null and new.puerta1_hash is distinct from old.puerta1_hash;
  aprueba_puerta2 := new.puerta2_hash_texto is not null and (
    new.puerta2_hash_texto is distinct from old.puerta2_hash_texto
    or new.puerta2_video_id is distinct from old.puerta2_video_id
    or new.puerta2_publicar_en is distinct from old.puerta2_publicar_en
  );
  if (aprueba_puerta1 or aprueba_puerta2) and not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_aprueba';
  end if;
  if new.estado in ('grabando_voz', 'en_render', 'programado', 'publicado_a_mano')
     and new.estado is distinct from old.estado and not public.es_coni() then
    -- The publish task may close a mixed piece (one destination by hand, the last one automatic: L7) only when
    -- nothing is left to upload.
    if not (new.estado = 'publicado_a_mano' and old.estado = 'programado'
            and not exists (select 1 from public.publicaciones
                             where pieza_id = new.id and estado in ('esperando', 'para_subir'))) then
      raise exception using errcode = '42501', message = 'solo_coni_entra_a_puerta';
    end if;
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
  if aprueba_puerta1 and new.avatar_id is null then
    raise exception using errcode = '42501', message = 'falta_avatar';
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
