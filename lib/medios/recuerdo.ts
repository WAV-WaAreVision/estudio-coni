const PREFIJO = "visto:"

// Storage is a convenience: in a private window or with site data blocked it throws, and she simply watches again.
export function recordarVisto(clave: string): void {
  try {
    window.localStorage.setItem(`${PREFIJO}${clave}`, "1")
  } catch {
    // Nothing to do: the next visit starts from zero, which is safe (it only asks her to watch once more).
  }
}

export function recuerdaVisto(clave: string): boolean {
  try {
    return window.localStorage.getItem(`${PREFIJO}${clave}`) === "1"
  } catch {
    return false
  }
}
