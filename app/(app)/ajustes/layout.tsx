// Ajustes and its four pages mark themselves so the (app) column widens on a computer (issue 103): two columns of
// sections here, a form and its panel in Cuentas, Datos personales, Página de IA and Presupuesto.
export default function DisenoDeAjustes({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div data-ancho="pagina">{children}</div>
}
