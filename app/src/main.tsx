import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

import App from './App.tsx'
import { AddExpense } from './pages/AddExpense.tsx'
import { Dashboard } from './pages/Dashboard.tsx'
import { Home } from './pages/Home.tsx'
import './index.css'

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
      { path: 'add', element: <AddExpense /> },
      { path: 'dashboard', element: <Dashboard /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
