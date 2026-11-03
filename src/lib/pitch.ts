// Pitch-accent analysis of a recorded word, all in the browser (and runnable in Node
// for scripts/check-pitch.ts). Pipeline: resample to 16 kHz → YIN F0 per 10 ms frame →
// trim silence → median smoothing → semitones relative to the speaker's median →
// mean pitch per mora (even time split) → compare with each accepted accent.
import { pitchPattern } from '../../shared/kana.ts'

const RATE = 16000
const WINDOW = 640 // 40 ms, long enough for two periods at 70 Hz
const HOP = 160 // 10 ms
const MIN_F0 = 70
const MAX_F0 = 500
const YIN_THRESHOLD = 0.2
// An accent fall is usually 3–6 semitones; natural downdrift is about 1 per mora.
const DROP_ST = 2

export type Frame = { t: number; f0: number | null }

export type Contour = {
  // Voiced span in seconds (silence trimmed); points are positioned inside it.
  start: number
  end: number
  // x: 0..1 across the voiced span, st: semitones relative to the speaker's median (null = unvoiced).
  points: { x: number; st: number | null }[]
  medianHz: number
  voicedRatio: number
}

export type Analysis =
  | { ok: false; reason: string }
  | {
      ok: true
      contour: Contour
      // Mean semitones per mora (and the particle が when included); null where no voiced frames.
      moraSt: (number | null)[]
      nucleus: number // closest accepted accent
      expected: boolean[] // high/low for each analysed mora of that accent
      // Expected levels fitted onto the user's semitone scale, for drawing.
      fitted: { high: number; low: number }
      expectedDrop: number | null // fall after this mora (1-based), null = no fall in range
      userDrop: number | null
      correct: boolean
      verdict: string
      notes: string[]
    }

export function resample(samples: Float32Array, from: number, to = RATE): Float32Array {
  if (from === to) return samples
  const ratio = from / to
  const out = new Float32Array(Math.floor(samples.length / ratio))
  // Box filter over each output sample's span keeps aliasing low enough for speech F0.
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio)
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = a; j < b && j < samples.length; j++) sum += samples[j]
    out[i] = sum / (b - a)
  }
  return out
}

// YIN (de Cheveigné & Kawahara 2002) with an energy gate. Expects 16 kHz mono.
export function detectF0(x: Float32Array): Frame[] {
  const frames: Frame[] = []
  const tauMin = Math.floor(RATE / MAX_F0)
  const tauMax = Math.ceil(RATE / MIN_F0)
  const n = WINDOW - tauMax
  const d = new Float32Array(tauMax + 1)
  const rms: number[] = []
  for (let s = 0; s + WINDOW <= x.length; s += HOP) {
    let e = 0
    for (let i = s; i < s + WINDOW; i++) e += x[i] * x[i]
    rms.push(Math.sqrt(e / WINDOW))
  }
  const peak = Math.max(0, ...rms)
  const gate = Math.max(peak * 0.1, 0.003) // −20 dB from the loudest frame

  rms.forEach((r, k) => {
    const s = k * HOP
    const t = (s + WINDOW / 2) / RATE
    if (r < gate) return frames.push({ t, f0: null })
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0
      for (let i = 0; i < n; i++) {
        const diff = x[s + i] - x[s + i + tau]
        sum += diff * diff
      }
      d[tau] = sum
    }
    // Cumulative mean normalised difference; take the first dip under the threshold.
    let running = 0
    let best = -1
    const cmnd = new Float32Array(tauMax + 1)
    cmnd[0] = 1
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau]
      cmnd[tau] = running > 0 ? (d[tau] * tau) / running : 1
    }
    for (let tau = tauMin; tau <= tauMax; tau++) {
      if (cmnd[tau] < YIN_THRESHOLD) {
        while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++
        best = tau
        break
      }
    }
    if (best < 0) return frames.push({ t, f0: null })
    // Parabolic interpolation for sub-sample precision.
    let tau = best
    if (best > tauMin && best < tauMax) {
      const [a, b, c] = [cmnd[best - 1], cmnd[best], cmnd[best + 1]]
      const den = a - 2 * b + c
      if (den > 0) tau = best + (a - c) / (2 * den)
    }
    frames.push({ t, f0: RATE / tau })
  })
  return frames
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// Drops voiced runs shorter than 40 ms (clicks, breath) and median-smooths the rest,
// which also removes single-frame octave jumps.
function clean(frames: Frame[]): Frame[] {
  const f = frames.map((fr) => ({ ...fr }))
  for (let i = 0; i < f.length; ) {
    if (f[i].f0 === null) {
      i++
      continue
    }
    let j = i
    while (j < f.length && f[j].f0 !== null) j++
    if (j - i < 4) for (let k = i; k < j; k++) f[k].f0 = null
    i = j
  }
  return f.map((fr, i) => {
    if (fr.f0 === null) return fr
    const win = f
      .slice(Math.max(0, i - 2), i + 3)
      .map((w) => w.f0)
      .filter((v): v is number => v !== null)
    return { t: fr.t, f0: median(win) }
  })
}

