-- Plan 5b, Track A. A caption edit used to be written with `service_role` because only the server may write
-- `piezas.revision`, so the audit row of the edit named nobody. This function writes the edit as Coni: the audit
-- trigger reads her id from the request's token, and the review column still cannot be written by her directly
-- (`exigir_revision_limpia` keeps refusing a plain UPDATE from the `authenticated` role).
--
-- The server computes `p_revision` (deterministic rules plus what Claude judged) and calls this function with her
-- session. The caller holds her token, so the review is as trustworthy as she is; the database still refuses an
-- approval while `revision` has a blocking finding.
--
-- The state change repeats the `editar_texto` row of lib/dominio/estados.ts; tests/integration/editar-texto-como-coni
-- compares both for every state where the event is allowed.
create function public.editar_texto_como_coni(p_pieza uuid, p_version integer, p_texto text, p_revision jsonb)
returns public.piezas
language plpgsql security definer set search_path = '' as $$
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

  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = '40001', message = 'version_desfasada';
  end if;
  if v_pieza.estado not in ('guion_por_aprobar', 'video_por_aprobar', 'programado') then
    raise exception using errcode = 'P0001', message = 'estado_no_editable';
  end if;

  update public.piezas
     set texto = p_texto,
         revision = p_revision,
         version = version + 1,
         estado = case when estado = 'programado' then 'video_por_aprobar'::public.estado_pieza else estado end,
         intento = case when estado = 'programado' then intento + 1 else intento end,
         puerta2_video_id = case when estado = 'guion_por_aprobar' then puerta2_video_id else null end,
         puerta2_hash_texto = case when estado = 'guion_por_aprobar' then puerta2_hash_texto else null end,
         puerta2_publicar_en = case when estado = 'guion_por_aprobar' then puerta2_publicar_en else null end,
         puerta2_en = case when estado = 'guion_por_aprobar' then puerta2_en else null end
   where id = p_pieza
  returning * into v_resultado;
  return v_resultado;
end $$;

revoke execute on function public.editar_texto_como_coni(uuid, integer, text, jsonb) from public, anon;
grant execute on function public.editar_texto_como_coni(uuid, integer, text, jsonb) to authenticated;

-- The function runs as its owner, so inside it the writer is not the `authenticated` role any more: only a direct write
-- from Coni's session is refused, as before.
create or replace function public.exigir_revision_limpia() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- Only server tasks write the review; otherwise Coni could clear it in the same update that approves.
  if new.revision is distinct from old.revision and public.es_coni() and current_user = 'authenticated' then
    raise exception using errcode = '42501', message = 'revision_solo_servidor';
  end if;
  if (
    (old.estado = 'guion_por_aprobar' and new.estado = 'en_render')
    or (old.estado = 'video_por_aprobar' and new.estado = 'programado')
  ) and exists (
    select 1 from jsonb_array_elements(new.revision) as hallazgo where hallazgo ->> 'tipo' = 'bloquea'
  ) then
    raise exception using errcode = '42501', message = 'revision_bloquea';
  end if;
  return new;
end $$;
