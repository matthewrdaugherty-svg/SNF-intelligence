import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { q, type Row } from '../lib/db'
import { COHORT_FIELDS, GROUPS_BY, MAX_CONDITIONS, OPS, describe, fieldByKey, overflowed, parse, problem, serialize, whereSql, type Condition } from '../lib/cohort'
import { MEASURE_COLS, colByKey, type TableCol } from '../lib/measures'
import { fmt, fmtInt } from '../lib/format'
import DataTable, { type Sort } from '../components/DataTable'
import { Empty, Stat, StatRow, useReference } from '../components/ui'
import { buildSql } from './Explore'
import { EMPTY } from '../lib/filters'

const DEFAULT_METRIC = 'qm_521_adj'
const NUMERIC = MEASURE_COLS.filter(c => c.unit !== 'text')

function ConditionRow({ c, onChange, onRemove }: { c: Condition; onChange: (c: Condition) => void; onRemove: () => void }) {
  const f = fieldByKey(c.field)!
  const ops = OPS[f.kind]
  const needsA = !['blank', 'notblank', 'yes', 'no'].includes(c.op)
  const groups = useMemo(() => { const g = new Map<string, typeof COHORT_FIELDS>(); for (const x of COHORT_FIELDS) g.set(x.group, [...(g.get(x.group) ?? []), x]); return [...g.entries()] }, [])
  return (
    <div className="flex flex-wrap items-center gap-2 py-2 border-b border-hairline/60">
      <select className="control text-sm max-w-[320px]" value={c.field} aria-label="Measure" onChange={e => { const nf = fieldByKey(e.target.value)!; onChange({ field: nf.key, op: OPS[nf.kind][0].op, a: '', b: '' }) }}>
        {groups.map(([g, fs]) => <optgroup key={g} label={g}>{fs.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</optgroup>)}
      </select>
      <select className="control text-sm" value={c.op} aria-label="Operator" onChange={e => onChange({ ...c, op: e.target.value as Condition['op'] })}>{ops.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}</select>
      {needsA && <input className="control text-sm w-36" value={c.a ?? ''} onChange={e => onChange({ ...c, a: e.target.value })} placeholder={f.kind === 'stars' && c.op === 'in' ? 'e.g. 1,2' : f.kind === 'hospital' ? 'e.g. 210009,210022' : f.unit === 'pct' ? '%' : 'value'} aria-label="Value" />}
      {c.op === 'between' && <><span className="text-ink-3 text-sm">and</span><input className="control text-sm w-36" value={c.b ?? ''} onChange={e => onChange({ ...c, b: e.target.value })} aria-label="Upper value" /></>}
      <button className="press btn btn-quiet text-xs ml-auto" onClick={onRemove} aria-label={`Remove condition ${describe(c)}`}>Remove</button>
      {problem(c) && <div className="basis-full text-xs" style={{ color: 'var(--color-rust)' }} role="alert">{problem(c)}</div>}
    </div>
  )
}

/** Histogram of one measure for the cohort, with all nursing homes as a quiet outline and p10/p50/p90 marks. */
function Histogram({ cohort, all, p, unit, label }: { cohort: number[]; all: number[]; p: { p10: number; p50: number; p90: number } | null; unit: TableCol['unit']; label: string }) {
  if (!cohort.length) return null
  const W = 640, H = 160, PAD = 24
  const lo = Math.min(...all), hi = Math.max(...all)
  const bins = 24, step = (hi - lo) / bins || 1
  const count = (vals: number[]) => { const c = new Array(bins).fill(0); for (const v of vals) c[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / step)))]++; return c }
  const cc = count(cohort), ca = count(all)
  const maxC = Math.max(...cc) || 1, maxA = Math.max(...ca) || 1
  const x = (v: number) => PAD + ((v - lo) / (hi - lo || 1)) * (W - 2 * PAD)
  const bw = (W - 2 * PAD) / bins
  return (
    <svg viewBox={`0 0 ${W} ${H + 44}`} className="w-full max-w-3xl" role="img" aria-label={`Distribution of ${label}: cohort (filled) versus all nursing homes (outline)`}>
      {ca.map((n, i) => <rect key={'a' + i} x={PAD + i * bw} y={H - (n / maxA) * (H - 10)} width={bw - 1} height={(n / maxA) * (H - 10)} fill="none" stroke="var(--color-hairline)" />)}
      {cc.map((n, i) => <rect key={'c' + i} x={PAD + i * bw} y={H - (n / maxC) * (H - 10)} width={bw - 1} height={(n / maxC) * (H - 10)} fill="var(--color-accent)" opacity={0.75} />)}
      {p && [['p10', p.p10, 0], ['p50', p.p50, 1], ['p90', p.p90, 0]].map(([k, v, rowI]) => { const px = Math.min(W - PAD, Math.max(PAD, x(Number(v)))); return <g key={String(k)}><line x1={px} x2={px} y1={6} y2={H} stroke="var(--color-ink)" strokeDasharray="3 3" /><text x={px} y={H + 24 + Number(rowI) * 13} textAnchor={px < PAD + 40 ? 'start' : px > W - PAD - 40 ? 'end' : 'middle'} fontSize="11" fill="var(--color-ink-2)">{String(k)} {fmt(Number(v), unit, 1)}</text></g> })}
      <text x={PAD} y={H + 12} fontSize="10" fill="var(--color-ink-3)">{fmt(lo, unit, 1)}</text>
      <text x={W - PAD} y={H + 12} fontSize="10" fill="var(--color-ink-3)" textAnchor="end">{fmt(hi, unit, 1)}</text>
    </svg>
  )
}

