import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { q } from '../lib/db'
import { fromParams, toParams, whereClause, distExpr, type Filters } from '../lib/filters'
import { TABLE_COLS, colByKey, type TableCol } from '../lib/measures'
import FilterPanel from '../components/FilterPanel'
import DataTable, { type Sort } from '../components/DataTable'
import { useReference, Empty } from '../components/ui'
import { fmt } from '../lib/format'

const BASE_COLS = ['ccn', 'provider_name', 'overall_rating', 'health_inspection_rating', 'qm_rating', 'staffing_rating', 'special_focus_status', 'abuse_icon']
const COLS_KEY = 'snf.explore.cols'
function loadCols(): string[] { try { const v = localStorage.getItem(COLS_KEY); if (v) return (JSON.parse(v) as string[]).filter(colByKey) } catch { /* ignore */ } return TABLE_COLS.filter(c => c.default).map(c => c.key) }

export function buildSql(f: Filters, cols: TableCol[], sort: Sort): string {
  const sel = [...BASE_COLS, ...cols.map(c => c.key), ...cols.map(c => c.fn).filter(Boolean) as string[]]
  const hasDist = f.lat != null && f.lng != null
  if (hasDist) sel.push(`${distExpr(f.lat!, f.lng!)} AS distance_mi`)
  const sortCol = sort.key === 'distance_mi' && !hasDist ? 'provider_name' : sort.key
  const dir = sort.dir === 'asc' ? 'ASC' : 'DESC'
  return `SELECT ${[...new Set(sel)].join(', ')} FROM facility_master ${whereClause(f)} ORDER BY ${sortCol} ${dir} NULLS LAST, provider_name ASC`
}

