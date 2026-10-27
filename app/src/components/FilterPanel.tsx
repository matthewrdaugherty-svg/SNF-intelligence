import { useEffect, useRef, useState, type ReactNode } from 'react'
import { EMPTY, STATES, countActive, type Filters } from '../lib/filters'
import { starFg, tierWord } from './ui'
import HospitalPicker from './HospitalPicker'

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
  return <label className="flex items-center gap-2 text-sm min-h-8 md:min-h-7 cursor-pointer select-none"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-accent w-4 h-4" />{children}</label>
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
    <aside className={`${open ? 'flex' : 'hidden'} md:flex flex-col w-80 md:w-72 shrink-0 overflow-y-auto bg-paper px-3 py-3 text-ink absolute md:static inset-y-0 left-0 z-20 md:z-auto shadow-[var(--shadow-float)] md:shadow-none`} aria-label="Filters">
      <div className="flex items-center justify-between px-1 mb-2 h-8">
        <div className="font-semibold">Filters</div>
        <div className="flex items-center gap-1">
          {active > 0 && <button className="press btn btn-quiet btn-sm" onClick={() => { setPlace(''); onClear() }}>Clear {active}</button>}
          <button className="press btn btn-primary btn-sm md:hidden" onClick={onClose}>Done</button>
        </div>
      </div>

      <section className="fgroup" aria-labelledby="fg-find">
        <div id="fg-find" className="fgroup-title">Find</div>
        <label className="flabel block" htmlFor="flt-q">Name, city, chain or CCN</label>
        <Debounced id="flt-q" className="control w-full" value={f.q} onCommit={v => onPatch({ q: v })} placeholder="e.g. Genesis, Baltimore, 215…" />

        <div className="flabel mt-3">Serving a hospital or system</div>
        <HospitalPicker selected={f.hospitals} onChange={h => onPatch({ hospitals: h })} />
        <div className="fhelp">Nursing homes in the ZIP codes the hospital's Medicare patients come from (modeled).</div>

        <div className="flabel mt-3">Near a place</div>
        <div className="flex gap-1">
          <input className="control w-full min-w-0" value={place} onChange={e => setPlace(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setCenter() }} placeholder="Address, hospital or city" aria-label="Place for radius" />
          <button className="press btn btn-surface" onClick={setCenter} disabled={geoState === 'busy'}>{geoState === 'busy' ? '…' : 'Set'}</button>
        </div>
        {geoState === 'none' && <div className="fhelp" role="status">No match for that place. Try adding the city and state.</div>}
        {geoState === 'error' && <div className="fhelp" role="status">The place lookup is unreachable right now. You can still drop a pin on the Map.</div>}
        {f.lat != null && f.lng != null ? (
          <div className="mt-2 text-sm">
            <div className="text-ink-2 text-xs truncate" title={f.place || `${f.lat}, ${f.lng}`}>{f.place || `${f.lat.toFixed(3)}, ${f.lng.toFixed(3)}`}</div>
            <div className="flex items-center gap-2 mt-1">
              <input type="range" min={2} max={60} step={1} value={f.miles ?? 15} onChange={e => onPatch({ miles: Number(e.target.value) })} className="w-full" aria-label="Radius in miles" />
              <span className="tabular-nums w-14 text-right">{f.miles ?? 15} mi</span>
            </div>
            <button className="press btn btn-quiet btn-sm mt-1" onClick={() => { setPlace(''); onPatch({ lat: null, lng: null, miles: null, place: '' }) }}>Remove radius</button>
          </div>
        ) : <div className="fhelp">Looked up with OpenStreetMap. Or drop a pin on the Map.</div>}
      </section>

      <section className="fgroup" aria-labelledby="fg-quality">
        <div id="fg-quality" className="fgroup-title">Quality</div>
        <div className="flabel">Overall star rating</div>
        <div className="flex gap-1" role="group" aria-label="Overall star rating">
          {[1, 2, 3, 4, 5].map(s => {
            const on = f.stars.includes(s), any = f.stars.length > 0
            return <button key={s} aria-pressed={on} onClick={() => toggleIn('stars', s as never)}
              className={`press h-9 md:h-8 flex-1 rounded-[6px] text-sm font-semibold ${on ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}`}
              style={any && !on ? { background: 'var(--color-well)', color: 'var(--color-ink-2)' } : { background: `var(--color-q${s})`, color: starFg(s) }} title={`${s} stars (${tierWord(s)})`}>{s}</button>
          })}
        </div>
        <div className="flabel mt-3">Warnings</div>
        <Check checked={f.sff} onChange={v => onPatch({ sff: v })}>Special focus facility or candidate</Check>
        <Check checked={f.abuse} onChange={v => onPatch({ abuse: v })}>Abuse icon</Check>
      </section>

      <section className="fgroup" aria-labelledby="fg-facility">
        <div id="fg-facility" className="fgroup-title">Facility</div>
        <div className="flabel">Ownership</div>
        <Check checked={f.ownership.includes('for_profit')} onChange={() => toggleIn('ownership', 'for_profit' as never)}>For profit</Check>
        <Check checked={f.ownership.includes('non_profit')} onChange={() => toggleIn('ownership', 'non_profit' as never)}>Non profit</Check>
        <Check checked={f.ownership.includes('government')} onChange={() => toggleIn('ownership', 'government' as never)}>Government</Check>
        <div className="flabel mt-3">Setting and programs</div>
        <Check checked={f.hospital} onChange={v => onPatch({ hospital: v })}>Located in a hospital</Check>
        <Check checked={f.vbp} onChange={v => onPatch({ vbp: v })}>In SNF Value-Based Purchasing</Check>
        <div className="flabel mt-3">Certified beds</div>
        <div className="flex items-center gap-2">
          <Debounced className="control w-full min-w-0" type="number" min={0} placeholder="min" value={f.bedsMin == null ? '' : String(f.bedsMin)} onCommit={v => onPatch({ bedsMin: toNum(v) })} aria-label="Minimum beds" />
          <span className="text-ink-3">–</span>
          <Debounced className="control w-full min-w-0" type="number" min={0} placeholder="max" value={f.bedsMax == null ? '' : String(f.bedsMax)} onCommit={v => onPatch({ bedsMax: toNum(v) })} aria-label="Maximum beds" />
        </div>
      </section>

      <section className="fgroup" aria-labelledby="fg-where">
        <div id="fg-where" className="fgroup-title">Location</div>
        <div className="flabel">County or parish</div>
        <Debounced className="control w-full" value={f.county} onCommit={v => onPatch({ county: v })} placeholder="contains…" aria-label="County" />
        <div className="flabel mt-3">State{f.states.length ? ` · ${f.states.length} selected` : ''}</div>
        <div className="grid grid-cols-6 gap-1" role="group" aria-label="State">
          {STATES.map(s => (
            <button key={s} aria-pressed={f.states.includes(s)} onClick={() => toggleIn('states', s as never)}
              className={`press h-9 md:h-7 rounded-[5px] text-[11px] tabular-nums ${f.states.includes(s) ? 'bg-accent text-white font-semibold' : 'bg-paper text-ink-2 hover:text-ink'}`}>{s}</button>
          ))}
        </div>
      </section>
      {resultCount != null && <div className="caption px-1 mt-3">{resultCount.toLocaleString()} facilities match</div>}
    </aside>
  )
}
export { EMPTY }
