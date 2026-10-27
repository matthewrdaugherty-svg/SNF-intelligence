// One verdict rule for the whole app (D-026): "better / worse / same" is decided on the numbers AS DISPLAYED,
// so a pill, a color or a sentence can never contradict the figures beside it. Where CMS publishes its own
// comparison (QRP "better / no different / worse than the national rate") CMS's verdict wins.
import type { Measure } from './measures'
import { fmt, fmtUsd } from './format'

export type VerdictKind = 'better' | 'worse' | 'same'
export interface Verdict { kind: VerdictKind; text: string }

/** Difference between a value and a benchmark, in the unit's natural terms, after rounding both to the shown precision. */
export function verdict(value: number | null, cmp: number | null, m: Pick<Measure, 'unit' | 'direction' | 'decimals'>, against: 'state' | 'nation' = 'state'): Verdict | null {
  if (value == null || cmp == null || m.direction === 'none' || m.unit === 'stars') return null
  const dec = m.unit === 'count' ? 1 : m.unit === 'usd' ? 0 : (m.decimals ?? (m.unit === 'pct' || m.unit === 'fraction_pct' ? 1 : 2))
  const scale = m.unit === 'fraction_pct' ? 100 : 1
  const d = Number((value * scale).toFixed(dec)) - Number((cmp * scale).toFixed(dec))
  const shown = Number(Math.abs(d).toFixed(dec))
  if (shown === 0) return { kind: 'same', text: `same as ${against}` }
  const better = m.direction === 'lower' ? d < 0 : d > 0
  const abs = m.unit === 'pct' || m.unit === 'fraction_pct' ? `${shown.toFixed(dec)} pts` : m.unit === 'usd' ? fmtUsd(shown) : m.unit === 'count' ? shown.toFixed(1) : fmt(shown, m.unit, dec)
  return { kind: better ? 'better' : 'worse', text: `${abs} ${better ? 'better' : 'worse'} than ${against}` }
}

/** CMS's own comparative-performance text → verdict ("Better than the National Rate" → better). */
export function cmsVerdict(comp: unknown): Verdict | null {
  if (comp == null || comp === '') return null
  const s = String(comp).toLowerCase()
  if (s.startsWith('better')) return { kind: 'better', text: 'better than nation · CMS' }
  if (s.startsWith('worse')) return { kind: 'worse', text: 'worse than nation · CMS' }
  if (s.startsWith('no different')) return { kind: 'same', text: 'same as nation · CMS' }
  return null
}

/** Text color for a verdict kind; `undefined` for no verdict so the value keeps the ink color. */
export const verdictColor = (k: VerdictKind | undefined) => k === 'better' ? 'var(--color-q5)' : k === 'worse' ? 'var(--color-rust)' : k === 'same' ? 'var(--color-ink-3)' : undefined
export const verdictStyle = (k: VerdictKind | undefined) => k === 'better' ? { color: 'var(--color-q5)', fontWeight: 600 } : k === 'worse' ? { color: 'var(--color-rust)', fontWeight: 600 } : { color: 'var(--color-ink-3)' }
