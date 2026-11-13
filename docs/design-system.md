# Design system

The full design system (tokens, components with light/dark previews and states, usage notes, and a list of known inconsistencies) is the Claude Design artifact [Nihongo Coach Design System](https://claude.ai/artifact/KNdGjHDVUb4hpvBsj1P22D). It is private to the owner.

This page is the short version kept in the repo. It describes the UI on `main` at v0.6.0. The code is the source of truth: if they disagree, update this page and the artifact.

## Rules

- Style with Tailwind 4 utilities inline; there is no component library.
- Dark mode follows the `.dark` class on `<html>`, and `src/index.css` remaps the shades themselves, so `text-gray-500` adapts without a `dark:` variant. Using a shade that isn't remapped? Add it to the remap, or give it a `dark:` variant.
- Use `bg-page` / `bg-raised`, never `bg-white`.
- One primary action per screen (`bg-gray-900 text-white`); `bg-rose-500` starts or records something.
- Disabled is `disabled:opacity-40` only. Pressed is `active:scale-95` on round buttons. No hover styles.
- UI text is Traditional Chinese; progress labels end in 中… (思考中…); metadata is joined with ・.
- Icons are emoji and Unicode glyphs (🔊 ⏹ 🎤 ■ 🎙 ☰ ✓ →), not an icon set.

## Colour

| Role | Class | Light | Dark |
| --- | --- | --- | --- |
| Page | `bg-page` | `#ffffff` | `#0f1218` |
| Raised surface (menus, selected segment) | `bg-raised` | `#ffffff` | `#353d4c` |
| Text (set on `body`) | — | `#111827` | `#e5e7eb` |
| Secondary text | `text-gray-500` | `#6a7282` | `#a3abb8` |
| Stronger secondary | `text-gray-600` | `#4a5565` | `#c5cbd4` |
| Meta / tertiary | `text-gray-400` | `#99a1af` | `#8a93a3` |
| Neutral fill (tracks, chips, SpeakButton) | `bg-gray-100` | `#f3f4f6` | `#1f242e` |
| Primary button | `bg-gray-900` | `#101828` | `#3b4556` |
| Accent fill (mic, badges, user bubble) | `bg-rose-500` | `#ff2056` | same |
| Accent text / pitch line | `text-rose-600` (`dark:text-rose-400` on SVG) | `#ec003f` | same (`#ff637e` with `dark:`) |
| Accent tint (category tag, misread row) | `bg-rose-50` + `text-rose-700` | `#fff1f2` / `#c70036` | `#3a1621` / `#fda4af` |
| Recording | `bg-red-600 animate-pulse` | `#e7000b` | same |
| Error box | `bg-red-50` + `text-red-700` | `#fef2f2` / `#c10007` | `#3b1619` / `#fca5a5` |
| Hint / warning | `bg-amber-50`, `text-amber-700` | `#fffbeb` / `#bb4d00` | `#33270f` / `#fcd34d` |
| Success | `text-emerald-700`, `bg-emerald-50` | `#007a55` / `#ecfdf5` | `#6ee7b7` / `#0e3027` |
| Review ratings 重來 / 困難 / 良好 / 簡單 | `red` / `amber` / `green` / `sky`, 50 + 700 | | remapped |
| Learner's pitch contour | `--color-blue-600` | `#155dfc` | `#60a5fa` |

Light values are Tailwind 4 defaults (oklch in the source; hex shown here). Dark values are from `src/index.css`.

## Type

- Font stack, Japanese and Chinese: `system-ui, -apple-system, "Hiragino Sans", "PingFang TC", sans-serif`.
- Card headword `text-2xl font-bold leading-snug`; review prompt `text-3xl font-bold`; passage title `text-xl font-bold`.
- Japanese to read: `text-lg leading-loose`, `leading-[2.4]` once furigana shows.
- Furigana: `<rt class="text-[0.6em] text-gray-500">`.
- UI default `text-sm`; section headings `text-sm font-semibold text-gray-500`; tags and meta `text-xs`; inputs `text-base`.

## Space, radius, shadow

- Layout: one column, `max-w-xl px-4 pb-24`; sections `space-y-4`, inside `space-y-3` / `space-y-2`.
- Controls: `h-12` full-width actions and the mic, `h-11` accent and outline buttons.
- Radius:
  - `rounded` (4px): tags and boxes
  - `rounded-md`: segments
  - `rounded-lg`: buttons and inputs
  - `rounded-xl`: card panels
  - `rounded-2xl`: chat bubbles
  - `rounded-full`: round buttons, chips, pills
- Shadow: `shadow` on the selected segment and the 48px mic; `shadow-lg` on the ☰ menu and the 64px mic.

## Pitch and reading

- PitchAccent: 28px per mora, high/low dots at y=10/30, rose line, a hollow trailing が (`text-gray-300`), label `[n] 平板|頭高|中高|尾高`.
- Recording chart: the learner is blue, dictionary bars are gray, the expected fall is a dashed rose line (↓應降).
- 讀音 reveal: read without furigana first, then reveal; tricky words get a dotted underline, misread ones turn `bg-rose-100`.

## Known inconsistencies

The artifact lists 14, each with a suggested fix. The main ones:

- Bare `border` is near-black in light mode but `gray-200` in dark.
- `rose-600` and `red-600` aren't remapped for dark, so text in them is under 4.5:1 there.
- `gray-400` text is 2.6:1 on white.
- Primary buttons come in three colours and four heights.
- The segmented control is copied in four pages.
