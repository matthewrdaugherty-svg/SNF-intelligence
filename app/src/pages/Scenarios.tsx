import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { DEFAULTS, UNIT_LABEL, fromParams, runScenario, toParams, type Outcome, type ScenarioParams } from '../lib/scenario'
import { hospitalsByCcn, searchHospitals, type HospitalLite } from '../lib/hospitals'
import { fmtInt, fmtPct, fmtUsd, titleCase } from '../lib/format'
import { Empty, QualityStrip, StripHeader, Stat, StatRow, Stars } from '../components/ui'
import { verdictStyle } from './Facility'

const pct = (v: unknown, d = 1) => v == null ? '–' : fmtPct(Number(v), d)
const delta = (a: unknown, b: unknown, lowerBetter: boolean, unit: 'pct' | 'usd' | 'stars' | 'pts') => {
  if (a == null || b == null) return null
  const d = Number(b) - Number(a); const better = lowerBetter ? d < 0 : d > 0
  const txt = unit === 'usd' ? fmtUsd(Math.abs(d)) : unit === 'stars' ? Math.abs(d).toFixed(2) + '★' : `${Math.abs(d).toFixed(1)} pts`
  const same = unit === 'usd' ? Math.abs(d) < 1 : Math.abs(d) < 0.05
  return { kind: same ? 'same' as const : better ? 'better' as const : 'worse' as const, text: same ? 'no change' : `${txt} ${better ? 'better' : 'worse'}` }
}

