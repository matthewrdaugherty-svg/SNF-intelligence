import { useEffect, useState, type ReactNode } from 'react'
import { onProgress } from '../lib/db'
import { getReference, type Reference } from '../lib/reference'

/** One star-rating cell on the quality ramp. Unrated renders as an empty well. */
export function Stars({ value, size = 'md', label }: { value: unknown; size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const n = value == null ? null : Number(value)
  const cls = { sm: 'h-4 min-w-7 text-[11px]', md: 'h-6 min-w-9 text-xs', lg: 'h-8 min-w-12 text-sm' }[size]
  if (n == null || Number.isNaN(n)) return <span className={`inline-flex items-center justify-center rounded px-1 bg-well text-ink-3 ${cls}`} title={label ? `${label}: not rated` : 'Not rated'}>–</span>
  const bg = `var(--color-q${Math.round(n)})`
  const fg = n >= 4 ? '#fff' : 'var(--color-ink)'
  return <span className={`inline-flex items-center justify-center rounded px-1 font-semibold ${cls}`} style={{ background: bg, color: fg }} title={label ? `${label}: ${n} of 5` : `${n} of 5`}>{n}</span>
}

/** The signature strip: overall · health inspection · quality measures · staffing. */
export function QualityStrip({ row, size = 'sm' }: { row: Record<string, unknown>; size?: 'sm' | 'md' }) {
  return (
    <span className="inline-flex gap-0.5" aria-label="Star ratings: overall, health inspection, quality measures, staffing">
      <Stars value={row.overall_rating} size={size} label="Overall" />
      <Stars value={row.health_inspection_rating} size={size} label="Health inspection" />
      <Stars value={row.qm_rating} size={size} label="Quality measures" />
      <Stars value={row.staffing_rating} size={size} label="Staffing" />
    </span>
  )
}

/** Footnote marker: small, text-first, meaning on hover and in the title. */
export function Fn({ code, ref }: { code: unknown; ref: Reference | null }) {
  if (code == null || code === '' || code === '-') return null
  const s = String(code)
  const meaning = s.split(',').map(c => ref?.footnotes[c.trim()]?.meaning ?? s).join(' / ')
  return <span className="text-ink-3 text-[11px] ml-1 cursor-help underline decoration-dotted underline-offset-2" title={meaning}>{/^\d/.test(s) ? `fn ${s}` : s}</span>
}

/** A rust-colored flag for enforcement facts. Text, not an icon. */
export function Flag({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--color-rust-soft)', color: 'var(--color-rust)' }}>{children}</span>
}

export function useReference() {
  const [ref, setRef] = useState<Reference | null>(null)
  useEffect(() => { getReference().then(setRef).catch(() => setRef(null)) }, [])
  return ref
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
        <div className="h-1 w-48 rounded bg-well overflow-hidden"><div className="h-full w-1/3 bg-q4 rounded" style={{ animation: 'slide 1.1s ease-in-out infinite' }} /></div>
        <style>{`@keyframes slide { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } } @media (prefers-reduced-motion: reduce) { div[style*="slide"] { animation: none } }`}</style>
        <div className="text-xs text-ink-3">Loads 14,690 facilities into a database that runs in your browser. Nothing is sent anywhere.</div>
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
