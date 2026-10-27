import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EMPTY, STATES, countActive, type Filters } from '../lib/filters'
import { starFg, tierWord } from './ui'

export async function geocode(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) return null
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[]
  if (!j.length) return null
  return { lat: Number(j[0].lat), lng: Number(j[0].lon), label: j[0].display_name.split(',').slice(0, 3).join(',') }
}

/** Text input that keeps its own state while typing and writes to the filters after a short pause,
 *  so fast typing never loses keystrokes to the URL round-trip. */
function Debounced({ value, onCommit, delay = 250, ...rest }: { value: string; onCommit: (v: string) => void; delay?: number } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [local, setLocal] = useState(value)
  const last = useRef(value)
  // the URL stores a trimmed copy; a value that only differs by surrounding spaces must not reset what the person is typing
  useEffect(() => { if (value !== last.current && value !== last.current.trim()) { last.current = value; setLocal(value) } }, [value])
  useEffect(() => {
    if (local === last.current) return
    const t = setTimeout(() => { last.current = local; onCommit(local) }, delay)
    return () => clearTimeout(t)
  }, [local, delay, onCommit])
  return <input {...rest} value={local} onChange={e => setLocal(e.target.value)} />
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return <label className="flex items-center gap-2 text-sm py-0.5 cursor-pointer select-none"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-ink" />{children}</label>
}

interface Props { f: Filters; onPatch: (patch: Partial<Filters>) => void; onClear: () => void; resultCount: number | null; open: boolean; onClose: () => void }

