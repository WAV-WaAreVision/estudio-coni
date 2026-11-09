-- The switch and the way back of a model dry run (issue 19). One transaction each: nothing is ever half written.
-- Topic assignments are never touched; each call returns a fingerprint of them before and after, as proof.

create function public.huella_de_asignaciones() returns text
language sql stable set search_path = '' as $$
  select md5(coalesce(string_agg(a.id::text || ':' || coalesce(a.tema_id::text, '-'), ',' order by a.id), ''))
  from public.afirmaciones a
$$;

-- Claims with a vector that still lack their row for a dry run: candidates (before the switch) or saved vectors
-- (before the way back). The tasks embed them and insert the rows, then call the switch.
create function public.afirmaciones_sin_huella(p_prueba uuid, p_destino text)
returns table (id uuid, texto text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.texto
  from public.afirmaciones a
  where a.vector is not null
    and case p_destino
      when 'candidata' then not exists (
        select 1 from public.huellas_candidatas h where h.prueba_id = p_prueba and h.afirmacion_id = a.id)
      when 'anterior' then not exists (
        select 1 from public.huellas_anteriores h where h.prueba_id = p_prueba and h.afirmacion_id = a.id)
    end
  order by a.id
$$;

create function public.aplicar_prueba_de_modelo(p_prueba uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  prueba public.pruebas_de_modelo;
  anterior public.calibraciones_de_parecido;
  nueva int;
  antes text;
begin
  select * into prueba from public.pruebas_de_modelo where id = p_prueba for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'prueba_inexistente';
  end if;
  if prueba.estado <> 'lista' then
    raise exception using errcode = '22023', message = 'prueba_no_lista';
  end if;
  if prueba.creada_en < now() - interval '30 days' then
    raise exception using errcode = '22023', message = 'prueba_vencida';
  end if;
  select * into anterior from public.calibraciones_de_parecido where vigente for update;
  if anterior.modelo = prueba.modelo then
    raise exception using errcode = '22023', message = 'modelo_ya_vigente';
  end if;
  -- Writers of vectors and centroids wait for this transaction; what they computed with the old model is dropped
  -- (claims) or refused (topics) by the stamp triggers once it commits.
  lock table public.afirmaciones, public.temas in share row exclusive mode;
  if exists (
    select 1 from public.afirmaciones a
    where a.vector is not null
      and not exists (select 1 from public.huellas_candidatas h where h.prueba_id = p_prueba and h.afirmacion_id = a.id and h.modelo = prueba.modelo)
  ) then
    raise exception using errcode = '22023', message = 'faltan_candidatas';
  end if;
  antes := public.huella_de_asignaciones();

  insert into public.huellas_anteriores (prueba_id, afirmacion_id, modelo, vector, version_calibracion)
  select p_prueba, a.id, a.modelo_vector, a.vector, anterior.version from public.afirmaciones a where a.vector is not null;
  insert into public.huellas_anteriores (prueba_id, tema_id, modelo, vector, version_calibracion)
  select p_prueba, t.id, t.modelo_centroide, t.centroide, anterior.version from public.temas t;

  -- The new model is vigente from here on, so the stamp triggers accept what follows.
  select max(version) + 1 into nueva from public.calibraciones_de_parecido;
  update public.calibraciones_de_parecido set vigente = false where version = anterior.version;
  insert into public.calibraciones_de_parecido
    (version, modelo, tema, grupo, fusion, puente_min, puente_max, vigente, prueba_id, motivo)
  values (
    nueva, prueba.modelo,
    (prueba.umbrales ->> 'tema')::numeric, (prueba.umbrales ->> 'grupo')::numeric,
    (prueba.umbrales ->> 'fusion')::numeric, (prueba.umbrales ->> 'puente_min')::numeric,
    (prueba.umbrales ->> 'puente_max')::numeric,
    true, p_prueba, 'Traslado por percentil de la prueba ' || p_prueba
  );

  update public.afirmaciones a set vector = h.vector, modelo_vector = h.modelo
  from public.huellas_candidatas h
  where h.prueba_id = p_prueba and h.afirmacion_id = a.id and a.vector is not null;

  -- Centroids: the plain mean of the new vectors (20261003000351), which also counts claims assigned after the dry
  -- run; then a merged topic takes the centroid of the topic it points at.
  update public.temas t set centroide = m.media, modelo_centroide = prueba.modelo
  from (
    select a.tema_id, extensions.avg(a.vector) as media
    from public.afirmaciones a
    where a.tema_id is not null and not a.excluida and a.vector is not null
    group by a.tema_id
  ) m
  where t.id = m.tema_id;
  update public.temas t set centroide = d.centroide, modelo_centroide = prueba.modelo
  from public.temas d
  where t.fusionado_en = d.id and t.modelo_centroide <> prueba.modelo and d.modelo_centroide = prueba.modelo;
  if exists (select 1 from public.temas where modelo_centroide <> prueba.modelo) then
    raise exception using errcode = '22023', message = 'falta_centroide';
  end if;

  update public.pruebas_de_modelo
     set estado = 'aplicada', aplicada_en = now(), version_anterior = anterior.version
   where id = p_prueba;
  return jsonb_build_object(
    'asignaciones_antes', antes, 'asignaciones_despues', public.huella_de_asignaciones(), 'version', nueva);
end $$;

create function public.revertir_prueba_de_modelo(p_prueba uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  prueba public.pruebas_de_modelo;
  actual public.calibraciones_de_parecido;
  anterior public.calibraciones_de_parecido;
  antes text;
begin
  select * into prueba from public.pruebas_de_modelo where id = p_prueba for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'prueba_inexistente';
  end if;
  if prueba.estado <> 'aplicada' then
    raise exception using errcode = '22023', message = 'prueba_no_aplicada';
  end if;
  if prueba.aplicada_en < now() - interval '30 days' then
    raise exception using errcode = '22023', message = 'plazo_vencido';
  end if;
  select * into actual from public.calibraciones_de_parecido where vigente for update;
  if actual.prueba_id is distinct from p_prueba then
    raise exception using errcode = '22023', message = 'no_es_la_vigente';
  end if;
  select * into anterior from public.calibraciones_de_parecido where version = prueba.version_anterior;
  lock table public.afirmaciones, public.temas in share row exclusive mode;
  if exists (
    select 1 from public.afirmaciones a
    where a.vector is not null
      and not exists (select 1 from public.huellas_anteriores h where h.prueba_id = p_prueba and h.afirmacion_id = a.id and h.modelo = anterior.modelo)
  ) then
    raise exception using errcode = '22023', message = 'faltan_anteriores';
  end if;
  antes := public.huella_de_asignaciones();

  update public.calibraciones_de_parecido set vigente = false where version = actual.version;
  update public.calibraciones_de_parecido set vigente = true where version = anterior.version;

  update public.afirmaciones a set vector = h.vector, modelo_vector = h.modelo
  from public.huellas_anteriores h
  where h.prueba_id = p_prueba and h.afirmacion_id = a.id and a.vector is not null;

  -- Centroids: exactly the saved one where the topic existed and still has the same members; a topic born after the
  -- switch, or one whose members changed since (a claim assigned or moved), takes the plain mean of its restored
  -- claims, so the centroid stays the mean of its members. A merged one takes the centroid of the topic it points at.
  update public.temas t set centroide = h.vector, modelo_centroide = h.modelo
  from public.huellas_anteriores h
  where h.prueba_id = p_prueba and h.tema_id = t.id;
  update public.temas t set centroide = m.media, modelo_centroide = anterior.modelo
  from (
    select a.tema_id, extensions.avg(a.vector) as media
    from public.afirmaciones a
    where a.tema_id is not null and not a.excluida and a.vector is not null
    group by a.tema_id
  ) m
  where t.id = m.tema_id
    and (t.modelo_centroide <> anterior.modelo or t.centroide operator(extensions.<->) m.media > 0.000001);
  update public.temas t set centroide = d.centroide, modelo_centroide = anterior.modelo
  from public.temas d
  where t.fusionado_en = d.id and t.modelo_centroide <> anterior.modelo and d.modelo_centroide = anterior.modelo;
  if exists (select 1 from public.temas where modelo_centroide <> anterior.modelo) then
    raise exception using errcode = '22023', message = 'falta_centroide';
  end if;

  update public.pruebas_de_modelo set estado = 'revertida', revertida_en = now() where id = p_prueba;
  return jsonb_build_object(
    'asignaciones_antes', antes, 'asignaciones_despues', public.huella_de_asignaciones(), 'version', anterior.version);
end $$;

-- Nightly: saved vectors live 30 days after a switch (the revert window); candidates go with a discarded dry run or
-- 30 days after it was made.
create function public.limpiar_huellas_de_prueba(p_ahora timestamptz) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  anteriores int;
  candidatas int;
begin
  delete from public.huellas_anteriores h using public.pruebas_de_modelo p
   where h.prueba_id = p.id and p.aplicada_en < p_ahora - interval '30 days';
  get diagnostics anteriores = row_count;
  delete from public.huellas_candidatas h using public.pruebas_de_modelo p
   where h.prueba_id = p.id and (p.estado = 'descartada' or p.creada_en < p_ahora - interval '30 days');
  get diagnostics candidatas = row_count;
  return jsonb_build_object('anteriores', anteriores, 'candidatas', candidatas);
end $$;

revoke execute on function public.huella_de_asignaciones(), public.afirmaciones_sin_huella(uuid, text),
  public.aplicar_prueba_de_modelo(uuid), public.revertir_prueba_de_modelo(uuid),
  public.limpiar_huellas_de_prueba(timestamptz) from public, anon, authenticated;
grant execute on function public.afirmaciones_sin_huella(uuid, text), public.aplicar_prueba_de_modelo(uuid),
  public.revertir_prueba_de_modelo(uuid), public.limpiar_huellas_de_prueba(timestamptz) to service_role;
