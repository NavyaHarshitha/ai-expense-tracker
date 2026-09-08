import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'

/*
Any URL that is not a route.

Firebase Hosting rewrites everything to index.html so the SPA can handle deep
links, which means a typo like /dashbaord reaches the router rather than a
server 404. Without a catch-all, React Router rendered its own developer error
page - complete with a stack trace - to anyone who mistyped a URL.

Doubles as the router's errorElement, so a thrown route error lands somewhere
deliberate too.
*/
export function NotFound() {
  const error = useRouteError()
  const status = isRouteErrorResponse(error) ? error.status : 404

  return (
    <div className="grid min-h-dvh place-items-center p-6">
      <div className="w-full max-w-md rounded-card border border-line-strong bg-surface p-8 text-center">
        <p className="tnum m-0 text-5xl font-extrabold text-primary">{status}</p>
        <h1 className="mt-3 mb-2 text-2xl font-bold text-ink">
          {status === 404 ? 'That page does not exist' : 'Something went wrong'}
        </h1>
        <p className="m-0 text-muted">
          {status === 404
            ? 'The link may be mistyped, or the page may have moved.'
            : 'Your data is safe. Try again from the home page.'}
        </p>

        <Link
          to="/"
          className="mt-6 inline-block rounded-full bg-primary px-5 py-2.5 font-bold text-surface transition hover:opacity-90"
        >
          Back to Home
        </Link>
      </div>
    </div>
  )
}
