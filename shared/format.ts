import { accentType, splitMorae } from './kana'
import type { Card } from './schema'

// Plain-text version of a card, for iOS Shortcuts' "Show Result".
export function cardToText(card: Card): string {
  const accents = card.wordAccents
    .map((w) => {
      if (!w.accents) return `${w.surface}（${w.reading}）重音：字典查無`
      const n = splitMorae(w.reading).length
      return `${w.surface}（${w.reading}）[${w.accents.join('/')}] ${w.accents.map((a) => accentType(a, n)).join('/')}`
    })
    .join('\n')
  return [
    card.ja,
    card.reading,
    '',
    `中：${card.zh}`,
    `英：${card.en}`,
    card.correction ? `\n原句：${card.correction.original}\n為什麼：${card.correction.why}` : null,
    '',
    card.nuance,
    '',
    ...card.examples.map((e) => `・${e.ja}\n  ${e.zh}`),
    '',
    accents,
    `#${card.category}`,
  ]
    .filter((l) => l !== null)
    .join('\n')
}
