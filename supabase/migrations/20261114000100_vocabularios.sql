-- Change 6a: closed lists with versions. Each version holds the whole list for one network; one vigente per list and
-- network. Going back is approving an older version again (6d). Writes only through the service role for now.
create function public.valores_de_vocabulario_validos(lista text, valores jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(valores) = 'array'
    and jsonb_array_length(valores) > 0
    and not exists (
      select 1 from jsonb_array_elements(valores) v
      where jsonb_typeof(v) <> 'object'
        or coalesce(v->>'valor', '') = ''
        or coalesce(v->>'etiqueta', '') = ''
        or (lista = 'emocion' and coalesce(v->>'grupo', '') not in ('problema', 'puente', 'solucion', 'respaldo'))
    )
$$;

create table public.versiones_de_vocabulario (
  id integer generated always as identity primary key,
  lista text not null check (lista in ('tipo', 'evidencia', 'publico', 'dolor', 'emocion', 'gancho')),
  red text not null check (red in ('linkedin', 'instagram', 'todas')),
  nombre text not null,
  motivo text not null,
  valores jsonb not null,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'vigente', 'anterior', 'rechazada')),
  creada_en timestamptz not null default now(),
  aprobada_en timestamptz,
  constraint versiones_de_vocabulario_valores_check check (public.valores_de_vocabulario_validos(lista, valores))
);
create unique index vocabulario_uno_vigente on public.versiones_de_vocabulario (lista, red) where estado = 'vigente';

alter table public.versiones_de_vocabulario enable row level security;
revoke all on public.versiones_de_vocabulario from anon, authenticated;
grant select on public.versiones_de_vocabulario to authenticated;
create policy "coni y wav leen vocabularios" on public.versiones_de_vocabulario for select to authenticated
  using (public.es_coni() or public.es_mantenedor());
grant all on public.versiones_de_vocabulario to service_role;

