import { useCallback, useRef, useState } from 'react'

/*
Microphone capture.

Records with MediaRecorder and hands back base64 for the /parse endpoint.
Deliberately not the Web Speech API: it is Chrome-bound, and its accuracy on
Indian accents and rupee amounts is poor. Sending the audio to Gemini handles
"sixteen hundred" and code-mixed Hindi/Telugu-English in one hop.
*/

export type VoiceState = 'idle' | 'requesting' | 'recording' | 'processing' | 'error'

/** Pick a container the browser will actually record. Safari refuses webm. */
function pickMimeType(): string {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) return type
  }
  return ''
}

export function useVoiceCapture(onCaptured: (base64: string, mimeType: string) => Promise<void>) {
  const [state, setState] = useState<VoiceState>('idle')
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const cancelledRef = useRef(false)

  const supported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined'

  function releaseMic() {
    // Without this the browser keeps showing the recording indicator after we stop.
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }

  const start = useCallback(async () => {
    if (!supported) {
      setError('Voice input needs a browser with microphone support.')
      setState('error')
      return
    }

    setError(null)
    setState('requesting')
    cancelledRef.current = false

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (e) {
      // A denied permission is the common case and deserves a real message
      // rather than silence, which reads as the app being broken.
      const name = (e as { name?: string }).name
      setError(
        name === 'NotAllowedError'
          ? 'Microphone access was blocked. Allow it in your browser settings and try again.'
          : 'No microphone found.',
      )
      setState('error')
      return
    }

    streamRef.current = stream
    chunksRef.current = []

    const mimeType = pickMimeType()
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }

    recorder.onstop = async () => {
      releaseMic()

      if (cancelledRef.current) {
        setState('idle')
        return
      }

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType })

      // An empty or near-empty blob means a mis-tap, not speech.
      if (blob.size < 1200) {
        setError("That was too short - hold the button while you speak.")
        setState('error')
        return
      }

      setState('processing')
      try {
        const base64 = await blobToBase64(blob)
        await onCaptured(base64, recorder.mimeType || 'audio/webm')
        setState('idle')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not process that recording.')
        setState('error')
      }
    }

    recorder.start()
    setState('recording')
  }, [onCaptured, supported])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    else {
      releaseMic()
      setState('idle')
    }
  }, [])

  const reset = useCallback(() => {
    setError(null)
    setState('idle')
  }, [])

  return { state, error, supported, start, stop, cancel, reset }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Strip the "data:audio/webm;base64," prefix - the API wants raw base64.
      resolve(result.slice(result.indexOf(',') + 1))
    }
    reader.onerror = () => reject(new Error('Could not read the recording.'))
    reader.readAsDataURL(blob)
  })
}
