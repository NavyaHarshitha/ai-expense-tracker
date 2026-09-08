import { Component, type ErrorInfo, type ReactNode } from 'react'

/*
The last line of defence.

React unmounts the entire tree when a render throws. Without a boundary the
result is a blank white page with no explanation, no way back, and - because
this app's state lives in Firestore - no indication that the data is still safe.
That is the worst possible failure mode for something holding your money, and
the most likely moment for it is a live demo.

This catches the throw, keeps the page rendered, says plainly that nothing was
lost, and offers the two things that actually recover: reload, or go Home. The
message is shown only in development, because a stack trace tells a user
nothing and can leak structure to anyone else looking at the screen.
*/
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // One place to forward to Crashlytics or Cloud Logging later.
    console.error('Unhandled render error:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <div className="w-full max-w-md rounded-card border border-line-strong bg-surface p-8 text-center">
          <p className="m-0 text-4xl" aria-hidden="true">
            🛟
          </p>
          <h1 className="mt-4 mb-2 text-2xl font-bold text-ink">Something broke on this screen</h1>
          <p className="m-0 text-muted">
            Your data is safe &mdash; nothing is stored in this page, it all lives in your
            account. Reloading almost always fixes it.
          </p>

          {import.meta.env.DEV && (
            <pre className="mt-4 overflow-x-auto rounded-field bg-canvas p-3 text-left text-xs text-danger">
              {error.message}
            </pre>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-primary px-5 py-2.5 font-bold text-surface transition hover:opacity-90"
            >
              Reload
            </button>
            <a
              href="/"
              className="rounded-full border border-line-strong px-5 py-2.5 font-bold text-ink transition hover:border-ink"
            >
              Go home
            </a>
          </div>
        </div>
      </div>
    )
  }
}
