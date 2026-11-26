-- Change 6a: tipo gains límite, evidencia gains guía o consenso, both gain sin_clasificar (doubtful values no longer
-- become opinión or fail the chunk). Lists rewritten in full.
alter table public.afirmaciones drop constraint afirmaciones_tipo_check;
alter table public.afirmaciones drop constraint afirmaciones_evidencia_check;
alter table public.afirmaciones add constraint afirmaciones_tipo_check check (tipo in ('definicion', 'causa',
  'consecuencia', 'mito', 'consejo', 'dato', 'experiencia', 'limite', 'sin_clasificar'));
alter table public.afirmaciones add constraint afirmaciones_evidencia_check check (evidencia in ('estudio',
  'guia_consenso', 'clinica', 'opinion', 'testimonio', 'sin_clasificar'));
