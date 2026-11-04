-- Pillars per network (spec 2026-11-04, part 15a, section 1). `categorias` grows instead of a new table, so the slug FK
-- of ideas.pilar, `leerPilares` and every reader keep working. This migration adds columns, checks, triggers, the new
-- pillars and their weights: it changes no existing row. The five pillars of 2026-10-17 stay active and without a
-- network until the apply step (`aplicar_lote_de_pilares`, 20261104000210) retires them.
alter table public.categorias
  add column red text check (red in ('linkedin', 'instagram')),
  add column es_capa boolean not null default false,
  add constraint capa_es_pilar check (not es_capa or es_pilar),
  add constraint red_solo_en_pilar check (red is null or es_pilar),
  -- tema_pilares carries a pillar's network and layer flag through a composite foreign key.
  add constraint categorias_id_red_capa unique (id, red, es_capa);

-- The spec's `pilar_con_red`, as a trigger: a check would refuse the five pillars of 2026-10-17 (active, no network)
-- and the undo of the apply step, which reactivates them. A new active pillar, a category made a pillar, or an active
-- pillar that loses its network needs one. Only the pillars that had no network when this migration ran may be
-- reactivated without one: their ids are frozen into the function as a literal (ids differ per database, so they are
-- read here, not written by hand). A timestamp cutoff would not do: in one transaction the seed below shares now().
do $migracion$
begin
  execute format($funcion$
    create function public.exigir_red_de_pilar() returns trigger
    language plpgsql set search_path = '' as $$
    begin
      if new.es_pilar and new.activa and new.red is null
         and (tg_op = 'INSERT' or not old.es_pilar or old.red is not null or not (old.id = any (%L::uuid[]))) then
        raise exception using errcode = '23514', message = 'pilar_sin_red';
      end if;
      return new;
    end $$
  $funcion$, (select coalesce(array_agg(id), '{}') from public.categorias where es_pilar and red is null));
end $migracion$;

create trigger exigir_red_de_pilar before insert or update on public.categorias
  for each row execute function public.exigir_red_de_pilar();

-- Redefined: a layer (Capa TDAH) is a lens inside the pillars, never an idea's pillar (spec section 4).
create or replace function public.exigir_pilar_activo() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and old.pilar is not distinct from new.pilar then
    return null;
  end if;
  if exists (select 1 from public.categorias c where c.slug = new.pilar)
     and not exists (
       select 1 from public.categorias c where c.slug = new.pilar and c.es_pilar and c.activa and not c.es_capa
     ) then
    raise exception using errcode = '23514', message = 'pilar_inactivo';
  end if;
  return null;
end $$;

