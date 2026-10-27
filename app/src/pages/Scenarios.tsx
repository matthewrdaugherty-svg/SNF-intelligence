import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { DEFAULTS, OBJECTIVE_LABEL, OBJECTIVE_WORD, UNIT_LABEL, WEIGHT_LABEL, fromParams, runScenario, toParams, type Objective, type Outcome, type ScenarioParams, type Weights } from '../lib/scenario'
import { hospitalsByCcn, searchHospitals, type HospitalLite } from '../lib/hospitals'
import { fmtInt, fmtPct, fmtUsd, titleCase } from '../lib/format'
import { Empty, FlagCell, QualityStrip, StripHeader, Stat, StatRow } from '../components/ui'
import { verdictStyle } from '../lib/verdict'

const pct = (v: unknown, d = 1) => v == null ? '–' : fmtPct(Number(v), d)
/** Verdict on the numbers AS DISPLAYED (D-026): both sides are rounded to the shown precision before comparing, so the pill never contradicts the figures beside it. */
const delta = (a: unknown, b: unknown, lowerBetter: boolean, unit: 'usd' | 'stars' | 'pts' | 'pts0') => {
  if (a == null || b == null) return null
  const dec = unit === 'usd' ? 0 : unit === 'stars' ? 2 : unit === 'pts0' ? 0 : 1
  const d = Number(Number(b).toFixed(dec)) - Number(Number(a).toFixed(dec)); const better = lowerBetter ? d < 0 : d > 0
  const shown = Number(Math.abs(d).toFixed(dec))
  const txt = unit === 'usd' ? fmtUsd(shown) : unit === 'stars' ? shown.toFixed(2) + '★' : `${shown.toFixed(dec)} pts`
  return { kind: shown === 0 ? 'same' as const : better ? 'better' as const : 'worse' as const, text: shown === 0 ? 'no change' : `${txt} ${better ? 'better' : 'worse'}` }
}

export default function Scenarios() {
  const [params, setParams] = useSearchParams()
  const s = useMemo(() => fromParams(params), [params])
  const [hosp, setHosp] = useState<HospitalLite | null>(null)
  const [text, setText] = useState('')
  const [results, setResults] = useState<HospitalLite[]>([])
  const [out, setOut] = useState<Outcome | null>(null)
  const [opt, setOpt] = useState<Outcome | null>(null)   // the same constraints, optimal allocation — the ceiling the user's scenario is measured against
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
    runScenario(s).then(async o => {
      const best = s.mode === 'optimal' ? o : await runScenario({ ...s, mode: 'optimal' }, 'opt')
      if (live) { setOut(o); setOpt(best); setBusy(false) }
    }).catch(e => { if (live) { setError(String((e as Error)?.message ?? e)); setBusy(false) } })
    return () => { live = false }
  }, [s])

  /** 'SNF(s)' when the acceptable set is Medicare-certified SNFs only, else 'facility / facilities' — never a bare 'facility', which reads as the patient's home. */
  const F = s?.snfOnly ? 'SNFs' : 'facilities', F1 = s?.snfOnly ? 'SNF' : 'facility'
  const objWord = s ? OBJECTIVE_WORD[s.objective] : ''
  /** Shares as whole percentages; anything that would round to 0% but is not zero reads "<1%". */
