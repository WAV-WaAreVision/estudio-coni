import { join } from "node:path"

// A synthetic LinkedIn export (issue 15's format, fake URLs and numbers). Federico's real file never enters the repo.

/** Written by `pnpm fixture:excel-linkedin`; committed so the tests need no generator. */
export const EXCEL_DE_PRUEBA = join(__dirname, "excel-linkedin.xlsx")

/** Published by Conidolly through the API: `urn:li:share:<this>`. */
export const POST_COMPARTIDO = "7380000000000000001"
/** Uploaded by hand on 7 October: no URN, matched by its day. */
export const POST_UGC = "7380000000000000002"
/** Somebody else's repost: not Conidolly's. */
export const POST_AJENO = "7380000000000000003"

const url = (tipo: string, numero: string, titulo: string) =>
  `https://www.linkedin.com/posts/constanza-del-rosario_${titulo}-${tipo}-${numero}-AbCd`

export const HOJAS_DE_PRUEBA: { sheet: string; data: string[][] }[] = [
  {
    sheet: "DESCUBRIMIENTO",
    data: [
      ["Rendimiento general", "1/10/2026 - 30/10/2026"],
      ["Impresiones", "3800"],
      ["Miembros alcanzados", "2100"],
    ],
  },
  {
    sheet: "INTERACCIÓN",
    data: [
      ["Fecha", "Impresiones", "Interacciones"],
      ["1/10/2026", "120", "4"],
    ],
  },
  {
    sheet: "PUBLICACIONES PRINCIPALES",
    data: [
      ["Esta lista puede incluir 50 publicaciones como máximo"],
      [],
      [
        "URL de la publicación",
        "Fecha de publicación",
        "Interacciones",
        "",
        "URL de la publicación",
        "Fecha de publicación",
        "Impresiones",
      ],
      [
        url("ugcPost", POST_UGC, "qu%C3%A9-pasa-cuando-te-dicen"),
        "7/10/2026",
        "40",
        "",
        url("ugcPost", POST_UGC, "qu%C3%A9-pasa-cuando-te-dicen"),
        "7/10/2026",
        "2300",
      ],
      [
        url("share", POST_COMPARTIDO, "lo-que-firma-un-modelo"),
        "3/10/2026",
        "12",
        "",
        url("share", POST_COMPARTIDO, "lo-que-firma-un-modelo"),
        "3/10/2026",
        "1200",
      ],
      [
        url("share", POST_AJENO, "repost"),
        "20/10/2026",
        "5",
        "",
        url("share", POST_AJENO, "repost"),
        "20/10/2026",
        "300",
      ],
    ],
  },
  {
    sheet: "SEGUIDORES",
    data: [["Total de seguidores el 30/10/2026", "830"], [], ["Fecha", "Nuevos seguidores"], ["1/10/2026", "3"]],
  },
  { sheet: "INFORMACIÓN DETALLADA DEL PÚBLI", data: [["Información detallada principal", "Valor", "Porcentaje"]] },
]
