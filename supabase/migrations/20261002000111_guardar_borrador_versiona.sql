-- Same function as before, plus the history row for the draft Claude just saved (autor 'claude', nobody's uid).
create or replace function public.guardar_borrador(
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

  insert into public.guion_versiones (pieza_id, numero, guion, texto, autor, creada_por)
  values (p_pieza, public.siguiente_version_de_guion(p_pieza), p_guion, p_texto, 'claude', null);

  -- Without a reserved spend there is nothing to confirm; raising rolls back the writes above as well.
  update public.gastos set estado = 'confirmado', real_usd = p_real
    where clave = p_clave and estado = 'reservado';
  if not found then
    raise exception using errcode = 'P0001', message = 'gasto_no_reservado';
  end if;

  return v_pieza;
end $$;
