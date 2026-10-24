import { useState } from 'react'
import { speak } from '../lib/speak'

export function SpeakButton({ text }: { text: string }) {
  const [fallback, setFallback] = useState(false)
  return (
    <button
      type="button"
      aria-label="播放發音"
      title={fallback ? '使用瀏覽器語音，重音可能不準' : '播放發音'}
      onClick={async () => setFallback((await speak(text)) === 'browser')}
      className={`shrink-0 rounded-full px-2 py-1 text-sm ${fallback ? 'bg-amber-100' : 'bg-gray-100'} active:scale-95`}
    >
      🔊
    </button>
  )
}