-- Starting lists: Coni defined them (request of 2026-10-31 and emociones.md of 2026-11-01).
insert into public.versiones_de_vocabulario (lista, red, nombre, motivo, valores, estado, aprobada_en) values
('tipo', 'todas', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"definicion","etiqueta":"Definición","descripcion":"Dice qué es algo."},
  {"valor":"causa","etiqueta":"Causa","descripcion":"Dice por qué pasa algo."},
  {"valor":"consecuencia","etiqueta":"Consecuencia","descripcion":"Dice a qué lleva algo."},
  {"valor":"mito","etiqueta":"Mito","descripcion":"Nombra una creencia común y la corrige o la cuestiona."},
  {"valor":"consejo","etiqueta":"Consejo","descripcion":"Dice qué hacer o evitar."},
  {"valor":"dato","etiqueta":"Dato","descripcion":"Una cifra, un hallazgo o un hecho verificable."},
  {"valor":"experiencia","etiqueta":"Experiencia","descripcion":"Lo que le pasó a alguien, vivido u observado en la práctica profesional del autor."},
  {"valor":"limite","etiqueta":"Límite","descripcion":"Cuándo algo no aplica o tiene matices."}
]', 'vigente', now()),
('evidencia', 'todas', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"estudio","etiqueta":"Estudio","descripcion":"La fuente cita investigación o datos."},
  {"valor":"guia_consenso","etiqueta":"Guía o consenso","descripcion":"DSM, OMS, guías clínicas u otro consenso profesional."},
  {"valor":"clinica","etiqueta":"Práctica profesional","descripcion":"El autor habla desde su práctica profesional, nunca con datos de pacientes."},
  {"valor":"opinion","etiqueta":"Opinión","descripcion":"La visión del autor sin respaldo declarado."},
  {"valor":"testimonio","etiqueta":"Testimonio","descripcion":"El relato de una persona sobre su propio caso."}
]', 'vigente', now()),
('publico', 'linkedin', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"transformacion_digital","etiqueta":"Transformación digital"},
  {"valor":"rrhh_personas","etiqueta":"RR.HH. y personas"},
  {"valor":"lideres_equipos","etiqueta":"Líderes y equipos"},
  {"valor":"gerencia","etiqueta":"Gerencia"},
  {"valor":"empresas_tech","etiqueta":"Empresas tech"},
  {"valor":"academia","etiqueta":"Academia"},
  {"valor":"autoridades","etiqueta":"Autoridades"},
  {"valor":"mujeres_lideres","etiqueta":"Mujeres líderes"},
  {"valor":"colegas_clinicos","etiqueta":"Colegas clínicos"}
]', 'vigente', now()),
('publico', 'instagram', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"profesional_con_techo","etiqueta":"Profesional con techo (44 a 55)"},
  {"valor":"se_reinventa","etiqueta":"La que se reinventa (38 a 50)"},
  {"valor":"se_descubre_tarde","etiqueta":"La que se descubre tarde (35 a 45)"}
]', 'vigente', now()),
('dolor', 'linkedin', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"herramienta_sin_uso","etiqueta":"Herramienta comprada que no se usa"},
  {"valor":"rrhh_tarde","etiqueta":"RR.HH. llega tarde"},
  {"valor":"adopcion_no_impacto","etiqueta":"Medir adopción y no impacto"},
  {"valor":"liderar_incertidumbre","etiqueta":"Liderar con incertidumbre"},
  {"valor":"resistencia_miedo","etiqueta":"Resistencia o miedo en los equipos"},
  {"valor":"juzgada_por_ia","etiqueta":"Temor a ser juzgada por usar IA"}
]', 'vigente', now()),
('dolor', 'instagram', 'Lista de partida', 'Cambio 6: listas definidas por Coni', '[
  {"valor":"no_merecer_logros","etiqueta":"No merecer los logros"},
  {"valor":"techo_profesional","etiqueta":"Techo profesional"},
  {"valor":"reinventarse_sin_estructura","etiqueta":"Reinventarse sin estructura"},
  {"valor":"desconfianza_ia","etiqueta":"Desconfianza de la IA"},
  {"valor":"energia_limites","etiqueta":"Energía y límites"},
  {"valor":"propio_tdah","etiqueta":"Entender el propio TDAH"}
]', 'vigente', now()),
('emocion', 'todas', 'Lista de partida', 'Lista de Coni del 1 de noviembre de 2026 (emociones.md)', '[
  {"valor":"agobio","etiqueta":"Agobio","grupo":"problema","activacion":"alta","descripcion":"Demasiado, ahora: sobrecarga, no doy abasto."},
  {"valor":"inquietud","etiqueta":"Inquietud","grupo":"problema","activacion":"media","descripcion":"Preocupación por lo que podría pasar. Se puede pensar y nombrar."},
  {"valor":"miedo_angustia","etiqueta":"Miedo o angustia","grupo":"problema","activacion":"alta","descripcion":"Una amenaza intensa o cercana, en el cuerpo: me paraliza, me quita el sueño."},
  {"valor":"frustracion","etiqueta":"Frustración","grupo":"problema","activacion":"alta","descripcion":"La falla está afuera: hicimos todo y no resultó."},
  {"valor":"indignacion","etiqueta":"Indignación","grupo":"problema","activacion":"alta","descripcion":"Es injusto para un grupo. Apunta a sistemas y prácticas, nunca a personas."},
  {"valor":"rechazo_resistencia","etiqueta":"Rechazo o resistencia","grupo":"problema","activacion":"alta","descripcion":"No lo quiero y me opongo, aunque funcione: defensa activa de una forma de trabajar."},
  {"valor":"escepticismo","etiqueta":"Escepticismo","grupo":"problema","activacion":"media","descripcion":"No me lo creo, me venden humo: duda sobre si es cierto."},
  {"valor":"confusion","etiqueta":"Confusión","grupo":"problema","activacion":"media","descripcion":"No entiendo, información contradictoria, no sé por dónde partir."},
  {"valor":"incomodidad_evitacion","etiqueta":"Incomodidad o evitación","grupo":"problema","activacion":"baja","descripcion":"Prefiero no mirarlo: lo esquivo, lo postergo."},
  {"valor":"culpa","etiqueta":"Culpa","grupo":"problema","activacion":"media","descripcion":"Hice o no hice algo que creía que debía. Apunta a una conducta."},
  {"valor":"verguenza","etiqueta":"Vergüenza","grupo":"problema","activacion":"baja","descripcion":"Soy insuficiente o un fraude, y temo que lo noten. Apunta al yo."},
  {"valor":"curiosidad","etiqueta":"Curiosidad","grupo":"puente","activacion":"alta","descripcion":"La pregunta queda abierta: hay algo que quiero saber."},
  {"valor":"sorpresa","etiqueta":"Sorpresa","grupo":"puente","activacion":"alta","descripcion":"El dato ya rompió la creencia: algo que creía no es así."},
  {"valor":"alivio","etiqueta":"Alivio","grupo":"solucion","activacion":"media","descripcion":"Baja la carga: tiene nombre, explicación o permiso."},
  {"valor":"calma","etiqueta":"Calma","grupo":"solucion","activacion":"baja","descripcion":"Paz, margen, bajar el ritmo. Es un estado, no una transición."},
  {"valor":"claridad","etiqueta":"Claridad","grupo":"solucion","activacion":"media","descripcion":"Ahora entiendo cómo decidir: un marco o criterio que ordena."},
  {"valor":"autoconfianza","etiqueta":"Autoconfianza","grupo":"solucion","activacion":"media","descripcion":"Sí puedo: tengo un paso concreto y me siento capaz."},
  {"valor":"pertenencia","etiqueta":"Pertenencia","grupo":"solucion","activacion":"media","descripcion":"Me vio, no estoy sola, soy parte de un grupo."},
  {"valor":"orgullo","etiqueta":"Orgullo","grupo":"solucion","activacion":"media","descripcion":"Este logro es mío, por mi esfuerzo."},
  {"valor":"entusiasmo_optimismo","etiqueta":"Entusiasmo u optimismo","grupo":"solucion","activacion":"alta","descripcion":"Ganas de empezar ya y expectativa de que irá bien."},
  {"valor":"informativa","etiqueta":"Informativa","grupo":"respaldo","descripcion":"Un dato sin reacción buscada. Si el dato sorprende, es sorpresa."},
  {"valor":"otra","etiqueta":"Otra","grupo":"respaldo","descripcion":"Cuando nada calza. Siempre trae una línea de por qué."}
]', 'vigente', now()),
('gancho', 'todas', 'Lista de partida', 'Cambio 6: fórmulas de los manuales de Coni', '[
  {"valor":"afirmacion_contraria","etiqueta":"Afirmación contraria"},
  {"valor":"numero_especifico","etiqueta":"Número específico"},
  {"valor":"confesion","etiqueta":"Confesión"},
  {"valor":"pregunta_espejo","etiqueta":"Pregunta espejo"},
  {"valor":"escena","etiqueta":"Escena"},
  {"valor":"tiene_nombre","etiqueta":"Tiene nombre"},
  {"valor":"mito","etiqueta":"Mito"},
  {"valor":"verdad_incomoda","etiqueta":"Verdad incómoda"},
  {"valor":"antes_ahora","etiqueta":"Antes/ahora"},
  {"valor":"habla_directo","etiqueta":"Le habla directo a alguien"},
  {"valor":"lista_con_numero","etiqueta":"Lista con número"},
  {"valor":"detras_de_escena","etiqueta":"Detrás de escena"}
]', 'vigente', now());
