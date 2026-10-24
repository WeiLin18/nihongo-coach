import { accentType, pitchPattern, splitMorae } from '@shared/kana'

const CELL = 28
const HIGH = 10
const LOW = 30

// Draws the pitch line over the reading, like the NHK / OJAD dictionaries.
// The faded last dot is a following particle (が), which tells 平板 and 尾高 apart.
export function PitchAccent({ reading, nucleus }: { reading: string; nucleus: number }) {
  const morae = splitMorae(reading)
  const pattern = pitchPattern(nucleus, morae.length)
  const width = CELL * pattern.length
  const pts = pattern.map((high, i) => ({ x: CELL * i + CELL / 2, y: high ? HIGH : LOW }))

  return (
    <div className="inline-flex flex-col items-start">
      <svg width={width} height={40} viewBox={`0 0 ${width} 40`} className="text-rose-600">
        <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={2} />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={i === morae.length ? 'white' : 'currentColor'}
            stroke="currentColor"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <div className="flex text-lg">
        {[...morae, 'が'].map((m, i) => (
          <span key={i} style={{ width: CELL }} className={`text-center ${i === morae.length ? 'text-gray-300' : ''}`}>
            {m}
          </span>
        ))}
      </div>
      <span className="mt-1 text-xs text-gray-500">
        [{nucleus}] {accentType(nucleus, morae.length)}
      </span>
    </div>
  )
}
