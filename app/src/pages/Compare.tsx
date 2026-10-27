import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { q, sqlStr } from '../lib/db'
import { GROUPS } from '../lib/measures'
import { fmt, titleCase } from '../lib/format'
import { useCompare, compareStore, MAX_COMPARE } from '../lib/compare'
import { Fn, QualityStrip, STRIP_HEADER, Empty, useReference } from '../components/ui'

type Row = Record<string, unknown>

export default function Compare() {
  const ccns = useCompare()
  const [rows, setRows] = useState<Row[]>([])
  const ref = useReference()
  useEffect(() => {
    if (!ccns.length) { setRows([]); return }
    let live = true
    q(`SELECT * FROM facility_master WHERE ccn IN (${ccns.map(sqlStr).join(',')})`).then(r => { if (live) setRows(ccns.map(c => r.find(x => x.ccn === c)).filter(Boolean) as Row[]) })
    return () => { live = false }
  }, [ccns])
  if (!ccns.length) return <Empty title="Nothing to compare yet."><p>Tick facilities in Explore or on a facility page. Up to {MAX_COMPARE} at a time.</p><Link to="/explore" className="underline">Go to Explore</Link></Empty>
  const colW = `minmax(176px, 1fr)`
  return (
    <div className="page">
      <div className="flex items-center gap-3 mb-6">
        <h1>Compare</h1>
        <div className="t-body text-ink-2">{rows.length} of {MAX_COMPARE}</div>
        <button className="press btn btn-quiet ml-auto" onClick={() => compareStore.clear()}>Clear all</button>
      </div>
      <div className="panel panel-pad overflow-x-auto">
        <div className="grid gap-4 items-end border-b border-hairline pb-3" style={{ gridTemplateColumns: `minmax(140px, 240px) repeat(${rows.length}, ${colW})` }}>
          <div className="t-caption sticky left-0 bg-surface z-10">Best value in each row is in bold (by our reading of the measure's direction).<div className="mt-1">{STRIP_HEADER}</div></div>
          {rows.map(r => (
            <div key={String(r.ccn)} className="min-w-0 text-right">
              <Link to={`/facility/${r.ccn}`} className="block t-body font-medium hover:underline underline-offset-2">{titleCase(String(r.provider_name))}</Link>
              <div className="t-caption truncate">{titleCase(String(r.city_town))}, {String(r.state)} · {r.number_of_certified_beds != null ? `${Number(r.number_of_certified_beds)} beds` : ''}</div>
              <div className="mt-1"><QualityStrip row={r} /></div>
              <button className="press btn btn-quiet btn-sm mt-1" onClick={() => compareStore.remove(String(r.ccn))}>Remove</button>
            </div>
          ))}
        </div>
        {GROUPS.map(g => (
          <div key={g.id} className="mt-6">
            <div className="section-title mb-1 sticky left-0 bg-surface">{g.title}</div>
            {g.measures.map(m => {
              const vals = rows.map(r => { const v = r[m.key]; return v == null || v === '' ? null : Number(v) })
              const present = vals.filter((v): v is number => v != null)
              const best = present.length > 1 && m.direction !== 'none' ? (m.direction === 'lower' ? Math.min(...present) : Math.max(...present)) : null
              return (
                <div key={m.key} className="grid gap-4 py-2 border-b border-hairline/60 last:border-0 items-center" style={{ gridTemplateColumns: `minmax(140px, 240px) repeat(${rows.length}, ${colW})` }}>
                  <div className="t-body text-ink-2 sticky left-0 bg-surface z-10">{m.label}</div>
                  {rows.map((r, i) => (
                    <div key={String(r.ccn)} className={`t-body tabular-nums text-right ${best != null && vals[i] === best && present.length > 1 && present.filter(v => v === best).length === 1 ? 'font-semibold' : ''}`}>
                      {fmt(vals[i], m.unit, m.decimals)}{vals[i] == null && m.fn ? <Fn code={r[m.fn]} ref={ref} /> : null}
                      {m.compPerf && r[m.compPerf] ? <div className="t-caption font-normal">{String(r[m.compPerf]).toLowerCase()}</div> : null}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
