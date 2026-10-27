import { useEffect, useState, type ReactNode } from 'react'
import { onProgress } from '../lib/db'
import { getReference, type Reference } from '../lib/reference'

/** One star-rating cell on the quality ramp. Unrated renders as an empty well. */
/** Text color that reads on each rating tier's background. */
export const starFg = (n: number) => (n <= 2 || n === 5 ? '#fff' : 'var(--color-ink)')
export const tierWord = (n: number | null) => n == null ? 'not rated' : n <= 2 ? 'poor' : n === 3 ? 'average' : 'good'

/** One star-rating cell. Color says what the number means: red = 1–2 (poor), amber = 3 (average), green = 4–5 (good). */
export function Stars({ value, size = 'md', label }: { value: unknown; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const n = value == null ? null : Number(value)
  const cls = { sm: 'h-5 w-9 text-[11px]', md: 'h-6 w-9 text-xs', lg: 'h-8 min-w-12 text-sm' }[size]
  if (n == null || Number.isNaN(n)) return <span className={`inline-flex items-center justify-center rounded px-1 bg-well text-ink-3 ${cls}`} title={label ? `${label}: not rated` : 'Not rated'}>–</span>
  return <span className={`inline-flex items-center justify-center rounded px-1 font-semibold ${cls}`} style={{ background: `var(--color-q${Math.round(n)})`, color: starFg(n) }} title={`${label ? label + ': ' : ''}${n} of 5 stars (${tierWord(n)})`}>{n}</span>
}

const STRIP = [['overall_rating', 'Overall', 'overall'], ['health_inspection_rating', 'Health inspection', 'inspection'], ['qm_rating', 'Quality measures', 'quality'], ['staffing_rating', 'Staffing', 'staffing']] as const
/** Header text that names the four chips once, in order, instead of captioning every row. */
export const STRIP_HEADER = 'Stars: overall · inspection · quality · staffing'
/** Column header for the strip: one short label per chip, in fixed slots the same width as the chips, so each name sits over its rating. */
export function StripHeader({ title = 'Stars' }: { title?: string }) {
  return (
    <span className="inline-flex flex-col">
      <span>{title}</span>
      <span className="inline-flex gap-1 font-normal text-ink-3 text-[10px] leading-3 tracking-tight" aria-hidden>
        {['Overall', 'Inspect.', 'Quality', 'Staffing'].map(l => <span key={l} className="w-9 text-center">{l}</span>)}
      </span>
    </span>
  )
}
/** The four CMS star ratings side by side, always in the same order (overall, inspection, quality, staffing); the column header names them once. */
export function QualityStrip({ row, size = 'sm', captions = false }: { row: Record<string, unknown>; size?: 'sm' | 'md'; captions?: boolean }) {
  return (
    <span className="inline-flex gap-1" aria-label={STRIP.map(([k, l]) => `${l}: ${row[k] == null ? 'not rated' : row[k] + ' of 5'}`).join(', ')}>
      {STRIP.map(([k, l, c]) => (
        <span key={k} className="inline-flex flex-col items-center gap-px">
          <Stars value={row[k]} size={size} label={l} />
          {captions && <span className="text-[9px] leading-none text-ink-3" aria-hidden>{c}</span>}
        </span>
      ))}
    </span>
  )
}

/** Short reasons for the CMS footnote codes that appear on suppressed values (full sentence in the tooltip and on the Methodology page). */
const SHORT_FN: Record<string, string> = { '1': 'too new to rate', '2': 'not enough data to rate', '6': 'staffing data did not meet criteria', '7': 'suppressed by CMS', '9': 'too few residents to report', '10': 'data not submitted', '13': 'shorter period than required', '14': 'not required to report', '18': 'special focus facility, not rated', '20': 'CMS could not validate the data', '21': 'CMS could not validate the data', '22': 'address not matched to coordinates', '23': 'staffing data not submitted', '24': 'many days without an RN onsite', '25': 'CMS could not validate staffing data', '26': 'staffing data invalid for turnover', '27': 'staffing data did not meet criteria', '28': 'annual measure', '29': 'risk-based survey' }
/** Footnote marker: small, text-first, meaning on hover and in the title. */
export function Fn({ code, ref, compact = false }: { code: unknown; ref: Reference | null; compact?: boolean }) {
  if (code == null || code === '' || code === '-') return null
  const s = String(code)
  const meaning = s.split(',').map(c => ref?.footnotes[c.trim()]?.meaning ?? s).join(' / ')
  // focusable so keyboard and screen-reader users get the meaning, not just the code
  // Shown in words, never as a bare code: a short reason inline, the full CMS sentence on hover / for screen readers.
  const short = SHORT_FN[s.split(',')[0].trim()] ?? meaning
  // compact (table cells): a dash with the reason in the tooltip; full (cards, rows): the short reason in words
  return <span tabIndex={0} role="note" aria-label={`CMS footnote ${s}: ${meaning}`} className={`text-ink-3 cursor-help underline decoration-dotted underline-offset-2 whitespace-nowrap ${compact ? 'text-sm' : 'text-[11px] ml-1'}`} title={`${short} — CMS footnote ${s}: ${meaning}`}>{compact ? '—' : short}</span>
}

/** A rust-colored flag for enforcement facts. Text, not an icon. */
export function Flag({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--color-rust-soft)', color: 'var(--color-rust)' }}>{children}</span>
}

let refError: string | null = null
export function useReference() {
  const [ref, setRef] = useState<Reference | null>(null)
  const [, bump] = useState(0)
  useEffect(() => { getReference().then(setRef).catch(e => { refError = String(e?.message ?? e); bump(n => n + 1) }) }, [])
  return ref
}
/** Visible notice when the reference files (footnotes, averages, lineage) failed to load. */
export function ReferenceError() {
  return refError ? <div role="alert" className="mx-6 mt-4 px-4 py-2 rounded-[8px] bg-well text-sm text-ink">Reference data (footnote meanings, state and national averages) could not be loaded: {refError}. Facility values are unaffected; comparisons are hidden. Reload to retry.</div> : null
}

/** Gate that shows load progress the first time the database starts. */
export function LoadingGate({ ready, error }: { ready: boolean; error: string | null }) {
  const [msg, setMsg] = useState('Starting')
  useEffect(() => onProgress(setMsg), [])
  if (ready) return null
  return (
    <div className="flex flex-col items-start gap-2 p-8 text-ink-2">
      {error ? <>
        <div className="text-ink font-medium">The data could not be loaded.</div>
        <div className="text-sm">{error}</div>
        <div className="text-sm">Reload the page. If it keeps failing, the data files are missing from the deployment.</div>
      </> : <>
        <div className="text-sm">{msg}…</div>
        <div className="h-1 w-48 rounded bg-well overflow-hidden"><div className="h-full w-1/3 bg-ink-2 rounded" style={{ animation: 'slide 1.1s ease-in-out infinite' }} /></div>
        <style>{`@keyframes slide { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } } @media (prefers-reduced-motion: reduce) { div[style*="slide"] { animation: none } }`}</style>
        <div className="text-xs text-ink-3">Loads 14,690 facilities into a database that runs in your browser. Your filters and searches stay on your machine; only the optional place lookup contacts an outside service.</div>
      </>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="p-8 text-ink-2"><div className="text-ink font-medium mb-1">{title}</div><div className="text-sm">{children}</div></div>
}

export function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-[6px] bg-well p-0.5">
      {options.map(o => (
        <button key={o.value} role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`press px-3 py-1 text-sm rounded-[5px] ${value === o.value ? 'bg-surface text-ink here' : 'text-ink-2 hover:text-ink'}`}>{o.label}</button>
      ))}
    </div>
  )
}

