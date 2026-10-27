import { NavLink, Outlet } from 'react-router'
import { useCompare } from '../lib/compare'
import { useReference } from './ui'

const NAV = [
  { to: '/explore', label: 'Explore' },
  { to: '/hospitals', label: 'Hospitals' },
  { to: '/map', label: 'Map' },
  { to: '/compare', label: 'Compare' },
  { to: '/flows', label: 'Discharge flows' },
  { to: '/about', label: 'Methodology & trust' },
]

export default function Shell() {
  const compare = useCompare()
  const ref = useReference()
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="flex items-center gap-3 md:gap-6 px-4 md:px-5 h-13 bg-surface border-b border-hairline sticky top-0 z-30">
        <NavLink to="/explore" className="flex items-center gap-2.5 text-ink font-semibold tracking-tight whitespace-nowrap shrink-0">
          <span className="inline-block w-4 h-4 rounded-[5px] bg-ink" aria-hidden />SNF Intelligence
        </NavLink>
        <nav className="flex items-center gap-1 md:ml-2 overflow-x-auto whitespace-nowrap min-w-0" aria-label="Main">
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `press px-3 py-1.5 rounded-[6px] text-sm ${isActive ? 'bg-well text-ink font-medium' : 'text-ink-2 hover:text-ink hover:bg-paper'}`}>
              {n.label}{n.to === '/compare' && compare.length > 0 && <span className="ml-1.5 text-ink-3 tabular-nums">{compare.length}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto text-xs text-ink-3 hidden md:block shrink-0">{ref ? `CMS data as of ${ref.meta.data_vintage}` : ''}</div>
      </header>
      <main className="flex-1 min-h-0"><Outlet /></main>
    </div>
  )
}
