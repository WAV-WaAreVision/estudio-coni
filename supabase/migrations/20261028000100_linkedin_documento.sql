-- Carousels part 3 (design 2026-10-27, P3-4): reservar_envio_linkedin as of 20261007000110, plus a carousel's row
-- reserves with its document. Everything else is unchanged: version lock, programado, enviado_en once, never twice.
create or replace function public.reservar_envio_linkedin(p_pieza uuid, p_version integer) returns integer
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
     and (video_urn is not null or documento_urn is not null) and enviado_en is null and post_urn is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'linkedin_no_espera';
  end if;
  update public.piezas set version = version + 1 where id = p_pieza returning version into v_nueva;
  return v_nueva;
end $$;

revoke execute on function public.reservar_envio_linkedin(uuid, integer) from public, anon, authenticated;
grant execute on function public.reservar_envio_linkedin(uuid, integer) to service_role;