export function extractContour(samples: Float32Array, sampleRate: number): Contour | string {
  const x = resample(samples, sampleRate)
  if (x.length < WINDOW * 2) return '錄音太短'
  const frames = clean(detectF0(x))
  const voiced = frames.filter((f) => f.f0 !== null)
  if (voiced.length < 8) return '偵測不到穩定的聲音音高，請靠近麥克風、大聲一點再錄一次'
  const start = voiced[0].t
  const end = voiced[voiced.length - 1].t
  const span = frames.filter((f) => f.t >= start && f.t <= end)
  const voicedRatio = voiced.length / span.length
  if (voicedRatio < 0.4) return '音高斷斷續續、不夠穩定（可能有雜音），請在安靜的地方再錄一次'
  const medianHz = median(voiced.map((f) => f.f0!))
  // x runs on voiced time: unvoiced consonant gaps (s, k, t…) take no width, so an even
  // split lands closer to the real morae than an even split of clock time would.
  let seen = 0
  return {
    start,
    end,
    medianHz,
    voicedRatio,
    points: span.map((f) => {
      if (f.f0 === null) return { x: seen / voiced.length, st: null }
      seen++
      return { x: (seen - 0.5) / voiced.length, st: 12 * Math.log2(f.f0 / medianHz) }
    }),
  }
}

// Mean semitones per mora, using only the middle 60% of each mora so transitions
// (and the error of an even split) matter less. The last mora uses only its onset,
// because pitch sinks at the end of any utterance whatever the accent.
export function moraMeans(contour: Contour, count: number): (number | null)[] {
  return Array.from({ length: count }, (_, i) => {
    const last = i === count - 1 && count > 1
    const a = (i + (last ? 0.05 : 0.2)) / count
    const b = (i + (last ? 0.45 : 0.8)) / count
    const vals = contour.points.filter((p) => p.x >= a && p.x <= b && p.st !== null).map((p) => p.st!)
    return vals.length >= 2 ? vals.reduce((s, v) => s + v, 0) / vals.length : null
  })
}

// Least-squares fit of low + scale·pattern (scale ≥ 0) to the known mora means.
function fit(means: (number | null)[], pattern: boolean[]) {
  const pts = means.flatMap((m, i) => (m === null ? [] : [{ y: m, h: pattern[i] ? 1 : 0 }]))
  const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length
  const my = mean(pts.map((p) => p.y))
  const mh = mean(pts.map((p) => p.h))
  const cov = pts.reduce((s, p) => s + (p.h - mh) * (p.y - my), 0)
  const varH = pts.reduce((s, p) => s + (p.h - mh) ** 2, 0)
  const scale = varH > 0 ? Math.max(0, cov / varH) : 0
  const low = my - scale * mh
  const residual = pts.reduce((s, p) => s + (p.y - (low + scale * p.h)) ** 2, 0)
  return { low, high: low + Math.max(scale, 0), residual }
}

// First fall between neighbouring known morae that is clearly larger than downdrift.
// (After the accent fall everything stays low and keeps sinking, so the first one counts.)
// A fall into the last mora needs an extra semitone to beat utterance-final lowering.
function findDrop(means: (number | null)[]): number | null {
  for (let i = 0; i + 1 < means.length; i++) {
    const [a, b] = [means[i], means[i + 1]]
    const need = i + 2 === means.length ? DROP_ST + 1 : DROP_ST
    if (a !== null && b !== null && a - b >= need) return i + 1
  }
  return null
}

