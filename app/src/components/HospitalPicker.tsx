import { useEffect, useRef, useState } from 'react'
import { useSystemName } from '../lib/systemNames'
import { familyMembers, hospitalsByCcn, searchHospitals, searchSystems, type FamilyLite, type FamilyMember, type HospitalLite } from '../lib/hospitals'
import { titleCase } from '../lib/format'
import { NameModeToggle, Segmented } from './ui'

type Mode = 'hospital' | 'system'
/** Search-and-pick hospitals, one at a time or a whole system (a PECOS ownership family), optionally limited to chosen states. */
export default function HospitalPicker({ selected, onChange }: { selected: string[]; onChange: (ccns: string[]) => void }) {
  const sysName = useSystemName()
  const [mode, setMode] = useState<Mode>('hospital')
  const [text, setText] = useState('')
  const [hospitals, setHospitals] = useState<HospitalLite[]>([])
  const [systems, setSystems] = useState<FamilyLite[]>([])
  const [chosen, setChosen] = useState<HospitalLite[]>([])
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [searched, setSearched] = useState(false)
  // a system picked but not yet added: its members, and which states are ticked
  const [pending, setPending] = useState<{ fam: FamilyLite; members: FamilyMember[]; states: Set<string> } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { let live = true; hospitalsByCcn(selected).then(r => { if (live) setChosen(selected.map(c => r.find(x => x.hospital_ccn === c)).filter(Boolean) as HospitalLite[]) }); return () => { live = false } }, [selected])
  useEffect(() => {
    if (!text.trim()) { setHospitals([]); setSystems([]); setSearched(false); return }
    let live = true
    const t = setTimeout(() => {
      if (mode === 'hospital') searchHospitals(text).then(r => { if (live) { setHospitals(r); setSystems([]); setOpen(true); setSearched(true) } })
      else searchSystems(text).then(r => { if (live) { setSystems(r); setHospitals([]); setOpen(true); setSearched(true) } })
    }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [text, mode])
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc)
  }, [])
  const reset = () => { setText(''); setHospitals([]); setSystems([]); setOpen(false) }
  const addHospital = (h: HospitalLite) => { if (!selected.includes(h.hospital_ccn)) onChange([...selected, h.hospital_ccn]); setNote(null); reset() }
  const pickSystem = async (fam: FamilyLite) => {
    const members = await familyMembers(fam.family_id)
    setPending({ fam, members, states: new Set(members.map(m => m.state)) })
    setNote(null); reset()
  }
  const addPending = () => {
    if (!pending) return
    const usable = pending.members.filter(m => pending.states.has(m.state) && m.has_service_area)
    const skipped = pending.members.filter(m => pending.states.has(m.state) && !m.has_service_area).length
    const add = usable.map(m => m.hospital_ccn).filter(c => !selected.includes(c))
    onChange([...selected, ...add])
    setNote(`${titleCase(pending.fam.label)}: added ${add.length} hospital${add.length === 1 ? '' : 's'}${skipped > 0 ? `; ${skipped} in the chosen state${pending.states.size === 1 ? '' : 's'} ${skipped === 1 ? 'has' : 'have'} no service-area data and ${skipped === 1 ? 'was' : 'were'} left out` : ''}.`)
    setPending(null)
  }
  const results = mode === 'hospital' ? hospitals.length : systems.length
  const stateCounts = pending ? [...pending.members.reduce((m, x) => m.set(x.state, (m.get(x.state) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) : []
  const pendingCount = pending ? pending.members.filter(m => pending.states.has(m.state) && m.has_service_area).length : 0
  return (
    <div ref={box} className="relative">
      <div className="mb-1.5 flex items-center gap-3"><div className="flex-1"><Segmented value={mode} onChange={m => { setMode(m as Mode); reset() }} options={[{ value: 'hospital', label: 'Hospital' }, { value: 'system', label: 'System' }]} ariaLabel="Pick by" /></div>{mode === 'system' && <NameModeToggle />}</div>
      <input className="control w-full" value={text} onChange={e => setText(e.target.value)} onFocus={() => results && setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'ArrowDown' && open) { e.preventDefault(); (box.current?.querySelector('#hosp-results button:not([disabled])') as HTMLButtonElement | null)?.focus() } if (e.key === 'Enter' && open) { if (mode === 'hospital' && hospitals[0]) addHospital(hospitals[0]); if (mode === 'system' && systems[0] && Number(systems[0].tier ?? 2) < 2) pickSystem(systems[0]) } }}
        placeholder={mode === 'hospital' ? 'Hospital name, city or CCN' : 'System or owner name, e.g. Johns Hopkins, HCA'} aria-label={mode === 'hospital' ? 'Find a hospital' : 'Find a hospital system'} role="combobox" aria-expanded={open} aria-controls="hosp-results" />
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
            <li key={s.family_id} role="option" aria-selected={false}>
              <button className="press w-full text-left px-3 py-1.5 hover:bg-paper" onClick={() => pickSystem(s)} disabled={s.n_with_service_area === 0}>
                <div className="text-sm text-ink truncate" title={sysName(s.label).title ?? sysName(s.label).text}>{sysName(s.label).text}</div>
                <div className="text-[11px] text-ink-3">{s.n_hospitals} hospital{s.n_hospitals === 1 ? '' : 's'} · {s.n_states} state{s.n_states === 1 ? '' : 's'}{s.n_with_service_area < s.n_hospitals ? ` · ${s.n_with_service_area} with service-area data` : ''}{s.n_member_orgs > 1 ? ` · ${s.n_member_orgs} owner names` : ''}</div>
                {s.matched_alias ? <div className="text-[11px] text-ink-3 truncate">matches owner name {titleCase(s.matched_alias)}</div> : s.aliases ? <div className="text-[11px] text-ink-3 truncate" title={titleCase(s.aliases.split(' | ').join(', '))}>also {titleCase(s.aliases.split(' | ').slice(0, 3).join(', '))}{s.aliases.split(' | ').length > 3 ? ', …' : ''}</div> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {pending && (
        <div className="mt-2 rounded-[8px] bg-well px-3 py-2" data-testid="system-states">
          <div className="text-sm text-ink">{titleCase(pending.fam.label)} <span className="text-ink-3">· {pending.members.length} hospitals in {stateCounts.length} state{stateCounts.length === 1 ? '' : 's'}</span></div>
          <div className="text-[11px] text-ink-3 mt-0.5">Keep the states you want, then add.</div>
          <div className="flex flex-wrap gap-1 mt-1.5" role="group" aria-label="States">
            {stateCounts.map(([st, n]) => {
              const on = pending.states.has(st)
              return <button key={st} className={`press text-xs px-2 py-0.5 rounded-[5px] ${on ? 'bg-accent text-white' : 'bg-surface text-ink-2'}`} aria-pressed={on} onClick={() => setPending(p => { if (!p) return p; const s = new Set(p.states); if (s.has(st)) s.delete(st); else s.add(st); return { ...p, states: s } })}>{st} · {n}</button>
            })}
          </div>
          <div className="flex items-center gap-2 mt-2">
            <button className="press btn btn-primary text-xs" onClick={addPending} disabled={pendingCount === 0}>Add {pendingCount} hospital{pendingCount === 1 ? '' : 's'}</button>
            <button className="press btn btn-quiet text-xs" onClick={() => setPending(null)}>Cancel</button>
          </div>
        </div>
      )}
      {searched && results === 0 && text.trim() && <div className="t-caption mt-1" role="status">No {mode === 'hospital' ? 'hospital' : 'system or owner'} matches “{text.trim()}”. Try part of the name{mode === 'system' ? ', or search the hospital itself' : ''}.</div>}
      {mode === 'system' && !pending && <div className="text-[11px] text-ink-3 mt-1">A system is the organization that controls the hospital (a 50%-or-greater or unreported share in CMS's PECOS file), grouped with its holding companies. Minority stakes and joint-venture partners are not included.</div>}
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