export default function FilterPanel({ f, onPatch, onClear, resultCount, open, onClose }: Props) {
  const [place, setPlace] = useState(f.place)
  const [geoState, setGeoState] = useState<'idle' | 'busy' | 'none' | 'error'>('idle')
  useEffect(() => { setPlace(f.place) }, [f.place])
  const toggleIn = (key: 'stars' | 'ownership' | 'states', v: never) => {
    const cur = f[key] as unknown[]
    onPatch({ [key]: cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v].sort() } as Partial<Filters>)
  }
  const active = countActive(f)
  const toNum = (s: string) => { const n = Number(s); return s.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.floor(n) }

  async function setCenter() {
    if (!place.trim()) return
    setGeoState('busy')
    try {
      const g = await geocode(place.trim())
      if (!g) { setGeoState('none'); return }
      setGeoState('idle'); onPatch({ lat: g.lat, lng: g.lng, miles: f.miles ?? 15, place: g.label })
    } catch { setGeoState('error') }
  }

  return (
    <aside className={`${open ? 'flex' : 'hidden'} md:flex flex-col w-72 md:w-64 shrink-0 overflow-y-auto border-r border-hairline bg-surface px-4 py-4 text-ink absolute md:static inset-y-0 left-0 z-20 md:z-auto shadow-[var(--shadow-float)] md:shadow-none`} aria-label="Filters">
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-medium">Filters</div>
        <div className="flex items-center gap-1">
          {active > 0 && <button className="press btn btn-quiet text-xs px-2 py-1" onClick={() => { setPlace(''); onClear() }}>Clear {active}</button>}
          <button className="press btn btn-quiet text-xs px-2 py-1 md:hidden" onClick={onClose}>Done</button>
        </div>
      </div>
      <label className="block text-xs text-ink-2 mb-1" htmlFor="flt-q">Name, city, chain or CCN</label>
      <Debounced id="flt-q" className="control w-full mb-4" value={f.q} onCommit={v => onPatch({ q: v })} placeholder="e.g. Genesis, Baltimore, 215…" />

      <div className="text-xs text-ink-2 mb-1">Near a place</div>
      <div className="flex gap-1 mb-1">
        <input className="control w-full min-w-0" value={place} onChange={e => setPlace(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setCenter() }} placeholder="Address, hospital or city" aria-label="Place for radius" />
        <button className="press btn btn-surface text-sm whitespace-nowrap" onClick={setCenter} disabled={geoState === 'busy'}>{geoState === 'busy' ? '…' : 'Set'}</button>
      </div>
      {geoState === 'none' && <div className="text-xs text-ink-2 mb-1" role="status">No match for that place. Try adding the city and state.</div>}
      {geoState === 'error' && <div className="text-xs text-ink-2 mb-1" role="status">The place lookup is unreachable right now. You can still drop a pin on the Map.</div>}
      {f.lat != null && f.lng != null ? (
        <div className="mb-4 text-sm">
          <div className="text-ink-2 text-xs truncate" title={f.place || `${f.lat}, ${f.lng}`}>{f.place || `${f.lat.toFixed(3)}, ${f.lng.toFixed(3)}`}</div>
          <div className="flex items-center gap-2 mt-1">
            <input type="range" min={2} max={60} step={1} value={f.miles ?? 15} onChange={e => onPatch({ miles: Number(e.target.value) })} className="w-full" aria-label="Radius in miles" />
            <span className="tabular-nums w-14 text-right">{f.miles ?? 15} mi</span>
          </div>
          <button className="press btn btn-quiet text-xs px-2 py-1 mt-1" onClick={() => { setPlace(''); onPatch({ lat: null, lng: null, miles: null, place: '' }) }}>Remove radius</button>
        </div>
      ) : <div className="text-xs text-ink-3 mb-4">Sends the place you type to OpenStreetMap's lookup service. Or drop a pin on the Map.</div>}

      <div className="text-xs text-ink-2 mb-1">Overall star rating</div>
      <div className="flex gap-1 mb-4" role="group" aria-label="Overall star rating">
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} aria-pressed={f.stars.includes(s)} onClick={() => toggleIn('stars', s as never)}
            className={`press h-7 w-9 rounded-[6px] text-sm font-semibold ${f.stars.includes(s) ? 'here ring-1 ring-ink' : 'opacity-80 hover:opacity-100'}`}
            style={{ background: `var(--color-q${s})`, color: starFg(s) }} title={`${s} stars (${tierWord(s)})`}>{s}</button>
        ))}
      </div>

      <div className="text-xs text-ink-2 mb-1">Ownership</div>
      <div className="mb-4">
        <Check checked={f.ownership.includes('for_profit')} onChange={() => toggleIn('ownership', 'for_profit' as never)}>For profit</Check>
        <Check checked={f.ownership.includes('non_profit')} onChange={() => toggleIn('ownership', 'non_profit' as never)}>Non profit</Check>
        <Check checked={f.ownership.includes('government')} onChange={() => toggleIn('ownership', 'government' as never)}>Government</Check>
      </div>

      <div className="text-xs text-ink-2 mb-1">Flags</div>
      <div className="mb-4">
        <Check checked={f.sff} onChange={v => onPatch({ sff: v })}>Special focus facility or candidate</Check>
        <Check checked={f.abuse} onChange={v => onPatch({ abuse: v })}>Abuse icon</Check>
        <Check checked={f.hospital} onChange={v => onPatch({ hospital: v })}>Located in a hospital</Check>
        <Check checked={f.vbp} onChange={v => onPatch({ vbp: v })}>In SNF VBP</Check>
      </div>

      <div className="text-xs text-ink-2 mb-1">Certified beds</div>
      <div className="flex items-center gap-2 mb-4">
        <Debounced className="control w-full min-w-0" type="number" min={0} placeholder="min" value={f.bedsMin == null ? '' : String(f.bedsMin)} onCommit={v => onPatch({ bedsMin: toNum(v) })} aria-label="Minimum beds" />
        <span className="text-ink-3">–</span>
        <Debounced className="control w-full min-w-0" type="number" min={0} placeholder="max" value={f.bedsMax == null ? '' : String(f.bedsMax)} onCommit={v => onPatch({ bedsMax: toNum(v) })} aria-label="Maximum beds" />
      </div>

      <div className="text-xs text-ink-2 mb-1">County or parish</div>
      <Debounced className="control w-full mb-4" value={f.county} onCommit={v => onPatch({ county: v })} placeholder="contains…" aria-label="County" />

      <div className="text-xs text-ink-2 mb-1">State{f.states.length ? ` · ${f.states.length} selected` : ''}</div>
      <div className="grid grid-cols-6 gap-1 mb-4" role="group" aria-label="State">
        {STATES.map(s => (
          <button key={s} aria-pressed={f.states.includes(s)} onClick={() => toggleIn('states', s as never)}
            className={`press h-6 rounded-[5px] text-[11px] tabular-nums ${f.states.includes(s) ? 'bg-accent text-white font-semibold' : 'bg-paper text-ink-2 hover:text-ink'}`}>{s}</button>
        ))}
      </div>
      {resultCount != null && <div className="text-xs text-ink-3">{resultCount.toLocaleString()} facilities match</div>}
    </aside>
  )
}
export { EMPTY }
