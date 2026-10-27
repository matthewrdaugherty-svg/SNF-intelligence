import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router'
import './index.css'
import Shell from './components/Shell'
import { LoadingGate } from './components/ui'
import { getDb } from './lib/db'
import Explore from './pages/Explore'
import Facility from './pages/Facility'
import MapPage from './pages/MapPage'
import Compare from './pages/Compare'
import Flows from './pages/Flows'
import About from './pages/About'
import Hospital, { HospitalSearch } from './pages/Hospitals'

function Gate() {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { getDb().then(() => setReady(true)).catch(e => setError(String(e?.message ?? e))) }, [])
  return ready ? <Shell /> : <div className="min-h-dvh"><LoadingGate ready={false} error={error} /></div>
}

const router = createBrowserRouter([
  { path: '/', element: <Gate />, children: [
    { index: true, element: <Navigate to="/explore" replace /> },
    { path: 'explore', element: <Explore /> },
    { path: 'facility/:ccn', element: <Facility /> },
    { path: 'hospitals', element: <HospitalSearch /> },
    { path: 'hospital/:ccn', element: <Hospital /> },
    { path: 'map', element: <MapPage /> },
    { path: 'compare', element: <Compare /> },
    { path: 'flows', element: <Flows /> },
    { path: 'about', element: <About /> },
    { path: '*', element: <Navigate to="/explore" replace /> },
  ] },
])

createRoot(document.getElementById('root')!).render(<StrictMode><RouterProvider router={router} /></StrictMode>)