export default function Cohorts() {
  const [params, setParams] = useSearchParams()
  const conds = useMemo(() => parse(params.getAll('c')), [params])
  const dropped = overflowed(params.getAll('c'))
  const problems = conds.map(problem).filter(Boolean)
  const metric = colByKey(params.get('m') ?? '')?.key && NUMERIC.some(c => c.key === params.get('m')) ? params.get('m')! : DEFAULT_METRIC
  const groupBy = GROUPS_BY.find(g => g.key === params.get('g'))?.key ?? 'state'
  const [n, setN] = useState<number | null>(null)
  const [summary, setSummary] = useState<Row | null>(null)
  const [groups, setGroups] = useState<Row[]>([])
  const [dist, setDist] = useState<{ cohort: number[]; all: number[]; p: { p10: number; p50: number; p90: number } | null } | null>(null)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [sort, setSort] = useState<Sort>({ key: metric, dir: 'asc' })
  const [error, setError] = useState<string | null>(null)
  const ref = useReference()
  const where = useMemo(() => whereSql(conds), [conds])
  const m = colByKey(metric)!
  const setConds = (next: Condition[]) => setParams(prev => { const p = new URLSearchParams(prev); p.delete('c'); for (const s of serialize(next)) p.append('c', s); return p }, { replace: true })
  const setParam = (k: string, v: string) => setParams(prev => { const p = new URLSearchParams(prev); p.set(k, v); return p }, { replace: true })
  const cols = useMemo(() => [colByKey(metric)!, ...MEASURE_COLS.filter(c => c.default && c.key !== metric)].filter(Boolean) as TableCol[], [metric])

  useEffect(() => {
    let live = true
    if (problems.length) { setN(null); setRows(null); setSummary(null); setGroups([]); setDist(null); return }
    const g = GROUPS_BY.find(x => x.key === groupBy)!
    ;(async () => {
      try {
        const [cnt] = await q(`SELECT count(*) AS n FROM facility_master WHERE ${where}`)
        const [s] = await q(`SELECT count(${metric}) AS n_val, avg(${metric}) AS mean, median(${metric}) AS med, quantile_cont(${metric}, 0.25) AS p25, quantile_cont(${metric}, 0.75) AS p75,
          avg(overall_rating) AS stars, count(*) FILTER (WHERE overall_rating >= 4) * 1.0 / nullif(count(*),0) AS share_good, count(*) FILTER (WHERE overall_rating <= 2) * 1.0 / nullif(count(*),0) AS share_poor,
          (SELECT avg(${metric}) FROM facility_master) AS mean_all, (SELECT median(${metric}) FROM facility_master) AS med_all FROM facility_master WHERE ${where}`)
        const gr = await q(`SELECT ${g.expr} AS grp, count(*) AS n, avg(${metric}) AS mean, count(${metric}) AS n_val, count(*) FILTER (WHERE overall_rating >= 4) * 1.0 / count(*) AS share_good, count(*) FILTER (WHERE overall_rating <= 2) * 1.0 / count(*) AS share_poor, avg(pen_total_fines_usd) AS fines
          FROM facility_master WHERE ${where} GROUP BY 1 ORDER BY n DESC LIMIT 60`)
        const cv = await q(`SELECT ${metric} AS v FROM facility_master WHERE ${where} AND ${metric} IS NOT NULL`)
        const av = await q(`SELECT ${metric} AS v FROM facility_master WHERE ${metric} IS NOT NULL`)
        const [pp] = await q(`SELECT quantile_cont(${metric}, 0.10) AS p10, quantile_cont(${metric}, 0.50) AS p50, quantile_cont(${metric}, 0.90) AS p90 FROM facility_master WHERE ${where}`)
        const list = await q(buildSql(EMPTY, cols, sort, where))
        if (!live) return
        setN(Number(cnt.n)); setSummary(s); setGroups(gr); setRows(list); setError(null)
        setDist({ cohort: cv.map(r => Number(r.v)), all: av.map(r => Number(r.v)), p: pp && pp.p50 != null ? { p10: Number(pp.p10), p50: Number(pp.p50), p90: Number(pp.p90) } : null })
      } catch (e) { if (live) setError(String((e as Error)?.message ?? e)) }
    })()
    return () => { live = false }
  }, [where, metric, groupBy, cols, sort, problems.length])

  const share = (v: unknown) => v == null ? '' : (100 * Number(v)).toFixed(0) + '%'
  return (
    <div className="page stack">
      <div><h1>Cohorts</h1>
      <p className="t-body text-ink-2 mt-2 max-w-3xl">Pull every nursing home that meets a set of conditions, then summarize the group, compare it to all 14,690 nursing homes, and break it down by state, chain, ownership or size. The address bar holds the cohort, so copy the link to share it.</p></div>

      <section className="panel panel-pad">
        <div className="flex items-center gap-3"><h2 className="section-title">Conditions</h2><span className="t-caption">all must be true</span>
          <button className="press btn btn-surface ml-auto" disabled={conds.length >= MAX_CONDITIONS} title={conds.length >= MAX_CONDITIONS ? `Up to ${MAX_CONDITIONS} conditions` : undefined} onClick={() => setConds([...conds, { field: 'overall_rating', op: 'in', a: '4,5' }])}>Add condition</button>
          {conds.length > 0 && <button className="press btn btn-quiet" onClick={() => setConds([])}>Clear</button>}
        </div>
        {conds.length === 0 && <div className="text-sm text-ink-2 mt-2">No conditions yet — the cohort is every nursing home. Try: overall rating is any of 4,5 · short-stay rehospitalization at most 18 · fines last 12 months equals 0.</div>}
        {conds.map((c, i) => <ConditionRow key={i} c={c} onChange={nc => setConds(conds.map((x, j) => j === i ? nc : x))} onRemove={() => setConds(conds.filter((_, j) => j !== i))} />)}
        {conds.length > 0 && <div className="text-xs text-ink-3 mt-2">{conds.map(describe).join(' · ')}</div>}
        {dropped && <div className="text-xs mt-2" style={{ color: 'var(--color-rust)' }} role="alert">This link carried more than {MAX_CONDITIONS} conditions; only the first {MAX_CONDITIONS} are used.</div>}
      </section>

      {problems.length > 0 && <Empty title="Fix the highlighted condition to run this cohort.">Nothing is counted until every condition can be read.</Empty>}

      {error ? <Empty title="This cohort could not be run.">{error}</Empty> : problems.length > 0 ? null : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <label className="t-body text-ink-2">Focus measure</label>
            <select className="control text-sm max-w-[360px]" value={metric} onChange={e => { setParam('m', e.target.value); setSort({ key: e.target.value, dir: 'asc' }) }} aria-label="Focus measure">{NUMERIC.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
            <label className="t-body text-ink-2 ml-2">Break down by</label>
            <select className="control text-sm" value={groupBy} onChange={e => setParam('g', e.target.value)} aria-label="Break down by">{GROUPS_BY.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}</select>
          </div>

          <StatRow source="Derived" note="counts and statistics computed from the CMS values of the nursing homes in the cohort">
            <Stat label="Nursing homes in cohort" value={n == null ? '…' : fmtInt(n)} note={n != null ? `${(100 * n / 14690).toFixed(1)}% of all nursing homes` : undefined} source="CMS" />
            <Stat label={`${m.short ?? m.label} — cohort median`} value={summary?.med != null ? fmt(summary.med, m.unit, 1) : '–'} note={summary ? <>mean {summary.mean != null ? fmt(summary.mean, m.unit, 1) : '–'} · p25 {summary.p25 != null ? fmt(summary.p25, m.unit, 1) : '–'} · p75 {summary.p75 != null ? fmt(summary.p75, m.unit, 1) : '–'} · {fmtInt(Number(summary.n_val))} with a value</> : undefined} source="Derived" how="Median and quartiles of the CMS value across the nursing homes in the cohort; suppressed values excluded." />
            <Stat label="All nursing homes — median" value={summary?.med_all != null ? fmt(summary.med_all, m.unit, 1) : '–'} note={summary?.mean_all != null ? `mean ${fmt(summary.mean_all, m.unit, 1)}` : undefined} source="Derived" how="Same statistic across all 14,690 nursing homes, for comparison." />
            <Stat label="Rating mix in cohort" value={summary ? `${share(summary.share_good)} good` : '–'} note={summary ? <><span style={{ color: Number(summary.share_poor) > 0 ? 'var(--color-rust)' : undefined }}>{share(summary.share_poor)} poor (1–2★)</span> · avg {summary.stars != null ? Number(summary.stars).toFixed(2) : '–'}★</> : undefined} source="Derived" tone={summary && Number(summary.share_poor) > 0.3 ? 'bad' : summary && Number(summary.share_good) > 0.5 ? 'good' : 'mid'} how="Share of nursing homes in the cohort rated 4–5★ (good) and 1–2★ (poor) overall." />
          </StatRow>

          {dist && dist.cohort.length > 0 && (
            <section className="panel panel-pad">
              <div className="flex items-baseline gap-3"><h2 className="section-title">Distribution of {m.label}</h2><span className="t-caption">cohort filled · all nursing homes outlined · dashed = cohort 10th / median / 90th percentile</span></div>
              <div className="mt-2"><Histogram cohort={dist.cohort} all={dist.all} p={dist.p} unit={m.unit} label={m.label} /></div>
            </section>
          )}

          <section className="panel panel-pad">
            <h2 className="section-title">By {GROUPS_BY.find(g => g.key === groupBy)!.label.toLowerCase()} <span className="t-caption font-normal">· largest groups first, up to 60</span></h2>
            <div className="overflow-x-auto"><table className="tbl tbl-compact mt-2">
              <thead><tr><th>Group</th><th className="num">Nursing homes</th><th className="num">{m.short ?? m.label}, mean</th><th className="num">With a value</th><th className="num">4–5★</th><th className="num">1–2★</th><th className="num">Average fines, 3 yr</th></tr></thead>
              <tbody>{groups.map(g => (
                <tr key={String(g.grp)}>
                  <td>{String(g.grp)}</td><td className="num">{fmtInt(Number(g.n))}</td>
                  <td className="num font-medium">{g.mean != null ? fmt(g.mean, m.unit, 1) : <span className="empty">—</span>}</td><td className="num text-ink-3">{fmtInt(Number(g.n_val))}</td>
                  <td className="num">{share(g.share_good)}</td><td className="num" style={{ color: Number(g.share_poor) > 0.3 ? 'var(--color-rust)' : undefined }}>{share(g.share_poor)}</td>
                  <td className="num">{g.fines != null ? fmt(g.fines, 'usd') : <span className="empty">—</span>}</td>
                </tr>))}</tbody>
            </table></div>
          </section>

          <section className="panel overflow-hidden">
            <div className="px-4 md:px-6 py-3 flex items-center gap-3 border-b border-hairline"><h2 className="section-title">Nursing homes</h2><span className="t-caption">{rows ? `${fmtInt(rows.length)} rows · sorted by ${colByKey(sort.key)?.label ?? sort.key}` : ''}</span>
              <button className="press btn btn-primary ml-auto" disabled={!rows?.length} onClick={() => {
                if (!rows) return
                const keys = ['ccn', 'provider_name', 'city_town', 'state', 'overall_rating', 'overall_rating_footnote', 'health_inspection_rating', 'health_inspection_rating_footnote', 'qm_rating', 'qm_rating_footnote', 'staffing_rating', 'staffing_rating_footnote', ...cols.flatMap(c => c.fn ? [c.key, c.fn] : [c.key])]
                const labels = ['CCN', 'Facility', 'City', 'State', 'Overall stars', 'Overall stars — CMS footnote', 'Health inspection stars', 'Health inspection stars — CMS footnote', 'Quality measure stars', 'Quality measure stars — CMS footnote', 'Staffing stars', 'Staffing stars — CMS footnote', ...cols.flatMap(c => c.fn ? [c.label, `${c.label} — CMS footnote`] : [c.label])]
                const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
                const head = [`# SNF Intelligence cohort export · CMS data as of ${ref?.meta.data_vintage ?? ''} · exported ${new Date().toISOString().slice(0, 10)}`, `# Conditions: ${conds.length ? conds.map(describe).join(' AND ') : 'none (all facilities)'}`, `# Link: ${location.href}`]
                const blob = new Blob(['﻿' + [...head, labels.map(esc).join(','), ...rows.map(r => keys.map(k => esc(r[k])).join(','))].join('\n')], { type: 'text/csv;charset=utf-8' })
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `snf-cohort-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
              }}>Export CSV</button></div>
            <div className="h-[520px]">{rows && rows.length === 0 ? <Empty title="No nursing homes meet these conditions.">Loosen a condition.</Empty> : rows ? <DataTable rows={rows} cols={cols} sort={sort} onSort={setSort} ref={ref} /> : null}</div>
          </section>
        </>
      )}
    </div>
  )
}
