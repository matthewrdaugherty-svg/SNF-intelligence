import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { q, sqlStr } from '../lib/db'
import { GROUPS, type Measure } from '../lib/measures'
import { fmt, fmtUsd, titleCase, countyLabel } from '../lib/format'
import { useCompare, compareStore, MAX_COMPARE } from '../lib/compare'
import { Fn, Flag, Stars, Empty, useReference, ReferenceError } from '../components/ui'
import type { Reference } from '../lib/reference'

type Row = Record<string, unknown>

/** Facility value vs state and national averages on one quiet track. */
function Track({ value, state, nation, m }: { value: number | null; state: number | null; nation: number | null; m: Measure }) {
  const pts = [value, state, nation].filter((x): x is number => x != null && !Number.isNaN(x))
  if (value == null || !pts.length || m.unit === 'stars' || m.unit === 'rank' || m.unit === 'text' || m.unit === 'date') return null
  const lo = Math.min(0, ...pts), hi = Math.max(...pts) * 1.12 || 1
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div className="relative h-5 w-full" aria-hidden>
      <div className="absolute left-0 right-0 top-1/2 h-px bg-hairline" />
      {nation != null && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-px bg-ink-3" style={{ left: x(nation) }} title={`Nation ${fmt(nation, m.unit, m.decimals)}`} />}
      {state != null && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-px bg-ink-2" style={{ left: x(state) }} title={`State ${fmt(state, m.unit, m.decimals)}`} />}
      {value != null && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-ink" style={{ left: x(value) }} />}
    </div>
  )
}

/** Difference vs. the state average, worded so it cannot contradict the numbers beside it:
 *  percentage measures differ in points, counts are shown to one decimal, and anything that rounds to zero is "about the same". */
function Delta({ value, cmp, m }: { value: number | null; cmp: number | null; m: Measure }) {
  if (value == null || cmp == null || m.direction === 'none' || m.unit === 'stars') return null
  const d = value - cmp
  const dec = m.unit === 'count' ? 1 : m.unit === 'usd' ? 0 : (m.decimals ?? (m.unit === 'pct' || m.unit === 'fraction_pct' ? 1 : 2))
  const scale = m.unit === 'fraction_pct' ? 100 : 1
  const shown = Number((Math.abs(d) * scale).toFixed(dec))
  if (shown === 0) return <span className="text-ink-3">about the same as state</span>
  const better = m.direction === 'lower' ? d < 0 : d > 0
  const abs = m.unit === 'pct' || m.unit === 'fraction_pct' ? `${shown.toFixed(dec)} pts` : m.unit === 'usd' ? fmtUsd(shown) : m.unit === 'count' ? shown.toFixed(1) : fmt(shown, m.unit, dec)
  return <span className={better ? 'text-ink font-medium' : 'text-ink-2'}>{abs} {better ? 'better' : 'worse'} than state</span>
}

/** Averages are shown to one decimal for stars and counts so the same number never appears two ways. */
const avg = (v: number, m: Measure) => m.unit === 'stars' || m.unit === 'count' ? v.toFixed(1) : fmt(v, m.unit, m.decimals)
function MeasureRow({ m, row, ref, state }: { m: Measure; row: Row; ref: Reference | null; state: string }) {
  const raw = row[m.key]; const v = raw == null || raw === '' ? null : Number(raw)
  const st = m.state ? ref?.stateAvg[state]?.[m.state] ?? null : null
  const nat = m.national ? ref?.national[m.national] ?? null : m.state ? ref?.stateAvg['NATION']?.[m.state] ?? null : null
  const fn = m.fn ? row[m.fn] : null
  const comp = m.compPerf ? row[m.compPerf] : null
  const vol = m.volume ? row[m.volume] : null
  return (
    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_1fr_200px] items-center gap-x-4 gap-y-1 py-2 border-b border-hairline/60 last:border-0" data-testid={`measure-${m.key}`}>
      <div className="text-sm text-ink">{m.label}{m.note && <div className="text-[11px] text-ink-3">{m.note}</div>}</div>
      <div className="text-right text-sm tabular-nums">
        {m.unit === 'stars' ? <Stars value={v} /> : <span className="font-medium">{fmt(v, m.unit, m.decimals)}</span>}
        {v == null && <Fn code={fn} ref={ref} />}
        {v != null && fn ? <Fn code={fn} ref={ref} /> : null}
      </div>
      <div className="hidden md:block"><Track value={v} state={st} nation={nat} m={m} /></div>
      <div className="text-[11px] text-ink-2 leading-tight col-span-2 md:col-span-1">
        {st != null && <div>State avg {avg(st, m)}{nat != null ? ` · Nation ${avg(nat, m)}` : ''}</div>}
        {st == null && nat != null && <div>Nation {avg(nat, m)}</div>}
        {st != null && <Delta value={v} cmp={st} m={m} />}
        {comp ? <div className="text-ink">{String(comp)}</div> : null}
        {vol != null ? <div className="text-ink-3">{Number(vol).toLocaleString()} eligible stays</div> : null}
      </div>
    </div>
  )
}

export default function Facility() {
  const { ccn = '' } = useParams()
  const [row, setRow] = useState<Row | null | undefined>(undefined)
  const [pen, setPen] = useState<Row[]>([])
  const [cit, setCit] = useState<Row[]>([])
  const [own, setOwn] = useState<Row[]>([])
  const ref = useReference()
  const compare = useCompare()
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setRow(undefined); setPen([]); setCit([]); setOwn([]); setLoadError(null)
    const c = sqlStr(ccn)
    Promise.all([
      q(`SELECT * FROM facility_master WHERE ccn = ${c}`),
      q(`SELECT * FROM penalties WHERE ccn = ${c} ORDER BY penalty_date DESC`),
      q(`SELECT * FROM citations_gl WHERE ccn = ${c} ORDER BY survey_date DESC`),
      q(`SELECT * FROM ownership WHERE ccn = ${c} ORDER BY role, owner_name`),
    ]).then(([f, p, ci, o]) => { if (!live) return; setRow(f[0] ?? null); setPen(p); setCit(ci); setOwn(o) }).catch(e => { if (live) { setLoadError(String(e?.message ?? e)); setRow(null) } })
    return () => { live = false }
  }, [ccn])
  const state = String(row?.state ?? '')
  const inCmp = compare.includes(ccn)
  const ownerGroups = useMemo(() => {
    const g = new Map<string, Row[]>()
    for (const o of own) { const k = String(o.role); g.set(k, [...(g.get(k) ?? []), o]) }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [own])

  if (row === undefined) return <div className="p-8 text-sm text-ink-2">Loading…</div>
  if (loadError) return <Empty title="This facility could not be loaded.">{loadError} — <Link className="underline" to="/explore">Back to Explore</Link></Empty>
  if (row === null) return <Empty title={`No facility with CCN ${ccn}.`}><Link className="underline" to="/explore">Back to Explore</Link></Empty>

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      <ReferenceError />
      <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-3 mb-1"><Link to="/explore" className="hover:underline">Explore</Link> / {state}</div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{titleCase(String(row.provider_name))}</h1>
          <div className="text-sm text-ink-2 mt-1">{titleCase(String(row.provider_address))}, {titleCase(String(row.city_town))}, {state} {String(row.zip_code)} · {countyLabel(String(row.county_parish), state)} · CCN {ccn}</div>
          <div className="text-sm text-ink-2 mt-1">
            {String(row.ownership_type)} · {row.number_of_certified_beds != null ? `${Number(row.number_of_certified_beds)} certified beds` : 'beds not reported'}
            {row.average_number_of_residents_per_day != null ? ` · ${Number(row.average_number_of_residents_per_day).toFixed(1)} residents per day` : ''}
            {row.chain_name ? ` · ${titleCase(String(row.chain_name))} (${Number(row.number_of_facilities_in_chain)} facilities)` : ''}
            {row.provider_resides_in_hospital === 'Y' ? ' · located in a hospital' : ''} · {String(row.provider_type)}
            {row.date_first_approved_to_provide_medicare_and_medicaid_services ? ` · certified since ${String(row.date_first_approved_to_provide_medicare_and_medicaid_services).slice(0, 4)}` : ''}
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {row.special_focus_status ? <Flag>{String(row.special_focus_status)}</Flag> : null}
            {row.abuse_icon === 'Y' ? <Flag>Abuse icon</Flag> : null}
            {row.high_performing_icon === 'Y' ? <span className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-well text-ink">High performing</span> : null}
            {row.provider_changed_ownership_in_last_12_months === 'Y' ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-well text-ink-2">Changed ownership in the last 12 months</span> : null}
            {row.most_recent_health_inspection_more_than_2_years_ago === 'Y' ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-well text-ink-2">Last health inspection more than 2 years ago</span> : null}
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-start md:items-end gap-2">
          <button className={`press btn ${inCmp ? 'btn-surface' : 'btn-primary'} text-sm`} onClick={() => compareStore.toggle(ccn)} disabled={!inCmp && compare.length >= MAX_COMPARE}>
            {inCmp ? 'Remove from compare' : compare.length >= MAX_COMPARE ? `Compare is full (${MAX_COMPARE})` : 'Add to compare'}
          </button>
          <a className="text-xs text-ink-2 hover:underline" href={`https://www.medicare.gov/care-compare/details/nursing-home/${ccn}?state=${state}`} target="_blank" rel="noreferrer">Open on Medicare Care Compare</a>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        {GROUPS[0].measures.slice(0, 1).concat(GROUPS[0].measures.slice(1, 3), GROUPS[0].measures.slice(5, 6)).map(m => (
          <div key={m.key} className="bg-surface rounded-[10px] p-4">
            <div className="text-xs text-ink-2 mb-2">{m.label}{m.key === 'overall_rating' ? ' rating' : ''}</div>
            <div className="flex flex-wrap items-end gap-2"><Stars value={row[m.key]} size="lg" /><Fn code={m.fn ? row[m.fn] : null} ref={ref} />
              {m.state && ref?.stateAvg[state]?.[m.state] != null && <span className="text-xs text-ink-3 ml-auto whitespace-nowrap">state avg {Number(ref.stateAvg[state][m.state]).toFixed(1)}</span>}</div>
          </div>
        ))}
      </div>

      {GROUPS.map(g => (
        <section key={g.id} className="mt-8 bg-surface rounded-[10px] px-5 py-4">
          <h2 className="font-medium text-ink">{g.title}</h2>
          {g.blurb && <p className="text-xs text-ink-2 mt-0.5 mb-2">{g.blurb}</p>}
          <div className="hidden md:grid grid-cols-[1fr_120px_1fr_200px] gap-4 text-[11px] text-ink-3 pb-1 border-b border-hairline"><div>Measure</div><div className="text-right">This facility</div><div>Dot = facility · tall mark = state · short mark = nation</div><div>Comparison</div></div>
          {g.id === 'vbp' && row.vbp_in_program !== 'Y' ? <div className="text-sm text-ink-2 py-2">Not in the SNF Value-Based Purchasing program for FY2026 (CMS excludes facilities with too few eligible stays, Medicaid-only facilities and some others), so there is no ranking, score or multiplier.</div>
            : (g.id === 'ratings' ? g.measures.slice(3) : g.measures).map(m => <MeasureRow key={m.key} m={m} row={row} ref={ref} state={state} />)}
          {g.id === 'enforcement' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div>
                <div className="text-sm font-medium mb-1">Penalties <span className="text-ink-3 font-normal">· {pen.length}</span></div>
                {pen.length === 0 ? <div className="text-xs text-ink-3">None in the published window.</div> : (
                  <table className="w-full text-sm"><tbody>
                    {pen.map((p, i) => <tr key={i} className="border-b border-hairline/60"><td className="py-1 tabular-nums text-ink-2 w-24">{String(p.penalty_date)}</td><td className="py-1">{String(p.penalty_type)}</td><td className="py-1 text-right tabular-nums">{p.penalty_type === 'Fine' ? fmtUsd(Number(p.fine_amount)) : `${Number(p.payment_denial_length_in_days)} days from ${String(p.payment_denial_start_date)}`}</td></tr>)}
                  </tbody></table>
                )}
              </div>
              <div>
                <div className="text-sm font-medium mb-1">Deficiencies at severity G or worse <span className="text-ink-3 font-normal">· {cit.length}</span></div>
                {cit.length === 0 ? <div className="text-xs text-ink-3">None in the last three inspection cycles.</div> : (
                  <div className="max-h-80 overflow-auto">
                    {cit.map((c, i) => (
                      <div key={i} className="py-1.5 border-b border-hairline/60 text-sm">
                        <div className="flex gap-2 text-xs text-ink-2 tabular-nums"><span>{String(c.survey_date)}</span><span className="text-rust font-medium">Severity {String(c.scope_severity_code)}</span><span>Tag {String(c.deficiency_tag_number)}</span>{c.complaint_deficiency === 'Y' && <span>complaint</span>}{c.deficiency_corrected ? <span className="text-ink-3">{String(c.deficiency_corrected)}</span> : null}{(c.citation_under_idr === 'Y' || c.citation_under_iidr === 'Y') && <span className="text-ink-3">under dispute</span>}</div>
                        <div className="text-ink">{String(c.deficiency_description)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      ))}

      <section className="mt-8 bg-surface rounded-[10px] px-5 py-4">
        <h2 className="font-medium text-ink">Ownership and control</h2>
        <p className="text-xs text-ink-2 mt-0.5 mb-2">Ownership interests, operational/managerial control and partnership roles as reported to CMS; officers, directors, managing employees and lenders are in the workbook's Ownership sheet. {row.own_data_available === 'N' ? 'CMS lists no ownership data for this facility.' : `Legal business name: ${titleCase(String(row.legal_business_name ?? ''))}.`}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          {ownerGroups.map(([role, rows]) => (
            <div key={role} className="mb-3">
              <div className="text-xs text-ink-2">{titleCase(role)}</div>
              {rows.map((o, i) => <div key={i} className="text-sm">{titleCase(String(o.owner_name))}<span className="text-ink-3 text-xs">{o.ownership_percentage_raw && !/NOT APPLICABLE|NO PERCENTAGE/.test(String(o.ownership_percentage_raw)) ? ` · ${String(o.ownership_percentage_raw)}` : ''}{o.association_date ? ` · since ${String(o.association_date)}` : ''}</span></div>)}
            </div>
          ))}
        </div>
      </section>
      <div className="text-xs text-ink-3 mt-6 mb-8">Data as of {ref?.meta.data_vintage}. Blank values carry CMS's footnote. State and national figures are the simple averages CMS publishes. “Better/worse” follows our reading of each measure's direction; see Methodology.</div>
    </div>
  )
}