function expectedDropOf(pattern: boolean[]): number | null {
  for (let i = 0; i + 1 < pattern.length; i++) if (pattern[i] && !pattern[i + 1]) return i + 1
  return null
}

// moraCount is the word's morae; withParticle means the user said the word followed by が.
export function analyse(
  contour: Contour,
  moraCount: number,
  nuclei: number[],
  withParticle = false,
): Analysis {
  const count = moraCount + (withParticle ? 1 : 0)
  const means = moraMeans(contour, count)
  const known = means.filter((m) => m !== null).length
  if (known < Math.min(2, count)) {
    return { ok: false, reason: '每一拍的音高抓不到，可能念太快或太小聲，請放慢、清楚地再念一次' }
  }

  const candidates = nuclei.map((nucleus) => {
    const expected = pitchPattern(nucleus, moraCount).slice(0, count)
    return { nucleus, expected, ...fit(means, expected) }
  })
  const userDrop = findDrop(means)
  // Closest accent: the one whose drop matches; otherwise the smallest residual.
  const best =
    candidates.find((c) => expectedDropOf(c.expected) === userDrop) ??
    candidates.reduce((a, b) => (b.residual < a.residual ? b : a))
  const expectedDrop = expectedDropOf(best.expected)
  const notes: string[] = []

  let verdict: string
  let correct = userDrop === expectedDrop
  if (expectedDrop !== null) {
    if (userDrop === expectedDrop) verdict = `✓ 第 ${expectedDrop} 拍後下降，位置正確`
    else if (userDrop === null) verdict = `第 ${expectedDrop} 拍後應該下降，但你沒有明顯下降（聽起來比較平）`
    else if (userDrop > expectedDrop) verdict = `第 ${expectedDrop} 拍後應該下降，你在第 ${userDrop} 拍後才降`
    else verdict = `第 ${expectedDrop} 拍後才應該下降，你在第 ${userDrop} 拍後就降了`
  } else if (userDrop === null) {
    verdict = '✓ 沒有下降，跟字典一致'
  } else {
    verdict = `這個字不應該下降，但你在第 ${userDrop} 拍後降了`
  }

  // 平板 and 尾高 only differ on the following particle.
  if (!withParticle && expectedDrop === null) {
    notes.push('單念時平板和尾高都不下降，看不出差別；勾選「＋が」念「…が」才分得出來')
  }

  // The first two morae should go low → high unless the accent is on the first mora.
  const [m1, m2] = means
  if (count >= 2 && m1 !== null && m2 !== null && best.nucleus !== 1 && m1 - m2 >= DROP_ST) {
    notes.push('第 1 拍應該低、第 2 拍升高，你的第 1 拍偏高')
    correct = false
  }
  if (means.some((m) => m === null)) notes.push('有幾拍抓不到音高（例如無聲化的す、し），那幾拍不列入判斷')
  if (count <= 2) notes.push('字很短，判斷誤差較大，僅供參考')

  return {
    ok: true,
    contour,
    moraSt: means,
    nucleus: best.nucleus,
    expected: best.expected,
    fitted: best.high - best.low >= 1 ? { high: best.high, low: best.low } : { high: 2, low: -2 },
    expectedDrop,
    userDrop,
    correct,
    verdict,
    notes,
  }
}

export function analyseSamples(
  samples: Float32Array,
  sampleRate: number,
  moraCount: number,
  nuclei: number[],
  withParticle = false,
): Analysis {
  const contour = extractContour(samples, sampleRate)
  if (typeof contour === 'string') return { ok: false, reason: contour }
  return analyse(contour, moraCount, nuclei, withParticle)
}

// Browser only: decode a MediaRecorder blob (audio/mp4 on iOS Safari, webm elsewhere) to mono.
export async function decodeAudio(blob: Blob): Promise<{ samples: Float32Array; sampleRate: number }> {
  const ctx = new AudioContext()
  try {
    const buf = await ctx.decodeAudioData(await blob.arrayBuffer())
    return { samples: buf.getChannelData(0), sampleRate: buf.sampleRate }
  } finally {
    void ctx.close()
  }
}
