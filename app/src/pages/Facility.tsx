import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { q, sqlStr } from '../lib/db'
import { GROUPS, MEASURE_COLS, type Measure } from '../lib/measures'
import { fmt, fmtUsd, fmtPct, titleCase, countyLabel } from '../lib/format'
import { useCompare, compareStore, MAX_COMPARE } from '../lib/compare'
import { Fn, Flag, Stars, Empty, Stat, StatRow, tierWord, useReference, ReferenceError } from '../components/ui'
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
/** The verdict is computed on the numbers as displayed (rounded to the shown precision), so the words can never contradict the figures beside them. */
export function verdict(value: number | null, cmp: number | null, m: Measure): { kind: 'better' | 'worse' | 'same'; text: string } | null {
  if (value == null || cmp == null || m.direction === 'none' || m.unit === 'stars') return null
  const dec = m.unit === 'count' ? 1 : m.unit === 'usd' ? 0 : (m.decimals ?? (m.unit === 'pct' || m.unit === 'fraction_pct' ? 1 : 2))
  const scale = m.unit === 'fraction_pct' ? 100 : 1
  const d = Number((value * scale).toFixed(dec)) - Number((cmp * scale).toFixed(dec))
  const shown = Number(Math.abs(d).toFixed(dec))
  if (shown === 0) return { kind: 'same', text: 'same as state' }
  const better = m.direction === 'lower' ? d < 0 : d > 0
  const abs = m.unit === 'pct' || m.unit === 'fraction_pct' ? `${shown.toFixed(dec)} pts` : m.unit === 'usd' ? fmtUsd(shown) : m.unit === 'count' ? shown.toFixed(1) : fmt(shown, m.unit, dec)
  return { kind: better ? 'better' : 'worse', text: `${abs} ${better ? 'better' : 'worse'} than state` }
}
export const verdictStyle = (k: 'better' | 'worse' | 'same' | undefined) => k === 'better' ? { color: 'var(--color-q5)', fontWeight: 600 } : k === 'worse' ? { color: 'var(--color-rust)', fontWeight: 600 } : { color: 'var(--color-ink-3)' }
function Delta({ value, cmp, m }: { value: number | null; cmp: number | null; m: Measure }) {
  const v = verdict(value, cmp, m); if (!v) return null
  return <span style={verdictStyle(v.kind)}>{v.text}</span>
}

