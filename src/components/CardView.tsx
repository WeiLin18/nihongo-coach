import type { Card } from '@shared/schema'
import { PitchAccent } from './PitchAccent'
import { SpeakButton } from './SpeakButton'

const POLITENESS = { casual: '口語・朋友', neutral: '一般', polite: '丁寧語', keigo: '敬語' }

// Also renders a card that is still being generated: fields appear as they stream in,
// and the speak buttons and accents show up once the saved card (with an id) arrives.
export function CardView({ card }: { card: Partial<Card> }) {
  const done = card.id !== undefined
  const examples = (card.examples ?? []).filter((e) => e?.ja)
  return (
    <article className="space-y-4">
      <header>
        <div className="flex items-start gap-2">
          <h2 className="text-2xl font-bold leading-snug">{card.ja}</h2>
          {done && card.ja && <SpeakButton text={card.ja} />}
        </div>
        <p className="text-gray-500">{card.reading}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          {card.category && <span className="rounded bg-rose-50 px-2 py-0.5 text-rose-700">{card.category}</span>}
          {card.politeness && POLITENESS[card.politeness] && (
            <span className="rounded bg-gray-100 px-2 py-0.5">{POLITENESS[card.politeness]}</span>
          )}
        </div>
      </header>

      {card.correction?.original && (
        <section className="rounded-lg bg-amber-50 p-3 text-sm">
          <p className="text-gray-500 line-through">{card.correction.original}</p>
          <p className="mt-1">{card.correction.why}</p>
        </section>
      )}

      <section className="space-y-1">
        {card.zh && <p>🇹🇼 {card.zh}</p>}
        {card.en && <p>🇺🇸 {card.en}</p>}
      </section>

      <p className="whitespace-pre-wrap text-sm leading-relaxed">{card.nuance}</p>

      {examples.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500">例句</h3>
          {examples.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="min-w-0">
                <p>{e.ja}</p>
                <p className="text-xs text-gray-400">{e.reading}</p>
                <p className="text-sm text-gray-600">{e.zh}</p>
              </div>
              {done && <SpeakButton text={e.ja} />}
            </div>
          ))}
        </section>
      )}

      {!done && <p className="animate-pulse text-xs text-gray-400">產生中…</p>}

      {card.wordAccents && card.wordAccents.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-500">重音（字典）</h3>
          {card.wordAccents.map((w) => (
            <div key={`${w.surface}-${w.reading}`} className="flex flex-wrap items-end gap-4 border-b pb-3">
              <div className="w-20 shrink-0">
                <p className="font-medium">{w.surface}</p>
                <SpeakButton text={w.surface} />
              </div>
              {w.accents ? (
                w.accents.map((n) => <PitchAccent key={n} reading={w.reading} nucleus={n} />)
              ) : (
                <p className="text-sm text-gray-400">{w.reading}・字典查無，請以示範音為準</p>
              )}
            </div>
          ))}
          <p className="text-[10px] text-gray-400">
            重音資料：<a href="https://github.com/mifunetoshiro/kanjium" className="underline">Kanjium</a>（CC BY-SA 4.0）
          </p>
        </section>
      )}
    </article>
  )
}
