-- LinkedIn as a second destination, by hand (design 2026-10-06, D1, D2, D6, D7): the functions only Coni can run to edit
-- the LinkedIn text and to say one destination is up, and the trigger that keeps the rows of `publicaciones` in step
-- with the piece.

-- The LinkedIn text is not part of gate 1, so editing it never takes gate 1 back. On a scheduled piece it takes gate 2
-- back, like the caption (the trigger below deletes the rows when the approval goes).
create function public.editar_texto_linkedin_como_coni(p_pieza uuid, p_version integer, p_texto text, p_revision jsonb)
 returns public.piezas
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_pieza public.piezas;
  v_resultado public.piezas;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_edita_texto';
  end if;
  if jsonb_typeof(p_revision) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'revision_invalida';
  end if;
  if btrim(coalesce(p_texto, ''), E' \t\r\n') = '' then
    raise exception using errcode = '22023', message = 'texto_vacio';
  end if;

  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado not in ('guion_por_aprobar', 'guion_aprobado', 'video_por_aprobar', 'programado') then
    raise exception using errcode = 'P0001', message = 'estado_no_editable';
  end if;

  update public.piezas
     set texto_linkedin = p_texto,
         revision = p_revision,
         version = version + 1,
         estado = case when estado = 'programado' then 'video_por_aprobar'::public.estado_pieza else estado end,
         intento = case when estado = 'programado' then intento + 1 else intento end,
         puerta2_video_id = case when estado = 'programado' then null else puerta2_video_id end,
         puerta2_hash_texto = case when estado = 'programado' then null else puerta2_hash_texto end,
         puerta2_publicar_en = case when estado = 'programado' then null else puerta2_publicar_en end,
         puerta2_en = case when estado = 'programado' then null else puerta2_en end
   where id = p_pieza
  returning * into v_resultado;
  return v_resultado;
end $function$;

-- She uploaded one destination by hand. The row and the piece change in one transaction, with the optimistic lock: with
-- another destination still pending the piece keeps its state; with none left it is publicado_a_mano. A destination can
-- be marked before its time (the piece is still programado); nothing is left scheduled to go out twice because the
-- publication only ever hands the pending rows over.
create function public.marcar_subido_como_coni(p_pieza uuid, p_version integer, p_destino text, p_enlace text)
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

revoke execute on function public.editar_texto_linkedin_como_coni(uuid, integer, text, jsonb) from public, anon;
revoke execute on function public.marcar_subido_como_coni(uuid, integer, text, text) from public, anon;
grant execute on function public.editar_texto_linkedin_como_coni(uuid, integer, text, jsonb) to authenticated;
grant execute on function public.marcar_subido_como_coni(uuid, integer, text, text) to authenticated;

-- The rows follow the piece, whoever writes it (the screens, the publish task, a repair):
--   gate 2 approved            -> one `esperando` row per chosen destination
--   gate 2 taken back          -> the rows that still wait go; what she already uploaded stays
--   handed over to Coni        -> `esperando` becomes `para_subir` (rows that are missing are made, so the screen
--                                 always has something to show); Instagram already published by itself -> `publicado`
--   published by Instagram     -> the Instagram row is `publicado`
--   publicado_a_mano by any path -> what was still pending counts as uploaded by hand
create function public.sincronizar_publicaciones() returns trigger
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
        where public.publicaciones.estado in ('esperando', 'para_subir');
    end loop;
  elsif old.puerta2_hash_texto is not null and new.puerta2_hash_texto is null then
    delete from public.publicaciones where pieza_id = new.id and estado in ('esperando', 'para_subir');
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

revoke execute on function public.sincronizar_publicaciones() from public, anon, authenticated, service_role;

create trigger sincronizar_publicaciones after update on public.piezas
  for each row execute function public.sincronizar_publicaciones();
