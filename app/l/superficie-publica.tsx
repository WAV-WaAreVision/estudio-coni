import type { ReactNode } from "react"

/** A link on the raspberry: full colour, underlined, the focus ring in the same colour (brandkit 2), 44 px tall to tap. */
export const CLASES_DE_ENLACE_PUBLICO =
  "inline-flex min-h-objetivo w-fit items-center font-semibold underline underline-offset-4 outline-offset-2 focus-visible:outline-sobre-firma"

/** The raspberry surface of `/l/ia` and its error page: the same column and safe areas as `/l`. */
export function SuperficiePublica({ children }: { children: ReactNode }) {
  return (
    <div data-superficie="marca" className="min-h-dvh bg-firma text-sobre-firma">
      <main className="mx-auto grid w-full max-w-[560px] content-start gap-8 px-5 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        {children}
      </main>
    </div>
  )
}
