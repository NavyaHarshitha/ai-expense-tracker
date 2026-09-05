import { useRef } from 'react'

import type { ReceiptState } from '../hooks/useReceiptCapture'

/*
Snap a bill. `capture="environment"` opens the rear camera directly on a phone
rather than a file browser, which is the difference between two taps and five.
On desktop the same input falls back to a file picker.
*/
export function ReceiptButton({
  state,
  error,
  preview,
  onFile,
  onDismiss,
}: {
  state: ReceiptState
  error: string | null
  preview: string | null
  onFile: (file: File) => void
  onDismiss: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  const busy = state === 'reading' || state === 'processing'

  return (
    <div className="grid gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) onFile(file)
          // Reset, so photographing the same bill twice still fires onChange.
          e.target.value = ''
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="flex min-h-[52px] w-full items-center justify-center gap-3 rounded-field border border-primary-edge bg-surface px-5 py-3 font-extrabold text-primary-dark transition hover:bg-primary-soft disabled:opacity-70"
      >
        <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 3 7.17 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.17L15 3H9Z" />
          <circle cx="12" cy="12.5" r="3.5" fill="#fff" />
        </svg>
        {state === 'reading'
          ? 'Preparing the photo…'
          : state === 'processing'
            ? 'Reading the bill…'
            : 'Photograph a receipt'}
      </button>

      {preview && busy && (
        <img
          src={preview}
          alt="The receipt being read"
          className="max-h-40 w-auto self-start rounded-field border border-line object-contain"
        />
      )}

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-field border border-danger bg-red-50 px-4 py-3">
          <p className="m-0 text-sm text-danger">{error}</p>
          <button type="button" onClick={onDismiss} aria-label="Dismiss" className="shrink-0 font-bold text-danger">
            &times;
          </button>
        </div>
      )}
    </div>
  )
}
