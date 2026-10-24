import { useState } from 'react'
import { useNavigate } from 'react-router'
import { getToken, setToken } from '../lib/api'

export function Settings() {
  const navigate = useNavigate()
  const [value, setValue] = useState(getToken)
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        setToken(value.trim())
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
      <button className="rounded-lg bg-gray-900 px-4 py-2 text-white">儲存</button>
    </form>
  )
}
