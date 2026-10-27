import { useEffect, useRef, useState } from 'react'
import { hospitalsByCcn, searchHospitals, type HospitalLite } from '../lib/hospitals'
import { titleCase } from '../lib/format'

/** Search-and-pick hospitals (several at once, e.g. the hospitals of one system). */
export default function HospitalPicker({ selected, onChange }: { selected: string[]; onChange: (ccns: string[]) => void }) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<HospitalLite[]>([])
  const [chosen, setChosen] = useState<HospitalLite[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { let live = true; hospitalsByCcn(selected).then(r => { if (live) setChosen(selected.map(c => r.find(x => x.hospital_ccn === c)).filter(Boolean) as HospitalLite[]) }); return () => { live = false } }, [selected])
  useEffect(() => {
    if (!text.trim()) { setResults([]); return }
    let live = true
    const t = setTimeout(() => searchHospitals(text).then(r => { if (live) { setResults(r); setOpen(true) } }), 200)
    return () => { live = false; clearTimeout(t) }
  }, [text])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const add = (h: HospitalLite) => { if (!selected.includes(h.hospital_ccn)) onChange([...selected, h.hospital_ccn]); setText(''); setResults([]); setOpen(false) }
  return (
    <div ref={box} className="relative">
      <input className="control w-full" value={text} onChange={e => setText(e.target.value)} onFocus={() => results.length && setOpen(true)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && results[0]) add(results[0]) }}
        placeholder="Hospital name, city or CCN" aria-label="Find a hospital" role="combobox" aria-expanded={open} aria-controls="hosp-results" />
      {open && results.length > 0 && (
        <ul id="hosp-results" role="listbox" className="absolute left-0 right-0 top-full mt-1 max-h-72 overflow-auto bg-surface rounded-[8px] z-30 py-1" style={{ boxShadow: 'var(--shadow-float)' }}>
          {results.map(h => (
            <li key={h.hospital_ccn} role="option" aria-selected={selected.includes(h.hospital_ccn)}>
              <button className="press w-full text-left px-3 py-1.5 hover:bg-paper" onClick={() => add(h)} disabled={h.cases_visible == null}>
                <div className="text-sm text-ink truncate">{titleCase(h.hospital_name)}</div>
                <div className="text-[11px] text-ink-3">{titleCase(h.city)}, {h.state} · {h.hospital_type}{h.medicare_discharges_2024 != null ? ` · ${Math.round(h.medicare_discharges_2024).toLocaleString()} Medicare discharges` : ''}{h.cases_visible == null ? ' · no service-area data' : ''}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {chosen.length > 0 && (
        <ul className="mt-2 space-y-1">
          {chosen.map(h => (
            <li key={h.hospital_ccn} className="flex items-start gap-2 text-sm">
              <span className="min-w-0 flex-1"><span className="block truncate text-ink">{titleCase(h.hospital_name)}</span><span className="text-[11px] text-ink-3">{titleCase(h.city)}, {h.state} · CCN {h.hospital_ccn}</span></span>
              <button className="press btn btn-quiet text-xs px-1.5 py-0.5 shrink-0" onClick={() => onChange(selected.filter(c => c !== h.hospital_ccn))} aria-label={`Remove ${h.hospital_name}`}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
