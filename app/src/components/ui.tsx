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
  const cls = { sm: 'h-4 min-w-7 text-[11px]', md: 'h-6 min-w-9 text-xs', lg: 'h-8 min-w-12 text-sm' }[size]
  if (n == null || Number.isNaN(n)) return <span className={`inline-flex items-center justify-center rounded px-1 bg-well text-ink-3 ${cls}`} title={label ? `${label}: not rated` : 'Not rated'}>–</span>
  return <span className={`inline-flex items-center justify-center rounded px-1 font-semibold ${cls}`} style={{ background: `var(--color-q${Math.round(n)})`, color: starFg(n) }} title={`${label ? label + ': ' : ''}${n} of 5 stars (${tierWord(n)})`}>{n}</span>
}

const STRIP = [['overall_rating', 'Overall', 'overall'], ['health_inspection_rating', 'Health inspection', 'inspection'], ['qm_rating', 'Quality measures', 'quality'], ['staffing_rating', 'Staffing', 'staffing']] as const
/** The four CMS star ratings side by side, each captioned so the reader knows what it rates. */
export function QualityStrip({ row, size = 'sm', captions = true }: { row: Record<string, unknown>; size?: 'sm' | 'md'; captions?: boolean }) {
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

/** Footnote marker: small, text-first, meaning on hover and in the title. */
export function Fn({ code, ref }: { code: unknown; ref: Reference | null }) {
  if (code == null || code === '' || code === '-') return null
  const s = String(code)
  const meaning = s.split(',').map(c => ref?.footnotes[c.trim()]?.meaning ?? s).join(' / ')
  // focusable so keyboard and screen-reader users get the meaning, not just the code
  return <span tabIndex={0} role="note" aria-label={`CMS footnote ${s}: ${meaning}`} className="text-ink-3 text-[11px] ml-1 cursor-help underline decoration-dotted underline-offset-2" title={meaning}>{/^\d/.test(s) ? `fn ${s}` : s}</span>
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