/** Big-number card: value, unit, a one-line note, and a provenance tag with an expandable "how this is calculated". */
export type Source = 'CMS' | 'Modeled' | 'Derived' | 'Hospital-reported'
/** Big-number card on three fixed rows (label 32 · value 32 · note 32) so every card in a row shares the same baselines.
 *  No per-card footer: the source is stated once per row by StatRow; "How this is calculated" is the ⓘ button. */
export function Stat({ label, value, unit, note, how, tone, source }: { label: string; value: ReactNode; unit?: string; note?: ReactNode; source?: Source; how?: ReactNode; tone?: 'good' | 'mid' | 'bad' }) {
  const [open, setOpen] = useState(false)
  const bar = tone === 'good' ? 'var(--color-q5)' : tone === 'mid' ? '#dc6803' : tone === 'bad' ? 'var(--color-q2)' : 'transparent'
  void source
  return (
    <div className="panel relative p-4 grid gap-2 min-w-0" style={{ gridTemplateRows: '32px 32px 32px' }}>
      <div className="t-label line-clamp-2 pr-7" title={label}>{label}</div>
      {how && <button className="press absolute top-3 right-3 w-6 h-6 rounded-full text-ink-3 hover:text-ink hover:bg-well text-[12px] leading-6 text-center" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`How this is calculated: ${label}`} title="How this is calculated">i</button>}
      <div className="flex items-baseline gap-1.5 whitespace-nowrap overflow-hidden">
        <span className="t-display">{value}</span>
        {unit && <span className="t-body text-ink-2">{unit}</span>}
        {tone && <span className="ml-auto self-center h-1 w-8 rounded shrink-0" style={{ background: bar }} aria-hidden />}
      </div>
      <div className="t-label line-clamp-2">{note}</div>
      {open && how && <div className="absolute left-2 right-2 top-10 z-20 panel p-3 t-label" style={{ boxShadow: 'var(--shadow-float)' }} role="note" onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}><div className="t-label text-ink font-medium mb-1">How this is calculated</div>{how}<button className="press btn btn-quiet btn-sm mt-2" onClick={() => setOpen(false)}>Close</button></div>}
    </div>
  )
}
/** A row of Stat cards with the source stated once underneath. */
export function StatRow({ source, children, cols = 4, note }: { source: Source; children: ReactNode; cols?: 2 | 3 | 4 | 5; note?: ReactNode }) {
  const grid = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-2 md:grid-cols-4', 5: 'sm:grid-cols-3 md:grid-cols-5' }[cols]
  return (
    <div>
      <div className={`grid grid-cols-1 ${grid} gap-4`}>{children}</div>
      <div className="t-caption mt-2 flex items-center gap-1.5"><span className={`inline-block w-1.5 h-1.5 rounded-full ${source === 'Modeled' ? 'bg-accent' : 'bg-ink-3'}`} aria-hidden />Source: {source === 'CMS' ? 'CMS public files' : source === 'Modeled' ? 'modeled from CMS public files (see Methodology)' : source === 'Derived' ? 'derived from CMS public files' : 'hospital-reported upload'}{note ? <> · {note}</> : null}</div>
    </div>
  )
}
