import { useRef, useState } from 'react'

// Tap once to start, tap again to stop. iOS Safari records audio/mp4, others webm.
// Pass audio constraints to turn off processing (e.g. noise suppression) that can bend pitch.
export function useRecorder(onDone: (audio: Blob) => void, audio: MediaTrackConstraints | true = true) {
  const [recording, setRecording] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)

  async function toggle() {
    if (recorder.current) {
      recorder.current.stop()
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio })
    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      recorder.current = null
      setRecording(false)
      onDone(new Blob(chunks, { type: rec.mimeType }))
    }
    rec.start()
    recorder.current = rec
    setRecording(true)
  }

  return { recording, toggle }
}
