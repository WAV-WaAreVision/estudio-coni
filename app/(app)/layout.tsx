import { NavInferior } from "@/components/nav-inferior"

// One centred column on every screen size; on a tablet or a computer the bar goes to the top (DESIGN.md, Adaptation).
export default function DisenoDeLaApp({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[560px] flex-col md:flex-col-reverse md:justify-end">
      <main className="flex-1 px-4.5 pt-[max(1rem,env(safe-area-inset-top))] pb-6">{children}</main>
      <NavInferior />
    </div>
  )
}
