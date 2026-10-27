import { type ReactNode, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Link } from 'react-router'
import { fmt, titleCase } from '../lib/format'
import type { TableCol } from '../lib/measures'
import { useCompare, compareStore } from '../lib/compare'
import { Fn, QualityStrip, STRIP_HEADER } from './ui'
import type { Reference } from '../lib/reference'

export interface Sort { key: string; dir: 'asc' | 'desc' }
interface Props { rows: Record<string, unknown>[]; cols: TableCol[]; sort: Sort; onSort: (s: Sort) => void; ref: Reference | null; showDistance?: boolean; showShare?: boolean }

const ROW = 40
const OWN_SHORT: Record<string, string> = { 'For profit - Limited Liability company': 'For profit · LLC', 'For profit - Corporation': 'For profit · corporation', 'For profit - Individual': 'For profit · individual', 'For profit - Partnership': 'For profit · partnership',
  'Non profit - Corporation': 'Non profit · corporation', 'Non profit - Other': 'Non profit · other', 'Non profit - Church related': 'Non profit · church', 'Government - County': 'Government · county', 'Government - Hospital district': 'Government · hospital district',
  'Government - State': 'Government · state', 'Government - City/county': 'Government · city/county', 'Government - City': 'Government · city', 'Government - Federal': 'Government · federal' }
function displayText(key: string, val: unknown): string {
  if (val == null) return ''
  const s = String(val)
  if (key === 'ownership_type') return OWN_SHORT[s] ?? s
  if (key === 'city_town' || key === 'county_parish' || key === 'chain_name') return titleCase(s)
  if (key === 'provider_type') return s.replace('Medicare and Medicaid', 'Medicare & Medicaid')
  return s
}

export default function DataTable({ rows, cols, sort, onSort, ref, showDistance, showShare }: Props) {
  const parent = useRef<HTMLDivElement>(null)
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => ROW, overscan: 12 })
  const compare = useCompare()
  const head = (key: string, label: string, numeric = false, w?: number, node?: ReactNode) => {
    const on = sort.key === key
    return (
      <div key={key} role="columnheader" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className="shrink-0 border-b border-hairline" style={{ width: w }}>
        <button onClick={() => onSort({ key, dir: on && sort.dir === 'desc' ? 'asc' : 'desc' })}
          className={`press w-full text-left text-xs px-2 h-12 flex items-end gap-1 ${on ? 'text-ink font-semibold' : 'text-ink-2 hover:text-ink'} ${numeric ? 'justify-end' : ''}`} title={`Sort by ${label}`}>
          <span className="leading-tight line-clamp-3">{node ?? label}</span>{on && <span aria-hidden>{sort.dir === 'desc' ? '↓' : '↑'}</span>}
        </button>
      </div>
    )
  }
  const width = 36 + 300 + 150 + (showDistance ? 72 : 0) + (showShare ? 96 : 0) + cols.reduce((a, c) => a + (c.width ?? 96), 0)
  return (
    <div ref={parent} className="h-full overflow-auto bg-surface" role="table" aria-rowcount={rows.length}>
      <div style={{ minWidth: width }}>
        <div className="flex sticky top-0 z-10 bg-surface" role="row">
          <div role="columnheader" className="w-9 shrink-0 border-b border-hairline" aria-label="Compare" />
          {head('provider_name', 'Facility', false, 300)}
          {head('overall_rating', STRIP_HEADER, false, 150, <>Stars<span className="block font-normal text-ink-3 text-[11px]">overall · inspection · quality · staffing</span></>)}
          {showDistance && head('distance_mi', 'Miles', true, 72)}
          {showShare && head('modeled_share', 'Modeled share of hospital SNF volume', true, 96)}
          {cols.map(c => head(c.key, c.short ?? c.label, c.unit !== 'text', c.width ?? 96))}
        </div>
        <div style={{ height: v.getTotalSize(), position: 'relative' }}>
          {v.getVirtualItems().map(vi => {
            const r = rows[vi.index]; const ccn = String(r.ccn); const inCmp = compare.includes(ccn)
            return (
              <div key={ccn} role="row" className="flex items-center absolute left-0 right-0 hover:bg-paper border-b border-hairline/60" style={{ top: vi.start, height: ROW }}>
                <div role="cell" className="w-9 shrink-0 flex justify-center">
                  <input type="checkbox" className="accent-ink" checked={inCmp} onChange={() => compareStore.toggle(ccn)} aria-label={`Compare ${r.provider_name}`} title={inCmp ? 'Remove from compare' : 'Add to compare'} />
                </div>
                <div role="cell" className="shrink-0 px-2 min-w-0" style={{ width: 300 }}>
                  <Link to={`/facility/${ccn}`} className="block truncate text-sm text-ink hover:text-accent hover:underline underline-offset-2">{titleCase(String(r.provider_name))}</Link>
                  <div className="text-[11px] text-ink-3 truncate">{r.special_focus_status ? <span className="text-rust font-medium">{String(r.special_focus_status)} · </span> : null}{r.abuse_icon === 'Y' ? <span className="text-rust font-medium">Abuse icon · </span> : null}CCN {ccn}</div>
                </div>
                <div role="cell" className="shrink-0 px-2" style={{ width: 150 }}><QualityStrip row={r} /></div>
                {showDistance && <div role="cell" className="shrink-0 px-2 text-right text-sm tabular-nums" style={{ width: 72 }}>{r.distance_mi == null ? '' : Number(r.distance_mi).toFixed(1)}</div>}
                {showShare && <div role="cell" className="shrink-0 px-2 text-right text-sm tabular-nums" style={{ width: 96 }} title="Modeled: ZIP share of the hospital's visible volume × this SNF's share of Medicare stays in that ZIP">{r.modeled_share == null ? '' : (100 * Number(r.modeled_share)).toFixed(2) + '%'}</div>}
                {cols.map(c => {
                  const val = r[c.key]; const fn = c.fn ? r[c.fn] : null
                  const text = c.unit === 'text' ? displayText(c.key, val) : fmt(val, c.unit)
                  return (
                    <div key={c.key} role="cell" className={`shrink-0 px-2 text-sm tabular-nums truncate ${c.unit !== 'text' ? 'text-right' : ''}`} style={{ width: c.width ?? 96 }} title={c.unit === 'text' ? text : undefined}>
                      {text}{!text && fn ? <Fn code={fn} ref={ref} /> : null}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
