import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

import App from './App.tsx'
import { Home } from './pages/Home.tsx'
import './index.css'

/*
Home loads eagerly - it is the landing route. The other two are lazy.

Dashboard alone pulls in Recharts, which was the bulk of a 1.29 MB initial
bundle; charts should not be downloaded by someone who only wants to log a
lunch. Add Expense is split for the same reason.
*/
const AddExpense = lazy(() =>
  import('./pages/AddExpense.tsx').then((m) => ({ default: m.AddExpense })),
)
const Dashboard = lazy(() =>
  import('./pages/Dashboard.tsx').then((m) => ({ default: m.Dashboard })),
)

function Loading() {
  return <div className="py-16 text-center text-muted">Loading…</div>
}

/*
Three pages, mirroring the original vanilla app: Home, Add Expense, Dashboard.
App is the shell - it owns auth and the Firestore subscriptions, and hands them
down through the router outlet so each page reads the same live data.
*/
const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Home /> },
      {
        path: 'add',
        element: (
          <Suspense fallback={<Loading />}>
            <AddExpense />
          </Suspense>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <Suspense fallback={<Loading />}>
            <Dashboard />
          </Suspense>
        ),
      },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
