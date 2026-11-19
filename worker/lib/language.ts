// Explanation fields must be in Traditional Chinese, but the model sometimes drifts into the
// language around them: a `correction.why` right after a Japanese `original` came back in
// Japanese, and once in Korean. These checks catch that so the request can be retried.

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힯]/
const HAN = /[㐀-鿿]/g
const HIRAGANA = /[ぁ-ゟ]/g
const LATIN = /[A-Za-z]/g
// Japanese quoted inside an explanation is expected: 用「反映済みです」比較自然.
const QUOTED = /「[^」]*」|『[^』]*』|“[^”]*”|"[^"]*"|`[^`]*`/g

// True when `text` is clearly not Chinese: any Hangul, Japanese prose (hiragana makes up a
// large share of the unquoted text), or a long text with no CJK at all (English).
export function notChinese(text: string): boolean {
  if (HANGUL.test(text)) return true
  const plain = text.replace(QUOTED, '')
  const han = plain.match(HAN)?.length ?? 0
  const kana = plain.match(HIRAGANA)?.length ?? 0
  if (kana >= 6 && kana > (han + kana) * 0.25) return true
  return han + kana === 0 && (plain.match(LATIN)?.length ?? 0) > 20
}

// Names of the fields in `fields` that are not Chinese.
export function nonChineseFields(fields: Record<string, string | null | undefined>): string[] {
  return Object.entries(fields)
    .filter(([, v]) => v && notChinese(v))
    .map(([k]) => k)
}