export default function Explore() {
  const [params, setParams] = useSearchParams()
  const f = useMemo(() => fromParams(params), [params])
  const [sort, setSort] = useState<Sort>(() => ({ key: params.get('sort') || 'provider_name', dir: (params.get('dir') as 'asc' | 'desc') || 'asc' }))
  const [colKeys, setColKeys] = useState<string[]>(loadCols)
  const cols = useMemo(() => colKeys.map(colByKey).filter(Boolean) as TableCol[], [colKeys])
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picker, setPicker] = useState(false)
  const ref = useReference()
  const hasDist = f.lat != null && f.lng != null

  useEffect(() => {
    let live = true
    const effSort = sort.key === 'distance_mi' && !hasDist ? { key: 'provider_name', dir: 'asc' as const } : sort
    q(buildSql(f, cols, effSort)).then(r => { if (live) { setRows(r); setError(null) } }).catch(e => { if (live) setError(String(e)) })
    return () => { live = false }
  }, [f, cols, sort, hasDist])
  useEffect(() => { try { localStorage.setItem(COLS_KEY, JSON.stringify(colKeys)) } catch { /* ignore */ } }, [colKeys])
  useEffect(() => { if (hasDist && sort.key === 'provider_name' && !params.get('sort')) setSort({ key: 'distance_mi', dir: 'asc' }) }, [hasDist]) // eslint-disable-line react-hooks/exhaustive-deps

  const onFilters = (nf: Filters) => setParams(toParams(nf, params), { replace: true })
  const onSort = (s: Sort) => { setSort(s); const p = new URLSearchParams(params); p.set('sort', s.key); p.set('dir', s.dir); setParams(p, { replace: true }) }

  function exportCsv() {
    if (!rows) return
    const keys = ['ccn', 'provider_name', 'overall_rating', 'health_inspection_rating', 'qm_rating', 'staffing_rating', ...(hasDist ? ['distance_mi'] : []), ...cols.map(c => c.key)]
    const labels = ['CCN', 'Facility', 'Overall stars', 'Health inspection stars', 'Quality measure stars', 'Staffing stars', ...(hasDist ? ['Miles'] : []), ...cols.map(c => c.label)]
    const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
    const lines = [labels.map(esc).join(','), ...rows.map(r => keys.map(k => esc(k === 'distance_mi' && r[k] != null ? Number(r[k]).toFixed(1) : r[k])).join(','))]
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `snf-explore-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
  }

  const groups = useMemo(() => { const g = new Map<string, TableCol[]>(); for (const c of TABLE_COLS) g.set(c.group, [...(g.get(c.group) ?? []), c]); return [...g.entries()] }, [])

  return (
    <div className="flex h-[calc(100dvh-52px)]">
      <FilterPanel f={f} onChange={onFilters} resultCount={rows?.length ?? null} />
      <section className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-center gap-3 px-4 h-12 shrink-0">
          <div className="text-sm text-ink-2">{rows ? <><span className="text-ink font-medium tabular-nums" data-testid="result-count">{rows.length.toLocaleString()}</span> facilities</> : 'Loading…'}{hasDist && f.place ? <span className="text-ink-3"> · within {f.miles} mi of {f.place}</span> : null}</div>
          <div className="ml-auto flex items-center gap-2 relative">
            <button className="press btn btn-surface text-sm" onClick={() => setPicker(p => !p)} aria-expanded={picker}>Columns · {cols.length}</button>
            <button className="press btn btn-primary text-sm" onClick={exportCsv} disabled={!rows?.length}>Export CSV</button>
            {picker && (
              <div className="absolute right-0 top-10 w-[520px] max-h-[70vh] overflow-auto bg-surface rounded-[10px] p-4 z-20" style={{ boxShadow: 'var(--shadow-float)' }} role="dialog" aria-label="Choose columns">
                <div className="flex items-center justify-between mb-2"><div className="font-medium">Columns</div><button className="press btn btn-quiet text-xs" onClick={() => setColKeys(TABLE_COLS.filter(c => c.default).map(c => c.key))}>Reset to default</button></div>
                {groups.map(([g, cs]) => (
                  <div key={g} className="mb-3">
                    <div className="text-xs text-ink-2 mb-1">{g}</div>
                    <div className="grid grid-cols-2 gap-x-4">
                      {cs.map(c => <label key={c.key} className="flex items-center gap-2 text-sm py-0.5 cursor-pointer"><input type="checkbox" className="accent-ink" checked={colKeys.includes(c.key)} onChange={e => setColKeys(k => e.target.checked ? [...k, c.key] : k.filter(x => x !== c.key))} /><span className="truncate" title={c.label}>{c.label}</span></label>)}
                    </div>
                  </div>
                ))}
                <button className="press btn btn-primary text-sm mt-1" onClick={() => setPicker(false)}>Done</button>
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0 border-t border-hairline">
          {error ? <Empty title="The query failed.">{error}</Empty>
            : rows && rows.length === 0 ? <Empty title="No facilities match these filters.">Clear a filter or widen the radius.</Empty>
            : rows ? <DataTable rows={rows} cols={cols} sort={sort} onSort={onSort} ref={ref} showDistance={hasDist} /> : null}
        </div>
        {rows && rows.length > 0 && <Footer rows={rows} cols={cols} />}
      </section>
    </div>
  )
}

/** Quiet aggregate line for the current result set: simple facility averages, suppressed values excluded. */
function Footer({ rows, cols }: { rows: Record<string, unknown>[]; cols: TableCol[] }) {
  const stats = cols.filter(c => c.unit !== 'text').slice(0, 6).map(c => {
    const vals = rows.map(r => r[c.key]).filter(v => v != null && v !== '').map(Number).filter(n => !Number.isNaN(n))
    return { c, n: vals.length, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null }
  })
  const starAvg = (() => { const v = rows.map(r => r.overall_rating).filter(x => x != null).map(Number); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null })()
  return (
    <div className="shrink-0 border-t border-hairline bg-surface px-4 py-2 text-xs text-ink-2 flex flex-wrap gap-x-5 gap-y-1">
      <span>Averages of this set:</span>
      {starAvg != null && <span>overall stars <span className="text-ink tabular-nums">{starAvg.toFixed(2)}</span></span>}
      {stats.map(s => s.mean != null && <span key={s.c.key} title={`${s.n.toLocaleString()} facilities with a value`}>{s.c.label.replace(/\s*\(.*\)$/, '')} <span className="text-ink tabular-nums">{fmt(s.mean, s.c.unit, s.c.unit === 'count' ? undefined : 1)}</span></span>)}
    </div>
  )
}