-- Coni's manuals, 2026-11-04 (§22 LinkedIn, §23 Instagram). Descriptions are the manuals' definitions.
insert into public.categorias (slug, nombre, nombre_corto, descripcion, orden, es_pilar, activa, red, es_capa) values
  ('diagnostico-doble', 'Diagnóstico doble: transformación digital con factor humano', 'Diagnóstico doble',
   'Transformación digital con factor humano. Le habla a transformación digital, gerencias y líderes, con voz declarativa, en texto y carrusel. Lleva a charla + diagnóstico con Ingen-IA, charlas en eventos de tecnología y coaching.',
   1, true, true, 'linkedin', false),
  ('bienestar-e-impacto', 'Bienestar e impacto: lo que le pasa a las personas cuando llega la IA, y cómo medirlo',
   'Bienestar e impacto',
   'Lo que le pasa a las personas cuando llega la IA, y cómo medirlo. Le habla a RRHH, bienestar, líderes y academia. Ángulo «Lo que se ve»: lo que RRHH y yo observamos en las personas y los equipos cuando ya usan IA, incluso como apoyo emocional: estrés, desgaste, bienestar. Ángulo «Cómo se mide»: medir el impacto humano y no solo la adopción: indicadores, evaluación de pilotos, instrumentos.',
   2, true, true, 'linkedin', false),
  ('psicologia-en-la-mesa', 'Psicología en la mesa: la psicología donde se construye la IA', 'Psicología en la mesa',
   'La psicología donde se construye la IA; lo digo y lo hago. Le habla a academia, centros de innovación, autoridades, empresas y marcas de tecnología. Ángulo «Lo que planteo»: la IA y la salud mental como tema país y académico: IA ética, datos de salud, regulación y el rol de la psicología en diseñar y evaluar la IA. Ángulo «Lo que construyo»: mi caso a la vista, una psicóloga que construye y entrena modelos: Eureka Engine, Game Over Impostora, videojuegos, el diplomado, Conidolly, mi etapa de psicóloga cyborg.',
   3, true, true, 'linkedin', false),
  ('mujeres-lideres', 'Mujeres líderes, IA y síndrome del impostor', 'Mujeres líderes',
   'Mujeres líderes, IA y síndrome del impostor. Le habla a mujeres líderes, agrupaciones STEM y RRHH, con voz íntima, en texto y video. Lleva a coachings y talleres para mujeres líderes y a Game Over Impostora.',
   4, true, true, 'linkedin', false),
  ('game-over-impostora', 'Game Over Impostora', 'Game Over Impostora',
   'Patrones con nombre; la impostora frente a la IA («no soy tecnológica») y frente a emprender; lo que el entorno pone. Serie Game Over / Continue.',
   1, true, true, 'instagram', false),
  ('mi-nueva-partida', 'Mi nueva partida', 'Mi nueva partida',
   'Mi reinvención con IA y la de ella: lo que vivo al aprender, construir y emprender, y cómo usar la IA con criterio para pensar, decidir, ordenar, vender y ganar tiempo. Ángulo «Lo vivo»: mi giro de psicóloga que aprende a entrenar modelos, construye y emprende, con dudas, números y avances. Ángulo «Pruébalo tú»: usar la IA con criterio en su propia reinvención.',
   2, true, true, 'instagram', false),
  ('inteligencia-emocional', 'Inteligencia emocional aplicada: autocuidado, productividad y relaciones',
   'Inteligencia emocional',
   'Autocuidado, productividad y relaciones: límites, decir que no, energía, conversaciones difíciles. Serie Ahora que lo ves.',
   3, true, true, 'instagram', false),
  ('capa-tdah', 'Capa TDAH', 'Capa TDAH',
   'Cómo trabaja mi cerebro y qué me sirve, siempre separado de la evidencia. Nivel 2: lo vivo y comparto lo elaborado, sin detalle clínico. Aparece dentro de los otros pilares, en más o menos una de cada seis piezas.',
   4, true, true, 'instagram', true);

-- The weight of a date is the row with the latest `desde` on or before it. Nothing forces a network to add up to 100:
-- `pesosDeRed` flags it for the 15c panel. Changes 21 and 25 will read these weights; nothing reads them yet.
create table public.pilar_pesos (
  pilar_id uuid not null,
  red text,
  es_capa boolean not null default false,
  desde date not null,
  peso numeric(5, 2) not null check (peso > 0 and peso <= 100),
  primary key (pilar_id, desde),
  -- A weight belongs to a pillar of a network, never to a layer (spec section 1). Like tema_pilares, the composite
  -- key keeps it so: a weighted pillar cannot become a layer nor lose its network (`red` is only set on pillars).
  constraint pilar_pesos_pilar foreign key (pilar_id, red, es_capa)
    references public.categorias (id, red, es_capa),
  -- `red` may be null here only so this check, not a not-null error, names the rule; a null skips the foreign key.
  constraint peso_de_pilar_de_red check (red is not null and not es_capa)
);

alter table public.pilar_pesos enable row level security;
-- Only migrations and definer RPCs write in 15a; 15c adds Coni's drafts.
revoke all on public.pilar_pesos from anon, authenticated, service_role;
grant select on public.pilar_pesos to authenticated, service_role;
create policy "coni y wav leen pesos de pilares" on public.pilar_pesos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create trigger auditar after insert or update or delete on public.pilar_pesos
  for each row execute function public.registrar_evento();

insert into public.pilar_pesos (pilar_id, red, es_capa, desde, peso)
select c.id, c.red, c.es_capa, v.desde::date, v.peso
from (values
  ('diagnostico-doble', '2026-11-04', 30), ('diagnostico-doble', '2027-01-01', 25), ('diagnostico-doble', '2027-07-01', 25),
  ('bienestar-e-impacto', '2026-11-04', 25), ('bienestar-e-impacto', '2027-01-01', 25), ('bienestar-e-impacto', '2027-07-01', 20),
  ('psicologia-en-la-mesa', '2026-11-04', 30), ('psicologia-en-la-mesa', '2027-01-01', 35), ('psicologia-en-la-mesa', '2027-07-01', 30),
  ('mujeres-lideres', '2026-11-04', 15), ('mujeres-lideres', '2027-01-01', 15), ('mujeres-lideres', '2027-07-01', 25),
  ('game-over-impostora', '2026-11-04', 35),
  ('mi-nueva-partida', '2026-11-04', 40),
  ('inteligencia-emocional', '2026-11-04', 25)
) as v (slug, desde, peso)
join public.categorias c on c.slug = v.slug;
