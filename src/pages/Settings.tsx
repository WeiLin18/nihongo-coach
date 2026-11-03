import { useState } from 'react'
import { useNavigate } from 'react-router'
import { getNewPerDay, getToken, setNewPerDay, setToken } from '../lib/api'

export function Settings() {
  const navigate = useNavigate()
  const [value, setValue] = useState(getToken)
  const [newPerDay, setNewPerDayValue] = useState(String(getNewPerDay()))
  return (
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
  )
}
