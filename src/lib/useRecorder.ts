import { useEffect, useRef, useState } from 'react'

// Tap once to start, tap again to stop. iOS Safari records audio/mp4, others webm.
// Leaving the page mid-recording stops the mic and drops the recording.
export function useRecorder(onDone: (audio: Blob) => void) {
  const [recording, setRecording] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const unmounted = useRef(false)

  useEffect(() => {
    unmounted.current = false
    return () => {
      unmounted.current = true
      recorder.current?.stop()
    }
  }, [])

  async function toggle() {
    if (recorder.current) {
      recorder.current.stop()
      return
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (unmounted.current) {
      stream.getTracks().forEach((t) => t.stop())
      return
    }
    const rec = new MediaRecorder(stream)
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => chunks.push(e.data)
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      recorder.current = null
      if (unmounted.current) return
      setRecording(false)
      onDone(new Blob(chunks, { type: rec.mimeType }))
    }
    rec.start()
    recorder.current = rec
    setRecording(true)
  }

  return { recording, toggle }
}