const ALL_MEASURES: Measure[] = [...GROUPS.flatMap(g => g.measures), ...MEASURE_COLS.map(c => ({ key: c.key, label: c.label, unit: c.unit, direction: c.direction, fn: c.fn } as Measure))]
const measure = (k: string) => { const m = ALL_MEASURES.find(m => m.key === k); if (!m) throw new Error(`Unknown measure ${k}`); return m }
const num = (v: unknown) => v == null || v === '' ? null : Number(v)
/** Provenance text straight from the lineage file: source CMS file, original column, derivation. Nothing is written by hand. */
function howText(key: string, ref: Reference | null, m: Measure) {
  const l = ref?.lineage.find(x => x['db column'] === key)
  if (!l) return m.note ?? null
  const file = l.source_file.replace(/^[a-z0-9]{4}-[a-z0-9]{4}_\d{4}-\d{2}-\d{2}_/, '').replace(/_Sep2026_\d\.csv$/, '').replace(/_/g, ' ')
  return <>{m.note ? m.note + ' ' : ''}From CMS file “{file}”, column “{l.original_header}”: {l.how_derived.replace(/ — scripts\/.*$/, '')}.</>
}
/** Tone bar = the same verdict as the words (better / worse / same); for QRP measures CMS's own comparison to the national rate wins. */
const tone = (v: number | null, cmp: number | null, m: Measure, compPerf?: unknown): 'good' | 'mid' | 'bad' | undefined => {
  const cp = compPerf == null ? '' : String(compPerf).toLowerCase()
  if (cp.startsWith('better')) return 'good'
  if (cp.startsWith('worse')) return 'bad'
  if (cp.startsWith('no different')) return 'mid'
  const k = verdict(v, cmp, m)?.kind
  return k === 'better' ? 'good' : k === 'worse' ? 'bad' : k === 'same' ? 'mid' : undefined
}
/** One-paragraph snapshot in plain words. Every number comes from the row or the CMS averages; a sentence is dropped when its value is blank. */
function Snapshot({ row, ref, state }: { row: Row; ref: Reference | null; state: string }) {
  const st = (m: Measure) => m.state ? ref?.stateAvg[state]?.[m.state] ?? null : null
  const stars = num(row.overall_rating)
  const m521 = measure('qm_521_adj'), v521 = num(row.qm_521_adj), s521 = st(m521)
  const m004 = measure('qrp_004_ppr_pd_rsrr'), v004 = num(row.qrp_004_ppr_pd_rsrr), n004 = ref?.national[m004.national!] ?? null
  const fines = num(row.pen_total_fines_usd), harm = num(row.hc_n_severity_G_or_worse)
  const mStaff = measure('reported_total_nurse_staffing_hours_per_resident_per_day'), staff = num(row.reported_total_nurse_staffing_hours_per_resident_per_day), sStaff = st(mStaff)
  const beds = num(row.number_of_certified_beds)
  const own = String(row.ownership_type ?? '').split(' - ')[0].toLowerCase()
  const cmpWord = (v: number, c: number, lowerBetter: boolean, dec = 1) => { const d = Number(v.toFixed(dec)) - Number(c.toFixed(dec)); return Math.abs(d) < 1e-9 ? 'the same as' : (lowerBetter ? d < 0 : d > 0) ? 'better than' : 'worse than' }
  const parts: React.ReactNode[] = []
  parts.push(<>{titleCase(String(row.provider_name))} is {stars != null ? <>a <b>{stars}-star</b> ({tierWord(stars)})</> : 'an unrated'}{beds != null ? <>, {beds.toLocaleString()}-bed</> : null} {own} nursing home in {titleCase(String(row.city_town))}, {state}.</>)
  if (v521 != null) parts.push(<> <b>{fmtPct(v521, 1)}</b> of its short-stay residents were rehospitalized{s521 != null ? <>, {cmpWord(v521, s521, true)} the {state} average of {fmtPct(s521, 1)}</> : null}.</>)
  if (v004 != null) parts.push(<> After discharge from this facility, <b>{fmtPct(v004, 1)}</b> of Medicare stays had a potentially preventable readmission within 30 days{n004 != null ? <> (nation {fmtPct(n004, 1)})</> : null}.</>)
  if (harm != null) parts.push(<> CMS recorded <b>{harm} harm-or-jeopardy deficienc{harm === 1 ? 'y' : 'ies'}</b> across the last three inspection cycles{fines != null ? <> and <b>{fmtUsd(fines)}</b> in fines over the three-year penalties window</> : null}.</>)
  else if (fines != null) parts.push(<> CMS recorded <b>{fmtUsd(fines)}</b> in fines over the three-year penalties window.</>)
  if (staff != null) parts.push(<> Nurses provide <b>{staff.toFixed(2)} hours</b> per resident-day{sStaff != null ? <>, {cmpWord(staff, sStaff, false, 2)} the state average of {sStaff.toFixed(2)}</> : null}.</>)
  return <p className="t-lead mt-4" data-testid="snapshot">{parts.map((p, i) => <span key={i}>{p}</span>)}</p>
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
      <div className="text-sm text-ink">{m.label}<div className="text-[11px] text-ink-3">{m.direction === 'lower' ? 'Lower is better' : m.direction === 'higher' ? 'Higher is better' : ''}{m.note ? `${m.direction !== 'none' ? ' · ' : ''}${m.note}` : ''}</div></div>
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
        {comp ? <div style={verdictStyle(String(comp).toLowerCase().startsWith('better') ? 'better' : String(comp).toLowerCase().startsWith('worse') ? 'worse' : 'same')}>CMS: {String(comp).toLowerCase()}</div> : null}
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
  const [pecos, setPecos] = useState<Row | null>(null)
  const ref = useReference()
  const compare = useCompare()
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setRow(undefined); setPen([]); setCit([]); setOwn([]); setPecos(null); setLoadError(null)
    const c = sqlStr(ccn)
    Promise.all([
      q(`SELECT * FROM facility_master WHERE ccn = ${c}`),
      q(`SELECT * FROM penalties WHERE ccn = ${c} ORDER BY penalty_date DESC`),
      q(`SELECT * FROM citations_gl WHERE ccn = ${c} ORDER BY survey_date DESC`),
      q(`SELECT * FROM ownership WHERE ccn = ${c} ORDER BY role, owner_name`),
      q(`SELECT * FROM snf_pecos WHERE ccn = ${c}`),
    ]).then(([f, p, ci, o, pe]) => { if (!live) return; setRow(f[0] ?? null); setPen(p); setCit(ci); setOwn(o); setPecos(pe[0] ?? null) }).catch(e => { if (live) { setLoadError(String(e?.message ?? e)); setRow(null) } })
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
    <div className="page stack">
      <ReferenceError />
      <header className="panel panel-pad">
      <div className="flex flex-col md:flex-row items-start gap-4 md:gap-6">
        <div className="min-w-0 flex-1">
          <div className="t-caption mb-1"><Link to="/explore" className="hover:underline">Explore</Link> / {state}</div>
          <h1>{titleCase(String(row.provider_name))}</h1>
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
        <div className="shrink-0 flex flex-col sm:flex-row md:flex-col items-stretch md:items-end gap-2 w-full md:w-auto">
          <button className={`press btn ${inCmp ? 'btn-surface' : 'btn-primary'}`} onClick={() => compareStore.toggle(ccn)} disabled={!inCmp && compare.length >= MAX_COMPARE}>
            {inCmp ? 'Remove from compare' : compare.length >= MAX_COMPARE ? `Compare is full (${MAX_COMPARE})` : 'Add to compare'}
          </button>
          <a className="press btn btn-quiet" href={`https://www.medicare.gov/care-compare/details/nursing-home/${ccn}?state=${state}`} target="_blank" rel="noreferrer">Open on Care Compare</a>
        </div>
      </div>
      <Snapshot row={row} ref={ref} state={state} />
      </header>

      <StatRow source="CMS" note="star ratings, this facility vs the state average">
        {GROUPS[0].measures.slice(0, 1).concat(GROUPS[0].measures.slice(1, 3), GROUPS[0].measures.slice(5, 6)).map(m => {
          const v = num(row[m.key]); const sa = m.state && ref?.stateAvg[state]?.[m.state] != null ? Number(ref.stateAvg[state][m.state]) : null
          const fn = m.fn ? row[m.fn] : null
          return <Stat key={m.key} label={`${m.label}${m.key === 'overall_rating' ? ' rating' : ' stars'}`} value={<Stars value={row[m.key]} size="lg" />} unit={v != null ? tierWord(v) : 'not rated'}
            note={<>{v == null && fn ? <Fn code={fn} ref={ref} /> : null}{sa != null ? `${v == null && fn ? ' · ' : ''}${state} average ${sa.toFixed(1)}` : ''}</>} />
        })}
      </StatRow>

      <StatRow source="CMS" note="the four numbers a discharging hospital asks about first">
        {([['qm_521_adj', 'Short-stay residents rehospitalized'], ['qrp_004_ppr_pd_rsrr', 'Readmitted within 30 days of SNF discharge'], ['hc_n_severity_G_or_worse', 'Harm or jeopardy deficiencies, 3 cycles'], ['pen_total_fines_usd', 'Fines, 3 years']] as const).map(([k, cardLabel]) => {
          const m = measure(k); const v = num(row[k]); const fn = m.fn ? row[m.fn] : null
          const sa = m.state ? ref?.stateAvg[state]?.[m.state] ?? null : null
          const na = m.national ? ref?.national[m.national] ?? null : m.state ? ref?.stateAvg['NATION']?.[m.state] ?? null : null
          const cmp = sa ?? na; const cp = m.compPerf ? row[m.compPerf] : null
          return <Stat key={k} label={cardLabel} value={v == null ? <span className="text-ink-3">{fn ? <Fn code={fn} ref={ref} /> : '–'}</span> : fmt(v, m.unit, m.decimals)} source="CMS" tone={tone(v, cmp, m, cp)}
            note={cmp != null ? <>{cp ? <><span style={verdictStyle(String(cp).toLowerCase().startsWith('better') ? 'better' : String(cp).toLowerCase().startsWith('worse') ? 'worse' : 'same')}>CMS: {String(cp).toLowerCase()}</span><br /></> : v != null && sa != null ? <><Delta value={v} cmp={sa} m={m} /><br /></> : null}{sa != null ? `${state} ${avg(sa, m)}` : ''}{sa != null && na != null ? ' · ' : ''}{na != null ? `US ${avg(na, m)}` : ''}</> : m.note}
            how={<>{m.label}. {howText(k, ref, m)} Bar: green when better than the state average as displayed, red when worse, amber when the same{cp ? '; for this measure CMS\u2019s own comparison to the national rate decides' : ''}.</>} />
        })}
      </StatRow>

      <div className="t-label flex flex-wrap items-center gap-x-5 gap-y-1" aria-hidden>
        <span className="t-label text-ink">How to read the measure tables</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-ink" />This facility</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-px h-3.5 bg-ink-2" />State average</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-px h-2.5 bg-ink-3" />National average</span>
        <span className="inline-flex items-center gap-1.5"><span style={verdictStyle('better')}>green</span> better than the state · <span style={verdictStyle('worse')}>red</span> worse · grey about the same</span>
      </div>
      {GROUPS.map(g => (
        <section key={g.id} className="panel panel-pad">
          <h2 className="section-title">{g.title}</h2>
          {g.blurb && <p className="t-label mt-1 mb-2">{g.blurb}</p>}
          {g.id !== 'ratings' && <div className="hidden md:grid grid-cols-[1fr_120px_1fr_200px] gap-4 t-caption pb-2 border-b border-hairline"><div>Measure</div><div className="text-right">This facility</div><div /><div>Compared with the state</div></div>}
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

      <section className="panel panel-pad">
        <h2 className="section-title">Ownership and control</h2>
        <p className="t-label mt-1 mb-3">Ownership interests, operational/managerial control and partnership roles as reported to CMS; officers, directors, managing employees and lenders are in the workbook's Ownership sheet. {row.own_data_available === 'N' ? 'CMS lists no ownership data for this facility.' : `Legal business name: ${titleCase(String(row.legal_business_name ?? ''))}.`}</p>
        {!pecos && <div className="text-sm text-ink-2 mb-3" data-testid="pecos">No PECOS enrollment record matches this CCN in the {ref?.meta.hospital_layer?.pecos_release?.slice(0, 10) ?? 'latest'} release.</div>}
        {pecos && (
          <div className="text-sm text-ink mb-3 rounded-[8px] bg-well px-3 py-2" data-testid="pecos">
            <span className="text-ink-2">Medicare enrollment (PECOS, {ref?.meta.hospital_layer?.pecos_release?.slice(0, 10) ?? 'latest'}): </span>
            enrolled as {titleCase(String(pecos.legal_entity))}{pecos.dba && String(pecos.dba).toUpperCase() !== String(pecos.legal_entity).toUpperCase() ? <> doing business as {titleCase(String(pecos.dba))}</> : null}
            {pecos.affiliation_entity_name ? <>; CMS affiliation entity {titleCase(String(pecos.affiliation_entity_name))}</> : null}
            {pecos.proprietary_nonprofit === 'N' ? '; non-profit' : pecos.proprietary_nonprofit === 'P' ? '; proprietary' : ''}
            {Number(pecos.n_chow_since_2016) > 0 ? <>; <b>changed ownership on {String(pecos.last_chow_date)}</b>{pecos.last_buyer ? <> (buyer {titleCase(String(pecos.last_buyer))}{pecos.last_seller ? <>, seller {titleCase(String(pecos.last_seller))}</> : null})</> : null} — the PECOS file lists the change into the current enrollment, so earlier changes may not appear</> : '; no change of ownership listed in PECOS since 2016'}
            {pecos.any_private_equity_owner ? <>; <b>an owner self-identifies as a private-equity company</b></> : null}
            {pecos.any_reit_owner ? <>; <b>an owner self-identifies as a REIT</b></> : null}.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
          {ownerGroups.map(([role, rows]) => (
            <div key={role} className="mb-3">
              <div className="text-xs text-ink-2">{titleCase(role)}</div>
              {rows.map((o, i) => <div key={i} className="text-sm">{titleCase(String(o.owner_name))}<span className="text-ink-3 text-xs">{o.ownership_percentage_raw && !/NOT APPLICABLE|NO PERCENTAGE/.test(String(o.ownership_percentage_raw)) ? ` · ${String(o.ownership_percentage_raw)}` : ''}{o.association_date ? ` · since ${String(o.association_date)}` : ''}</span></div>)}
            </div>
          ))}
        </div>
      </section>
      <div className="t-caption">Data as of {ref?.meta.data_vintage}. Blank values carry CMS's footnote. State and national figures are the simple averages CMS publishes. “Better/worse” follows our reading of each measure's direction; see Methodology.</div>
    </div>
  )
}
