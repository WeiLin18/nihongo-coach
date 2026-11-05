import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { speak, speakingOwner, stopSpeaking, subscribeSpeaking } from '../lib/speak'

export function SpeakButton({ text }: { text: string }) {
  const id = useId()
  const playing = useSyncExternalStore(subscribeSpeaking, () => speakingOwner() === id)
  const [fallback, setFallback] = useState(false)

  // Navigating away (or the card changing) unmounts the button: stop its audio.
  useEffect(
    () => () => {
      if (speakingOwner() === id) stopSpeaking()
    },
    [id],
  )

  function toggle() {
    if (playing) return stopSpeaking()
    void speak(text, id).then((engine) => engine && setFallback(engine === 'browser'))
  }

  return (
    <button
      type="button"
      aria-label={playing ? '停止播放' : '播放發音'}
      aria-pressed={playing}
      title={fallback ? '使用瀏覽器語音，重音可能不準' : '播放發音'}
      onClick={toggle}
      className={`shrink-0 rounded-full px-2 py-1 text-sm ${fallback ? 'bg-amber-100' : 'bg-gray-100'} active:scale-95`}
    >
      {playing ? '⏹' : '🔊'}
    </button>
  )
}
