/**
 * Brandkit 2: `conidolly` in Geist 600 with the dot of the i drawn in the signature colour, 1.25 times the original.
 * The text is the dotless i (U+0131); the circle sits where the dot was. Measured in Chromium at 20 px: the glyph starts
 * at x = 33.36 and its stem is centred 2.65 px in, so the dot is at x = 36.0; the original dot's centre rises 13.25 px
 * above the baseline (y = 24) and measures 2.5 px, so the circle has radius 1.6 at y = 10.75.
 * Live text, because the font is the app's own; outlined paths are the follow-up for a shipped logo file.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <svg role="img" aria-label="Conidolly" viewBox="0 0 82 30" width={82} height={30} className={className}>
      <text
        x={0}
        y={24}
        className="fill-tinta"
        fontSize={20}
        fontWeight={600}
        letterSpacing="-0.03em"
        style={{ fontFamily: "var(--letra)" }}
      >
        {"conıdolly"}
      </text>
      <circle data-punto cx={36} cy={10.75} r={1.6} className="fill-firma" />
    </svg>
  )
}
