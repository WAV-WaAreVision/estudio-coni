-- Pillars are data (spec 2026-10-17, decisions 1 and 2): the five LinkedIn authority pillars become active pillar rows
-- of `categorias`; the five sexology pillars stay as inactive rows, because materials, topics and used ideas point at
-- them. `general` stays a plain category. `ideas.pilar` moves to these rows in 20261017000105.
alter table public.categorias
  add column es_pilar boolean not null default false,
  add column activa boolean not null default true,
  add column orden smallint,
  add column nombre_corto text,
  add column descripcion text,
  add constraint pilar_completo check (not es_pilar or (orden is not null and nombre_corto is not null)),
  add constraint pilar_activo_descrito check (not (es_pilar and activa) or descripcion is not null);

update public.categorias
   set es_pilar = true,
       activa = false,
       orden = case slug when 'pareja' then 6 when 'deseo' then 7 when 'autoestima' then 8 when 'limites' then 9 else 10 end,
       nombre_corto = case slug
         when 'pareja' then 'Pareja' when 'deseo' then 'Deseo' when 'autoestima' then 'Autoestima'
         when 'limites' then 'Límites' else 'Bienestar' end
 where slug in ('pareja', 'deseo', 'autoestima', 'limites', 'bienestar');

-- WAV may already have created one of these through the ingesta (crear_categoria): that row is promoted instead of
-- duplicated, so its materials and topics land in the pillar. Two different rows matching one pillar (one by slug,
-- one by name) make the update collide on a unique index and stop the migration: Federico's pre-check catches it.
do $$
declare
  p record;
  v_id uuid;
begin
  for p in
    select * from (values
      ('ia-salud-mental', 'IA y salud mental', 'IA y salud mental',
       'Qué dice la evidencia sobre chatbots, apps y modelos: uso real, beneficios y riesgos.', 1),
      ('practica-clinica', 'Práctica clínica aumentada', 'Práctica clínica',
       'Cómo cambia la consulta: herramientas, cuándo sí y cuándo no, y el rol del vínculo terapéutico.', 2),
      ('etica-regulacion', 'Ética y regulación', 'Ética',
       'Consentimiento, privacidad, sesgos, responsabilidad profesional y regulación en Chile y el mundo.', 3),
      ('acceso-salud-publica', 'Acceso y salud pública', 'Acceso',
       'Brechas de atención, escala, equidad, y salud mental en el trabajo y la educación.', 4),
      ('caso-coni', 'Caso Coni: humana + avatar', 'Caso Coni',
       'Su propio experimento: qué aprende usando un avatar con transparencia y qué funciona y qué no.', 5)
    ) as v (slug, nombre, nombre_corto, descripcion, orden)
  loop
    v_id := null;
    select id into v_id from public.categorias
     where slug = p.slug or nombre_normalizado = public.unaccent_inmutable(lower(btrim(p.nombre)))
     order by (slug = p.slug) desc
     limit 1;
    if v_id is null then
      insert into public.categorias (slug, nombre, nombre_corto, descripcion, orden, es_pilar, activa)
      values (p.slug, p.nombre, p.nombre_corto, p.descripcion, p.orden, true, true);
    else
      update public.categorias
         set slug = p.slug, nombre = p.nombre, nombre_corto = p.nombre_corto, descripcion = p.descripcion,
             orden = p.orden, es_pilar = true, activa = true
       where id = v_id;
    end if;
  end loop;
end $$;
