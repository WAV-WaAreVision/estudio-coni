// Not a client module: server and client components size their Phosphor icons with it.
/**
 * Phosphor sizes in em, so an icon grows with the text it sits next to (spec decision 3; v6: 16 -> 1em, 20 -> 1.2em,
 * 24 -> 1.45em). The comment on each is the px size it replaces at the 16 px design root.
 */
export const ICONO = {
  mini: "0.85em", // 14: the check inside a box
  chico: "1em", // 16: next to meta text
  medio: "1.2em", // 20: next to body text, chevrons
  grande: "1.45em", // 24: nav, the sign thumb
  amplio: "1.6em", // 28: the video play
  cierre: "1.9em", // 32: the closing moment
} as const