const sharePct = (x: number) => x > 0 && x < 0.005 ? '<1%' : fmtPct(100 * x, 0)
const miles = (m: number) => `${Number.isInteger(m) ? m : m.toFixed(1)} ${m === 1 ? 'mile' : 'miles'}`

  const per = s?.n ?? 1000
  const unitWord = s?.n ? 'per year' : 'per 1,000 SNF discharges'
  const avoided = (a: unknown, b: unknown) => a == null || b == null ? null : (Number(a) - Number(b)) / 100 * per
  const d521 = out ? delta(out.before.r521, out.after.r521, true, 'pts') : null
  const d004 = out ? delta(out.before.r004, out.after.r004, true, 'pts') : null
  const d005 = out ? delta(out.before.r005, out.after.r005, false, 'pts') : null
  const dpay = out ? delta(out.before.pay_per_stay, out.after.pay_per_stay, true, 'usd') : null
  const dlow = out ? delta(100 * Number(out.before.low_share), 100 * Number(out.after.low_share), true, 'pts0') : null

  return (
    <div className="page stack">
      <div><h1>Placement scenarios</h1>
        <p className="t-body text-ink-2 mt-2 max-w-3xl">Pick a hospital, define which SNFs count as acceptable, and see what happens if the patients who would have gone to the other facilities went to the nearest acceptable ones instead — or, with Optimize, to the best-fit acceptable facility: readmissions, discharge to community, Medicare cost per stay and extra travel. Modeled from CMS facility rates; when the hospital's own discharge counts are loaded on the Flows page the same arithmetic runs on them.</p></div>

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
              <label className="flex items-center gap-2 t-body mt-3 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={s.excludeFlags} onChange={e => set({ excludeFlags: e.target.checked })} />Exclude special-focus and abuse-icon facilities</label>
              <label className="flex items-center gap-2 t-body mt-1 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={s.snfOnly} onChange={e => set({ snfOnly: e.target.checked })} />Medicare-certified SNFs only</label>
            </div>
            <div>
              <div className="flabel">Required dedicated units</div>
              {Object.entries(UNIT_LABEL).map(([k, l]) => <label key={k} className="flex items-center gap-2 t-body mt-1 cursor-pointer"><input type="checkbox" className="accent-accent w-4 h-4" checked={s.units.includes(k)} onChange={e => set({ units: e.target.checked ? [...s.units, k] : s.units.filter(u => u !== k) })} />{l}</label>)}
              <div className="flabel mt-3">Minimum case-mix overlap</div>
              <div className="flex items-center gap-2"><input type="range" min={0} max={70} step={5} value={s.minOverlap == null ? 0 : Math.round(100 * s.minOverlap)} onChange={e => set({ minOverlap: Number(e.target.value) === 0 ? null : Number(e.target.value) / 100 })} className="w-full" aria-label="Minimum case-mix overlap" /><span className="t-body tabular-nums w-14 text-right">{s.minOverlap == null ? 'off' : `${Math.round(100 * s.minOverlap)}%`}</span></div>
              <div className="fhelp">Facilities whose published diagnosis mix is too thin to score are excluded when this is on. Overlap compares hospital admitting diagnoses with SNF-stay diagnoses, which differ by nature (aftercare, rehabilitation), so even a well-matched facility rarely scores above about 70%.</div>
            </div>
            <div>
              <div className="flabel">How far a patient can be moved</div>
              <div className="flex items-center gap-2"><input type="range" min={1} max={60} step={1} value={s.maxMiles} onChange={e => set({ maxMiles: Number(e.target.value) })} className="w-full" aria-label="Maximum miles" /><span className="t-body tabular-nums w-14 text-right">{s.maxMiles} mi</span></div>
              <div className="fhelp">From the facility they would otherwise have used. Moved volume is split equally across the nearest acceptable facilities (Optimize sends it to the best fit with room instead).</div>
              <div className="flabel mt-3">Spread across the nearest</div>
              <div role="radiogroup" aria-label="Number of receiving SNFs" className="seg">{[1, 3, 5].map(v => <button key={v} role="radio" aria-checked={s.k === v} className="press seg-btn" onClick={() => set({ k: v })}>{v} {v > 1 ? 'facilities' : 'facility'}</button>)}</div>
              <div className="flabel mt-3">Share of those patients actually moved</div>
              <div className="flex items-center gap-2"><input type="range" min={10} max={100} step={10} value={Math.round(100 * s.shift)} onChange={e => set({ shift: Number(e.target.value) / 100 })} className="w-full" aria-label="Share moved" /><span className="t-body tabular-nums w-14 text-right">{Math.round(100 * s.shift)}%</span></div>
              <div className="flabel mt-3">Optimize for</div>
              <select className="control w-full" value={s.objective} onChange={e => set({ objective: e.target.value as Objective })} aria-label="Optimize for">{(Object.keys(OBJECTIVE_LABEL) as Objective[]).map(o => <option key={o} value={o}>{OBJECTIVE_LABEL[o]}{o === 'balanced' ? ' (recommended)' : ''}</option>)}</select>
              {s.objective === 'blend' && <div className="mt-2 space-y-1.5" data-testid="blend-weights">{WEIGHT_LABEL.map((l, i) => <div key={l} className="grid grid-cols-[1fr_96px_28px] items-center gap-2"><span className="t-caption">{l}</span><input type="range" min={0} max={10} step={1} value={s.weights[i]} aria-label={`Weight: ${l}`} onChange={e => { const w = [...s.weights] as Weights; w[i] = Number(e.target.value); if (w.every(x => x === 0)) return; set({ weights: w }) }} /><span className="t-caption tabular-nums text-right">{s.weights[i]}</span></div>)}</div>}
              <div className="fhelp">What "best fit" means when you press Optimize. Balanced and custom blends score each SNF by its national percentile on each measure (1 = best in the country) and average them with the weights; a measure CMS has not published for a SNF drops out of its average. Ties: higher rating, then lower readmission after SNF discharge, then nearer.</div>
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
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="section-title">{s.mode === 'optimal' ? 'Optimal scenario' : 'Result'} <span className="t-caption font-normal ml-2">{out.source === 'reported' ? 'on the hospital\'s reported discharge counts' : 'Modeled baseline (service-area model)'}{busy ? ' · recalculating…' : ''}</span></h2>
              {s.mode === 'optimal'
                ? <button className="press btn btn-surface ml-auto" onClick={() => set({ mode: 'nearest' })}>Back to my scenario</button>
                : <button className="press btn btn-primary ml-auto" onClick={() => set({ mode: 'optimal' })} title="Every patient below the bar goes to the best acceptable facility within reach that has room: the total opportunity">Optimize</button>}
            </div>
            <p className="t-lead mt-2">
              Of this hospital's SNF volume, <b>{sharePct(out.belowBar)}</b> goes to {F} that do not meet the bar{out.source === 'modeled' ? <> when allocated pro rata by each {F1}'s Medicare volume in the patient's ZIP code</> : null}.
              {out.belowBar > 0 && s.mode === 'optimal' ? <> Sending all of it to the best acceptable {F1} within {miles(s.maxMiles)} that still has room — best meaning <b>{objWord}</b> — reaches <b>{fmtInt(out.nReceiving)}</b> {out.nReceiving === 1 ? F1 : F}{out.unreachable > 0.00005 ? <>; <b>{sharePct(out.unreachable)}</b> of the volume has no acceptable {F1} within reach</> : null}{out.full > 0.00005 ? <>; <b>{sharePct(out.full)}</b> cannot move because every acceptable {F1} within reach is full</> : null}.</> : null}
              {out.belowBar > 0 && s.mode !== 'optimal' ? <> {s.shift < 1 ? <>Moving <b>{Math.round(100 * s.shift)}%</b> of it</> : 'Moving it'} to the nearest acceptable {F} within {miles(s.maxMiles)} that still have room reaches <b>{fmtInt(out.nReceiving)}</b> {out.nReceiving === 1 ? F1 : F}{out.unreachable > 0.00005 ? <>; <b>{sharePct(out.unreachable)}</b> of the volume has no acceptable {F1} within reach</> : null}{out.full > 0.00005 ? <>; <b>{sharePct(out.full)}</b> cannot move because every acceptable {F1} within reach is full</> : null}.</> : null}
              {d004 && d004.kind !== 'same' ? <> Readmissions within 30 days of SNF discharge would be <span style={verdictStyle(d004.kind)}>{d004.text}</span> ({pct(out.before.r004)} → {pct(out.after.r004)}){avoided(out.before.r004, out.after.r004) != null ? <>, {Math.abs(avoided(out.before.r004, out.after.r004)!) < 0.5 ? <>fewer than <b>1</b></> : <>about <b>{fmtInt(Math.round(Math.abs(avoided(out.before.r004, out.after.r004)!)))}</b></>} {Number(out.after.r004) < Number(out.before.r004) ? 'fewer' : 'more'} {Math.abs(avoided(out.before.r004, out.after.r004)!) < 1.5 ? 'readmission' : 'readmissions'} {unitWord}</> : null}.</> : null}
              {dpay && dpay.kind !== 'same' ? <> Medicare's payment per SNF stay would be <span style={verdictStyle(dpay.kind)}>{dpay.text}</span>.</> : null}
              {out.addedMiles != null && out.moved > 0 ? <> The receiving {F1} is on average <b>{miles(out.addedMiles)}</b> from the {F1} the patient would otherwise have used — an upper bound on the extra travel from the patient's own address.</> : null}
              {out.unknownShare > 0.00005 ? <> <b>{sharePct(out.unknownShare)}</b> of the uploaded discharges went to CCNs that are not in Care Compare and are left out.</> : null}
            </p>
            <div className="mt-4">
              <StatRow source="Modeled" cols={5} note={`before → after, volume-weighted across the SNFs in the baseline (${out.nBaseline}) and after the move; a facility without a published rate is left out of that rate`}>
                <Stat label="Readmitted within 30 days of SNF discharge" value={pct(out.after.r004)} note={`before ${pct(out.before.r004)} · rates cover ${fmtPct(100 * Number(out.after.c004), 0)} of volume`} verdict={d004} how="CMS QRP 004 (potentially preventable 30-day readmissions after SNF discharge), weighted by each SNF's share of the hospital's SNF volume before and after the move." />
                <Stat label="Short-stay residents rehospitalized" value={pct(out.after.r521)} note={`before ${pct(out.before.r521)}`} verdict={d521} how="CMS QM 521 (risk-adjusted), volume-weighted." />
                <Stat label="Successful discharge to community" value={pct(out.after.r005)} note={`before ${pct(out.before.r005)}`} verdict={d005} how="CMS QRP 005, volume-weighted." />
                <Stat label="Medicare payment per SNF stay" value={out.after.pay_per_stay != null ? fmtUsd(Number(out.after.pay_per_stay)) : '–'} note={`before ${out.before.pay_per_stay != null ? fmtUsd(Number(out.before.pay_per_stay)) : '–'}${s.n && dpay && dpay.kind !== 'same' ? ` · ${fmtUsd(Math.abs((Number(out.after.pay_per_stay) - Number(out.before.pay_per_stay)) * s.n))} per year` : ''}`} verdict={dpay} how="Each SNF's 2024 Medicare fee-for-service payment divided by its stays (CMS Post-Acute Care PUF), volume-weighted. A cost proxy for the SNF stay only; it does not include the hospital stay, readmissions or care after the SNF." />
                <Stat label="Volume in 1–2★ facilities" value={fmtPct(100 * Number(out.after.low_share), 0)} note={`before ${fmtPct(100 * Number(out.before.low_share), 0)} · average rating ${Number(out.before.stars).toFixed(2)} → ${Number(out.after.stars).toFixed(2)}`} verdict={dlow} how="Share of the hospital's SNF volume landing in facilities rated 1 or 2 stars overall." />
              </StatRow>
            </div>
            {opt && s.mode !== 'optimal' && (
              <div className="mt-5" data-testid="realization">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2"><h3 className="t-title font-semibold whitespace-nowrap">Realization against the optimal scenario</h3><span className="t-caption">the share of the optimal improvement your scenario captures (optimal = every patient below the bar to the best acceptable {F1} within {miles(s.maxMiles)} that has room, best = {objWord})</span></div>
                <StatRow source="Modeled" cols={4} note="a P&L and clinical-leadership metric: track it as real placements come in">
                  {([['Readmitted within 30 days of SNF discharge', 'r004', true, (v: unknown) => pct(v)], ['Short-stay residents rehospitalized', 'r521', true, (v: unknown) => pct(v)], ['Successful discharge to community', 'r005', false, (v: unknown) => pct(v)], ['Medicare payment per SNF stay', 'pay_per_stay', true, (v: unknown) => v == null ? '–' : fmtUsd(Number(v))]] as const).map(([label, key, lowerBetter, f]) => {
                    const b = out.before[key], a = out.after[key], o = opt.after[key]
                    const room = b == null || o == null ? null : (lowerBetter ? Number(b) - Number(o) : Number(o) - Number(b))
                    const got = b == null || a == null ? null : (lowerBetter ? Number(b) - Number(a) : Number(a) - Number(b))
                    const r = room == null || got == null || room <= 0 ? null : Math.max(0, got / room)   // may exceed 1: the best-fit ranking optimizes rating and QRP 004 first, so a nearest split can beat it on another measure
                    const yr = key === 'pay_per_stay' && s.n && room != null ? ` · ${fmtUsd(room * s.n)} per year at the optimum` : ''
                    return <Stat key={key} label={`Realization: ${label}`} value={r == null ? '–' : r > 1 ? 'over 100%' : fmtPct(100 * r, 0)} verdict={r == null ? null : { kind: r >= 0.8 ? 'better' : r >= 0.4 ? 'same' : 'worse', text: r > 1 ? 'beats the optimal' : r >= 0.8 ? 'most of it' : r >= 0.4 ? 'part of it' : 'little of it' }}
                      note={room == null ? 'no room to improve under these constraints' : `yours ${f(a)} · optimal ${f(o)}${yr}`} how={`(before − yours) ÷ (before − optimal) on ${label.toLowerCase()}, volume-weighted; before is ${f(b)}. 100% means your scenario captures the whole modeled opportunity. The optimal allocation ranks facilities by the objective you chose (${objWord}) and respects each facility's room; a single-measure objective can lose ground on the other measures, and a nearest-facility split can even beat it there, shown as "over 100%".`} />
                  })}
                </StatRow>
              </div>
            )}
            <div className="t-caption mt-3 max-w-[68ch]">{out.nViable.toLocaleString()} {F} nationwide meet the bar; only those within {miles(s.maxMiles)} of the {F1} a displaced patient would otherwise have used receive volume. Capacity: each receiving {F1} can take extra Medicare stays only up to its empty beds (certified beds minus average residents per day, Care Compare) × 365 ÷ its own Medicare length of stay (PAC PUF), {out.annualSource === 'given' ? `checked against the ${fmtInt(out.annual!)} annual SNF discharges you entered` : out.annualSource === 'estimated' ? `checked against an estimated ${fmtInt(out.annual!)} annual SNF discharges (the hospital's 2024 Medicare discharges × 18.7%, the MedPAC share of fee-for-service discharges that go to a SNF — enter the real number above to replace it)` : 'but this hospital has no 2024 Medicare discharge count, so no capacity check was possible'}. Distances are straight lines between the two facilities' Care Compare coordinates. This is arithmetic on CMS's published facility rates, not a prediction for any patient: it assumes a moved patient experiences the receiving facility's average rate, that the receiving facilities have beds, and that the patient and family agree. Use it to size the opportunity, not to promise it.</div>
          </section>

          <div className="stack">
            <section className="panel panel-pad">
              <h2 className="section-title">{F.charAt(0).toUpperCase() + F.slice(1)} that would receive patients <span className="t-caption font-normal">· {out.nReceiving}{out.nReceiving > out.gains.length ? `, largest ${out.gains.length} shown` : ''}</span></h2>
              <div className="overflow-x-auto"><table className="tbl tbl-compact mt-2">
                <thead><tr><th>SNF</th><th><StripHeader /></th><th>Abuse icon</th><th className="num">Share gained</th>{out.annual != null && <th className="num" title="Extra stays per year this scenario sends here">Stays gained</th>}{out.annual != null && <th className="num" title="Empty beds × 365 ÷ the facility's Medicare length of stay">Room (stays/yr)</th>}<th className="num">Miles from original</th><th className="num">Rehosp.</th><th className="num">Readmit after SNF</th></tr></thead>
                <tbody>{out.gains.map(g => { const stays = out.annual != null ? Number(g.gained) * out.annual : null; const room = Number(g.capacity_stays ?? 0); return <tr key={String(g.ccn)}><td><Link to={`/facility/${g.ccn}`} className="hover:underline">{titleCase(String(g.provider_name))}</Link><span className="sub">{titleCase(String(g.city_town))}, {String(g.state)}</span></td><td><QualityStrip row={g} /></td><td><FlagCell row={g} /></td><td className="num font-medium">+{fmtPct(100 * Number(g.gained), 1)}</td>{stays != null && <td className="num">{fmtInt(Math.round(stays))}</td>}{stays != null && <td className="num" title={`${Number(g.empty_beds ?? 0).toFixed(1)} empty beds`}>{fmtInt(Math.round(room))}{room > 0 && stays >= room - 0.5 ? <span className="t-caption text-ink-3"> · full</span> : ''}</td>}<td className="num">{Number(g.miles).toFixed(1)}</td><td className="num">{pct(g.qm_521_adj)}</td><td className="num">{pct(g.qrp_004_ppr_pd_rsrr)}</td></tr> })}</tbody>
              </table></div>
            </section>
            <section className="panel panel-pad">
              <h2 className="section-title">{F.charAt(0).toUpperCase() + F.slice(1)} that would lose patients <span className="t-caption font-normal">· {out.nLosing}{out.nLosing > out.losses.length ? `, largest ${out.losses.length} shown` : ''}</span></h2>
              <div className="overflow-x-auto"><table className="tbl tbl-compact mt-2">
                <thead><tr><th>SNF</th><th><StripHeader /></th><th>Abuse icon</th><th className="num">Share today</th><th className="num">Moved out</th><th className="num">Rehosp.</th><th className="num">Readmit after SNF</th></tr></thead>
                <tbody>{out.losses.map(g => <tr key={String(g.ccn)}><td><Link to={`/facility/${g.ccn}`} className="hover:underline">{titleCase(String(g.provider_name))}</Link><span className="sub">{titleCase(String(g.city_town))}, {String(g.state)}</span></td><td><QualityStrip row={g} /></td><td><FlagCell row={g} /></td><td className="num">{fmtPct(100 * Number(g.before_w), 1)}</td><td className="num font-medium">−{fmtPct(100 * Number(g.lost), 1)}</td><td className="num">{pct(g.qm_521_adj)}</td><td className="num">{pct(g.qrp_004_ppr_pd_rsrr)}</td></tr>)}</tbody>
              </table></div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
