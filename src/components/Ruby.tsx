// Renders {漢字|かんじ} marks as <ruby>. Copes with a half-streamed mark at the end of the text.
export function Ruby({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  const re = /\{([^|}]+)\|([^}]*)\}/g
  let last = 0
  for (let m; (m = re.exec(text)); last = re.lastIndex) {
    parts.push(text.slice(last, m.index))
    parts.push(
      <ruby key={m.index}>
        {m[1]}
        <rt className="text-[0.6em] text-gray-500">{m[2]}</rt>
      </ruby>,
    )
  }
  const tail = text.slice(last)
  parts.push(tail.includes('{') ? tail.replace(/\{([^|}]*)(\|[^}]*)?$/, '$1') : tail)
  return <>{parts}</>
}
