import type { VoiceState } from '../hooks/useVoiceCapture'

/*
The primary way into the app.

Press and hold to record, release to send - the same gesture as a voice note,
which is the interaction people already know. Click-to-toggle is also supported
for desktop, where holding a mouse button down feels wrong.
*/
export function VoiceButton({
  state,
  error,
  supported,
  onStart,
  onStop,
  onCancel,
  onDismissError,
}: {
  state: VoiceState
  error: string | null
  supported: boolean
  onStart: () => void
  onStop: () => void
  onCancel: () => void
  onDismissError: () => void
}) {
  if (!supported) return null

  const recording = state === 'recording'
  const processing = state === 'processing'
  const requesting = state === 'requesting'

  const label = recording
    ? 'Listening… release to add'
    : processing
      ? 'Reading that back…'
      : requesting
        ? 'Waiting for the microphone…'
        : 'Hold to speak an expense'

  return (
    <div className="grid gap-3">
      <button
        type="button"
        disabled={processing || requesting}
        aria-pressed={recording}
        onPointerDown={(e) => {
          e.preventDefault()
          if (!recording && !processing) onStart()
        }}
        onPointerUp={() => recording && onStop()}
        onPointerLeave={() => recording && onStop()}
        onKeyDown={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && !recording && !processing) {
            e.preventDefault()
            onStart()
          }
        }}
        onKeyUp={(e) => {
          if ((e.key === ' ' || e.key === 'Enter') && recording) {
            e.preventDefault()
            onStop()
          }
        }}
        className={`flex min-h-[64px] w-full items-center justify-center gap-3 rounded-field px-5 py-4 font-extrabold text-surface transition disabled:opacity-70 ${
          recording ? 'bg-danger shadow-button' : 'bg-primary shadow-button hover:bg-primary-dark'
        }`}
      >
        {recording ? (
          <span className="flex items-end gap-1" aria-hidden="true">
            {/* Motion is the only reliable signal that it is actually listening. */}
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="w-1.5 animate-pulse rounded-full bg-surface"
                style={{ height: 18, animationDelay: `${delay}ms`, animationDuration: '700ms' }}
              />
            ))}
          </span>
        ) : (
          <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M17 12a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V22h2v-3.08A7 7 0 0 0 19 12h-2Z" />
          </svg>
        )}
        {label}
      </button>

      {recording && (
        <button type="button" className="text-sm font-bold text-muted hover:underline" onClick={onCancel}>
          Cancel
        </button>
      )}

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-field border border-danger bg-red-50 px-4 py-3">
          <p className="m-0 text-sm text-danger">{error}</p>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Dismiss"
            className="shrink-0 font-bold text-danger"
          >
            &times;
          </button>
        </div>
      )}
    </div>
  )
}
