-- A blank script or publication text is refused (gate 1 approval requires both). Grants of guardar_borrador made explicit.
create or replace function public.editar_guion_como_coni(
  p_pieza uuid, p_version integer, p_guion text, p_texto text, p_revision jsonb
) returns public.piezas
language plpgsql security definer set search_path = '' as $$
declare
  fila public.piezas;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_edita_guion';
  end if;
  if jsonb_typeof(p_revision) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'revision_invalida';
  end if;

  if btrim(coalesce(p_guion, ''), E' \t\r\n') = '' then
    raise exception using errcode = '22023', message = 'guion_vacio';
  end if;
  if btrim(coalesce(p_texto, ''), E' \t\r\n') = '' then
    raise exception using errcode = '22023', message = 'texto_vacio';
  end if;

  update public.piezas
     set guion = p_guion, texto = p_texto, revision = p_revision, version = version + 1
   where id = p_pieza and version = p_version and estado = 'guion_por_aprobar'
  returning * into fila;
  if fila.id is null then
    if exists (select 1 from public.piezas where id = p_pieza and estado <> 'guion_por_aprobar') then
      raise exception using errcode = '22023', message = 'guion_fuera_de_revision';
    end if;
    raise exception using errcode = '40001', message = 'version_desfasada';
  end if;

  insert into public.guion_versiones (pieza_id, numero, guion, texto, autor, creada_por)
  values (p_pieza, public.siguiente_version_de_guion(p_pieza), p_guion, p_texto, 'coni', auth.uid());
  return fila;
end $$;

revoke execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric)
  from public, anon, authenticated;
grant execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric) to service_role;
