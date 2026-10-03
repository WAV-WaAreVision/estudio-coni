-- C3: the backing a script was written from is frozen on the piece with the draft, and gate 1 gets formula 3, which
-- hashes it with the script, the caption and the avatar. Formulas 1 and 2 stay valid for pieces approved with them.

alter table public.piezas add column respaldo jsonb;
comment on column public.piezas.respaldo is
  'Theory and claims of the engine idea the current draft was written from (C3). Written only with the draft; hashed by gate 1 formula 3.';

alter table public.piezas drop constraint piezas_puerta1_formula_check;
alter table public.piezas add constraint piezas_puerta1_formula_check check (puerta1_formula in (1, 2, 3));

-- The old signature goes so PostgREST does not see two candidates. A worker deployed before C3 calls with the 7 old
-- named arguments and still matches: p_respaldo defaults to null.
drop function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric);

create function public.guardar_borrador(
  p_pieza uuid,
  p_version integer,
  p_guion text,
  p_texto text,
  p_revision jsonb,
  p_clave text,
  p_real numeric,
  p_respaldo jsonb default null
) returns public.piezas
language plpgsql set search_path = '' as $$
declare
  v_pieza public.piezas;
begin
  update public.piezas
    set guion = p_guion, texto = p_texto, revision = p_revision, respaldo = p_respaldo, version = version + 1
    where id = p_pieza and version = p_version
    returning * into v_pieza;
  if not found then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
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

revoke execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric, jsonb)
  from public, anon, authenticated;
grant execute on function public.guardar_borrador(uuid, integer, text, text, jsonb, text, numeric, jsonb) to service_role;
