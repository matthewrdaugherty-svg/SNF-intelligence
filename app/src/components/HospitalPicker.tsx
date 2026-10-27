import { useEffect, useRef, useState } from 'react'
import { hospitalsByCcn, searchHospitals, searchSystems, systemHospitalCcns, type HospitalLite, type SystemLite } from '../lib/hospitals'
import { titleCase } from '../lib/format'
import { Segmented } from './ui'

type Mode = 'hospital' | 'system'
/** Search-and-pick hospitals, one at a time or a whole system (every hospital a PECOS owner organization holds a 5%+ interest in). */
export default function HospitalPicker({ selected, onChange }: { selected: string[]; onChange: (ccns: string[]) => void }) {
  const [mode, setMode] = useState<Mode>('hospital')
  const [text, setText] = useState('')
  const [hospitals, setHospitals] = useState<HospitalLite[]>([])
  const [systems, setSystems] = useState<SystemLite[]>([])
  const [chosen, setChosen] = useState<HospitalLite[]>([])
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { let live = true; hospitalsByCcn(selected).then(r => { if (live) setChosen(selected.map(c => r.find(x => x.hospital_ccn === c)).filter(Boolean) as HospitalLite[]) }); return () => { live = false } }, [selected])
  useEffect(() => {
    if (!text.trim()) { setHospitals([]); setSystems([]); return }
    let live = true
    const t = setTimeout(() => {
      if (mode === 'hospital') searchHospitals(text).then(r => { if (live) { setHospitals(r); setSystems([]); setOpen(true) } })
      else searchSystems(text).then(r => { if (live) { setSystems(r); setHospitals([]); setOpen(true) } })
    }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [text, mode])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const reset = () => { setText(''); setHospitals([]); setSystems([]); setOpen(false) }
  const addHospital = (h: HospitalLite) => { if (!selected.includes(h.hospital_ccn)) onChange([...selected, h.hospital_ccn]); setNote(null); reset() }
  const addSystem = async (s: SystemLite) => {
    const ccns = await systemHospitalCcns(s.owner_id)
    const add = ccns.filter(c => !selected.includes(c))
    onChange([...selected, ...add])
    const skipped = s.n_hospitals_in_care_compare - ccns.length
    setNote(`${titleCase(s.system_name)}: added ${add.length} hospital${add.length === 1 ? '' : 's'}${skipped > 0 ? `; ${skipped} of its hospitals have no service-area data and were left out` : ''}.`)
    reset()
  }
  const results = mode === 'hospital' ? hospitals.length : systems.length
  return (
    <div ref={box} className="relative">
      <div className="mb-1.5"><Segmented value={mode} onChange={m => { setMode(m as Mode); reset() }} options={[{ value: 'hospital', label: 'One hospital' }, { value: 'system', label: 'Whole system' }]} ariaLabel="Pick by" /></div>
      <input className="control w-full" value={text} onChange={e => setText(e.target.value)} onFocus={() => results && setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter') { if (mode === 'hospital' && hospitals[0]) addHospital(hospitals[0]); if (mode === 'system' && systems[0]) addSystem(systems[0]) } }}
        placeholder={mode === 'hospital' ? 'Hospital name, city or CCN' : 'System or owner name, e.g. Johns Hopkins'} aria-label={mode === 'hospital' ? 'Find a hospital' : 'Find a hospital system'} role="combobox" aria-expanded={open} aria-controls="hosp-results" />
      {open && results > 0 && (
        <ul id="hosp-results" role="listbox" className="absolute left-0 right-0 top-full mt-1 max-h-72 overflow-auto bg-surface rounded-[8px] z-30 py-1" style={{ boxShadow: 'var(--shadow-float)' }}>
          {mode === 'hospital' ? hospitals.map(h => (
            <li key={h.hospital_ccn} role="option" aria-selected={selected.includes(h.hospital_ccn)}>
              <button className="press w-full text-left px-3 py-1.5 hover:bg-paper" onClick={() => addHospital(h)} disabled={h.cases_visible == null}>
                <div className="text-sm text-ink truncate">{titleCase(h.hospital_name)}</div>
                <div className="text-[11px] text-ink-3">{titleCase(h.city)}, {h.state} · {h.hospital_type}{h.medicare_discharges_2024 != null ? ` · ${Math.round(h.medicare_discharges_2024).toLocaleString()} Medicare discharges` : ''}{h.cases_visible == null ? ' · no service-area data' : ''}</div>
              </button>
            </li>
          )) : systems.map(s => (
            <li key={s.owner_id} role="option" aria-selected={false}>
              <button className="press w-full text-left px-3 py-1.5 hover:bg-paper" onClick={() => addSystem(s)} disabled={s.n_hospitals_with_service_area === 0}>
                <div className="text-sm text-ink truncate">{titleCase(s.system_name)}</div>
                <div className="text-[11px] text-ink-3">{s.n_hospitals_in_care_compare} hospital{s.n_hospitals_in_care_compare === 1 ? '' : 's'} in Care Compare · {s.n_state_codes} state{s.n_state_codes === 1 ? '' : 's'}{s.n_hospitals_with_service_area < s.n_hospitals_in_care_compare ? ` · ${s.n_hospitals_with_service_area} with service-area data` : ''}</div>
              </button>
            </li>
          ))}
        </ul>
      )}
      {mode === 'system' && <div className="text-[11px] text-ink-3 mt-1">A system is an organization holding a 5%-or-greater direct or indirect ownership interest in the hospital, from CMS's PECOS ownership file. Large chains appear under several holding-company names.</div>}
      {note && <div className="text-[12px] text-ink-2 mt-1.5" role="status">{note}</div>}
      {chosen.length > 0 && (
        <ul className="mt-2 space-y-1 max-h-56 overflow-auto">
          {chosen.map(h => (
            <li key={h.hospital_ccn} className="flex items-start gap-2 text-sm">
              <span className="min-w-0 flex-1"><span className="block truncate text-ink">{titleCase(h.hospital_name)}</span><span className="text-[11px] text-ink-3">{titleCase(h.city)}, {h.state} · CCN {h.hospital_ccn}</span></span>
              <button className="press btn btn-quiet text-xs px-1.5 py-0.5 shrink-0" onClick={() => onChange(selected.filter(c => c !== h.hospital_ccn))} aria-label={`Remove ${h.hospital_name}`}>Remove</button>
            </li>
          ))}
          {chosen.length > 1 && <li><button className="press btn btn-quiet text-xs px-1.5 py-0.5" onClick={() => onChange([])}>Remove all {chosen.length}</button></li>}
        </ul>
      )}
    </div>
  )
}
