import { describe, expect, it } from "vitest"
import { hacerPortable } from "../../scripts/staging/semilla-portable"

const PILAR = "11111111-1111-4111-8111-111111111111"
const ANGULO = "22222222-2222-4222-8222-222222222222"
const AUTORA = "33333333-3333-4333-8333-333333333333"

const BUSCAR_PILAR = "(SELECT id FROM public.categorias WHERE slug = 'mi-nueva-partida')"
const BUSCAR_ANGULO =
  "(SELECT a.id FROM public.pilar_angulos a JOIN public.categorias c ON c.id = a.pilar_id WHERE c.slug = 'mi-nueva-partida' AND a.slug = 'lo-vivo')"
const BUSCAR_AUTORA =
  "(SELECT id FROM public.autores WHERE nombre_normalizado = public.unaccent_inmutable(lower(btrim('Constanza del Rosario'))))"

const DUMP = `--
-- PostgreSQL database dump
--

\\restrict abc123

SET statement_timeout = 0;
SELECT pg_catalog.set_config('search_path', '', false);

--
-- Data for Name: autores; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.autores (id, nombre, tipo) VALUES ('${AUTORA}', 'Constanza del Rosario', 'coni') ON CONFLICT DO NOTHING;

--
-- Data for Name: categorias; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.categorias (id, slug, nombre, red) VALUES ('${PILAR}', 'mi-nueva-partida', 'Mi nueva partida', 'instagram') ON CONFLICT DO NOTHING;
INSERT INTO public.pilar_angulos (id, pilar_id, red, slug, orden) VALUES ('${ANGULO}', '${PILAR}', 'instagram', 'lo-vivo', 1) ON CONFLICT DO NOTHING;
INSERT INTO public.pilar_pesos (pilar_id, red, desde, peso) VALUES ('${PILAR}', 'instagram', '2026-11-04', 40.00) ON CONFLICT DO NOTHING;
INSERT INTO public.ideas (id, pilar, angulo_id, guion) VALUES ('44444444-4444-4444-8444-444444444444', 'mi-nueva-partida', '${ANGULO}', 'Hola, soy Coni; uno, dos (tres).

Con ''comillas'' en el texto.') ON CONFLICT DO NOTHING;
INSERT INTO public.materiales (id, autor_id, categoria_id) VALUES ('55555555-5555-4555-8555-555555555555', '${AUTORA}', '${PILAR}') ON CONFLICT DO NOTHING;

--
-- PostgreSQL database dump complete
--

\\unrestrict abc123
`

describe("hacerPortable", () => {
  const sql = hacerPortable(DUMP)

  it("keeps only the inserts, without pg_dump's settings or psql meta-commands", () => {
    expect(sql).not.toMatch(/\\restrict|\\unrestrict|SET statement_timeout|set_config/)
    expect(sql.split("\n").filter((l) => l.startsWith("INSERT INTO"))).toHaveLength(6)
  })

  it("restores with triggers off for the transaction, so state guards accept rows already past their gates", () => {
    expect(sql.startsWith("SET LOCAL session_replication_role = replica;\n")).toBe(true)
  })

  it("inserts a migration-owned row only when its natural key is missing, so the pillar trigger never sees a duplicate", () => {
    expect(sql).toContain(
      `INSERT INTO public.categorias (id, slug, nombre, red) SELECT '${PILAR}', 'mi-nueva-partida', 'Mi nueva partida', 'instagram' WHERE NOT EXISTS (SELECT 1 FROM public.categorias WHERE slug = 'mi-nueva-partida');`,
    )
    expect(sql).toContain(
      `INSERT INTO public.autores (id, nombre, tipo) SELECT '${AUTORA}', 'Constanza del Rosario', 'coni' WHERE NOT EXISTS (SELECT 1 FROM public.autores WHERE nombre_normalizado = public.unaccent_inmutable(lower(btrim('Constanza del Rosario'))));`,
    )
  })

  it("points pillar angles and weights at the pillar by slug when ids differ between databases", () => {
    expect(sql).toContain(
      `INSERT INTO public.pilar_angulos (id, pilar_id, red, slug, orden) SELECT '${ANGULO}', ${BUSCAR_PILAR}, 'instagram', 'lo-vivo', 1 WHERE NOT EXISTS (SELECT 1 FROM public.pilar_angulos WHERE pilar_id = ${BUSCAR_PILAR} AND slug = 'lo-vivo');`,
    )
    expect(sql).toContain(
      `INSERT INTO public.pilar_pesos (pilar_id, red, desde, peso) SELECT ${BUSCAR_PILAR}, 'instagram', '2026-11-04', 40.00 WHERE NOT EXISTS (SELECT 1 FROM public.pilar_pesos WHERE pilar_id = ${BUSCAR_PILAR} AND desde = '2026-11-04');`,
    )
  })

  it("turns every reference to a migration-owned row into a lookup by natural key", () => {
    expect(sql).toContain(
      `INSERT INTO public.materiales (id, autor_id, categoria_id) VALUES ('55555555-5555-4555-8555-555555555555', ${BUSCAR_AUTORA}, ${BUSCAR_PILAR}) ON CONFLICT DO NOTHING;`,
    )
    expect(sql).toContain(`'mi-nueva-partida', ${BUSCAR_ANGULO}, 'Hola, soy Coni; uno, dos (tres).`)
  })

  it("leaves text that merely contains an id untouched", () => {
    expect(sql).toContain(`Con ''comillas'' en el texto.') ON CONFLICT DO NOTHING;`)
  })

  it("refuses a dump that would keep a local id of a migration-owned row inside a value", () => {
    const conLista = `${DUMP}\nINSERT INTO public.piezas (id, pilares) VALUES ('66666666-6666-4666-8666-666666666666', '{${PILAR}}') ON CONFLICT DO NOTHING;\n`
    expect(() => hacerPortable(conLista)).toThrow(/public\.piezas.*pilares/)
  })
})
