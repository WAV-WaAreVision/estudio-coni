-- A design change that does not fit (plan 2026-10-27, amendment 3, as decided in the review of Lotes 4 and 5): the
-- automatic shortening happens at most once per text (hash_texto), whatever design changes came after it, and a design
-- change is never shortened: it is dropped and the piece goes back to gate 2 on the version she saw.

-- guardar_acortado as of 20261027000110, plus: never a design change's version, and never a text already shortened
-- once (a design change keeps the hash_texto of the shortened text).
create or replace function public.guardar_acortado(
  p_carrusel uuid,
  p_version integer,
  p_laminas jsonb,
  p_hash_texto text,
  p_revision jsonb,
  p_explicacion text,
  p_clave text,
  p_real numeric
) returns public.piezas
language plpgsql set search_path = '' as $$
declare
  v_carrusel public.carruseles;
  v_pieza public.piezas;
begin
  select * into v_carrusel from public.carruseles where id = p_carrusel for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'carrusel_inexistente';
  end if;
  select * into v_pieza from public.piezas where id = v_carrusel.pieza_id for update;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado <> 'armando_carrusel' or v_carrusel.origen = 'cambio_diseno'
     or exists (select 1 from public.carruseles c
                 where c.pieza_id = v_pieza.id and c.hash_texto = v_carrusel.hash_texto and c.origen = 'acortado')
     or v_carrusel.version <> (select max(version) from public.carruseles where pieza_id = v_pieza.id) then
    raise exception using errcode = 'P0001', message = 'acortado_fuera_de_turno';
  end if;
  if p_hash_texto = v_carrusel.hash_texto or jsonb_typeof(p_laminas) <> 'array'
     or jsonb_array_length(p_laminas) <> jsonb_array_length(v_carrusel.laminas)
     or btrim(coalesce(p_explicacion, '')) = '' then
    raise exception using errcode = '22023', message = 'acortado_invalido';
  end if;

  insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, diseno, origen)
  values (v_pieza.id, v_carrusel.version + 1, p_laminas, v_carrusel.texto_post, p_hash_texto, v_carrusel.diseno,
          'acortado');
  -- The version that did not fit is never rendered.
  update public.carruseles set estado = 'fallo' where id = p_carrusel;
  update public.piezas
     set estado = 'guion_por_aprobar', puerta1_hash = null, puerta1_en = null, revision = p_revision,
         explicacion = p_explicacion, intento = intento + 1, version = version + 1
   where id = v_pieza.id
  returning * into v_pieza;

  update public.gastos set estado = 'confirmado', real_usd = p_real where clave = p_clave and estado = 'reservado';
  if not found then
    raise exception using errcode = 'P0001', message = 'gasto_no_reservado';
  end if;
  return v_pieza;
end $$;


-- An overflowing design change (D5): its version was never rendered nor seen, so it is deleted (the audit keeps it)
-- and the latest version is again the rendered one she looked at; the piece is back at gate 2 with why. It is not one
-- of her three text changes, and nothing was spent.
create function public.rechazar_diseno_que_no_cabe(p_carrusel uuid, p_version integer, p_explicacion text)
returns public.piezas
language plpgsql set search_path = '' as $$
declare
  v_carrusel public.carruseles;
  v_pieza public.piezas;
begin
  select * into v_carrusel from public.carruseles where id = p_carrusel for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'carrusel_inexistente';
  end if;
  select * into v_pieza from public.piezas where id = v_carrusel.pieza_id for update;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.estado <> 'armando_carrusel' or v_carrusel.origen <> 'cambio_diseno' or v_carrusel.estado = 'listo'
     or v_carrusel.version <> (select max(version) from public.carruseles where pieza_id = v_pieza.id)
     or not exists (select 1 from public.carruseles c
                     where c.pieza_id = v_pieza.id and c.version = v_carrusel.version - 1 and c.estado = 'listo'
                       and c.hash_texto = v_carrusel.hash_texto) then
    raise exception using errcode = 'P0001', message = 'rechazo_fuera_de_turno';
  end if;
  if btrim(coalesce(p_explicacion, '')) = '' then
    raise exception using errcode = '22023', message = 'rechazo_invalido';
  end if;

  delete from public.carruseles where id = p_carrusel;
  update public.piezas set estado = 'carrusel_por_aprobar', explicacion = p_explicacion, version = version + 1
   where id = v_pieza.id
  returning * into v_pieza;
  return v_pieza;
end $$;

revoke execute on function public.rechazar_diseno_que_no_cabe(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.rechazar_diseno_que_no_cabe(uuid, integer, text) to service_role;
