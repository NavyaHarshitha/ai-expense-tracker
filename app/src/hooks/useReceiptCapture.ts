import { useCallback, useState } from 'react'

/*
Photograph a bill and get it down to a sensible size before upload.

A phone camera produces 8-12 megapixels, around 4 MB - and base64 inflates that
by a third. None of it is needed: a bill only has to be legible, so 1600px on
the long edge at JPEG quality 0.8 lands around 300 KB and reads just as well.
Doing this in the browser also means a slow connection is not asked to carry
4 MB before anything happens.
*/

const MAX_EDGE = 1600
const QUALITY = 0.8

export type ReceiptState = 'idle' | 'reading' | 'processing' | 'error'

export function useReceiptCapture(onCaptured: (base64: string, mimeType: string) => Promise<void>) {
  const [state, setState] = useState<ReceiptState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const capture = useCallback(
    async (file: File) => {
      setError(null)

      if (!file.type.startsWith('image/')) {
        setError('That file is not an image.')
        setState('error')
        return
      }

      setState('reading')

      try {
        const { base64, dataUrl } = await downscale(file)
        setPreview(dataUrl)
        setState('processing')
        await onCaptured(base64, 'image/jpeg')
        setState('idle')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not read that photo.')
        setState('error')
      }
    },
    [onCaptured],
  )

  const reset = useCallback(() => {
    setError(null)
    setPreview(null)
    setState('idle')
  }, [])

  return { state, error, preview, capture, reset }
}

async function downscale(file: File): Promise<{ base64: string; dataUrl: string }> {
  const bitmap = await createImageBitmap(file)

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process that photo.')

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  // JPEG rather than PNG: a photograph compresses an order of magnitude better,
  // and a receipt has no transparency to preserve.
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)

  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), dataUrl }
}
