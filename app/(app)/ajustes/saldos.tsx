import { LineaDeSaldo } from "@/components/ui/costo"
import { lineaDeSaldoVideo, lineaDeSaldoVoz } from "@/lib/dominio/saldos"
import { leerSaldos } from "@/lib/saldos/reales"

export function TarjetaDeSaldos({ voz, video }: { voz: string; video: string }) {
  return (
    <div className="grid gap-3">
      <p className="text-cuerpo">{voz}</p>
      <p className="text-cuerpo">{video}</p>
      <LineaDeSaldo>
        El saldo de API de HeyGen es distinto de los créditos de tu plan: Conidolly graba con el saldo de API.
      </LineaDeSaldo>
    </div>
  )
}

/** Read when the accounts open; a provider that does not answer reads "No pude ver tu saldo" and blocks nothing. */
export async function SaldosDeLaPagina({ zona }: { zona: string }) {
  const saldos = await leerSaldos()
  return <TarjetaDeSaldos voz={lineaDeSaldoVoz(saldos.elevenlabs, zona)} video={lineaDeSaldoVideo(saldos.heygen)} />
}
