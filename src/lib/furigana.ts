import { toHiragana } from '@shared/kana'

const KANJI = /[々一-鿿]/

export type RubyPart = { base: string; rt?: string }

// Splits a token like 確かめる / たしかめる into 確[たし] + かめる, so furigana sits only over the kanji.
// Leading and trailing kana that match the reading are peeled off; the rest keeps the remaining reading.
export function rubyParts(text: string, reading: string): RubyPart[] {
  if (!reading || !KANJI.test(text)) return [{ base: text }]
  const chars = [...text]
  const kana = [...reading]
  let head = 0
  while (head < chars.length - 1 && !KANJI.test(chars[head]) && toHiragana(chars[head]) === kana[head]) head++
  let tail = 0
  while (
    tail < chars.length - head - 1 &&
    !KANJI.test(chars[chars.length - 1 - tail]) &&
    toHiragana(chars[chars.length - 1 - tail]) === kana[kana.length - 1 - tail]
  )
    tail++
  const middle = chars.slice(head, chars.length - tail).join('')
  const rt = kana.slice(head, kana.length - tail).join('')
  if (!rt) return [{ base: text }]
  return [
    ...(head ? [{ base: chars.slice(0, head).join('') }] : []),
    { base: middle, rt },
    ...(tail ? [{ base: chars.slice(chars.length - tail).join('') }] : []),
  ]
}
