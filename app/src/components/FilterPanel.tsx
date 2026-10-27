import { useState } from 'react'
import { EMPTY, STATES, countActive, type Filters } from '../lib/filters'

export async function geocode(query: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' } })
  if (!r.ok) return null
  const j = (await r.json()) as { lat: string; lon: string; display_name: string }[]
  if (!j.length) return null
  return { lat: Number(j[0].lat), lng: Number(j[0].lon), label: j[0].display_name.split(',').slice(0, 3).join(',') }
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return <label className="flex items-center gap-2 text-sm py-0.5 cursor-pointer select-none"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="accent-ink" />{children}</label>
}

export default function FilterPanel({ f, onChange, resultCount }: { f: Filters; onChange: (f: Filters) => void; resultCount: number | null }) {
  const [place, setPlace] = useState(f.place)
  const [geoState, setGeoState] = useState<'idle' | 'busy' | 'none' | 'error'>('idle')
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch })
  const toggleStar = (s: number) => set({ stars: f.stars.includes(s) ? f.stars.filter(x => x !== s) : [...f.stars, s].sort() })
  const toggleOwn = (o: Filters['ownership'][number]) => set({ ownership: f.ownership.includes(o) ? f.ownership.filter(x => x !== o) : [...f.ownership, o] })
  const toggleState = (s: string) => set({ states: f.states.includes(s) ? f.states.filter(x => x !== s) : [...f.states, s].sort() })
  const active = countActive(f)

  async function setCenter() {
    if (!place.trim()) return
    setGeoState('busy')
    try {
      const g = await geocode(place.trim())
      if (!g) { setGeoState('none'); return }
      setGeoState('idle'); set({ lat: g.lat, lng: g.lng, miles: f.miles ?? 15, place: g.label })
    } catch { setGeoState('error') }
  }

  return (
    <aside className="w-64 shrink-0 overflow-y-auto border-r border-hairline bg-surface px-4 py-4 text-ink" aria-label="Filters">
      <div className="flex items-baseline justify-between mb-3">
        <div className="font-medium">Filters</div>
        {active > 0 && <button className="press btn btn-quiet text-xs px-2 py-1" onClick={() => { setPlace(''); onChange(EMPTY) }}>Clear {active}</button>}
      </div>
      <label className="block text-xs text-ink-2 mb-1">Name, city, chain or CCN</label>
      <input className="control w-full mb-4" value={f.q} onChange={e => set({ q: e.target.value })} placeholder="e.g. Genesis, Baltimore, 215…" />

      <div className="text-xs text-ink-2 mb-1">Near a place</div>
      <div className="flex gap-1 mb-1">
        <input className="control w-full" value={place} onChange={e => setPlace(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') setCenter() }} placeholder="Address, hospital or city" aria-label="Place for radius" />
        <button className="press btn btn-surface text-sm whitespace-nowrap" onClick={setCenter} disabled={geoState === 'busy'}>{geoState === 'busy' ? '…' : 'Set'}</button>
      </div>
      {geoState === 'none' && <div className="text-xs text-rust mb-1">No match for that place. Try adding the city and state.</div>}
      {geoState === 'error' && <div className="text-xs text-rust mb-1">The place lookup is unreachable right now. You can still drop a pin on the map.</div>}
      {f.lat != null && f.lng != null ? (
        <div className="mb-4 text-sm">
          <div className="text-ink-2 text-xs truncate" title={f.place || `${f.lat}, ${f.lng}`}>{f.place || `${f.lat.toFixed(3)}, ${f.lng.toFixed(3)}`}</div>
          <div className="flex items-center gap-2 mt-1">
            <input type="range" min={2} max={60} step={1} value={f.miles ?? 15} onChange={e => set({ miles: Number(e.target.value) })} className="w-full" aria-label="Radius in miles" />
            <span className="tabular-nums w-14 text-right">{f.miles ?? 15} mi</span>
          </div>
          <button className="press btn btn-quiet text-xs px-2 py-1 mt-1" onClick={() => { setPlace(''); set({ lat: null, lng: null, miles: null, place: '' }) }}>Remove radius</button>
        </div>
      ) : <div className="text-xs text-ink-3 mb-4">Or drop a pin on the Map.</div>}

      <div className="text-xs text-ink-2 mb-1">Overall star rating</div>
      <div className="flex gap-1 mb-4" role="group" aria-label="Overall star rating">
        {[1, 2, 3, 4, 5].map(s => (
          <button key={s} aria-pressed={f.stars.includes(s)} onClick={() => toggleStar(s)}
            className={`press h-7 w-9 rounded-[6px] text-sm font-semibold ${f.stars.includes(s) ? 'here ring-1 ring-ink' : 'opacity-80 hover:opacity-100'}`}
            style={{ background: `var(--color-q${s})`, color: s >= 4 ? '#fff' : 'var(--color-ink)' }}>{s}</button>
        ))}
      </div>

      <div className="text-xs text-ink-2 mb-1">Ownership</div>
      <div className="mb-4">
        <Check checked={f.ownership.includes('for_profit')} onChange={() => toggleOwn('for_profit')}>For profit</Check>
        <Check checked={f.ownership.includes('non_profit')} onChange={() => toggleOwn('non_profit')}>Non profit</Check>
        <Check checked={f.ownership.includes('government')} onChange={() => toggleOwn('government')}>Government</Check>
      </div>

      <div className="text-xs text-ink-2 mb-1">Flags</div>
      <div className="mb-4">
        <Check checked={f.sff} onChange={v => set({ sff: v })}>Special focus facility or candidate</Check>
        <Check checked={f.abuse} onChange={v => set({ abuse: v })}>Abuse icon</Check>
        <Check checked={f.hospital} onChange={v => set({ hospital: v })}>Located in a hospital</Check>
        <Check checked={f.vbp} onChange={v => set({ vbp: v })}>In SNF VBP</Check>
      </div>

      <div className="text-xs text-ink-2 mb-1">Certified beds</div>
      <div className="flex items-center gap-2 mb-4">
        <input className="control w-full" type="number" min={0} placeholder="min" value={f.bedsMin ?? ''} onChange={e => set({ bedsMin: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Minimum beds" />
        <span className="text-ink-3">–</span>
        <input className="control w-full" type="number" min={0} placeholder="max" value={f.bedsMax ?? ''} onChange={e => set({ bedsMax: e.target.value === '' ? null : Number(e.target.value) })} aria-label="Maximum beds" />
      </div>

      <div className="text-xs text-ink-2 mb-1">County</div>
      <input className="control w-full mb-4" value={f.county} onChange={e => set({ county: e.target.value })} placeholder="contains…" aria-label="County" />

      <div className="text-xs text-ink-2 mb-1">State{f.states.length ? ` · ${f.states.length} selected` : ''}</div>
      <div className="grid grid-cols-6 gap-1 mb-4" role="group" aria-label="State">
        {STATES.map(s => (
          <button key={s} aria-pressed={f.states.includes(s)} onClick={() => toggleState(s)}
            className={`press h-6 rounded-[5px] text-[11px] tabular-nums ${f.states.includes(s) ? 'bg-ink text-white' : 'bg-paper text-ink-2 hover:text-ink'}`}>{s}</button>
        ))}
      </div>
      {resultCount != null && <div className="text-xs text-ink-3">{resultCount.toLocaleString()} facilities match</div>}
    </aside>
  )
}
