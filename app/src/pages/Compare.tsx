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
  const colW = `minmax(150px, 1fr)`
  return (
    <div className="px-4 md:px-6 py-6 overflow-x-auto">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold tracking-tight">Compare</h1>
        <div className="text-sm text-ink-2">{rows.length} of {MAX_COMPARE}</div>
        <button className="press btn btn-quiet text-sm ml-auto" onClick={() => compareStore.clear()}>Clear all</button>
      </div>
      <div className="bg-surface rounded-[10px] px-5 py-4" style={{ minWidth: 320 + rows.length * 160 }}>
        <div className="grid gap-4 items-end border-b border-hairline pb-3" style={{ gridTemplateColumns: `320px repeat(${rows.length}, ${colW})` }}>
          <div className="text-xs text-ink-3">Best value in each row is in bold (by our reading of the measure's direction).<div className="mt-1">{STRIP_HEADER}</div></div>
          {rows.map(r => (
            <div key={String(r.ccn)} className="min-w-0">
              <Link to={`/facility/${r.ccn}`} className="block text-sm font-medium text-ink hover:underline underline-offset-2 leading-tight">{titleCase(String(r.provider_name))}</Link>
              <div className="text-[11px] text-ink-3 truncate">{titleCase(String(r.city_town))}, {String(r.state)} · {r.number_of_certified_beds != null ? `${Number(r.number_of_certified_beds)} beds` : ''}</div>
              <div className="mt-1"><QualityStrip row={r} /></div>
              <button className="press btn btn-quiet text-xs px-0 mt-1" onClick={() => compareStore.remove(String(r.ccn))}>Remove</button>
            </div>
          ))}
        </div>
        {GROUPS.map(g => (
          <div key={g.id} className="mt-4">
            <div className="font-medium text-sm text-ink mb-1">{g.title}</div>
            {g.measures.map(m => {
              const vals = rows.map(r => { const v = r[m.key]; return v == null || v === '' ? null : Number(v) })
              const present = vals.filter((v): v is number => v != null)
              const best = present.length > 1 && m.direction !== 'none' ? (m.direction === 'lower' ? Math.min(...present) : Math.max(...present)) : null
              return (
                <div key={m.key} className="grid gap-4 py-1.5 border-b border-hairline/60 last:border-0 items-center" style={{ gridTemplateColumns: `320px repeat(${rows.length}, ${colW})` }}>
                  <div className="text-sm text-ink-2">{m.label}</div>
                  {rows.map((r, i) => (
                    <div key={String(r.ccn)} className={`text-sm tabular-nums ${best != null && vals[i] === best ? 'font-semibold text-ink' : 'text-ink'}`}>
                      {fmt(vals[i], m.unit, m.decimals)}{vals[i] == null && m.fn ? <Fn code={r[m.fn]} ref={ref} /> : null}
                      {m.compPerf && r[m.compPerf] ? <div className="text-[11px] text-ink-3 font-normal">{String(r[m.compPerf])}</div> : null}
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
