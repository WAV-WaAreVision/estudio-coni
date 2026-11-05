-- Angles of a pillar (spec 2026-11-05, part 15d). Additive: a table and its seed, a column with its trigger, a view and
-- one more notice kind. No existing row changes.

-- An angle is a way to approach a merged pillar, with its own voice and format (Coni's manuals, §22 and §23). Like
-- pilar_pesos, the composite key ties it to a network's pillar: a pillar with angles can neither become a layer nor
-- lose its network. `minimo` is the least share of the pillar's pieces the angle must have (1/3), or null.
create table public.pilar_angulos (
  id uuid primary key default gen_random_uuid(),
  pilar_id uuid not null,
  red text,
  es_capa boolean not null default false,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  nombre text not null check (btrim(nombre) <> ''),
  descripcion text not null check (btrim(descripcion) <> ''),
  orden int not null check (orden > 0),
  minimo numeric check (minimo > 0 and minimo <= 1),
  constraint pilar_angulos_pilar foreign key (pilar_id, red, es_capa)
    references public.categorias (id, red, es_capa),
  -- `red` may be null here only so this check, not a not-null error, names the rule; a null skips the foreign key.
  constraint angulo_de_pilar_de_red check (red is not null and not es_capa),
  constraint pilar_angulos_slug unique (pilar_id, slug),
  constraint pilar_angulos_orden unique (pilar_id, orden)
);

alter table public.pilar_angulos enable row level security;
-- Only migrations write (spec 15d, out of scope: editing angles in the app).
revoke all on public.pilar_angulos from anon, authenticated, service_role;
grant select on public.pilar_angulos to authenticated, service_role;
create policy "coni y wav leen angulos" on public.pilar_angulos for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
create trigger auditar after insert or update or delete on public.pilar_angulos
  for each row execute function public.registrar_evento();

-- Coni's answer of 2026-11-04, parts 3 and 4: each angle's definition, then its voice and format (and series). The
-- minimum is 1.0 / 3, not a rounded decimal, so ceil(6 * minimo) is 2.
insert into public.pilar_angulos (pilar_id, red, es_capa, slug, nombre, descripcion, orden, minimo)
select c.id, c.red, c.es_capa, v.slug, v.nombre, v.descripcion, v.orden, v.minimo
from (values
  ('bienestar-e-impacto', 'lo-que-se-ve', 'Lo que se ve',
   'Lo que RRHH y yo observamos en las personas y los equipos cuando ya usan IA, incluso como apoyo emocional: estrés, desgaste, bienestar. Voz íntima, texto en primera persona.',
   1, null::numeric),
  ('bienestar-e-impacto', 'como-se-mide', 'Cómo se mide',
   'Medir el impacto humano y no solo la adopción: indicadores, evaluación de pilotos, instrumentos. Voz declarativa, carrusel PDF con datos.',
   2, null),
  ('psicologia-en-la-mesa', 'lo-que-planteo', 'Lo que planteo',
   'La IA y la salud mental como tema país y académico: IA ética, datos de salud, regulación y el rol de la psicología en diseñar y evaluar la IA. Voz declarativa, carrusel con datos y fuentes revisadas.',
   1, null),
  ('psicologia-en-la-mesa', 'lo-que-construyo', 'Lo que construyo',
   'Mi caso a la vista. Una psicóloga que construye y entrena modelos: Eureka Engine, Game Over Impostora, videojuegos, el diplomado, Conidolly, mi etapa de psicóloga cyborg. Voz íntima, fotos reales, demos y video.',
   2, 1.0 / 3),
  ('mi-nueva-partida', 'lo-vivo', 'Lo vivo',
   'Mi giro de psicóloga que aprende a entrenar modelos, construye y emprende, con dudas, números y avances. Reel detrás de escena y Stories, voz íntima. Series «Mi nueva partida» y «Lo probé».',
   1, null),
  ('mi-nueva-partida', 'pruebalo-tu', 'Pruébalo tú',
   'Usar la IA con criterio en su propia reinvención. Reel de pantalla y carrusel paso a paso. Series «Prompt con inteligencia emocional» y «Pequeño experimento».',
   2, 1.0 / 3)
) as v (pilar, slug, nombre, descripcion, orden, minimo)
join public.categorias c on c.slug = v.pilar;

-- The idea carries the angle as it carries the pillar (spec 15d, decision 2): a piece's angle is its idea's.
alter table public.ideas add column angulo_id uuid references public.pilar_angulos (id);
create index ideas_angulo on public.ideas (angulo_id) where angulo_id is not null;

-- 1. A pillar change that does not also set the angle clears it (the undo of 15a's lot, any later move).
-- 2. An angle belongs to the idea's pillar (`ideas.pilar` is the pillar's slug).
-- 3. Coni changes it until she signs gate 1: then the script was written and signed with that angle. Asking for
--    changes or "volver a firmar" clears `puerta1_en`, and the angle opens again. A discarded piece locks nothing.
create function public.exigir_angulo_de_pilar() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.pilar is distinct from old.pilar and new.angulo_id is not distinct from old.angulo_id then
    new.angulo_id := null;
  end if;
  if new.angulo_id is not null and not exists (
    select 1
      from public.pilar_angulos a
      join public.categorias c on c.id = a.pilar_id
     where a.id = new.angulo_id and c.slug = new.pilar
  ) then
    raise exception using errcode = '23514', message = 'angulo_de_otro_pilar';
  end if;
  if tg_op = 'UPDATE'
     and new.pilar is not distinct from old.pilar
     and new.angulo_id is distinct from old.angulo_id
     and exists (
       select 1 from public.piezas p
        where p.idea_id = new.id and p.estado <> 'descartado' and p.puerta1_en is not null
     ) then
    raise exception using errcode = '23514', message = 'angulo_firmado';
  end if;
  return new;
end $$;

create trigger exigir_angulo_de_pilar before insert or update of pilar, angulo_id on public.ideas
  for each row execute function public.exigir_angulo_de_pilar();
