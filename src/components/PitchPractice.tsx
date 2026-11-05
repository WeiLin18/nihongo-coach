import { useMemo, useState } from 'react'
import { splitMorae } from '@shared/kana'
import { analyse, decodeAudio, extractContour, type Analysis, type Contour } from '../lib/pitch'
import { useRecorder } from '../lib/useRecorder'

// Echo cancellation and noise suppression can smear or clip the pitch track.
const RAW_AUDIO = { echoCancellation: false, noiseSuppression: false, autoGainControl: false }

// Record yourself saying a word and compare your pitch with the dictionary accents.
// Everything runs on the device; the audio is never uploaded.
export function PitchPractice({ reading, accents }: { reading: string; accents: number[] }) {
  const morae = splitMorae(reading)
  const [withParticle, setWithParticle] = useState(false)
  const [contour, setContour] = useState<Contour | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const recorder = useRecorder(async (audio) => {
    setBusy(true)
    try {
      const { samples, sampleRate } = await decodeAudio(audio)
      const c = extractContour(samples, sampleRate)
      setContour(typeof c === 'string' ? null : c)
      setError(typeof c === 'string' ? c : null)
    } catch {
      setError('無法讀取錄音，請再試一次')
    } finally {
      setBusy(false)
    }
  }, RAW_AUDIO)

  const result = useMemo(
    () => (contour ? analyse(contour, morae.length, accents, withParticle) : null),
    [contour, morae.length, accents, withParticle],
  )

  async function toggle() {
    setError(null)
    try {
      await recorder.toggle()
    } catch {
      setError('無法使用麥克風，請允許錄音權限')
    }
  }

  return (
    <div className="w-full space-y-2">
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`rounded-full px-3 py-1 active:scale-95 ${recorder.recording ? 'animate-pulse bg-rose-600 text-white' : 'bg-gray-100'}`}
        >
          {recorder.recording ? '■ 停止' : busy ? '分析中…' : '🎙 錄音比對'}
        </button>
        <label className="flex items-center gap-1 text-gray-500">
          <input type="checkbox" checked={withParticle} onChange={(e) => setWithParticle(e.target.checked)} />
          ＋が
        </label>
        {recorder.recording && <span className="text-xs text-gray-400">念「{reading}{withParticle ? 'が' : ''}」</span>}
      </div>
      {error && <p className="text-sm text-amber-700">{error}</p>}
      {result && !result.ok && <p className="text-sm text-amber-700">{result.reason}</p>}
      {result?.ok && <PitchComparison result={result} labels={withParticle ? [...morae, 'が'] : morae} />}
    </div>
  )
}

const CELL = 52
const H = 120
const TOP = 10
const RANGE = 8 // semitones shown above and below the speaker's median

const y = (st: number) => TOP + ((RANGE - Math.max(-RANGE, Math.min(RANGE, st))) / (2 * RANGE)) * (H - 2 * TOP)

// Splits a contour into polylines at unvoiced gaps.
function segments(contour: Contour, width: number): string[] {
  const out: string[] = []
  let cur: string[] = []
  for (const p of contour.points) {
    if (p.st === null) {
      if (cur.length > 1) out.push(cur.join(' '))
      cur = []
    } else cur.push(`${(p.x * width).toFixed(1)},${y(p.st).toFixed(1)}`)
  }
  if (cur.length > 1) out.push(cur.join(' '))
  return out
}

// The user's contour (blue) over the expected high/low pattern of the closest accent (grey),
// with the expected fall marked in rose. `reference` is for a native recording later (e.g. /api/tts).
export function PitchComparison({
  result,
  labels,
  reference,
}: {
  result: Extract<Analysis, { ok: true }>
  labels: string[]
  reference?: Contour
}) {
  const width = CELL * labels.length
  const { fitted, expected, expectedDrop, moraSt } = result
  return (
    <div className="space-y-1">
      <p className={`text-sm font-medium ${result.correct ? 'text-emerald-700' : 'text-amber-700'}`}>{result.verdict}</p>
      <div className="overflow-x-auto">
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="rounded bg-gray-50">
          {labels.map((_, i) => (
            <line key={i} x1={CELL * i} x2={CELL * i} y1={0} y2={H} stroke="#e5e7eb" />
          ))}
          {expected.map((high, i) => (
            <line
              key={i}
              x1={CELL * i + 4}
              x2={CELL * (i + 1) - 4}
              y1={y(high ? fitted.high : fitted.low)}
              y2={y(high ? fitted.high : fitted.low)}
              stroke="#9ca3af"
              strokeWidth={8}
              strokeLinecap="round"
              opacity={0.45}
            />
          ))}
          {expectedDrop !== null && (
            <g className="text-rose-600">
              <line
                x1={CELL * expectedDrop}
                x2={CELL * expectedDrop}
                y1={4}
                y2={H - 4}
                stroke="currentColor"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <text x={CELL * expectedDrop + 3} y={14} fontSize={11} fill="currentColor">
                ↓應降
              </text>
            </g>
          )}
          {reference &&
            segments(reference, width).map((pts, i) => (
              <polyline key={`r${i}`} points={pts} fill="none" stroke="#6b7280" strokeWidth={1.5} strokeDasharray="3 2" />
            ))}
          {segments(result.contour, width).map((pts, i) => (
            <polyline key={i} points={pts} fill="none" stroke="#2563eb" strokeWidth={2} strokeLinejoin="round" />
          ))}
          {moraSt.map((st, i) =>
            st === null ? null : <circle key={i} cx={CELL * i + CELL / 2} cy={y(st)} r={3.5} fill="#2563eb" />,
          )}
        </svg>
        <div className="flex text-lg">
          {labels.map((m, i) => (
            <span key={i} style={{ width: CELL }} className="text-center">
              {m}
            </span>
          ))}
        </div>
      </div>
      <p className="text-xs text-gray-500">
        <span className="text-blue-600">━ 你的音高</span>　<span className="text-gray-400">▬ 字典 [{result.nucleus}]</span>
      </p>
      {result.notes.map((n) => (
        <p key={n} className="text-xs text-gray-400">
          ・{n}
        </p>
      ))}
    </div>
  )
}
