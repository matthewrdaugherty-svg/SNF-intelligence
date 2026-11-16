import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import HospitalPicker from '../components/HospitalPicker'
import { Empty, Pill, Segmented, Stat, StatRow, useReference } from '../components/ui'
import { fmtInt, fmtPct, fmtUsd, titleCase } from '../lib/format'
import {
  HOSPITAL_DEFAULTS, HOSPITAL_PRESETS, PAYER_DEFAULTS, PAYER_PRESETS, RISK_DRIFT, RISK_MODEL_FACTOR, RISK_TREND_FACTOR, SNF_DEFAULTS, SNF_PRESETS,
  chainsIn, cleanParent, geoInfo, geoParam, hospitalBaseline, hospitalValue, parentsIn, parseGeo, payerBaseline, payerValue, searchGeos, searchSnfs, snfBaseline, snfCostNote, snfMarket, snfValue, snfsByCcn,
  type Geo, type GeoInfo, type GeoOption, type HospitalAssumptions, type HospitalBaseline, type Lever, type ParentRow, type PayerAssumptions, type PayerBaseline, type Preset,
  type SnfAssumptions, type SnfBaseline, type SnfLite, type SnfTier,
} from '../lib/value'

// ------------------------------------------------------------------ formatting
const money = (n: number) => { const a = Math.abs(n); return a >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : a >= 1e4 ? `$${Math.round(n / 1e3).toLocaleString()}K` : fmtUsd(Math.round(n)) }
const pmpm = (n: number) => `$${n.toFixed(2)}`
const rate = (n: number | null | undefined, d = 1) => n == null || !Number.isFinite(n) ? '–' : n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
const usd0 = (n: number | null | undefined) => n == null || !Number.isFinite(n) ? '–' : fmtUsd(Math.round(n))
const pct = (n: number | null | undefined, d = 0) => n == null || !Number.isFinite(n) ? '–' : fmtPct(100 * n, d)
const CASES: { value: Preset; label: string }[] = [{ value: 'min', label: 'Minimum' }, { value: 'base', label: 'Base' }, { value: 'stretch', label: 'Stretch' }]

// ------------------------------------------------------------------ assumptions in the URL (so a link reproduces the page)
type Limits<T> = Partial<Record<keyof T, [number, number]>>
function readCase<T extends object>(params: URLSearchParams, prefix: string, defaults: T, presets: Record<Preset, Partial<T>>, limits: Limits<T>) {
  const c = params.get(prefix + 'c'); const preset: Preset = c === 'min' || c === 'stretch' ? c : 'base'
  const ov: Record<string, unknown> = {}
  for (const part of (params.get(prefix + 'a') ?? '').split(',')) {
    const i = part.indexOf(':'); if (i < 1) continue
    const k = part.slice(0, i) as keyof T & string, v = part.slice(i + 1); if (!(k in defaults)) continue
    const d = defaults[k]
    if (typeof d === 'string') ov[k] = v
    else if (v === '') { if (d === null) ov[k] = null }
    else { const n = Number(v); const lim = limits[k]; if (Number.isFinite(n)) ov[k] = lim ? Math.min(lim[1], Math.max(lim[0], n)) : n }
  }
  const facts = Object.fromEntries(Object.entries(ov).filter(([k]) => !(k in presets.base))) as Partial<T>
  const custom = Object.keys(ov).some(k => k in presets.base)
  return { preset, custom, facts, a: { ...defaults, ...presets[preset], ...ov } as T, ov: ov as Partial<T> }
}
function writeCase<T extends object>(params: URLSearchParams, prefix: string, preset: Preset, ov: Partial<T>) {
  const p = new URLSearchParams(params)
  if (preset === 'base') p.delete(prefix + 'c'); else p.set(prefix + 'c', preset)
  const s = Object.entries(ov).map(([k, v]) => `${k}:${v ?? ''}`).join(',')
  if (s) p.set(prefix + 'a', s); else p.delete(prefix + 'a')
  return p
}

// ------------------------------------------------------------------ small shared pieces
type Tag = 'Assumption' | 'Your number'
interface Field<T> { key: keyof T & string; label: string; unit: string; help?: ReactNode; tag: Tag; nullable?: boolean; placeholder?: string }
function Num({ label, value, onChange, unit, help, tag, min, max, nullable, placeholder }: { label: string; value: number | null; onChange: (v: number | null) => void; unit: string; help?: ReactNode; tag: Tag; min: number; max: number; nullable?: boolean; placeholder?: string }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value))
  useEffect(() => { setTxt(t => (t === '' ? null : Number(t)) === value ? t : value == null ? '' : String(value)) }, [value])
  return (
    <label className="block min-w-0">
      <div className="flabel flex flex-wrap items-center gap-x-1.5">{label}<span className={`pill !h-4 !text-[10px] !leading-4 !px-1.5 ${tag === 'Assumption' ? 'pill-same' : ''}`} style={tag === 'Your number' ? { background: 'var(--color-accent-soft)', color: 'var(--color-accent)' } : undefined}>{tag}</span></div>
      <div className="flex items-center gap-1.5">
        <input className="control w-24 text-right tabular-nums" inputMode="decimal" value={txt} placeholder={placeholder} aria-label={label}
          onChange={e => { const t = e.target.value.replace(/[^\d.]/g, ''); setTxt(t); if (t === '') { if (nullable) onChange(null); return } const n = Number(t); if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n))) }}
          onBlur={() => setTxt(value == null ? '' : String(value))} />
        <span className="t-label">{unit}</span>
      </div>
      {help && <div className="fhelp">{help}</div>}
    </label>
  )
}
function RiskInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [txt, setTxt] = useState(String(value))
  useEffect(() => { setTxt(t => Number(t) === value ? t : String(value)) }, [value])
  return <input className="control w-24 text-right tabular-nums" inputMode="decimal" aria-label="Your own risk score" value={txt} onChange={e => { const t = e.target.value.replace(/[^\d.]/g, ''); setTxt(t); const n = Number(t); if (t !== '' && Number.isFinite(n) && n >= 0.5 && n <= 3) onChange(n) }} onBlur={() => setTxt(String(value))} />
}
function Fields<T extends object>({ fields, a, limits, set }: { fields: Field<T>[]; a: T; limits: Limits<T>; set: (k: keyof T & string, v: number | null) => void }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">{fields.map(f => { const lim = limits[f.key] ?? [0, 1e9]; return <Num key={f.key} label={f.label} unit={f.unit} help={f.help} tag={f.tag} nullable={f.nullable} placeholder={f.placeholder} min={lim[0]} max={lim[1]} value={a[f.key] as number | null} onChange={v => set(f.key, v)} /> })}</div>
}
function CaseBar({ preset, custom, onPick }: { preset: Preset; custom: boolean; onPick: (p: Preset) => void }) {
  return <div className="flex flex-wrap items-center gap-3"><div className="w-full sm:w-80"><Segmented value={preset} options={CASES} onChange={onPick} ariaLabel="Case" /></div>{custom && <span className="t-label inline-flex items-center gap-2"><Pill kind="same">Edited</Pill>your changes are on top of {CASES.find(c => c.value === preset)!.label} · pick a case to reset them</span>}</div>
}
/** Levers down the side; Minimum / Base / Stretch across (and "Yours" when an assumption has been edited). The chosen case is the emphasized column, and its arithmetic is printed under each lever. */
function LeverTable({ cases, yours, preset, custom, get, fmtv, unitHead, extraHead, extra }: { cases: Record<Preset, Lever[]>; yours: Lever[]; preset: Preset; custom: boolean; get: (l: Lever) => number; fmtv: (n: number) => string; unitHead: string; extraHead?: string; extra?: (l: Lever | null) => string }) {
  const sum = (ls: Lever[]) => ls.reduce((s, l) => s + get(l), 0)
  const total = sum(yours)
  const col = (p: Preset) => `num ${!custom && p === preset ? 'font-semibold text-ink bg-well' : 'text-ink-2'}`
  return (
    <div className="overflow-x-auto"><table className="tbl" data-testid="levers">
      <thead><tr><th>Lever <span className="font-normal text-ink-3">· the arithmetic shown is for {custom ? 'your edited case' : `the ${CASES.find(c => c.value === preset)!.label.toLowerCase()} case`}</span></th>{CASES.map(c => <th key={c.value} className="num whitespace-nowrap">{c.label}</th>)}{custom && <th className="num">Yours</th>}{extraHead && <th className="num whitespace-nowrap">{extraHead}</th>}<th className="num">Share</th></tr><tr className="sr-only"><td colSpan={5}>{unitHead}</td></tr></thead>
      <tbody>
        {yours.map((l, i) => (
          <tr key={l.key} data-lever={l.key}>
            <td>{l.label}<span className="sub">{l.basis}</span></td>
            {CASES.map(c => <td key={c.value} className={col(c.value)}>{fmtv(get(cases[c.value][i]))}</td>)}
            {custom && <td className="num font-semibold bg-well">{fmtv(get(l))}</td>}
            {extra && <td className="num">{extra(l)}</td>}
            <td className="num w-28"><div className="flex items-center justify-end gap-2"><span className="inline-block h-1.5 rounded-full bg-accent" style={{ width: `${total > 0 ? Math.round(56 * get(l) / total) : 0}px` }} aria-hidden /><span className="w-9 text-right text-ink-2">{total > 0 ? fmtPct(100 * get(l) / total, 0) : '–'}</span></div></td>
          </tr>
        ))}
        <tr className="font-semibold" data-lever="total"><td>Total <span className="font-normal text-ink-3">· {unitHead}</span></td>{CASES.map(c => <td key={c.value} className={`num ${!custom && c.value === preset ? 'bg-well' : ''}`} data-case={c.value}>{fmtv(sum(cases[c.value]))}</td>)}{custom && <td className="num bg-well" data-case="yours">{fmtv(total)}</td>}{extra && <td className="num">{extra(null)}</td>}<td className="num" /></tr>
      </tbody>
    </table></div>
  )
}
const Row2 = ({ k, v, sub }: { k: ReactNode; v: ReactNode; sub?: ReactNode }) => <tr><td>{k}{sub && <span className="sub">{sub}</span>}</td><td className="num whitespace-nowrap">{v}</td></tr>
const Chip = ({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) => <span className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-full bg-well text-[13px] text-ink">{children}{onRemove && <button className="press w-5 h-5 rounded-full text-ink-3 hover:text-ink hover:bg-hairline leading-5" onClick={onRemove} aria-label="Remove">×</button>}</span>

function GeoPicker({ geo, info, onPick }: { geo: Geo; info: GeoInfo | null; onPick: (param: string) => void }) {
  const [text, setText] = useState(''); const [opts, setOpts] = useState<GeoOption[]>([]); const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!text.trim()) { setOpts([]); return } let live = true; const t = setTimeout(() => searchGeos(text).then(r => { if (live) { setOpts(r); setOpen(true) } }), 200); return () => { live = false; clearTimeout(t) } }, [text])
  useEffect(() => { const f = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }; document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f) }, [])
  const pick = (p: string) => { onPick(p); setText(''); setOpen(false) }
  return (
    <div ref={box} className="relative">
      <div className="flabel">Market</div>
      <div className="flex flex-wrap items-center gap-2">
        <input className="control w-full sm:w-80" value={text} onChange={e => setText(e.target.value)} onFocus={() => opts.length && setOpen(true)} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); if (e.key === 'Enter' && opts[0]) pick(opts[0].param) }}
          placeholder="Metro area (CBSA) or two-letter state" aria-label="Find a market" role="combobox" aria-expanded={open} aria-controls="geo-results" />
        <Chip onRemove={geo.kind === 'us' ? undefined : () => pick('US')}><b className="font-medium">{info ? (info.counties === 0 ? 'Unknown market' : info.label) : '…'}</b></Chip>
      </div>
      {open && text.trim() && (
        <ul id="geo-results" role="listbox" className="absolute left-0 top-full mt-1 w-full sm:w-[28rem] max-h-72 overflow-auto bg-surface rounded-[8px] z-30 py-1" style={{ boxShadow: 'var(--shadow-float)' }}>
          {opts.length === 0 && <li className="px-3 py-2 t-label">No metro area or state matches. Try a city name, or a two-letter state such as MD.</li>}
          {opts.map(o => <li key={o.param} role="option" aria-selected={geoParam(geo) === o.param}><button className="press w-full text-left px-3 py-1.5 hover:bg-paper" onClick={() => pick(o.param)}><div className="text-sm text-ink truncate">{o.label}</div><div className="text-[11px] text-ink-3">{fmtInt(o.total)} Medicare beneficiaries · {fmtInt(o.ma)} in Medicare Advantage</div></button></li>)}
        </ul>
      )}
      {info && <div className="fhelp">{fmtInt(info.counties)} {info.counties === 1 ? 'county' : 'counties'} · {fmtInt(info.enrTotal)} Medicare beneficiaries, {fmtInt(info.enrMa)} in Medicare Advantage and other health plans ({pct(info.enrMa / info.enrTotal)}) · {fmtInt(info.nHospitals)} hospitals · {fmtInt(info.nSnf)} nursing homes in Care Compare</div>}
    </div>
  )
}

