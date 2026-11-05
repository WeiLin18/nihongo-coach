// Checks src/lib/pitch.ts on synthetic voices with a known F0 per mora.
//
//   node scripts/check-pitch.ts [recording.wav ...]
//
// Extra arguments are 16-bit PCM WAV files (e.g. from `say -v Kyoko`), analysed and printed.
import { readFileSync } from 'node:fs'
import { analyseSamples, detectF0, extractContour, resample } from '../src/lib/pitch.ts'

const RATE = 44100
let failed = 0

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`)
  if (!ok) failed++
}

// A buzzy vowel-like tone (harmonics at 1/k) gliding between per-mora F0 targets,
// with silence around it and a little noise.
function voice(hz: number[], { mora = 0.18, noise = 0.003 } = {}): Float32Array {
  const pad = Math.floor(0.3 * RATE)
  const len = Math.floor(hz.length * mora * RATE)
  const out = new Float32Array(len + 2 * pad)
  let phase = 0
  let seed = 1
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1
  for (let i = 0; i < out.length; i++) {
    out[i] = noise * rand()
    const j = i - pad
    if (j < 0 || j >= len) continue
    const pos = j / (mora * RATE)
    const k = Math.min(Math.floor(pos), hz.length - 1)
    // 40 ms glide into each new target.
    const into = (pos - k) * mora
    const prev = hz[Math.max(0, k - 1)]
    const f = into < 0.04 && k > 0 ? prev + ((hz[k] - prev) * into) / 0.04 : hz[k]
    phase += (2 * Math.PI * f) / RATE
    let s = 0
    for (let h = 1; h <= 10; h++) s += Math.sin(h * phase) / h
    const env = Math.min(1, j / 400, (len - j) / 400)
    out[i] += 0.3 * s * env
  }
  return out
}

// F0 accuracy on a steady tone.
for (const hz of [90, 140, 220, 330]) {
  const frames = detectF0(resample(voice([hz, hz, hz]), RATE))
  const f0 = frames.map((f) => f.f0).filter((v): v is number => v !== null)
  const err = Math.max(...f0.map((v) => Math.abs(v - hz) / hz))
  check(`steady ${hz} Hz detected within 3%`, f0.length > 30 && err < 0.03, `max err ${(err * 100).toFixed(1)}%`)
}

// Silence trimming: the voiced span should match the 0.3 s padding.
{
  const c = extractContour(voice([200, 200, 200, 200]), RATE)
  const ok = typeof c !== 'string' && Math.abs(c.start - 0.3) < 0.05 && Math.abs(c.end - 1.02) < 0.05
  check('silence trimmed', ok, typeof c === 'string' ? c : `${c.start.toFixed(2)}–${c.end.toFixed(2)} s`)
}

type Case = { name: string; hz: number[]; morae: number; nuclei: number[]; particle?: boolean; want: RegExp; correct: boolean }
const H = 220
const L = 165 // ~5 semitones below H
const male = (hz: number[]) => hz.map((v) => v / 2)
const cases: Case[] = [
  { name: '頭高 [1] said right (め|がね→ 3 morae H L L)', hz: [H, L, L], morae: 3, nuclei: [1], want: /✓ 第 1 拍後下降/, correct: true },
  { name: '中高 [2] said right (L H L L)', hz: [L, H, L, L], morae: 4, nuclei: [2], want: /✓ 第 2 拍後下降/, correct: true },
  { name: '中高 [2] dropped late at 3', hz: [L, H, H, L], morae: 4, nuclei: [2], want: /第 2 拍後應該下降，你在第 3 拍後才降/, correct: false },
  { name: '中高 [3] dropped early at 2', hz: [L, H, L, L], morae: 4, nuclei: [3], want: /第 3 拍後才應該下降，你在第 2 拍後就降了/, correct: false },
  { name: '平板 [0] said right (L H H)', hz: [L, H, H], morae: 3, nuclei: [0], want: /✓ 沒有下降/, correct: true },
  { name: '平板 [0] said as 頭高', hz: [H, L, L], morae: 3, nuclei: [0], want: /不應該下降，但你在第 1 拍後降了/, correct: false },
  { name: '頭高 [1] said flat', hz: [L, H, H], morae: 3, nuclei: [1], want: /沒有明顯下降/, correct: false },
  { name: 'two accents [0, 2]: picks the one said (2)', hz: [L, H, L], morae: 3, nuclei: [0, 2], want: /✓ 第 2 拍後下降/, correct: true },
  { name: 'two accents [0, 2]: picks the one said (0)', hz: [L, H, H], morae: 3, nuclei: [0, 2], want: /✓ 沒有下降/, correct: true },
  { name: '尾高 [3] + が (L H H L)', hz: [L, H, H, L], morae: 3, nuclei: [3], particle: true, want: /✓ 第 3 拍後下降/, correct: true },
  { name: '尾高 [3] + が said as 平板', hz: [L, H, H, H], morae: 3, nuclei: [3], particle: true, want: /沒有明顯下降/, correct: false },
  { name: 'male voice, 中高 [2] late drop', hz: male([L, H, H, L]), morae: 4, nuclei: [2], want: /你在第 3 拍後才降/, correct: false },
  { name: 'gentle downdrift is not a drop (平板)', hz: [L, H, 210, 200, 190], morae: 5, nuclei: [0], want: /✓ 沒有下降/, correct: true },
]
for (const c of cases) {
  const a = analyseSamples(voice(c.hz), RATE, c.morae, c.nuclei, c.particle)
  const text = a.ok ? a.verdict : a.reason
  check(c.name, a.ok && c.want.test(a.verdict) && a.correct === c.correct, text)
}

// Honest failure on noise and on silence.
{
  const pad = new Float32Array(RATE)
  let seed = 7
  const noise = pad.map(() => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 0.6 - 0.3)
  const a = analyseSamples(noise, RATE, 3, [0])
  check('white noise is reported as unreliable', !a.ok, a.ok ? a.verdict : a.reason)
  const b = analyseSamples(pad, RATE, 3, [0])
  check('silence is reported as unreliable', !b.ok, b.ok ? b.verdict : b.reason)
}

function readWav(path: string): { samples: Float32Array; rate: number } {
  const buf = readFileSync(path)
  let off = 12
  let rate = 0
  let channels = 1
  while (off < buf.length) {
    const id = buf.toString('ascii', off, off + 4)
    const size = buf.readUInt32LE(off + 4)
    if (id === 'fmt ') {
      channels = buf.readUInt16LE(off + 10)
      rate = buf.readUInt32LE(off + 12)
    } else if (id === 'data') {
      const n = Math.floor(size / 2 / channels)
      const samples = new Float32Array(n)
      for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(off + 8 + i * 2 * channels) / 32768
      return { samples, rate }
    }
    off += 8 + size + (size % 2)
  }
  throw new Error(`${path}: no data chunk`)
}

// Real recordings: node scripts/check-pitch.ts file.wav:moraCount:nucleus[,nucleus]
for (const arg of process.argv.slice(2)) {
  const [path, morae, nuclei] = arg.split(':')
  const { samples, rate } = readWav(path)
  const a = analyseSamples(samples, rate, Number(morae ?? 3), (nuclei ?? '0').split(',').map(Number))
  console.log(`\n${path}:`, a.ok ? `${a.verdict} | morae st ${a.moraSt.map((m) => m?.toFixed(1)).join(' ')} | ${a.notes.join('; ')}` : a.reason)
}

if (failed) {
  console.log(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nall pitch checks passed')
