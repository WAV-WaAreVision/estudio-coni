-- Saves the script Claude wrote and confirms what it cost in ONE transaction. Done as two calls, a run that died
-- between them left the spend reserved with the draft already saved, and the retry paid Claude a second time.
create function public.guardar_borrador(
  p_pieza uuid,
  p_version integer,
  p_guion text,
  p_texto text,
  p_revision jsonb,
  p_clave text,
  p_real numeric
) returns public.piezas
language plpgsql set search_path = '' as $$
declare
  v_pieza public.piezas;
begin
  update public.piezas
    set guion = p_guion, texto = p_texto, revision = p_revision, version = version + 1
    where id = p_pieza and version = p_version
    returning * into v_pieza;
  if not found then
    raise exception using errcode = '40001', message = 'version_desfasada';
  end if;

  -- Without a reserved spend there is nothing to confirm; raising rolls back the update above as well.
  update public.gastos set estado = 'confirmado', real_usd = p_real
    where clave = p_clave and estado = 'reservado';
  if not found then
    raise exception using errcode = 'P0001', message = 'gasto_no_reservado';
  end if;

  return v_pieza;
end $$;

revoke execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric)
  from public, anon, authenticated;
grant execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric) to service_role;
