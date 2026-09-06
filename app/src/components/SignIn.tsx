import { cardPadded, primaryButton } from '../lib/ui'

export function SignIn({ onSignIn, error }: { onSignIn: () => void; error: string | null }) {
  return (
    <div
      className="grid min-h-dvh place-items-center bg-canvas p-6"
    >
      <div className={`${cardPadded} w-[min(420px,100%)] text-center`}>
        <h1 className="mb-4 text-3xl font-bold tracking-tight text-ink">AI Expense Tracker</h1>
        <p className="text-muted">
          Know what&rsquo;s safe to spend today &mdash; after your EMIs, savings and plans.
        </p>

        <button type="button" className={`${primaryButton} mt-6 w-full`} onClick={onSignIn}>
          Continue with Google
        </button>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
      </div>
    </div>
  )
}
