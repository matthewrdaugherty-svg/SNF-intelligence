import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'
import { useCompare } from '../lib/compare'
import { useReference } from './ui'

const NAV = [
  { to: '/explore', label: 'Explore' },
  { to: '/cohorts', label: 'Cohorts' },
  { to: '/hospitals', label: 'Hospitals' },
  { to: '/map', label: 'Map' },
  { to: '/compare', label: 'Compare' },
  { to: '/scenarios', label: 'Scenarios' },
  { to: '/flows', label: 'Flows' },
  { to: '/guide', label: 'Guide' },
  { to: '/about', label: 'Methods' },
]

export default function Shell() {
  const compare = useCompare()
  const ref = useReference()
  const [menu, setMenu] = useState(false)
  useEffect(() => { if (!menu) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [menu])
  const loc = useLocation()
  const current = NAV.find(n => loc.pathname.startsWith(n.to) || (n.to === '/hospitals' && loc.pathname.startsWith('/hospital/')) || (n.to === '/explore' && loc.pathname.startsWith('/facility/')))
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center gap-3 md:gap-6 px-4 md:px-5 h-14 bg-surface border-b border-hairline sticky top-0 z-30">
        <NavLink to="/explore" className="flex items-center gap-2.5 text-ink font-semibold tracking-tight whitespace-nowrap shrink-0">
          <span className="inline-block w-4 h-4 rounded-[5px] bg-ink" aria-hidden />SNF Intelligence
        </NavLink>
        <nav className="hidden md:flex items-center gap-1 ml-2" aria-label="Main">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `press h-9 inline-flex items-center px-3 rounded-[6px] text-sm ${isActive ? 'bg-well text-ink font-medium' : 'text-ink-2 hover:text-ink hover:bg-paper'}`}>
              {n.label}{n.to === '/compare' && compare.length > 0 && <span className="ml-1.5 text-ink-3 tabular-nums">{compare.length}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="md:hidden ml-auto flex items-center gap-2">
          <span className="text-sm text-ink-2">{current?.label ?? ''}</span>
          <button className="press btn btn-surface h-10" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-controls="mobile-menu">Menu</button>
        </div>
        <div className="ml-auto text-xs text-ink-3 hidden xl:block shrink-0">{ref ? `CMS data as of ${ref.meta.data_vintage}` : ''}</div>
      </header>
      {menu && (
        <nav id="mobile-menu" className="md:hidden bg-surface border-b border-hairline" aria-label="Main">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} onClick={() => setMenu(false)} className={({ isActive }) => `press flex items-center h-12 px-5 text-base border-t border-hairline/60 ${isActive ? 'text-ink font-medium bg-well' : 'text-ink-2'}`}>
              {n.label}{n.to === '/compare' && compare.length > 0 && <span className="ml-2 text-ink-3 tabular-nums">{compare.length}</span>}
            </NavLink>
          ))}
        </nav>
      )}
      <main className="flex-1 min-h-0"><Outlet /></main>
    </div>
  )
}