export default function Scenarios() {
  const [params, setParams] = useSearchParams()
  const s = useMemo(() => fromParams(params), [params])
  const [hosp, setHosp] = useState<HospitalLite | null>(null)
  const [text, setText] = useState('')
  const [results, setResults] = useState<HospitalLite[]>([])
  const [out, setOut] = useState<Outcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (patch: Partial<ScenarioParams>) => { if (!s) return; setParams(toParams({ ...s, ...patch }), { replace: true }) }
  useEffect(() => { if (!s) { setHosp(null); return } let live = true; hospitalsByCcn([s.hospital]).then(r => { if (live) setHosp(r[0] ?? null) }); return () => { live = false } }, [s?.hospital])
  useEffect(() => {
    if (!text.trim()) { setResults([]); return }
    let live = true; const t = setTimeout(() => searchHospitals(text, 8).then(r => { if (live) setResults(r) }), 200); return () => { live = false; clearTimeout(t) }
  }, [text])
  useEffect(() => {
    if (!s) { setOut(null); return }
    let live = true; setBusy(true); setError(null)
    runScenario(s).then(o => { if (live) { setOut(o); setBusy(false) } }).catch(e => { if (live) { setError(String((e as Error)?.message ?? e)); setBusy(false) } })
    return () => { live = false }
  }, [s])

  const per = s?.n ?? 1000
  const unitWord = s?.n ? 'per year' : 'per 1,000 SNF discharges'
  const avoided = (a: unknown, b: unknown) => a == null || b == null ? null : (Number(a) - Number(b)) / 100 * per
  const d521 = out ? delta(out.before.r521, out.after.r521, true, 'pts') : null
  const d004 = out ? delta(out.before.r004, out.after.r004, true, 'pts') : null
  const d005 = out ? delta(out.before.r005, out.after.r005, false, 'pts') : null
  const dpay = out ? delta(out.before.pay_per_stay, out.after.pay_per_stay, true, 'usd') : null
  const dstars = out ? delta(out.before.stars, out.after.stars, false, 'stars') : null

  return (
    <div className="page stack">
      <div><h1>Placement scenarios</h1>
        <p className="t-body text-ink-2 mt-2 max-w-3xl">Pick a hospital, define which SNFs count as acceptable, and see what happens if the patients who would have gone to the other homes went to the nearest acceptable ones instead: readmissions, discharge to community, Medicare cost per stay and extra travel. Modeled from CMS facility rates; when the hospital's own discharge counts are loaded on the Flows page the same arithmetic runs on them.</p></div>

      <section className="panel panel-pad">
        <h2 className="section-title">Hospital</h2>
        <div className="mt-2 relative max-w-xl">
          <input className="control w-full" value={text} onChange={e => setText(e.target.value)} placeholder={hosp ? `${titleCase(hosp.hospital_name)} · change hospital…` : 'Hospital name, city or CCN'} aria-label="Find a hospital" />
          {results.length > 0 && (
            <ul role="listbox" className="absolute left-0 right-0 top-full mt-1 panel z-20 py-1" style={{ boxShadow: 'var(--shadow-float)' }}>
              {results.map(h => <li key={h.hospital_ccn} role="option" aria-selected={false}><button className="press w-full text-left px-3 py-2 hover:bg-paper" disabled={h.cases_visible == null} onClick={() => { setParams(toParams({ ...DEFAULTS, ...(s ?? {}), hospital: h.hospital_ccn }), { replace: true }); setText(''); setResults([]) }}>
                <div className="t-body">{titleCase(h.hospital_name)}</div><div className="t-caption">{titleCase(h.city)}, {h.state}{h.cases_visible == null ? ' · no service-area data' : ''}</div></button></li>)}
            </ul>
          )}
        </div>
        {hosp && <div className="t-body mt-2">{titleCase(hosp.hospital_name)}, {titleCase(hosp.city)}, {hosp.state} · <Link to={`/hospital/${hosp.hospital_ccn}`} className="text-accent hover:underline">hospital page</Link></div>}
      </section>

      {s && (
        <section className="panel panel-pad">
          <h2 className="section-title">What counts as an acceptable SNF</h2>
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 max-w-5xl">
            <div>
              <div className="flabel">Minimum overall rating</div>
              <div role="radiogroup" aria-label="Minimum overall rating" className="seg">{[3, 4, 5].map(v => <button key={v} role="radio" aria-checked={s.minStars === v} className="press seg-btn" onClick={() => set({ minStars: v })}>{v}★{v < 5 ? '+' : ''}</button>)}</div>
              <label className="flex items-center gap-2 t-body mt-3 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={s.excludeFlags} onChange={e => set({ excludeFlags: e.target.checked })} />Exclude special-focus and abuse-icon homes</label>
              <label className="flex items-center gap-2 t-body mt-1 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={s.snfOnly} onChange={e => set({ snfOnly: e.target.checked })} />Medicare-certified SNFs only</label>
            </div>
            <div>
              <div className="flabel">Required dedicated units</div>
              {Object.entries(UNIT_LABEL).map(([k, l]) => <label key={k} className="flex items-center gap-2 t-body mt-1 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={s.units.includes(k)} onChange={e => set({ units: e.target.checked ? [...s.units, k] : s.units.filter(u => u !== k) })} />{l}</label>)}
              <div className="flabel mt-3">Minimum case-mix overlap</div>
              <div className="flex items-center gap-2"><input type="range" min={0} max={80} step={5} value={s.minOverlap == null ? 0 : Math.round(100 * s.minOverlap)} onChange={e => set({ minOverlap: Number(e.target.value) === 0 ? null : Number(e.target.value) / 100 })} className="w-full" aria-label="Minimum case-mix overlap" /><span className="t-body tabular-nums w-14 text-right">{s.minOverlap == null ? 'off' : `${Math.round(100 * s.minOverlap)}%`}</span></div>
              <div className="fhelp">Homes whose published diagnosis mix is too thin to score are excluded when this is on.</div>
            </div>
            <div>
              <div className="flabel">How far a patient can be moved</div>
              <div className="flex items-center gap-2"><input type="range" min={1} max={60} step={1} value={s.maxMiles} onChange={e => set({ maxMiles: Number(e.target.value) })} className="w-full" aria-label="Maximum miles" /><span className="t-body tabular-nums w-14 text-right">{s.maxMiles} mi</span></div>
              <div className="fhelp">From the SNF they would otherwise have used. Moved volume is split equally across the nearest acceptable homes.</div>
              <div className="flabel mt-3">Spread across the nearest</div>
              <div role="radiogroup" aria-label="Number of receiving SNFs" className="seg">{[1, 3, 5].map(v => <button key={v} role="radio" aria-checked={s.k === v} className="press seg-btn" onClick={() => set({ k: v })}>{v} home{v > 1 ? 's' : ''}</button>)}</div>
              <div className="flabel mt-3">Share of those patients actually moved</div>
              <div className="flex items-center gap-2"><input type="range" min={10} max={100} step={10} value={Math.round(100 * s.shift)} onChange={e => set({ shift: Number(e.target.value) / 100 })} className="w-full" aria-label="Share moved" /><span className="t-body tabular-nums w-14 text-right">{Math.round(100 * s.shift)}%</span></div>
              <div className="flabel mt-3">Annual SNF discharges <span className="t-caption">(optional — turns rates into counts)</span></div>
              <input className="control w-40" inputMode="numeric" value={s.n ?? ''} placeholder="e.g. 1800" onChange={e => { const v = e.target.value.replace(/[^\d]/g, ''); set({ n: v ? Number(v) : null }) }} aria-label="Annual SNF discharges" />
            </div>
          </div>
        </section>
      )}

      {!s && <Empty title="Choose a hospital to start.">Search above, or open any hospital page and use its link to this page.</Empty>}
      {s && error && <Empty title="The scenario could not be run.">{error}</Empty>}
      {s && !error && out && (
        <>
          <section className="panel panel-pad" data-testid="scenario-summary">
            <h2 className="section-title">Result <span className="t-caption font-normal ml-2">{out.source === 'reported' ? 'on the hospital\'s reported discharge counts' : 'Modeled baseline (service-area model)'}{busy ? ' · recalculating…' : ''}</span></h2>
            <p className="t-lead mt-2">
              Of this hospital's SNF volume, <b>{fmtPct(100 * out.moved / Number(out.before.total), 0)}</b> goes to homes that do not meet the bar and could be moved to <b>{fmtInt(out.nReceiving)}</b> acceptable {out.nReceiving === 1 ? 'home' : 'homes'} within {s.maxMiles} miles{out.unplaced > 0.0005 ? <>; <b>{fmtPct(100 * out.unplaced / Number(out.before.total), 0)}</b> could not be placed because no acceptable home is within reach</> : null}.
              {d004 && d004.kind !== 'same' ? <> Readmissions within 30 days of SNF discharge would be <span style={verdictStyle(d004.kind)}>{d004.text}</span> ({pct(out.before.r004)} → {pct(out.after.r004)})</> : null}
              {avoided(out.before.r004, out.after.r004) != null && d004 && d004.kind !== 'same' ? <>, about <b>{fmtInt(Math.round(Math.abs(avoided(out.before.r004, out.after.r004)!)))}</b> {Number(out.after.r004) < Number(out.before.r004) ? 'fewer' : 'more'} readmissions {unitWord}</> : null}
              {dpay && dpay.kind !== 'same' ? <>; Medicare's payment per SNF stay would be <span style={verdictStyle(dpay.kind)}>{dpay.text}</span></> : null}.
              {out.addedMiles != null ? <> Moved patients would travel on average <b>{out.addedMiles.toFixed(1)} miles</b> farther than the home they would otherwise have used.</> : null}
            </p>
            <div className="mt-4">
              <StatRow source="Modeled" cols={5} note={`before → after, volume-weighted across the SNFs in the baseline (${out.nBaseline}) and after the move; a home without a published rate is left out of that rate`}>
                <Stat label="Readmitted within 30 days of SNF discharge" value={pct(out.after.r004)} note={<>{d004 ? <span style={verdictStyle(d004.kind)}>{d004.text}</span> : '–'}<br />before {pct(out.before.r004)} · rates cover {fmtPct(100 * Number(out.after.c004), 0)} of volume</>} tone={d004?.kind === 'better' ? 'good' : d004?.kind === 'worse' ? 'bad' : d004 ? 'mid' : undefined} how="CMS QRP 004 (potentially preventable 30-day readmissions after SNF discharge), weighted by each SNF's share of the hospital's SNF volume before and after the move." />
                <Stat label="Short-stay residents rehospitalized" value={pct(out.after.r521)} note={<>{d521 ? <span style={verdictStyle(d521.kind)}>{d521.text}</span> : '–'}<br />before {pct(out.before.r521)}</>} tone={d521?.kind === 'better' ? 'good' : d521?.kind === 'worse' ? 'bad' : d521 ? 'mid' : undefined} how="CMS QM 521 (risk-adjusted), volume-weighted." />
                <Stat label="Successful discharge to community" value={pct(out.after.r005)} note={<>{d005 ? <span style={verdictStyle(d005.kind)}>{d005.text}</span> : '–'}<br />before {pct(out.before.r005)}</>} tone={d005?.kind === 'better' ? 'good' : d005?.kind === 'worse' ? 'bad' : d005 ? 'mid' : undefined} how="CMS QRP 005, volume-weighted." />
                <Stat label="Medicare payment per SNF stay" value={out.after.pay_per_stay != null ? fmtUsd(Number(out.after.pay_per_stay)) : '–'} note={<>{dpay ? <span style={verdictStyle(dpay.kind)}>{dpay.text}</span> : '–'}<br />before {out.before.pay_per_stay != null ? fmtUsd(Number(out.before.pay_per_stay)) : '–'}{s.n && dpay && dpay.kind !== 'same' ? ` · ${fmtUsd(Math.abs((Number(out.after.pay_per_stay) - Number(out.before.pay_per_stay)) * s.n))} per year` : ''}</>} tone={dpay?.kind === 'better' ? 'good' : dpay?.kind === 'worse' ? 'bad' : dpay ? 'mid' : undefined} how="Each SNF's 2024 Medicare fee-for-service payment divided by its stays (CMS Post-Acute Care PUF), volume-weighted. A cost proxy for the SNF stay only; it does not include the hospital stay, readmissions or care after the SNF." />
                <Stat label="Volume in 1–2★ homes" value={fmtPct(100 * Number(out.after.low_share), 0)} note={<>before {fmtPct(100 * Number(out.before.low_share), 0)}<br />average rating {Number(out.before.stars).toFixed(2)} → {Number(out.after.stars).toFixed(2)}{dstars ? ` (${dstars.text})` : ''}</>} tone={Number(out.after.low_share) < Number(out.before.low_share) ? 'good' : Number(out.after.low_share) > Number(out.before.low_share) ? 'bad' : 'mid'} how="Share of the hospital's SNF volume landing in homes rated 1 or 2 stars overall." />
              </StatRow>
            </div>
            <div className="t-caption mt-3 max-w-[68ch]">{out.nViable.toLocaleString()} homes nationwide meet the bar; only those within {s.maxMiles} miles of a displaced patient's original home receive volume. This is arithmetic on CMS's published facility rates, not a prediction for any patient: it assumes a moved patient experiences the receiving home's average rate, that the receiving homes have beds, and that the patient and family agree. Use it to size the opportunity, not to promise it.</div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="panel panel-pad">
              <h2 className="section-title">Homes that would receive patients <span className="t-caption font-normal">· {out.nReceiving}{out.nReceiving > out.gains.length ? `, largest ${out.gains.length} shown` : ''}</span></h2>
              <div className="overflow-x-auto"><table className="tbl tbl-compact mt-2">
                <thead><tr><th>SNF</th><th><StripHeader /></th><th className="num">Share gained</th><th className="num">Miles from original</th><th className="num">Rehosp.</th><th className="num">Readmit after SNF</th></tr></thead>
                <tbody>{out.gains.map(g => <tr key={String(g.ccn)}><td><Link to={`/facility/${g.ccn}`} className="hover:underline">{titleCase(String(g.provider_name))}</Link><span className="sub">{titleCase(String(g.city_town))}, {String(g.state)}</span></td><td><QualityStrip row={g} /></td><td className="num font-medium">+{fmtPct(100 * Number(g.gained), 1)}</td><td className="num">{Number(g.miles).toFixed(1)}</td><td className="num">{pct(g.qm_521_adj)}</td><td className="num">{pct(g.qrp_004_ppr_pd_rsrr)}</td></tr>)}</tbody>
              </table></div>
            </section>
            <section className="panel panel-pad">
              <h2 className="section-title">Homes that would lose patients <span className="t-caption font-normal">· {out.nLosing}{out.nLosing > out.losses.length ? `, largest ${out.losses.length} shown` : ''}</span></h2>
              <div className="overflow-x-auto"><table className="tbl tbl-compact mt-2">
                <thead><tr><th>SNF</th><th>Stars</th><th className="num">Share today</th><th className="num">Moved out</th><th className="num">Rehosp.</th><th className="num">Readmit after SNF</th></tr></thead>
                <tbody>{out.losses.map(g => <tr key={String(g.ccn)}><td><Link to={`/facility/${g.ccn}`} className="hover:underline">{titleCase(String(g.provider_name))}</Link><span className="sub">{titleCase(String(g.city_town))}, {String(g.state)}{g.special_focus_status ? <span className="text-rust"> · {String(g.special_focus_status)}</span> : ''}{g.abuse_icon === 'Y' ? <span className="text-rust"> · abuse icon</span> : ''}</span></td><td><Stars value={g.overall_rating} /></td><td className="num">{fmtPct(100 * Number(g.before_w), 1)}</td><td className="num font-medium">−{fmtPct(100 * Number(g.lost), 1)}</td><td className="num">{pct(g.qm_521_adj)}</td><td className="num">{pct(g.qrp_004_ppr_pd_rsrr)}</td></tr>)}</tbody>
              </table></div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