// ================================================================== PAYER
const PAYER_LIMITS: Limits<PayerAssumptions> = { readmPts: [0, 10], snfToHome: [0, 50], snfLos: [0, 50], irfToSnf: [0, 100], ltchToSnf: [0, 100], ipDays: [0, 30], perDiemShare: [0, 100], umPmpm: [0, 50], priceFactor: [50, 200], acuity: [50, 300], planRisk: [0.5, 3], bidRatio: [50, 100] }
const PAYER_FIELDS: Field<PayerAssumptions>[] = [
  { key: 'readmPts', label: 'Readmission rate, points removed', unit: 'points', tag: 'Assumption', help: '1 point means 15% becomes 14%. Each avoided readmission is priced at the average inpatient payment per stay in this market.' },
  { key: 'snfToHome', label: 'SNF admissions that go home with home health instead', unit: '% of SNF stays', tag: 'Assumption', help: 'Saving per stay = the SNF stay (days per stay × payment per day) less one home-health episode.' },
  { key: 'snfLos', label: 'Shorter SNF stays', unit: '% fewer days', tag: 'Assumption', help: 'Applied only to stays that still go to a SNF. 13% is the drop measured after one Medicare Advantage insurer adopted naviHealth, with no change found in health outcomes (Marr, Journal of Health Economics, 2025).' },
  { key: 'irfToSnf', label: 'Rehab-hospital stays that step down to a SNF', unit: '% of IRF stays', tag: 'Assumption', help: 'Saving per stay = the IRF payment less a SNF stay.' },
  { key: 'ltchToSnf', label: 'Long-term acute stays that step down to a SNF', unit: '% of LTCH stays', tag: 'Assumption', help: 'Saving per stay = the LTCH payment less a SNF stay.' },
  { key: 'ipDays', label: 'Fewer inpatient days waiting for a placement', unit: '% of days', tag: 'Assumption', help: 'Only days the plan pays per diem save the plan money; see the next field.' },
  { key: 'perDiemShare', label: 'Inpatient days the plan pays per diem', unit: '% of days', tag: 'Your number', help: 'Under DRG (per-stay) payment a shorter stay saves the hospital, not the plan. Enter the share of days under per-diem contracts; 0 if all DRG.' },
  { key: 'umPmpm', label: 'Post-acute utilization management the rails replace', unit: '$ PMPM', tag: 'Your number', help: 'What the plan pays today for post-acute prior authorization and review, in house or to a vendor. Rondo makes no coverage decisions, so this is cost the plan no longer needs.' },
  { key: 'priceFactor', label: 'What the plan pays, relative to Medicare', unit: '% of Medicare', tag: 'Your number', help: 'Prices here are what Original Medicare paid in this market in 2024. 100 means the plan pays the same.' },
  { key: 'acuity', label: 'Utilization relative to the baseline', unit: '%', tag: 'Your number', help: 'Above 100 for a sicker population (a dual-eligible special-needs plan, for example). The area\'s Original Medicare risk score is shown in the baseline below.' },
]
function PayerTab({ geo, info }: { geo: Geo; info: GeoInfo | null }) {
  const [params, setParams] = useSearchParams()
  const text = cleanParent(params.get('payer') ?? '')
  const membersOv = params.get('pm') && Number(params.get('pm')) > 0 ? Math.min(1e8, Number(params.get('pm'))) : null
  const cs = useMemo(() => { const r = readCase(params, 'p', PAYER_DEFAULTS, PAYER_PRESETS, PAYER_LIMITS); r.a.basis = r.a.basis === 'ffs' ? 'ffs' : 'ma'; r.a.risk = r.a.risk === 'one' || r.a.risk === 'own' ? r.a.risk : 'cms'; return r }, [params])
  const a = cs.a
  const [draft, setDraft] = useState(text)
  const [parents, setParents] = useState<ParentRow[]>([])
  const [b, setB] = useState<PayerBaseline | null | undefined>(undefined)
  const [us, setUs] = useState<PayerBaseline | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cpscRaw = useReference()?.meta.underwriting?.cpsc_period   // 'YYYY-MM'
  const cpscPeriod = cpscRaw && /^\d{4}-\d{2}$/.test(cpscRaw) ? new Date(Date.UTC(Number(cpscRaw.slice(0, 4)), Number(cpscRaw.slice(5)) - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : cpscRaw
  useEffect(() => { setDraft(text) }, [text])
  useEffect(() => { let live = true; parentsIn(geo, '', 8).then(r => { if (live) setParents(r) }).catch(() => {}); return () => { live = false } }, [geoParam(geo)])
  useEffect(() => { let live = true; setB(undefined); setError(null); payerBaseline(geo, text).then(r => { if (live) setB(r) }).catch(e => { if (live) { setError(String(e?.message ?? e)); setB(null) } }); return () => { live = false } }, [geoParam(geo), text])
  useEffect(() => { let live = true; payerBaseline({ kind: 'us' }, '').then(r => { if (live) setUs(r) }).catch(() => {}); return () => { live = false } }, [])
  const patch = (f: (p: URLSearchParams) => void) => { const p = new URLSearchParams(params); f(p); setParams(p, { replace: true }) }
  const setA = (k: string, v: number | string | null) => setParams(writeCase(params, 'p', cs.preset, { ...cs.ov, [k]: v }), { replace: true })
  const pickCase = (p: Preset) => setParams(writeCase(params, 'p', p, cs.facts), { replace: true })
  const applyPayer = (t: string) => patch(p => { if (cleanParent(t)) p.set('payer', t.trim()); else p.delete('payer'); p.delete('pm') })
  if (error) return <Empty title="The payer model could not be run.">{error}</Empty>
  if (b === undefined) return <div className="panel panel-pad t-label">Loading the market baseline…</div>
  const noMatch = b === null
  const members = membersOv ?? (b ? Math.round(b.members) : 0)
  return (
    <div className="stack">
      <section className="panel panel-pad">
        <h2 className="section-title">Which plan</h2>
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-8 gap-y-4">
          <div>
            <div className="flabel">Parent organization <span className="t-caption">· any part of the name, e.g. "united" · leave empty for all Medicare Advantage here</span></div>
            <form className="flex gap-2" onSubmit={e => { e.preventDefault(); applyPayer(draft) }}>
              <input className="control flex-1 min-w-0" value={draft} onChange={e => setDraft(e.target.value)} placeholder="All Medicare Advantage plans" aria-label="Parent organization" />
              <button className="press btn btn-surface" type="submit">Apply</button>
              {text && <button className="press btn btn-quiet" type="button" onClick={() => applyPayer('')}>Clear</button>}
            </form>
            {parents.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" data-testid="parent-chips">{parents.map(p => <button key={p.parent_org} className="press h-7 px-2.5 rounded-full bg-well hover:bg-hairline text-[12px] text-ink-2 hover:text-ink" onClick={() => applyPayer(p.parent_org)} title={`${fmtInt(p.enrollment)} members in ${fmtInt(p.counties)} counties`}>{p.parent_org.replace(/,? (Inc|Corporation|Corp|Company|LLC)\.?$/i, '')} <span className="text-ink-3 tabular-nums">{fmtInt(p.enrollment)}</span></button>)}</div>}
            <div className="fhelp">Largest Medicare Advantage parent organizations in this market, by enrollment (CMS contract/plan/county file, {cpscPeriod ?? 'latest month'}). CMS hides plan-county cells of 10 members or fewer, so small footprints are undercounted.</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 content-start">
            <div>
              <div className="flabel">Members to size for</div>
              <input className="control w-36 text-right tabular-nums" inputMode="numeric" value={membersOv ?? ''} placeholder={b ? fmtInt(Math.round(b.members)) : '0'} aria-label="Members to size for" onChange={e => { const v = e.target.value.replace(/[^\d]/g, ''); patch(p => { if (v && Number(v) > 0) p.set('pm', v); else p.delete('pm') }) }} />
              <div className="fhelp">{noMatch ? 'No members to size here.' : <>Default: {b!.membersSource === 'parent' ? <>the {fmtInt(Math.round(b!.members))} members CMS shows for {b!.matchedParents.length === 1 ? b!.matchedParents[0] : `${b!.matchedParents.length} matching organizations`} here</> : <>all {fmtInt(Math.round(b!.members))} Medicare Advantage and other health plan enrollees here</>}. Type a number to size a different book.</>}</div>
            </div>
            <div>
              <div className="flabel">Utilization baseline</div>
              <Segmented value={a.basis} onChange={v => setA('basis', v)} ariaLabel="Utilization baseline" options={[{ value: 'ma', label: 'Typical MA plan' }, { value: 'ffs', label: 'Unmanaged' }]} />
              <div className="fhelp">Typical MA plan: Original Medicare use in these counties × the state's Medicare Advantage-to-Original Medicare ratio (2023). Unmanaged: Original Medicare levels, for a plan or ACO with no post-acute management today.</div>
            </div>
          </div>
        </div>
        {b && b.matchedParents.length > 1 && <div className="t-label mt-3">Matches {b.matchedParents.length} parent organizations: {b.matchedParents.slice(0, 6).join(' · ')}{b.matchedParents.length > 6 ? ' …' : ''}. Add more of the name to narrow it.</div>}
      </section>
      {noMatch ? (text ? <Empty title="No Medicare Advantage enrollment matches.">No parent organization containing "{text}" has visible enrollment in {info?.inLabel ?? 'this market'}. Clear the name or choose a larger market.</Empty>
        : <Empty title="No baseline for this market.">CMS does not publish Medicare Advantage enrollment together with Original Medicare post-acute use for {info?.inLabel ?? 'this market'}, so there is nothing to build the plan's baseline from. Choose another market.</Empty>) : <PayerResult b={b!} us={us} a={a} members={members} preset={cs.preset} custom={cs.custom} facts={cs.facts as Partial<PayerAssumptions>} setA={setA} pickCase={pickCase} info={info} />}
    </div>
  )
}
function PayerResult({ b, us, a, members, preset, custom, facts, setA, pickCase, info }: { b: PayerBaseline; us: PayerBaseline | null; a: PayerAssumptions; members: number; preset: Preset; custom: boolean; facts: Partial<PayerAssumptions>; setA: (k: string, v: number | string | null) => void; pickCase: (p: Preset) => void; info: GeoInfo | null }) {
  const ref = useReference(); const uw = ref?.meta.underwriting
  const [params, setParams] = useSearchParams()
  // reference marks: up to four PMPM figures of the user's own (a target, a deck number, a competitor's claim) drawn on the scale; nothing is built in
  const marks = useMemo(() => (params.get('ref') ?? '').split(',').map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 200).slice(0, 4), [params])
  const [markText, setMarkText] = useState(marks.join(', '))
  useEffect(() => { setMarkText(t => t.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0).join(',') === marks.join(',') ? t : marks.join(', ')) }, [marks.join(',')])
  const v = payerValue(b, a, members)
  const cases = Object.fromEntries(CASES.map(c => [c.value, payerValue(b, { ...PAYER_DEFAULTS, ...PAYER_PRESETS[c.value], ...facts }, members)])) as Record<Preset, ReturnType<typeof payerValue>>
  const who = b.membersSource === 'parent' ? (b.matchedParents.length === 1 ? b.matchedParents[0] : `${b.matchedParents.length} matching organizations`) : 'all Medicare Advantage plans'
  const u = a.basis === 'ffs' ? b.ffs : b.ma
  const lv = (k: string) => v.levers.find(l => l.key === k)!.pmpm * 12 * 100000
  const mine = { readm: lv('readm'), level: lv('home') + lv('irf') + lv('ltch'), stays: lv('los') + lv('ipdays'), um: lv('um') }
  const scaleMax = Math.max(25, Math.ceil(Math.max(cases.stretch.totalPmpm, v.totalPmpm, ...marks) * 1.1 / 5) * 5)
  const x = (n: number) => `${Math.min(100, 100 * n / scaleMax)}%`
  const adj = (area: number | null, usv: number | null | undefined) => { if (area == null || usv == null || !b.ffsRisk || !us?.ffsRisk) return null; const d = area / (b.ffsRisk / us.ffsRisk) / usv - 1; const r = Math.round(100 * d); return r === 0 ? { kind: 'same' as const, text: 'in line with the US' } : { kind: r > 0 ? 'worse' as const : 'better' as const, text: `${Math.abs(r)}% ${r > 0 ? 'above' : 'below'} the US` } }
  const basisWord = a.basis === 'ffs' ? 'unmanaged (Original Medicare) utilization' : 'typical Medicare Advantage utilization'
  return (
    <>
      <section className="panel panel-pad" data-testid="payer-result">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><h2 className="section-title">What it is worth to the plan</h2><div className="ml-auto"><CaseBar preset={preset} custom={custom} onPick={pickCase} /></div></div>
        <p className="t-lead mt-2">For <b>{fmtInt(members)}</b> members of {who} in {info?.inLabel ?? 'this market'}, at {basisWord}: about <b data-testid="payer-pmpm">{pmpm(v.totalPmpm)}</b> per member per month, <b>{money(v.totalPerYear)}</b> a year{custom ? ' on your edited assumptions' : ` in the ${CASES.find(c => c.value === preset)!.label.toLowerCase()} case`}. The range runs from <b>{pmpm(cases.min.totalPmpm)}</b> (minimum) to <b>{pmpm(cases.stretch.totalPmpm)}</b> (stretch).</p>
        <div className="mt-4">
          <StatRow source="Modeled" cols={4} note="baseline volumes and prices are CMS figures; every improvement percentage is an assumption set below">
            <Stat label="Per member per month" value={pmpm(v.totalPmpm)} note={`minimum ${pmpm(cases.min.totalPmpm)} · stretch ${pmpm(cases.stretch.totalPmpm)}`} how="The sum of the levers in the table below, each one volume × change × price, divided by 12,000 to turn dollars per 1,000 members per year into dollars per member per month." />
            <Stat label={`Per year, ${fmtInt(members)} members`} value={money(v.totalPerYear)} note={`${money(v.totalPmpm * 12 * 100000)} per 100,000 members`} how="Per member per month × 12 × members." />
            <Stat label="Share of inpatient and post-acute spend" value={pct(v.pctOfIpPac, 1)} note={`of ${pmpm(v.spendPmpm.total)} PMPM: inpatient ${pmpm(v.spendPmpm.ip)}, SNF ${pmpm(v.spendPmpm.snf)}, IRF + LTCH ${pmpm(v.spendPmpm.irf + v.spendPmpm.ltch)}`} how="Savings ÷ the plan's modeled spend on inpatient, SNF, rehab-hospital and long-term acute stays (utilization × price). Home health, physician and outpatient spend are not in the denominator." />
            <Stat label="Share of benchmark revenue" value={v.pctOfRevenue == null ? '–' : pct(v.pctOfRevenue, 2)} note={v.benchRevenue == null || !b.rev ? 'no ratebook rate for these counties' : `of ${fmtUsd(Math.round(v.benchRevenue))} PMPM${b.rev.stars != null ? ` · ${b.rev.stars.toFixed(2)}★` : ''} · risk score ${rate(v.riskUsed, 2)}${v.riskSource === 'cms' ? ` (CMS ${uw?.plan_payment?.year})` : ''}${v.pctOfPayment != null ? ` · ${pct(v.pctOfPayment, 2)} of expected CMS payment` : ''}`} how={`Savings ÷ benchmark revenue. Benchmark revenue is the ${uw?.ratebook_year ?? ''} county benchmark at each contract's own quality-bonus level (from its Star Rating), weighted by where the members live, times the risk score chosen in the Plan revenue section below. The second figure divides by the payment CMS is expected to make after the plan's bid and rebate.`} />
          </StatRow>
        </div>
        <div className="mt-5"><LeverTable cases={{ min: cases.min.levers, base: cases.base.levers, stretch: cases.stretch.levers }} yours={v.levers} preset={preset} custom={custom} get={l => l.pmpm} fmtv={pmpm} unitHead="dollars per member per month" extraHead={`Per year, ${fmtInt(members)} members`} extra={l => money(l ? l.perYear : v.totalPerYear)} /></div>
        <div className="mt-5" data-testid="pmpm-scale">
          <div className="t-label mb-1.5">Where that sits · dollars per member per month</div>
          <div className="relative h-9">
            <div className="absolute inset-x-0 top-3 h-2 rounded-full bg-well" />
            <div className="absolute top-3 h-2 rounded-full bg-accent/40" style={{ left: x(cases.min.totalPmpm), width: `calc(${x(cases.stretch.totalPmpm)} - ${x(cases.min.totalPmpm)})` }} />
            {marks.map(m => <div key={m} className="absolute top-1 w-0.5 h-6 bg-ink" style={{ left: x(m) }} title={`Your reference: ${pmpm(m)}`} data-testid="ref-mark" />)}
            {CASES.map(c => <div key={c.value} className={`absolute top-[9px] w-3.5 h-3.5 -ml-[7px] rounded-full border-2 border-surface ${!custom && c.value === preset ? 'bg-accent' : 'bg-ink-3'}`} style={{ left: x(cases[c.value].totalPmpm) }} title={`${c.label}: ${pmpm(cases[c.value].totalPmpm)}`} />)}
            {custom && <div className="absolute top-[9px] w-3.5 h-3.5 -ml-[7px] rounded-full border-2 border-surface bg-accent" style={{ left: x(v.totalPmpm) }} title={`Yours: ${pmpm(v.totalPmpm)}`} />}
          </div>
          <div className="flex justify-between t-caption tabular-nums"><span>$0</span><span>${scaleMax / 2}</span><span>${scaleMax}</span></div>
          <div className="t-caption mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1"><span><span className="inline-block w-2.5 h-2.5 rounded-full bg-ink-3 align-[-1px] mr-1" />minimum, base and stretch</span>{marks.length > 0 && <span><span className="inline-block w-0.5 h-3 bg-ink align-[-2px] mr-1.5" />your reference {marks.length === 1 ? 'figure' : 'figures'}: {marks.map(pmpm).join(', ')}</span>}</div>
          <label className="mt-3 flex flex-wrap items-center gap-2"><span className="flabel !mb-0">Compare with</span><input className="control w-40" inputMode="decimal" value={markText} placeholder="e.g. 11, 15, 20" aria-label="Reference figures, dollars per member per month"
            onChange={e => { const t = e.target.value.replace(/[^\d.,\s]/g, ''); setMarkText(t); const ns = t.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0 && n <= 200).slice(0, 4); const p = new URLSearchParams(params); if (ns.length) p.set('ref', ns.join(',')); else p.delete('ref'); setParams(p, { replace: true }) }} /><span className="t-caption">dollars per member per month · a target or another estimate of your own, up to four, separated by commas</span></label>
        </div>
      </section>

      {b.rev && <section className="panel panel-pad" data-testid="plan-revenue">
        <h2 className="section-title">Plan revenue <span className="t-caption font-normal ml-1">what CMS pays {who === 'all Medicare Advantage plans' ? 'these plans' : who} here in {uw?.ratebook_year}, per member per month</span></h2>
        <p className="t-label mt-1 max-w-3xl">Built the way CMS builds it: each member is priced at their own county's benchmark, at the quality-bonus level their contract's Star Rating earns. The plan is paid its bid, and a share of the gap between benchmark and bid comes back as a rebate. Members and Star Ratings are the plan's own; the bid is CMS's published average unless you enter the plan's.</p>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-x-10 gap-y-5 mt-4">
          <div>
            <table className="tbl tbl-compact" data-testid="revenue-build"><tbody>
              <Row2 k={<>Star Rating used for {uw?.stars?.payment_year} payment</>} v={b.rev.stars == null ? 'not rated' : <span className="font-medium">{b.rev.stars.toFixed(2)}★</span>} sub={`${uw?.stars?.rating_year} Star Ratings, member-weighted · ${pct(b.rev.shareRated)} of members in contracts with their own rating${b.rev.shareParentAvg > 0.0005 ? `, ${pct(b.rev.shareParentAvg, 1)} in new contracts that take their parent's average` : ''}`} />
              <Row2 k="Members in contracts at 4 stars or more" v={pct(b.rev.share5)} sub={`paid at the 5% bonus benchmark${b.rev.share35 > 0.0005 ? ` · ${pct(b.rev.share35, 1)} in new or low-enrollment contracts at 3.5%` : ''} · ${pct(b.rev.share0)} with no bonus`} />
              <Row2 k="County benchmark at those ratings" v={<span className="font-medium">{usd0(b.rev.bench)}</span>} sub={`${usd0(b.rev.bench0)} with no bonus · ${usd0(b.rev.bench5)} if every contract were at 4 stars or more`} />
              <Row2 k={<>× risk score {v.riskSource === 'cms' ? <span className="pill pill-same !h-4 !text-[10px] !leading-4 !px-1.5 align-[1px]" data-testid="risk-tag">CMS-published, {uw?.plan_payment?.year} †</span> : v.riskSource === 'own' ? <span className="pill !h-4 !text-[10px] !leading-4 !px-1.5 align-[1px]" style={{ background: 'var(--color-accent-soft)', color: 'var(--color-accent)' }} data-testid="risk-tag">Your number</span> : <span className="pill pill-same !h-4 !text-[10px] !leading-4 !px-1.5 align-[1px]" data-testid="risk-tag">Set to 1.0</span>}</>} v={rate(v.riskUsed, 3)} sub={v.riskSource === 'cms' ? `these plans' average in CMS's ${uw?.plan_payment?.year} payment data, the latest CMS has reconciled; see the note below` : v.riskSource === 'own' ? 'the risk score you entered' : a.risk === 'cms' ? 'CMS has published no risk score for these plans, so the benchmark is used as published' : 'the benchmark as published'} />
              <Row2 k={<b className="font-semibold">Benchmark revenue</b>} v={<b className="font-semibold" data-testid="bench-revenue">{usd0(v.benchRevenue)}</b>} sub="the most CMS pays for Medicare-covered benefits, before the bid" />
              <Row2 k="Bid as a share of benchmark" v={v.bidRatioUsed == null ? '–' : pct(v.bidRatioUsed, 1)} sub={a.bidRatio == null ? `CMS's published average for these counties (${uw?.ratebook_year} ratebook)` : 'your number'} />
              <Row2 k="Base payment" v={usd0(v.basePayment)} sub="risk score × bid: what CMS pays for Medicare-covered services" />
              <Row2 k={`Rebate, ${rate(b.rev.rebatePct, 0)}% of the gap`} v={usd0(v.rebate)} sub="70% at 4.5 stars or more, 65% at 3.5 to 4, 50% below; must go to extra benefits or lower premiums" />
              <Row2 k={<b className="font-semibold">Expected CMS payment</b>} v={<b className="font-semibold" data-testid="cms-payment">{usd0(v.payment)}</b>} sub={v.payment != null && v.benchRevenue ? `${pct(v.payment / v.benchRevenue, 1)} of benchmark revenue · Part C only, before the 2% sequestration reduction; Part D and member premiums are not included` : undefined} />
            </tbody></table>
          </div>
          <div className="space-y-4">
            <div>
              <div className="flabel">Risk score</div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-[22rem]"><Segmented value={v.riskSource} onChange={x2 => setA('risk', x2)} ariaLabel="Risk score" options={[...(b.rev.pay24 ? [{ value: 'cms' as const, label: `CMS ${uw?.plan_payment?.year}: ${b.rev.pay24.risk.toFixed(2)}` }] : []), { value: 'one', label: '1.0' }, { value: 'own', label: 'Your own' }]} /></div>
                {a.risk === 'own' && <RiskInput value={a.planRisk} onChange={n => setA('planRisk', n)} />}
              </div>
              <div className="fhelp">Risk scores only turn the benchmark into revenue; they do not change the savings.{b.rev.pay24 ? ` The published score covers plans holding ${pct(b.rev.pay24.coverage)} of these members; newer plans have none.` : ' CMS has not published a risk score for these plans, so 1.0 is used.'}</div>
            </div>
            <Num label="Plan's bid, as a share of its benchmark" unit="% of benchmark" tag="Your number" nullable placeholder={b.rev.bidRatio == null ? 'average' : (100 * b.rev.bidRatio).toFixed(1)} min={50} max={100} value={a.bidRatio} onChange={n => setA('bidRatio', n)} help={<>Leave empty to use CMS's published average bid for these counties. A lower bid means a smaller base payment and a larger rebate.{b.rev.pay24?.impliedBidRatio != null ? <> These plans' own {uw?.plan_payment?.year} payments imply a bid near <b className="text-ink">{pct(b.rev.pay24.impliedBidRatio, 1)}</b> of benchmark (an estimate, from their bid and rebate that year). <button type="button" className="text-accent hover:underline" data-testid="use-implied-bid" onClick={e => { e.preventDefault(); setA('bidRatio', Math.round(1000 * b.rev!.pay24!.impliedBidRatio!) / 10) }}>Use it</button></> : null}</>} />
            {b.rev.pay24 && <div className="card p-3" data-testid="pay-check"><div className="card-label">Check against what CMS actually paid these plans in {uw?.plan_payment?.year}</div>
              <div className="t-label mt-1">{usd0(b.rev.pay24.base + b.rev.pay24.rebate)} per member per month: base {usd0(b.rev.pay24.base)} + rebate {usd0(b.rev.pay24.rebate)}, at an average risk score of {b.rev.pay24.risk.toFixed(3)}.{v.payment != null ? <> The {uw?.ratebook_year} figure on the left is {pct(Math.abs(v.payment / (b.rev.pay24.base + b.rev.pay24.rebate) - 1), 0)} {v.payment >= b.rev.pay24.base + b.rev.pay24.rebate ? 'higher' : 'lower'}{a.risk !== 'cms' ? '; choose the CMS risk score above to compare like with like' : ', three years of benchmark growth later'}.</> : null}</div></div>}
            {b.rev.mlr23 && <div className="card p-3" data-testid="mlr-check"><div className="card-label">What these contracts reported to CMS for {uw?.mlr?.year}</div>
              <div className="t-label mt-1">Medical loss ratio <b className="text-ink">{pct(b.rev.mlr23.mlr, 1)}</b> on revenue of {usd0(b.rev.mlr23.revenue)} per member per month (CMS payment {usd0(b.rev.mlr23.maPay)}, the rest Part D and premiums); hospital and medical claims {usd0(b.rev.mlr23.abClaims)}.{v.mlrPoints != null ? <> Against that revenue the savings above are <b className="text-ink" data-testid="mlr-points">{rate(100 * v.mlrPoints, 2)} points</b> of medical loss ratio.</> : null}{v.ipPacShareOfClaims != null ? <> The inpatient and post-acute spend this model starts from is {pct(v.ipPacShareOfClaims)} of those claims.</> : null} <span className="text-ink-3">Contract-wide filings covering {pct(b.rev.mlr23.coverage)} of these members, weighted by where today's members are.</span></div></div>}
          </div>
        </div>
        {v.riskSource === 'cms' && b.rev.pay24 && <p className="t-caption mt-4 max-w-3xl" data-testid="risk-footnote">† The risk score is CMS's, not this tool's: the member-weighted average for these plans in CMS's Plan Payment Data for {uw?.plan_payment?.year}, the latest year CMS has reconciled. It is {RISK_DRIFT.to - RISK_DRIFT.from} years older than the {uw?.ratebook_year} benchmark it is multiplied by. Since {RISK_DRIFT.from} CMS has finished phasing in its new risk model (known as V28), changed normalization, and stopped counting some diagnoses; by CMS's own estimates those lower the average risk score by about {pct(1 - RISK_MODEL_FACTOR, 1)} through {RISK_DRIFT.to}, while underlying coding growth raises it by about {pct(RISK_TREND_FACTOR - 1, 1)}, leaving the average plan about where it started. Those are industry averages. With the model changes and no coding growth, this score would be {rate(b.rev.pay24.risk * RISK_MODEL_FACTOR, 3)}. Switch to 1.0 or enter your own above.</p>}
        {v.bonusGapPmpm != null && <p className="t-label mt-4 max-w-3xl" data-testid="bonus-gap">{b.rev.share5 > 0.9995 ? <>Every contract here is already at 4 stars or more, so the full quality bonus is being earned.</> : <>Not in any total: the quality bonus these members are not earning. If every contract here reached 4 stars, the benchmark would be <b className="text-ink">{pmpm(v.bonusGapPmpm)}</b> higher per member per month, <b className="text-ink">{money(v.bonusGapPerYear ?? 0)}</b> a year for {fmtInt(members)} members. Plan All-Cause Readmissions is one of the Star Ratings measures, so fewer readmissions help, but this data cannot say how much of a star they move.</>}{b.rev.starsNext != null ? <> The {uw?.stars?.next_rating_year} Star Ratings, which set {(uw?.stars?.next_rating_year ?? 0) + 1} payment, average <b className="text-ink">{b.rev.starsNext.toFixed(2)}★</b> for these members, with {pct(b.rev.share4Next)} in contracts at 4 stars or more.</> : null}</p>}
      </section>}

      <section className="panel panel-pad" data-testid="payer-reading">
        <h2 className="section-title">Reading the result</h2>
        <p className="t-body text-ink-2 mt-1 max-w-3xl">The baseline matters as much as the levers. CMS shows Original Medicare in this market at <b className="text-ink">{rate(b.ffs.ipStays, 0)}</b> admissions and <b className="text-ink">{rate(b.ffs.snfStays)}</b> SNF stays per 1,000, with SNF stays of {rate(b.ffs.snfDays / b.ffs.snfStays)} days. A typical Medicare Advantage plan here runs about <b className="text-ink">{rate(b.ma.ipStays, 0)}</b> admissions and <b className="text-ink">{rate(b.ma.snfStays)}</b> SNF stays, at {rate(b.ma.snfDays / b.ma.snfStays)} days a stay: it has already taken out {pct(1 - b.ma.snfDays / b.ffs.snfDays)} of the SNF days. A savings figure built on Original Medicare volumes describes a plan with no post-acute management; switch the utilization baseline above to see both.</p>
        <div className="overflow-x-auto mt-3"><table className="tbl max-w-2xl" data-testid="per-100k">
          <thead><tr><th>Per 100,000 members, per year{custom ? ', your edited case' : `, ${CASES.find(c => c.value === preset)!.label.toLowerCase()} case`}</th><th className="num">Dollars</th><th className="num">PMPM</th></tr></thead>
          <tbody>
            <tr><td>Readmissions</td><td className="num">{money(mine.readm)}</td><td className="num">{pmpm(mine.readm / 1.2e6)}</td></tr>
            <tr><td>Right level of care<span className="sub">SNF to home health, and rehab-hospital and long-term acute stays to SNF</span></td><td className="num">{money(mine.level)}</td><td className="num">{pmpm(mine.level / 1.2e6)}</td></tr>
            <tr><td>Stays and routing<span className="sub">shorter SNF stays, and inpatient days the plan pays per diem</span></td><td className="num">{money(mine.stays)}</td><td className="num">{pmpm(mine.stays / 1.2e6)}</td></tr>
            <tr><td>Utilization-management cost replaced</td><td className="num">{money(mine.um)}</td><td className="num">{pmpm(mine.um / 1.2e6)}</td></tr>
            <tr className="font-semibold"><td>Total</td><td className="num">{money(v.totalPmpm * 12 * 100000)}</td><td className="num">{pmpm(v.totalPmpm)}</td></tr>
          </tbody>
        </table></div>
        {v.routingPts != null && <div className="mt-4 max-w-3xl" data-testid="routing-evidence">
          <div className="card-label mb-1">How much of the readmission assumption can routing alone support?</div>
          <div className="overflow-x-auto"><table className="tbl tbl-compact min-w-[34rem]"><thead><tr><th>If Medicare SNF stays here moved from…</th><th className="num">Share of stays</th><th className="num">Rehospitalized today</th><th className="num">At the receiving SNFs</th><th className="num">Readmission points</th></tr></thead><tbody>
            <tr><td>SNFs rated below 4 stars to 4–5-star SNFs<span className="sub">{fmtInt(b.snf.nHigh)} of {fmtInt(b.snf.n)} nursing homes here are 4–5 stars</span></td><td className="num">{pct(b.snf.lowShare)}</td><td className="num">{rate(b.snf.rehospLow)}%</td><td className="num">{rate(b.snf.rehospHigh)}%</td><td className="num font-medium">{rate(v.routingPts, 2)}</td></tr>
            {v.routingPtsMeasure != null && <tr><td>SNFs with a worse-than-average rehospitalization rate to the better ones<span className="sub">ranked on the measure itself, whatever the star rating</span></td><td className="num">{pct(b.snf.worseShare)}</td><td className="num">{rate(b.snf.rehospWorse)}%</td><td className="num">{rate(b.snf.rehospBetter)}%</td><td className="num font-medium">{rate(v.routingPtsMeasure, 2)}</td></tr>}
          </tbody></table></div>
          <p className="t-caption mt-2">Points = SNF stays per inpatient stay × share of stays moved × the gap in CMS's risk-adjusted short-stay rehospitalization rate (QM 521), weighted by each SNF's Medicare stays. A ceiling for routing alone: it assumes every stay moves, and that the receiving SNFs have room and keep their published rates. It is not added to the total. The <Link to="/scenarios" className="text-accent hover:underline">Scenarios</Link> page tests routing hospital by hospital with capacity.</p>
        </div>}
      </section>

      <section className="panel panel-pad">
        <h2 className="section-title">Assumptions</h2>
        <p className="t-label mt-1 max-w-3xl">Nothing in this block comes from CMS. <b className="text-ink font-medium">Assumption</b> fields are the improvement Rondo delivers and change with the case; <b className="text-ink font-medium">Your number</b> fields are facts about the plan and stay put when you switch cases.</p>
        <div className="mt-4"><Fields fields={PAYER_FIELDS} a={a} limits={PAYER_LIMITS} set={setA} /></div>
      </section>

      <section className="panel panel-pad" data-testid="payer-baseline">
        <h2 className="section-title">Baseline for this market</h2>
        <p className="t-label mt-1 max-w-3xl">Per 1,000 beneficiaries per year, weighted by where these members live. {pct(b.coverage)} of the members live in counties where CMS publishes SNF use; the rest are left out of the averages rather than guessed.</p>
        <div className="overflow-x-auto mt-3"><table className="tbl tbl-compact">
          <thead><tr><th>Utilization</th><th className="num">Original Medicare here<span className="sub">{uw?.gv_year}</span></th><th className="num">United States<span className="sub">same method</span></th><th>Here against the US, after risk adjustment</th><th className="num">State MA ÷ Original Medicare<span className="sub">{uw?.ma_gv_year}</span></th><th className="num">Medicare Advantage here<span className="sub">modeled</span></th></tr></thead>
          <tbody>
            {([['Inpatient stays', b.ffs.ipStays, us?.ffs.ipStays, b.ratio.ipStays, b.ma.ipStays, 1], ['Inpatient days', b.ffs.ipDays, us?.ffs.ipDays, b.ratio.ipDays, b.ma.ipDays, 0], ['SNF stays', b.ffs.snfStays, us?.ffs.snfStays, b.ratio.snfStays, b.ma.snfStays, 1], ['SNF days', b.ffs.snfDays, us?.ffs.snfDays, b.ratio.snfDays, b.ma.snfDays, 0],
              ['Rehab-hospital (IRF) stays', b.ffs.irfStays, us?.ffs.irfStays, b.ffs.irfStays && b.ma.irfStays != null ? b.ma.irfStays / b.ffs.irfStays : null, b.ma.irfStays, 2], ['Long-term acute (LTCH) stays', b.ffs.ltchStays, us?.ffs.ltchStays, b.ffs.ltchStays && b.ma.ltchStays != null ? b.ma.ltchStays / b.ffs.ltchStays : null, b.ma.ltchStays, 2]] as [string, number | null, number | null | undefined, number | null, number | null, number][]).map(([k, f, usv, r, m, d]) => {
              const ad = adj(f, usv); return <tr key={k}><td>{k}</td><td className="num">{rate(f, d)}</td><td className="num">{rate(usv, d)}</td><td>{ad ? <Pill kind={ad.kind}>{ad.text}</Pill> : <span className="empty">–</span>}</td><td className="num">{r == null ? '–' : rate(r, 2)}</td><td className="num font-medium">{rate(m, d)}</td></tr> })}
            <tr><td>Home-health episodes</td><td className="num">{rate(b.ffs.hhEpisodes, 1)}</td><td className="num">{rate(us?.ffs.hhEpisodes, 1)}</td><td>{(() => { const ad = adj(b.ffs.hhEpisodes, us?.ffs.hhEpisodes); return ad ? <Pill kind="same">{ad.text}</Pill> : <span className="empty">–</span> })()}</td><td className="num empty">not published</td><td className="num empty">–</td></tr>
            <tr><td>30-day readmission rate</td><td className="num">{pct(b.ffs.readmRate, 1)}</td><td className="num">{pct(us?.ffs.readmRate, 1)}</td><td><span className="empty">–</span></td><td className="num empty">not published</td><td className="num empty">–</td></tr>
          </tbody>
        </table></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 mt-5">
          <div><div className="card-label mb-1">Prices · what Original Medicare paid here in {uw?.gv_year}</div><table className="tbl tbl-compact"><tbody>
            <Row2 k="Inpatient stay" v={usd0(b.price.ipPerStay)} sub={`${usd0(b.price.ipPerDay)} per day`} />
            <Row2 k="SNF day" v={usd0(b.price.snfPerDay)} sub={`a SNF stay costs ${usd0(v.snfCostPerStay)} at ${rate(u.snfDays / u.snfStays)} days (${a.basis === 'ffs' ? 'Original Medicare' : 'Medicare Advantage'} length of stay)`} />
            <Row2 k="Home-health episode" v={usd0(b.price.hhPerEpisode)} />
            <Row2 k="Rehab-hospital (IRF) stay" v={usd0(b.price.irfPerStay)} />
            <Row2 k="Long-term acute (LTCH) stay" v={usd0(b.price.ltchPerStay)} />
          </tbody></table></div>
          <div><div className="card-label mb-1">Benchmark and acuity in these counties</div><table className="tbl tbl-compact"><tbody>
            <Row2 k={`County benchmark, ${uw?.ratebook_year}`} v={b.benchmark.r0 == null ? '–' : `${usd0(b.benchmark.r0)} PMPM`} sub={b.benchmark.r5 == null ? undefined : `${usd0(b.benchmark.r35)} at the 3.5% bonus · ${usd0(b.benchmark.r5)} at 5%`} />
            <Row2 k="Original Medicare total cost" v={`${usd0(b.ffs.totalPc / 12)} PMPM`} sub={`${usd0(b.ffs.totalPc)} per beneficiary per year, ${uw?.gv_year}`} />
            <Row2 k="Average risk score, Original Medicare" v={rate(b.ffsRisk, 3)} sub={`United States ${rate(us?.ffsRisk, 3)} · CMS Shared Savings Program county file, ${uw?.mssp_year}`} />
            <Row2 k="Medicare Advantage enrollment here" v={fmtInt(b.areaMa)} sub={`all plans, ${uw?.enrollment_month}`} />
          </tbody></table></div>
        </div>
        <p className="t-caption mt-4 max-w-3xl">The risk-adjusted comparison divides this market's rate by its risk score relative to the national one before comparing with the US: red means more use than acuity explains, which is where a plan has the most to gain. The Medicare Advantage column is a model, not an observation: CMS publishes Medicare Advantage utilization only by state, so each county's Original Medicare rate is multiplied by its state's ratio. Sources and math are on the <Link to="/about#value" className="text-accent hover:underline">Methods</Link> page.</p>
      </section>
    </>
  )
}

// ================================================================== HOSPITAL
const HOSPITAL_LIMITS: Limits<HospitalAssumptions> = { daysSaved: [0, 5], placements: [0, 1e6], variableShare: [0, 100], backfill: [0, 100], penaltyRecovered: [0, 100], vbpRecovered: [0, 100], atRiskShare: [0, 100], readmPts: [0, 10], hoursSaved: [0, 10], hourly: [0, 500] }
const HOSPITAL_FIELDS: Field<HospitalAssumptions>[] = [
  { key: 'daysSaved', label: 'Days saved per SNF-bound discharge', unit: 'days', tag: 'Assumption', help: 'Days a patient who is ready to leave waits for a SNF bed.' },
  { key: 'backfill', label: 'Freed days that are filled by another patient', unit: '% of days', tag: 'Assumption', help: 'A filled day earns a day of inpatient revenue; an unfilled one only saves its variable cost.' },
  { key: 'penaltyRecovered', label: 'Readmission penalty removed', unit: '% of today\'s penalty', tag: 'Assumption', help: 'Applied to the hospital\'s actual FY 2027 penalty in the baseline below.' },
  { key: 'vbpRecovered', label: 'Value-based purchasing withhold earned on top of today', unit: '% of the 2%', tag: 'Assumption', help: 'CMS withholds 2% of DRG payments and pays it back by performance.' },
  { key: 'readmPts', label: 'Readmission rate, points removed', unit: 'points', tag: 'Assumption', help: 'Counted only on the at-risk discharges in the next field.' },
  { key: 'hoursSaved', label: 'Case-manager hours saved per placement', unit: 'hours', tag: 'Assumption' },
  { key: 'atRiskShare', label: 'Medicare discharges the hospital is at risk for', unit: '% of discharges', tag: 'Your number', help: 'ACO, bundled-payment or capitated patients. Under DRG payment a readmission is paid for, so avoiding one saves the hospital money only on these. 0 until you enter it.' },
  { key: 'placements', label: 'SNF-bound discharges per year, all payers', unit: 'discharges', tag: 'Your number', nullable: true, placeholder: 'modeled', help: 'Leave empty to use the modeled Medicare count in the baseline; enter the hospital\'s own number to include Medicaid and commercial.' },
  { key: 'variableShare', label: 'Share of a day\'s cost that is avoidable', unit: '% of cost', tag: 'Your number', help: 'Nursing, supplies and drugs go away with the day; the building does not.' },
  { key: 'hourly', label: 'Case-manager cost', unit: '$ per hour', tag: 'Your number' },
]
function HospitalTab({ geo, info }: { geo: Geo; info: GeoInfo | null }) {
  const [params, setParams] = useSearchParams()
  const ccns = useMemo(() => (params.get('h') ?? '').split(',').filter(c => /^\w{6}$/.test(c)).slice(0, 400), [params])
  const cs = useMemo(() => readCase(params, 'h', HOSPITAL_DEFAULTS, HOSPITAL_PRESETS, HOSPITAL_LIMITS), [params])
  const a = cs.a
  const [b, setB] = useState<HospitalBaseline | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { let live = true; setB(undefined); setError(null); hospitalBaseline(geo, ccns.length ? ccns : null).then(r => { if (live) setB(r) }).catch(e => { if (live) { setError(String(e?.message ?? e)); setB(null) } }); return () => { live = false } }, [geoParam(geo), ccns.join(',')])
  const setA = (k: string, v: number | null) => setParams(writeCase(params, 'h', cs.preset, { ...cs.ov, [k]: v }), { replace: true })
  const pickCase = (p: Preset) => setParams(writeCase(params, 'h', p, cs.facts), { replace: true })
  const uw = useReference()?.meta.underwriting
  const v = b ? hospitalValue(b, a) : null
  const cases = b ? Object.fromEntries(CASES.map(c => [c.value, hospitalValue(b, { ...HOSPITAL_DEFAULTS, ...HOSPITAL_PRESETS[c.value], ...cs.facts })])) as Record<Preset, ReturnType<typeof hospitalValue>> : null
  const who = ccns.length ? (b && b.n === 1 ? titleCase(b.names[0] ?? 'this hospital') : `${b?.n ?? ccns.length} chosen hospitals`) : `all ${b ? fmtInt(b.n) : ''} hospitals in ${info?.inLabel ?? 'this market'}`
  return (
    <div className="stack">
      <section className="panel panel-pad">
        <h2 className="section-title">Which hospitals</h2>
        <div className="mt-3 max-w-2xl"><HospitalPicker selected={ccns} onChange={c => { const p = new URLSearchParams(params); if (c.length) p.set('h', c.join(',')); else p.delete('h'); setParams(p, { replace: true }) }} /></div>
        <div className="fhelp">Pick one hospital or a whole system. With nothing picked, the model covers every hospital in the market chosen above.</div>
      </section>
      {error && <Empty title="The hospital model could not be run.">{error}</Empty>}
      {b === undefined && !error && <div className="panel panel-pad t-label">Loading cost reports…</div>}
      {b === null && !error && <Empty title="No cost report for this selection.">CMS has no usable fiscal-year 2024 cost report for {ccns.length ? 'the chosen hospitals' : 'hospitals in this market'}: none was filed, or its figures are out of range (occupancy above 105%, or a cost per day outside $300–$20,000). Pick another hospital or a larger market.</Empty>}
      {b && v && cases && (
        <>
          <section className="panel panel-pad" data-testid="hospital-result">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><h2 className="section-title">What it is worth to the hospital</h2><div className="ml-auto"><CaseBar preset={cs.preset} custom={cs.custom} onPick={pickCase} /></div></div>
            <p className="t-lead mt-2">For {who}: about <b data-testid="hospital-total">{money(v.totalPerYear)}</b> a year{cs.custom ? ' on your edited assumptions' : ` in the ${CASES.find(c => c.value === cs.preset)!.label.toLowerCase()} case`}, from <b>{money(cases.min.totalPerYear)}</b> (minimum) to <b>{money(cases.stretch.totalPerYear)}</b> (stretch), on <b>{fmtInt(Math.round(v.placements))}</b> SNF-bound discharges a year{a.placements == null ? ' (Medicare only, modeled)' : ' (your number)'}.</p>
            <div className="mt-4">
              <StatRow source="Modeled" cols={4} note="volumes, costs and penalties are CMS figures; every improvement is an assumption set below">
                <Stat label="Per year" value={money(v.totalPerYear)} note={`minimum ${money(cases.min.totalPerYear)} · stretch ${money(cases.stretch.totalPerYear)}`} how="The sum of the levers in the table below." />
                <Stat label="Per SNF-bound discharge" value={usd0(v.perPlacement)} note={`${fmtInt(Math.round(v.placements))} discharges a year`} how="Value per year ÷ SNF-bound discharges." />
                <Stat label="Bed-days freed" value={fmtInt(Math.round(v.daysFreed))} unit="a year" note={`${rate(v.daysFreed / 365, 1)} beds · each freed day worth ${usd0(v.valuePerDay)}`} how={`Discharges × days saved. A freed day is worth (1 − backfill) × variable share × cost per day + backfill × (revenue per day − variable share × cost per day) = ${usd0(v.valuePerDay)}.`} />
                <Stat label="Readmission penalty today" value={b.nHrrp === 0 ? '–' : money(b.hrrpPenalty)} unit={b.nHrrp === 0 ? undefined : 'a year'} note={b.nHrrp === 0 ? 'exempt: not in the CMS penalty table' : `${fmtInt(b.nPenalized)} of ${fmtInt(b.nHrrp)} ${b.nHrrp === 1 ? 'hospital' : 'hospitals'} penalized · cap ${money(v.hrrpMax)}`} verdict={b.nHrrp === 0 ? null : b.hrrpPenalty > 0 ? { kind: 'worse', text: `${pct(b.hrrpPenalty / b.drgHrrp, 2)} of DRG payments` } : { kind: 'better', text: 'no penalty' }} how="Each hospital's Medicare DRG payments (cost report, annualized) × (1 − its FY 2027 payment adjustment factor from the IPPS final rule, Table 15). CMS caps the reduction at 3%. Maryland hospitals are exempt and not in the table." />
              </StatRow>
            </div>
            {v.modeledPlacements < 0.5 && a.placements == null && <p className="t-label mt-3 max-w-3xl" data-testid="no-placements"><Pill kind="worse">Needs your number</Pill> CMS publishes no SNF use for {b.n === 1 ? 'this hospital\'s county' : 'these counties'}, so SNF-bound discharges cannot be modeled and the levers that depend on them are zero. Enter the hospital's own count under Assumptions.</p>}
            <div className="mt-5"><LeverTable cases={{ min: cases.min.levers, base: cases.base.levers, stretch: cases.stretch.levers }} yours={v.levers} preset={cs.preset} custom={cs.custom} get={l => l.perYear} fmtv={money} unitHead="dollars per year" /></div>
          </section>
          <section className="panel panel-pad"><h2 className="section-title">Assumptions</h2><p className="t-label mt-1 max-w-3xl">Nothing in this block comes from CMS. <b className="text-ink font-medium">Assumption</b> fields are the improvement Rondo delivers and change with the case; <b className="text-ink font-medium">Your number</b> fields are facts about the hospital.</p><div className="mt-4"><Fields fields={HOSPITAL_FIELDS} a={a} limits={HOSPITAL_LIMITS} set={setA} /></div></section>
          <section className="panel panel-pad" data-testid="hospital-baseline">
            <h2 className="section-title">Baseline <span className="t-caption font-normal ml-1">{b.n === 1 ? titleCase(b.names[0] ?? '') : `${fmtInt(b.n)} hospitals${b.names.length ? `, largest: ${b.names.slice(0, 3).map(titleCase).join(' · ')}` : ''}`}</span></h2>
            {b.nNoCostReport > 0 && <p className="t-label mt-1">{fmtInt(b.nNoCostReport)} of the {fmtInt(b.n)} have no usable fiscal-year 2024 cost report (none filed, or its figures are out of range) and add nothing to the figures below.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 mt-3">
              <div><div className="card-label mb-1">Volume</div><table className="tbl tbl-compact"><tbody>
                <Row2 k="Inpatient discharges, all payers" v={fmtInt(Math.round(b.dischargesTotal))} sub="cost report, fiscal year 2024, annualized" />
                <Row2 k="Original Medicare discharges" v={fmtInt(Math.round(b.dischargesFfs))} sub="cost report (Title XVIII)" />
                <Row2 k="Medicare Advantage discharges" v={fmtInt(Math.round(b.maDischarges))} sub="modeled: Original Medicare discharges × the county's MA-to-Original Medicare enrollment × the state's MA inpatient ratio" />
                <Row2 k="SNF-bound discharges, Medicare" v={fmtInt(Math.round(b.placementsFfs + b.placementsMa))} sub={`modeled: ${fmtInt(Math.round(b.placementsFfs))} Original Medicare + ${fmtInt(Math.round(b.placementsMa))} Medicare Advantage · MedPAC's national share of discharges that go to a SNF (18.7%), scaled by this county's SNF use per hospital stay against the nation's`} />
                <Row2 k="Occupancy" v={pct(v.occupancy)} sub={`${fmtInt(Math.round(b.beds))} beds · average stay ${rate(v.alos)} days`} />
              </tbody></table></div>
              <div><div className="card-label mb-1">Money</div><table className="tbl tbl-compact"><tbody>
                <Row2 k="Inpatient cost per day" v={usd0(b.costPerDay)} sub="derived: inpatient charges × cost-to-charge ratio ÷ inpatient days (operating expense share when no ratio is reported)" />
                <Row2 k="Inpatient revenue per day" v={usd0(b.revPerDay)} sub="derived: net patient revenue × inpatient share of charges ÷ inpatient days" />
                <Row2 k="Medicare DRG payments" v={money(b.drgPayments)} sub={`cost report, annualized · ${usd0(b.paymentPerStay)} per Original Medicare stay`} />
                <Row2 k="Readmission penalty, FY 2027" v={b.nHrrp ? money(b.hrrpPenalty) : '–'} sub={b.nHrrp ? `IPPS final rule Table 15 · ${fmtInt(b.nPenalized)} of ${fmtInt(b.nHrrp)} penalized` : 'not in Table 15 (Maryland and non-IPPS hospitals are exempt)'} />
                <Row2 k="Value-based purchasing, net of the 2% withhold" v={b.nVbp ? `${b.vbpNet >= 0 ? '+' : '−'}${money(Math.abs(b.vbpNet))}` : '–'} sub={b.nVbp ? `proxy FY 2027 factors (Table 16A), ${fmtInt(b.nVbp)} ${b.nVbp === 1 ? 'hospital' : 'hospitals'} · the withhold itself is ${money(v.vbpWithhold)}` : 'not in Table 16A'} />
              </tbody></table></div>
            </div>
            <p className="t-caption mt-4 max-w-3xl">Cost reports are {uw?.hospital_cost?.ccns ? `${fmtInt(uw.hospital_cost.ccns)} hospitals' ` : ''}fiscal-year 2024 filings (CMS Hospital Provider Cost Report); a filing shorter than a year is scaled to 365 days. CMS does not publish how many patients a hospital sends to a SNF, so SNF-bound discharges are modeled: the hospital's Medicare discharges × 18.7% (MedPAC's national share, the same figure the Scenarios page uses) × how this county's SNF stays per inpatient stay compare with the nation's. Replace it with the hospital's own count above. A cost report is left out, not adjusted, when its occupancy is above 105% or its cost per day falls outside $300–$20,000.</p>
          </section>
        </>
      )}
    </div>
  )
}

// ================================================================== SNF
const SNF_LIMITS: Limits<SnfAssumptions> = { fill: [0, 100], medicareShare: [0, 100], maPriceFactor: [30, 150], medicaidRate: [0, 2000], variableShare: [0, 100], hoursSaved: [0, 10], hourly: [0, 500] }
const SNF_FIELDS: Field<SnfAssumptions>[] = [
  { key: 'fill', label: 'Empty bed-days filled by preferred referrals', unit: '% of empty days', tag: 'Assumption' },
  { key: 'medicareShare', label: 'Of those added days, Medicare or Medicare Advantage', unit: '% of added days', tag: 'Assumption', help: 'The rest are priced as Medicaid or dual-eligible days.' },
  { key: 'hoursSaved', label: 'Intake hours saved per admission', unit: 'hours', tag: 'Assumption' },
  { key: 'maPriceFactor', label: 'Payment for the added Medicare days', unit: '% of Part A per day', tag: 'Your number', help: '100 prices them at the facility\'s own Medicare Part A revenue per day. Medicare Advantage contracts are often lower.' },
  { key: 'medicaidRate', label: 'Medicaid payment per day', unit: '$ per day', tag: 'Your number', nullable: true, placeholder: 'auto', help: 'Leave empty to use the facility\'s own average revenue per non-Medicare day from its cost report.' },
  { key: 'variableShare', label: 'Share of cost per day an added day really adds', unit: '% of cost', tag: 'Your number', help: 'Nursing, food and supplies rise with a filled bed; the building and most overhead do not.' },
  { key: 'hourly', label: 'Intake staff cost', unit: '$ per hour', tag: 'Your number' },
]
function SnfTab({ geo, info }: { geo: Geo; info: GeoInfo | null }) {
  const [params, setParams] = useSearchParams()
  const ccns = useMemo(() => (params.get('snf') ?? '').split(',').filter(c => /^\w{6}$/.test(c)).slice(0, 200), [params])
  const chain = params.get('chain'); const tier = params.get('tier') !== 'all'   // default: the 4-5-star facilities, the set a preferred network would be drawn from
  const cs = useMemo(() => readCase(params, 's', SNF_DEFAULTS, SNF_PRESETS, SNF_LIMITS), [params])
  const a = cs.a
  const [mode, setMode] = useState<'snf' | 'chain'>(chain ? 'chain' : 'snf')
  const [text, setText] = useState(''); const [snfs, setSnfs] = useState<SnfLite[]>([]); const [chains, setChains] = useState<{ chain: string; n: number }[]>([]); const [chosen, setChosen] = useState<SnfLite[]>([])
  const [b, setB] = useState<SnfBaseline | null | undefined>(undefined); const [market, setMarket] = useState<SnfTier[]>([]); const [error, setError] = useState<string | null>(null); const [note, setNote] = useState<string | null>(null)
  const patch = (f: (p: URLSearchParams) => void) => { const p = new URLSearchParams(params); f(p); setParams(p, { replace: true }) }
  useEffect(() => { let live = true; snfsByCcn(ccns).then(r => { if (live) setChosen(r) }); return () => { live = false } }, [ccns.join(',')])
  useEffect(() => { let live = true; const t = setTimeout(() => { if (mode === 'snf') searchSnfs(geo, text).then(r => { if (live) setSnfs(r) }); else chainsIn(geo, text).then(r => { if (live) setChains(r) }) }, 200); return () => { live = false; clearTimeout(t) } }, [text, mode, geoParam(geo)])
  useEffect(() => { let live = true; setB(undefined); setError(null); snfBaseline(geo, ccns.length ? ccns : null, chain, tier && !chain).then(r => { if (live) setB(r) }).catch(e => { if (live) { setError(String(e?.message ?? e)); setB(null) } }); return () => { live = false } }, [geoParam(geo), ccns.join(','), chain, tier])
  useEffect(() => { setNote(null); if (ccns.length !== 1 || b !== null) return; let live = true; snfCostNote(ccns[0]).then(t => { if (live) setNote(t) }).catch(() => {}); return () => { live = false } }, [b, ccns.join(',')])
  useEffect(() => { let live = true; snfMarket(geo).then(r => { if (live) setMarket(r) }).catch(() => {}); return () => { live = false } }, [geoParam(geo)])
  const setA = (k: string, v: number | null) => setParams(writeCase(params, 's', cs.preset, { ...cs.ov, [k]: v }), { replace: true })
  const pickCase = (p: Preset) => setParams(writeCase(params, 's', p, cs.facts), { replace: true })
  const v = b ? snfValue(b, a) : null
  const cases = b ? Object.fromEntries(CASES.map(c => [c.value, snfValue(b, { ...SNF_DEFAULTS, ...SNF_PRESETS[c.value], ...cs.facts })])) as Record<Preset, ReturnType<typeof snfValue>> : null
  const who = ccns.length ? (chosen.length === 1 ? titleCase(chosen[0].provider_name) : `${ccns.length} chosen SNFs`) : chain ? `${titleCase(chain)} in ${info?.inLabel ?? 'this market'}` : `${tier ? '4–5-star' : 'all'} nursing homes in ${info?.inLabel ?? 'this market'}`
  const TIER = { high: '4–5 stars', mid: '3 stars', low: '1–2 stars' } as const
  return (
    <div className="stack">
      <section className="panel panel-pad">
        <h2 className="section-title">Which SNFs</h2>
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
          <div>
            <div className="mb-1.5 w-full sm:w-72"><Segmented value={mode} onChange={m => { setMode(m); setText('') }} ariaLabel="Pick by" options={[{ value: 'snf', label: 'One SNF' }, { value: 'chain', label: 'A chain' }]} /></div>
            <input className="control w-full" value={text} onChange={e => setText(e.target.value)} placeholder={mode === 'snf' ? 'SNF name or CCN, within this market' : 'Chain name, within this market'} aria-label={mode === 'snf' ? 'Find a SNF' : 'Find a chain'} />
            {(mode === 'snf' ? text.trim() !== '' : true) && (
              <ul className="mt-1 max-h-56 overflow-auto rounded-[8px] border border-hairline" data-testid="snf-results">
                {mode === 'snf' && snfs.length === 0 && <li className="px-3 py-2 t-label">No SNF in this market matches.</li>}
                {mode === 'snf' && snfs.map(s => <li key={s.ccn}><button className="press w-full text-left px-3 py-1.5 hover:bg-paper" onClick={() => { patch(p => { p.set('snf', [...new Set([...ccns, s.ccn])].join(',')); p.delete('chain') }); setText('') }}><span className="text-sm text-ink">{titleCase(s.provider_name)}</span><span className="text-[11px] text-ink-3 ml-2">{titleCase(s.city_town)}, {s.state}{s.overall_rating != null ? ` · ${s.overall_rating}★` : ''}</span></button></li>)}
                {mode === 'chain' && chains.length === 0 && <li className="px-3 py-2 t-label">No chain in this market matches.</li>}
                {mode === 'chain' && chains.map(c => <li key={c.chain}><button className="press w-full text-left px-3 py-1.5 hover:bg-paper" onClick={() => { patch(p => { p.set('chain', c.chain); p.delete('snf') }); setText('') }}><span className="text-sm text-ink">{titleCase(c.chain)}</span><span className="text-[11px] text-ink-3 ml-2">{c.n} here</span></button></li>)}
              </ul>
            )}
          </div>
          <div>
            <div className="flabel">Sizing for</div>
            <div className="flex flex-wrap gap-1.5">
              {chosen.map(s => <Chip key={s.ccn} onRemove={() => patch(p => { const r = ccns.filter(c => c !== s.ccn); if (r.length) p.set('snf', r.join(',')); else p.delete('snf') })}>{titleCase(s.provider_name)}</Chip>)}
              {chain && !ccns.length && <Chip onRemove={() => patch(p => p.delete('chain'))}>{titleCase(chain)}</Chip>}
              {!ccns.length && !chain && <Chip>{tier ? '4–5-star' : 'All'} nursing homes in {info?.inLabel ?? 'this market'}</Chip>}
            </div>
            {!ccns.length && !chain && <div className="mt-3 w-full sm:w-72"><Segmented value={tier ? 'high' : 'all'} onChange={t => patch(p => { if (t === 'all') p.set('tier', 'all'); else p.delete('tier') })} ariaLabel="Star tier" options={[{ value: 'high', label: '4–5 stars' }, { value: 'all', label: 'All ratings' }]} /></div>}
            <div className="fhelp">With nothing picked, the model covers the 4–5-star nursing homes in the market chosen above: the set a preferred network is drawn from.</div>
          </div>
        </div>
      </section>
      {error && <Empty title="The SNF model could not be run.">{error}</Empty>}
      {b === undefined && !error && <div className="panel panel-pad t-label">Loading cost reports…</div>}
      {b === null && !error && <Empty title="No cost report for this selection.">{ccns.length === 1 && note ? note : `CMS has no usable fiscal-year 2024 cost report for ${who}.`} The model leaves such reports out instead of adjusting them. Pick another SNF or a larger market.</Empty>}
      {b && v && cases && (
        <>
          <section className="panel panel-pad" data-testid="snf-result">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><h2 className="section-title">What it is worth to the SNF</h2><div className="ml-auto"><CaseBar preset={cs.preset} custom={cs.custom} onPick={pickCase} /></div></div>
            <p className="t-lead mt-2">For {who}: about <b data-testid="snf-total">{money(v.totalPerYear)}</b> a year{cs.custom ? ' on your edited assumptions' : ` in the ${CASES.find(c => c.value === cs.preset)!.label.toLowerCase()} case`}, from <b>{money(cases.min.totalPerYear)}</b> (minimum) to <b>{money(cases.stretch.totalPerYear)}</b> (stretch). Occupancy is <b>{pct(v.occupancy)}</b> today; filling {a.fill}% of the empty bed-days takes it to <b>{pct((b.daysTotal + v.addedDays) / b.bedDays)}</b>.</p>
            <div className="mt-4">
              <StatRow source="Modeled" cols={4} note="days, revenue and cost are from each facility's CMS cost report; fill, mix and hours are assumptions set below">
                <Stat label="Per year" value={money(v.totalPerYear)} note={`minimum ${money(cases.min.totalPerYear)} · stretch ${money(cases.stretch.totalPerYear)}`} how="The sum of the two levers in the table below." />
                <Stat label="Per bed" value={usd0(v.perBed)} unit="a year" note={`${fmtInt(Math.round(b.beds))} beds in ${fmtInt(b.n - b.nNoCostReport)} ${b.n - b.nNoCostReport === 1 ? 'facility' : 'facilities'}`} how="Value per year ÷ beds reported on the cost reports." />
                <Stat label="Added patient days" value={fmtInt(Math.round(v.addedDays))} unit="a year" note={`${fmtInt(Math.round(v.addedMedicareDays))} Medicare or MA · ${fmtInt(Math.round(v.addedMedicaidDays))} Medicaid or other`} how="Empty bed-days (bed-days available − patient days, cost report) × the fill assumption, split by the Medicare share assumption." />
                <Stat label="Medicaid days one Medicare day carries" value={v.medicaidDaysCarried == null ? '–' : rate(v.medicaidDaysCarried, 1)} note={v.medicareMarginPerDay == null || v.medicaidGapPerDay == null ? 'not enough cost-report detail' : v.medicaidGapPerDay <= 0 ? 'Medicaid covers full cost here' : v.medicareMarginPerDay <= 0 ? 'Medicare does not cover full cost here' : `per day at full cost: Medicare +${usd0(v.medicareMarginPerDay)}, Medicaid \u2212\u2060${usd0(v.medicaidGapPerDay)}`} how="At full cost per day (operating expense ÷ patient days): Medicare margin per day = Medicare Part A revenue per day × your payment factor − cost per day; Medicaid shortfall per day = cost per day − Medicaid revenue per day. The ratio is how many Medicaid days one Medicare day pays for. It is the exchange rate behind asking a SNF to take dual-eligible patients alongside Medicare ones." />
              </StatRow>
            </div>
            <div className="mt-5"><LeverTable cases={{ min: cases.min.levers, base: cases.base.levers, stretch: cases.stretch.levers }} yours={v.levers} preset={cs.preset} custom={cs.custom} get={l => l.perYear} fmtv={money} unitHead="dollars per year" /></div>
            <p className="t-label mt-4 max-w-3xl" data-testid="snf-zero-sum">{!ccns.length && !chain && !tier ? <><Pill kind="worse">Read with care</Pill> </> : null}Placement moves patients between SNFs; it does not create them. What these facilities gain in filled beds, other facilities in the market give up, so this figure makes sense for one SNF, a chain or a preferred set, not as a total for every SNF in a market. The payer levers also shorten SNF stays, so a preferred SNF needs more admissions to keep the same beds full; that offset is not netted here.</p>
          </section>
          <section className="panel panel-pad"><h2 className="section-title">Assumptions</h2><p className="t-label mt-1 max-w-3xl">Nothing in this block comes from CMS. <b className="text-ink font-medium">Assumption</b> fields are what Rondo delivers and change with the case; <b className="text-ink font-medium">Your number</b> fields are facts about the facility.</p><div className="mt-4"><Fields fields={SNF_FIELDS} a={a} limits={SNF_LIMITS} set={setA} /></div></section>
          <section className="panel panel-pad" data-testid="snf-baseline">
            <h2 className="section-title">Baseline <span className="t-caption font-normal ml-1">{b.n === 1 ? titleCase(b.names[0] ?? '') : `${fmtInt(b.n)} facilities${b.avgStars != null ? ` · average rating ${b.avgStars.toFixed(1)}★` : ''}`}</span></h2>
            {b.nNoCostReport > 0 && <p className="t-label mt-1">{fmtInt(b.nNoCostReport)} of the {fmtInt(b.n)} have no usable fiscal-year 2024 cost report (none filed, or its figures are out of range) and add nothing to the figures below.</p>}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-4 mt-3">
              <div><div className="card-label mb-1">Beds and days</div><table className="tbl tbl-compact"><tbody>
                <Row2 k="Occupancy" v={pct(v.occupancy)} sub={`${fmtInt(Math.round(b.daysTotal))} patient days of ${fmtInt(Math.round(b.bedDays))} available · ${fmtInt(Math.round(v.emptyBedDays))} empty`} />
                <Row2 k="Original Medicare days" v={pct(v.mix.medicare)} sub="Title XVIII; Medicare Advantage days are reported under other" />
                <Row2 k="Medicaid days" v={v.mix.medicaid == null ? '–' : pct(v.mix.medicaid)} sub="Title XIX; some states' managed Medicaid days are reported under other" />
                <Row2 k="Other days" v={pct(v.mix.other)} sub="Medicare Advantage, private pay, managed Medicaid, other" />
                <Row2 k="Admissions" v={fmtInt(Math.round(b.admissions))} sub="total discharges on the cost report, annualized" />
              </tbody></table></div>
              <div><div className="card-label mb-1">Per patient day</div><table className="tbl tbl-compact"><tbody>
                <Row2 k="Revenue, all payers" v={usd0(v.revPerDay)} sub="net patient revenue ÷ patient days" />
                <Row2 k="Operating cost" v={usd0(v.opexPerDay)} sub="operating expense ÷ patient days" />
                <Row2 k="Medicare Part A revenue per Medicare day" v={usd0(v.medicareRevPerDay)} sub="inpatient PPS amount ÷ Title XVIII days" />
                <Row2 k="Revenue per non-Medicare day" v={usd0(v.nonMedicareRevPerDay)} sub="derived: (net patient revenue − Part A) ÷ other days · the default Medicaid rate" />
              </tbody></table></div>
            </div>
            {market.some(t => t.n > 0) && <div className="mt-5 max-w-2xl" data-testid="snf-market"><div className="card-label mb-1">Are the better SNFs fuller in {info?.inLabel ?? 'this market'}?</div><div className="overflow-x-auto"><table className="tbl tbl-compact min-w-[26rem]"><thead><tr><th>Overall rating</th><th className="num">Facilities with a cost report</th><th className="num">Occupancy</th><th className="num">Original Medicare share of days</th></tr></thead><tbody>{market.map(t => <tr key={t.tier}><td>{TIER[t.tier]}</td><td className="num">{fmtInt(t.n)}</td><td className="num font-medium">{pct(t.occupancy)}</td><td className="num">{pct(t.medicareShare)}</td></tr>)}</tbody></table></div></div>}
            <p className="t-caption mt-4 max-w-3xl">Cost reports are fiscal-year 2024 filings (CMS Skilled Nursing Facility Cost Report); a filing shorter than a year is scaled to 365 days. A report is left out, not adjusted, when its occupancy is outside 10–102%, its operating expense is more than twice or less than half its patient revenue, or it has no Medicare Part A revenue. The fill lever counts contribution after variable cost, because a bed that is already staffed costs less to fill than the average day; the "Medicaid days one Medicare day carries" figure is at full cost, because that is the test for whether a payer mix is sustainable.</p>
          </section>
        </>
      )}
    </div>
  )
}

// ================================================================== page
type Tab = 'payer' | 'hospital' | 'snf'
export default function Value() {
  const [params, setParams] = useSearchParams()
  const geo = useMemo(() => parseGeo(params.get('geo')), [params])
  const t = params.get('tab'); const tab: Tab = t === 'hospital' || t === 'snf' ? t : 'payer'
  const [info, setInfo] = useState<GeoInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { let live = true; setInfo(null); geoInfo(geo).then(r => { if (live) setInfo(r) }).catch(e => { if (live) setError(String(e?.message ?? e)) }); return () => { live = false } }, [geoParam(geo)])
  const patch = (f: (p: URLSearchParams) => void) => { const p = new URLSearchParams(params); f(p); setParams(p, { replace: true }) }
  return (
    <div className="page">
      <h1>Value</h1>
      <p className="t-body text-ink-2 mt-2 max-w-3xl">What better placement between hospital and post-acute care is worth to each party in a market: the health plan, the hospital, and the SNF. Every baseline is a CMS figure for the market and organization you choose; every improvement is an assumption you can see and change, with a minimum, a base and a stretch case.</p>
      <div className="stack mt-5">
        <section className="panel panel-pad">
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-x-8 gap-y-4 items-start">
            <GeoPicker geo={geo} info={info} onPick={p => patch(q2 => { if (p === 'US') q2.delete('geo'); else q2.set('geo', p); q2.delete('pm') })} />
            <div><div className="flabel">Value for</div><div className="w-full sm:w-80"><Segmented value={tab} onChange={v => patch(p => { if (v === 'payer') p.delete('tab'); else p.set('tab', v) })} ariaLabel="Value for" options={[{ value: 'payer', label: 'Payer' }, { value: 'hospital', label: 'Hospital' }, { value: 'snf', label: 'SNF' }]} /></div></div>
          </div>
        </section>
        {error ? <Empty title="The market data could not be loaded.">{error}</Empty> : info && info.counties === 0 ? <Empty title="That market is not in the data."><span>The link names a metro area or state this tool has no counties for. </span><button className="text-accent hover:underline" onClick={() => patch(p => p.delete('geo'))}>Show the United States</button></Empty> : tab === 'payer' ? <PayerTab geo={geo} info={info} /> : tab === 'hospital' ? <HospitalTab geo={geo} info={info} /> : <SnfTab geo={geo} info={info} />}
      </div>
    </div>
  )
}
