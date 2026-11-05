import { Fragment } from 'react'

export type RubyPart = { base: string; rt?: string }

// Renders text with furigana; shared by conversation practice and kanji reading.
export function RubyParts({ parts }: { parts: RubyPart[] }) {
  return parts.map((p, i) =>
    p.rt ? (
      <ruby key={i} className="[ruby-align:center]">
        {p.base}
        <rt className="text-[0.6em] text-gray-500">{p.rt}</rt>
      </ruby>
    ) : (
      <Fragment key={i}>{p.base}</Fragment>
    ),
  )
}

// Renders {漢字|かんじ} marks as <ruby>. Copes with a half-streamed mark at the end of the text.
export function Ruby({ text }: { text: string }) {
  const parts: RubyPart[] = []
  const re = /\{([^|}]+)\|([^}]*)\}/g
  let last = 0
  for (let m; (m = re.exec(text)); last = re.lastIndex) {
    parts.push({ base: text.slice(last, m.index) }, { base: m[1], rt: m[2] })
  }
  const tail = text.slice(last)
  parts.push({ base: tail.includes('{') ? tail.replace(/\{([^|}]*)(\|[^}]*)?$/, '$1') : tail })
  return <RubyParts parts={parts} />
}
