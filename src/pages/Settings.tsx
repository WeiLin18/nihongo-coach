import { useState } from 'react'
import { useNavigate } from 'react-router'
import { getNewPerDay, getToken, setNewPerDay, setToken } from '../lib/api'
import { getTheme, setTheme, type Theme } from '../lib/theme'

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: '跟隨系統' },
  { value: 'light', label: '淺色' },
  { value: 'dark', label: '深色' },
]

// Applies at once and is stored on this device only, like the token.
function ThemePicker() {
  const [theme, setThemeValue] = useState(getTheme)
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium">外觀</h2>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-gray-100 p-1">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            aria-pressed={theme === t.value}
            onClick={() => {
              setTheme(t.value)
              setThemeValue(t.value)
            }}
            className={`rounded-md py-2 text-sm ${theme === t.value ? 'bg-raised font-semibold shadow' : 'text-gray-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export function Settings() {
  const navigate = useNavigate()
  const [value, setValue] = useState(getToken)
  const [newPerDay, setNewPerDayValue] = useState(String(getNewPerDay()))
  return (
    <div className="space-y-8">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          setToken(value.trim())
          const n = Math.round(Number(newPerDay))
          if (Number.isFinite(n) && n >= 0) setNewPerDay(n)
          navigate('/')
        }}
      >
        <label className="block text-sm font-medium">APP_TOKEN</label>
        <p className="text-xs text-gray-500">貼上部署時設定的 token，只會存在這台裝置。</p>
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full rounded-lg border p-2"
          autoComplete="off"
        />
        <label className="block text-sm font-medium">每天新卡片數</label>
        <p className="text-xs text-gray-500">複習時每天最多加入幾張還沒練過的卡片。</p>
        <input
          type="number"
          min={0}
          inputMode="numeric"
          value={newPerDay}
          onChange={(e) => setNewPerDayValue(e.target.value)}
          className="w-24 rounded-lg border p-2"
        />
        <button className="rounded-lg bg-gray-900 px-4 py-2 text-white">儲存</button>
      </form>
      <ThemePicker />
    </div>
  )
}
