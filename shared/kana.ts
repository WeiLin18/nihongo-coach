export function toHiragana(s: string): string {
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

// Small kana that merge with the previous kana into one mora (っ and ー are their own mora).
const SMALL = new Set('ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ')

export function splitMorae(reading: string): string[] {
  const morae: string[] = []
  for (const ch of reading) {
    if (SMALL.has(ch) && morae.length > 0) morae[morae.length - 1] += ch
    else morae.push(ch)
  }
  return morae
}

export type AccentType = '平板' | '頭高' | '中高' | '尾高'

export function accentType(nucleus: number, moraCount: number): AccentType {
  if (nucleus === 0) return '平板'
  if (nucleus === 1) return '頭高'
  if (nucleus === moraCount) return '尾高'
  return '中高'
}

// High (true) / low (false) for each mora, plus one extra entry for a following particle like が.
export function pitchPattern(nucleus: number, moraCount: number): boolean[] {
  return Array.from({ length: moraCount + 1 }, (_, i) => {
    const pos = i + 1
    if (nucleus === 0) return pos !== 1
    if (nucleus === 1) return pos === 1
    return pos !== 1 && pos <= nucleus
  })
}
