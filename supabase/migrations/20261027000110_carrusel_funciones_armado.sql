-- The render's results and gate 2's changes of a carousel (design 2026-10-26, D4, D5; plan amendments 3, 5, 6).

-- The words of a carousel's slides in order, whatever slides they sit on (as palabrasDelCarrusel in
-- lib/dominio/carrusel.ts): a design change must keep them exactly, so gate 1 stands.
create function public.palabras_de_laminas(p_laminas jsonb) returns text
language sql immutable set search_path = '' as $$
  select coalesce(string_agg(p.palabra, ' ' order by l.orden, p.orden), '')
    from jsonb_array_elements(p_laminas) with ordinality as l(lamina, orden),
         regexp_split_to_table(
           normalize(coalesce(l.lamina ->> 'texto', '') || ' ' || coalesce(l.lamina ->> 'fuente', ''), nfc),
           '\s+'
         ) with ordinality as p(palabra, orden)
   where p.palabra <> ''
$$;

-- The render's result (D4): the latest version's PNGs and PDF, and the piece at gate 2, in one transaction.
create function public.guardar_armado(p_carrusel uuid, p_version integer, p_pdf text, p_pngs text[])
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
  if v_pieza.estado <> 'armando_carrusel'
     or v_carrusel.version <> (select max(version) from public.carruseles where pieza_id = v_pieza.id)
     or v_carrusel.hash_texto is distinct from v_pieza.puerta1_hash then
    raise exception using errcode = 'P0001', message = 'armado_fuera_de_turno';
  end if;
  if p_pdf is null or btrim(p_pdf) = '' or p_pngs is null or array_position(p_pngs, null) is not null
     or cardinality(p_pngs) <> jsonb_array_length(v_carrusel.laminas) then
    raise exception using errcode = '22023', message = 'armado_incompleto';
  end if;

  update public.carruseles set estado = 'listo', pdf_clave = p_pdf, png_claves = p_pngs where id = p_carrusel;
  update public.piezas set estado = 'carrusel_por_aprobar', explicacion = null, version = version + 1
   where id = v_pieza.id
  returning * into v_pieza;
  return v_pieza;
end $$;

revoke execute on function public.guardar_armado(uuid, integer, text, text[]) from public, anon, authenticated;
grant execute on function public.guardar_armado(uuid, integer, text, text[]) to service_role;

-- The one automatic shortening (amendment 3): a new text (new hash_texto, same post and design), the piece back at
-- gate 1 with why, and the Claude spend that paid for it, in one transaction. Never twice in a row.
create function public.guardar_acortado(
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
  if v_pieza.estado <> 'armando_carrusel' or v_carrusel.origen = 'acortado'
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

revoke execute on function public.guardar_acortado(uuid, integer, jsonb, text, jsonb, text, text, numeric)
  from public, anon, authenticated;
grant execute on function public.guardar_acortado(uuid, integer, jsonb, text, jsonb, text, text, numeric)
  to service_role;

-- "El diseño" at gate 2 (D5, amendment 5): a new version with the same words and post, so gate 1 stands, and the piece
-- back to be rendered. Bounded as on the screen: portada and cierre keep their text, 6 to 8 slides, one known variant.
-- It is not one of her three text changes.
create function public.cambiar_diseno_de_carrusel(p_pieza uuid, p_version integer, p_laminas jsonb, p_diseno jsonb)
returns public.carruseles
language plpgsql security definer set search_path = '' as $$
declare
  v_pieza public.piezas;
  v_actual public.carruseles;
  v_nueva public.carruseles;
  v_n integer;
begin
  if not public.es_coni() then
    raise exception using errcode = '42501', message = 'solo_coni_cambia_diseno';
  end if;
  select * into v_pieza from public.piezas where id = p_pieza for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'pieza_inexistente';
  end if;
  if v_pieza.version <> p_version then
    raise exception using errcode = 'PT409', message = 'version_desfasada';
  end if;
  if v_pieza.tipo <> 'carrusel' or v_pieza.estado <> 'carrusel_por_aprobar' then
    raise exception using errcode = 'P0001', message = 'estado_no_cambiable';
  end if;
  select * into v_actual from public.carruseles where pieza_id = p_pieza order by version desc limit 1;
  if v_actual.estado <> 'listo' then
    raise exception using errcode = 'P0001', message = 'estado_no_cambiable';
  end if;

  if jsonb_typeof(p_laminas) <> 'array' or jsonb_typeof(p_diseno) <> 'object' then
    raise exception using errcode = '22023', message = 'diseno_invalido';
  end if;
  v_n := jsonb_array_length(p_laminas);
  if v_n not between 6 and 8
     or p_laminas -> 0 ->> 'tipo' is distinct from 'portada'
     or p_laminas -> (v_n - 1) ->> 'tipo' is distinct from 'cierre'
     or exists (select 1 from jsonb_array_elements(p_laminas) with ordinality as e(lamina, orden)
                 where e.orden between 2 and v_n - 1 and e.lamina ->> 'tipo' is distinct from 'idea')
     or p_laminas -> 0 ->> 'texto' is distinct from v_actual.laminas -> 0 ->> 'texto'
     or p_laminas -> (v_n - 1) ->> 'texto' is distinct from v_actual.laminas -> (jsonb_array_length(v_actual.laminas) - 1) ->> 'texto'
     or p_laminas -> (v_n - 1) ->> 'fuente' is distinct from v_actual.laminas -> (jsonb_array_length(v_actual.laminas) - 1) ->> 'fuente'
     or public.palabras_de_laminas(p_laminas) <> public.palabras_de_laminas(v_actual.laminas)
     or (select count(*) from jsonb_object_keys(p_diseno)) <> 1
     or p_diseno ->> 'variante' is null
     or p_diseno ->> 'variante' not in ('crema', 'piedra', 'oscura') then
    raise exception using errcode = '22023', message = 'diseno_invalido';
  end if;
  if p_laminas = v_actual.laminas and p_diseno = v_actual.diseno then
    raise exception using errcode = '22023', message = 'diseno_sin_cambio';
  end if;

  insert into public.carruseles (pieza_id, version, laminas, texto_post, hash_texto, diseno, origen)
  values (p_pieza, v_actual.version + 1, p_laminas, v_actual.texto_post, v_actual.hash_texto, p_diseno, 'cambio_diseno')
  returning * into v_nueva;
  update public.piezas set estado = 'armando_carrusel', intento = intento + 1, explicacion = null, version = version + 1
   where id = p_pieza;
  return v_nueva;
end $$;

revoke execute on function public.cambiar_diseno_de_carrusel(uuid, integer, jsonb, jsonb) from public, anon;
grant execute on function public.cambiar_diseno_de_carrusel(uuid, integer, jsonb, jsonb) to authenticated;

-- pedir_cambio_de_carrusel as of 20261026000130, plus gate 2 ("El texto", amendment 6): from carrusel_por_aprobar too.
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
  if v_pieza.tipo <> 'carrusel' or v_pieza.estado not in ('guion_por_aprobar', 'carrusel_por_aprobar') then
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
