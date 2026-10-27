import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { q, sqlStr } from '../lib/db'
import { GROUPS, MEASURE_COLS, type Measure } from '../lib/measures'
import { fmt, fmtUsd, fmtPct, titleCase, countyLabel } from '../lib/format'
import { CERT_SHORT } from '../components/DataTable'
import { useCompare, compareStore, MAX_COMPARE } from '../lib/compare'
import { Fn, Flag, Pill, Stars, Empty, Stat, StatRow, tierWord, useReference, ReferenceError } from '../components/ui'
import { verdict, cmsVerdict, verdictColor, verdictStyle } from '../lib/verdict'
export { verdict, verdictStyle }
import type { Reference } from '../lib/reference'

type Row = Record<string, unknown>
/** Payer colors for the census bar: categorical, used nowhere else. */
const PAYER = { medicare: 'var(--color-accent)', medicaid: '#475467', other: '#98a2b3' }

/** Facility value vs state and national averages on one quiet track. */
function Track({ value, state, nation, m, color }: { value: number | null; state: number | null; nation: number | null; m: Measure; color?: string }) {
  const pts = [value, state, nation].filter((x): x is number => x != null && !Number.isNaN(x))
  if (value == null || !pts.length || m.unit === 'stars' || m.unit === 'rank' || m.unit === 'text' || m.unit === 'date') return null
  const lo = Math.min(0, ...pts), hi = Math.max(...pts) * 1.12 || 1
  const x = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div className="relative h-5 w-full" aria-hidden>
      <div className="absolute left-0 right-0 top-1/2 h-px bg-hairline" />
      {nation != null && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-2.5 w-px bg-ink-3" style={{ left: x(nation) }} title={`Nation ${fmt(nation, m.unit, m.decimals)}`} />}
      {state != null && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-px bg-ink-2" style={{ left: x(state) }} title={`State ${fmt(state, m.unit, m.decimals)}`} />}
      {value != null && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full ring-2 ring-surface" style={{ left: x(value), background: color ?? 'var(--color-ink)' }} />}
    </div>
  )
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

/** What the facility has set up to handle, and who is in its beds — from the CMS-671 facility application. Self-reported; shown with that caveat. */
const UNITS: [string, string][] = [['beds_ventilator', 'Ventilator'], ['beds_dialysis', 'Dialysis'], ['beds_alzheimers', "Alzheimer's / dementia"], ['beds_hospice', 'Hospice'], ['beds_head_trauma', 'Head trauma'], ['beds_rehab', 'Specialized rehab'], ['beds_pediatric', 'Children / young adults'], ['beds_aids', 'AIDS'], ['beds_huntingtons', "Huntington's"]]
function ServicesPanel({ row, ref }: { row: Row; ref: Reference | null }) {
  const has = row.certification_detail != null
  const units = UNITS.map(([k, l]) => [l, num(row[k])] as const).filter(([, n]) => n != null && n > 0)
  const total = num(row.census_total), mc = num(row.census_medicare), md = num(row.census_medicaid), ot = num(row.census_other)
  const beds = num(row.number_of_certified_beds)
  return (
    <section className="panel panel-pad" data-testid="services">
      <div className="flex flex-wrap items-baseline gap-x-3"><h2 className="section-title">Services and who is in the beds</h2><span className="t-caption">CMS-671 facility application, {ref?.meta.hospital_layer?.ltc671_release?.slice(0, 7) ?? 'latest'} · self-reported by the facility</span></div>
      {!has ? <p className="t-body text-ink-2 mt-2">No CMS-671 record for this CCN in the current release.</p> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-3">
          <div>
            <div className="t-label">Dedicated special-care units</div>
            {units.length === 0 ? <div className="t-body text-ink-2 mt-1">None reported. The facility may still accept such patients; the form only records dedicated units.</div> : (
              <ul className="mt-1 flex flex-wrap gap-1.5">{units.map(([l, n]) => <li key={l} className="inline-flex items-baseline gap-1 rounded-[6px] bg-well px-2 py-1 t-body"><span>{l}</span><span className="t-caption tabular-nums">{n} beds</span></li>)}</ul>
            )}
          </div>
          <div>
            <div className="t-label">Certification</div>
            <div className="t-body mt-1">{CERT_SHORT[String(row.certification_detail)] ?? String(row.certification_detail)}{row.ltc_hospital_based === 'Y' ? ' · hospital-based' : ''}{row.ccrc ? ' · continuing-care retirement community' : ''}</div>
            <div className="t-caption mt-1">{beds != null ? `${beds.toLocaleString()} certified beds (Care Compare)` : ''}{row.ltc671_certification_date ? ` · certified ${String(row.ltc671_certification_date)}` : ''}</div>
          </div>
          <div>
            <div className="t-label">Residents by payer at the last survey</div>
            {total == null || total === 0 ? <div className="t-body text-ink-2 mt-1">{row.census_unreliable ? 'The reported census failed a sanity check (above 2,000, or more than 1.2 times the certified beds), so it is not shown.' : 'Not reported.'}</div> : (
              <>
                {/* one bar, three payer segments that add to 100%; the legend dots carry the same colors */}
                <div className="flex h-3 rounded overflow-hidden mt-2 bg-well" role="img" aria-label={`Medicare ${Math.round(100 * (mc ?? 0) / total)}%, Medicaid ${Math.round(100 * (md ?? 0) / total)}%, other ${Math.round(100 * (ot ?? 0) / total)}%`}>
                  {([[mc, PAYER.medicare], [md, PAYER.medicaid], [ot, PAYER.other]] as const).map(([v, c], i) => <div key={i} style={{ width: `${100 * (v ?? 0) / total}%`, background: c }} />)}
                </div>
                <div className="t-label mt-1.5 tabular-nums flex flex-wrap items-center gap-x-3 gap-y-1"><span className="text-ink font-medium">{total.toLocaleString()} residents</span>
                  {([['Medicare', mc, PAYER.medicare], ['Medicaid', md, PAYER.medicaid], ['Other', ot, PAYER.other]] as const).map(([l, v, c]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c }} aria-hidden />{l} {Math.round(100 * (v ?? 0) / total)}%</span>)}
                </div>
                <div className="t-caption mt-1">Who is paying on the day of the survey — a snapshot, not the year's admissions. Medicare residents are mostly short-stay rehab patients after a hospital stay; Medicaid residents are mostly long-stay.</div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

const CHAPTER_LABEL: Record<string, string> = { infctn: 'Infections (incl. sepsis)', neobld: 'Cancer and blood', endonutrmet: 'Diabetes, nutrition, metabolism', mntbehneudis: 'Mental health and dementia', nervsystm: 'Stroke, brain and nerves', entsys: 'Eye, ear, nose and throat', circsystm: 'Heart and circulation', rspsystm: 'Lung and breathing', digsystm: 'Digestive and liver', sknmussystm: 'Bones, joints, muscles and skin', gusystm: 'Kidney, urinary and reproductive', prgpericong: 'Pregnancy and congenital', sxilldef: 'Symptoms and ill-defined', injpois: 'Injuries, fractures and poisoning', hlthsrv: 'Aftercare and rehabilitation' }
/** Who this facility actually treats: Medicare fee-for-service SNF stays in 2024 (CMS Post-Acute Care PUF): primary diagnosis mix, chronic conditions, acuity. */
function PatientsPanel({ pmix, cmix }: { pmix: Row | null; cmix: Row[] }) {
  const cc: [string, string][] = [['cc_dementia_pct', "Alzheimer's or dementia"], ['cc_heart_failure_pct', 'Heart failure'], ['cc_copd_pct', 'COPD'], ['cc_ckd_pct', 'Chronic kidney disease'], ['cc_diabetes_pct', 'Diabetes'], ['cc_stroke_pct', 'Stroke or TIA'], ['cc_depression_pct', 'Depression'], ['cc_psychosis_pct', 'Schizophrenia or other psychosis']]
  return (
    <section className="panel panel-pad" data-testid="patients">
      <div className="flex flex-wrap items-baseline gap-x-3"><h2 className="section-title">Patients this facility treats</h2><span className="t-caption">Medicare fee-for-service SNF stays, calendar 2024 (CMS Post-Acute Care PUF) · shares under CMS's small-count threshold are omitted</span></div>
      {!pmix ? <p className="t-body text-ink-2 mt-2">No 2024 Medicare SNF utilization published for this facility (fewer than 11 stays, or not in the file).</p> : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-3">
          <div className="md:col-span-1">
            <div className="t-label">Primary diagnosis of admitted patients <span className="t-caption">· published shares cover {Math.round(100 * cmix.reduce((a, r) => a + Number(r.share), 0))}% of stays</span></div>
            {cmix.reduce((a, r) => a + Number(r.share), 0) < 0.6 && <div className="t-caption mt-1">Most categories are too small for CMS to publish for this facility, so the picture is incomplete.</div>}
            <ul className="mt-1 space-y-1">{cmix.filter(r => Number(r.share) > 0).slice(0, 8).map(r => <li key={String(r.chapter)} className="grid grid-cols-[1fr_auto] items-center gap-x-3"><div className="min-w-0"><div className="t-body truncate">{CHAPTER_LABEL[String(r.chapter)] ?? String(r.chapter)}</div><div className="h-1.5 rounded bg-well mt-0.5"><div className="h-full rounded bg-ink-3" style={{ width: `${Math.min(100, 100 * Number(r.share))}%` }} /></div></div><div className="t-body tabular-nums w-12 text-right">{(100 * Number(r.share)).toFixed(0)}%</div></li>)}</ul>
          </div>
          <div>
            <div className="t-label">Chronic conditions among those patients</div>
            <ul className="mt-1 space-y-0.5">{cc.filter(([k]) => pmix[k] != null).map(([k, l]) => <li key={k} className="flex justify-between gap-3 t-body"><span>{l}</span><span className="tabular-nums">{Number(pmix[k]).toFixed(0)}%</span></li>)}</ul>
          </div>
          <div>
            <div className="t-label">Acuity and population</div>
            <ul className="mt-1 space-y-0.5 t-body">
              {pmix.avg_risk_score != null && <li className="flex justify-between gap-3"><span>Average risk score <span className="t-caption">(1.0 = average Medicare beneficiary)</span></span><span className="tabular-nums">{Number(pmix.avg_risk_score).toFixed(2)}</span></li>}
              {pmix.avg_age != null && <li className="flex justify-between gap-3"><span>Average age</span><span className="tabular-nums">{Number(pmix.avg_age).toFixed(0)}</span></li>}
              {pmix.dual_pct != null && <li className="flex justify-between gap-3"><span>Also on Medicaid (dual eligible)</span><span className="tabular-nums">{Number(pmix.dual_pct).toFixed(0)}%</span></li>}
            </ul>
            <div className="t-caption mt-2">The best public evidence of what a facility routinely handles. It covers Medicare fee-for-service stays only; Medicare Advantage and Medicaid patients are not in the file.</div>
          </div>
        </div>
      )}
    </section>
  )
}

/** Averages are shown to one decimal for stars and counts so the same number never appears two ways. */
const avg = (v: number, m: Measure) => m.unit === 'stars' || m.unit === 'count' ? v.toFixed(1) : fmt(v, m.unit, m.decimals)
function MeasureRow({ m, row, ref, state }: { m: Measure; row: Row; ref: Reference | null; state: string }) {
  const raw = row[m.key]; const v = raw == null || raw === '' || m.unit === 'text' ? null : Number(raw)
  const st = m.state ? ref?.stateAvg[state]?.[m.state] ?? null : null
  const nat = m.national ? ref?.national[m.national] ?? null : m.state ? ref?.stateAvg['NATION']?.[m.state] ?? null : null
  const fn = m.fn ? row[m.fn] : null
  const comp = m.compPerf ? row[m.compPerf] : null
  const vol = m.volume ? row[m.volume] : null
  // CMS's own comparison wins; otherwise the state average, or the nation when CMS publishes no state figure for this measure.
  const vd = cmsVerdict(comp) ?? (st != null ? verdict(v, st, m, 'state') : verdict(v, nat, m, 'nation'))
  const color = verdictColor(vd?.kind)
  return (
    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_1fr_200px] items-center gap-x-4 gap-y-1 py-2 border-b border-hairline/60 last:border-0" data-testid={`measure-${m.key}`}>
      <div className="text-sm text-ink">{m.label}<div className="text-[11px] text-ink-3">{m.direction === 'lower' ? 'Lower is better' : m.direction === 'higher' ? 'Higher is better' : ''}{m.note ? `${m.direction !== 'none' ? ' · ' : ''}${m.note}` : ''}</div></div>
      <div className="text-right text-sm tabular-nums">
        {m.unit === 'stars' ? <Stars value={v} /> : m.unit === 'text' ? <span className="font-medium">{raw == null || raw === '' ? <span className="text-ink-3">—</span> : CERT_SHORT[String(raw)] ?? (String(raw) === 'Y' ? 'Yes' : String(raw) === 'N' ? 'No' : String(raw))}</span> : <span className="font-semibold" style={{ color }}>{fmt(v, m.unit, m.decimals)}</span>}
        {v == null && <Fn code={fn} ref={ref} />}
        {v != null && fn ? <Fn code={fn} ref={ref} /> : null}
      </div>
      <div className="hidden md:block"><Track value={v} state={st} nation={nat} m={m} color={color} /></div>
      <div className="text-[11px] text-ink-2 leading-tight col-span-2 md:col-span-1 space-y-1">
        {vd && <div><Pill kind={vd.kind}>{vd.text}</Pill></div>}
        {st != null && <div>State {avg(st, m)}{nat != null ? ` · Nation ${avg(nat, m)}` : ''}</div>}
        {st == null && nat != null && <div>Nation {avg(nat, m)}</div>}
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
  const [pmix, setPmix] = useState<Row | null>(null)
  const [cmix, setCmix] = useState<Row[]>([])
  const ref = useReference()
  const compare = useCompare()
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    setRow(undefined); setPen([]); setCit([]); setOwn([]); setPecos(null); setPmix(null); setCmix([]); setLoadError(null)
    const c = sqlStr(ccn)
    Promise.all([
      q(`SELECT * FROM facility_master WHERE ccn = ${c}`),
      q(`SELECT * FROM penalties WHERE ccn = ${c} ORDER BY penalty_date DESC`),
      q(`SELECT * FROM citations_gl WHERE ccn = ${c} ORDER BY survey_date DESC`),
      q(`SELECT * FROM ownership WHERE ccn = ${c} ORDER BY role, owner_name`),
      q(`SELECT * FROM snf_pecos WHERE ccn = ${c}`),
      q(`SELECT * FROM snf_patient_mix WHERE ccn = ${c}`),
      q(`SELECT chapter, share FROM snf_chapter_mix WHERE ccn = ${c} ORDER BY share DESC`),
    ]).then(([f, p, ci, o, pe, pm, cm]) => { if (!live) return; setRow(f[0] ?? null); setPen(p); setCit(ci); setOwn(o); setPecos(pe[0] ?? null); setPmix(pm[0] ?? null); setCmix(cm) }).catch(e => { if (live) { setLoadError(String(e?.message ?? e)); setRow(null) } })
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
          <div className="t-body text-ink-2 mt-2">{titleCase(String(row.provider_address))}, {titleCase(String(row.city_town))}, {state} {String(row.zip_code)} <span className="text-ink-3">· {countyLabel(String(row.county_parish), state)} · CCN {ccn}</span></div>
          <div className="mt-4 flex flex-wrap gap-2">
            {row.special_focus_status ? <Flag>{String(row.special_focus_status)}</Flag> : null}
            {row.abuse_icon === 'Y' ? <Flag>Abuse icon</Flag> : null}
            {[String(row.ownership_type), row.number_of_certified_beds != null ? `${Number(row.number_of_certified_beds)} certified beds` : 'Beds not reported',
              row.average_number_of_residents_per_day != null ? `${Number(row.average_number_of_residents_per_day).toFixed(1)} residents per day` : null,
              String(row.provider_type), row.provider_resides_in_hospital === 'Y' ? 'In a hospital' : null,
              row.date_first_approved_to_provide_medicare_and_medicaid_services ? `Certified since ${String(row.date_first_approved_to_provide_medicare_and_medicaid_services).slice(0, 4)}` : null,
              row.high_performing_icon === 'Y' ? 'High performing' : null, row.provider_changed_ownership_in_last_12_months === 'Y' ? 'Changed ownership in the last 12 months' : null,
              row.most_recent_health_inspection_more_than_2_years_ago === 'Y' ? 'Last health inspection more than 2 years ago' : null].filter((x): x is string => !!x).map(t => <span key={t} className="pill pill-same font-medium">{t}</span>)}
          </div>
          {row.chain_name ? <div className="mt-4 t-body" data-testid="chain"><span className="t-label">Chain</span><div className="mt-0.5"><span className="font-semibold">{titleCase(String(row.chain_name))}</span> <span className="text-ink-2">({Number(row.number_of_facilities_in_chain)} nursing homes)</span></div></div> : null}
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
          const vd = cmsVerdict(cp) ?? (sa != null ? verdict(v, sa, m, 'state') : verdict(v, na, m, 'nation'))
          return <Stat key={k} label={cardLabel} value={v == null ? <span className="text-ink-3">{fn ? <Fn code={fn} ref={ref} /> : '–'}</span> : fmt(v, m.unit, m.decimals)} source="CMS" verdict={vd}
            note={cmp != null ? <>{sa != null ? `${state} ${avg(sa, m)}` : ''}{sa != null && na != null ? ' · ' : ''}{na != null ? `US ${avg(na, m)}` : ''}</> : m.note}
            how={<>{m.label}. {howText(k, ref, m)} The pill compares this facility with the {sa != null ? 'state' : 'national'} average as displayed{cp ? '; for this measure CMS\u2019s own comparison to the national rate decides' : ''}.</>} />
        })}
      </StatRow>

      <ServicesPanel row={row} ref={ref} />
      <PatientsPanel pmix={pmix} cmix={cmix} />

      <div className="t-label flex flex-wrap items-center gap-x-5 gap-y-1" aria-hidden>
        <span className="t-label text-ink">How to read the measure tables</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-full bg-ink" />This facility</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-px h-3.5 bg-ink-2" />State average</span>
        <span className="inline-flex items-center gap-1.5"><span className="inline-block w-px h-2.5 bg-ink-3" />National average</span>
        <span className="inline-flex items-center gap-1.5"><Pill kind="better">better</Pill> than the state average (or the nation when CMS publishes no state figure) · <Pill kind="worse">worse</Pill> · <Pill kind="same">same</Pill> as displayed; for QRP measures CMS's own comparison decides</span>
      </div>
      {GROUPS.map(g => (
        <section key={g.id} className="panel panel-pad">
          <h2 className="section-title">{g.title}</h2>
          {g.blurb && <p className="t-label mt-1 mb-2">{g.blurb}</p>}
          {g.id !== 'ratings' && <div className="hidden md:grid grid-cols-[1fr_120px_1fr_200px] gap-4 t-caption pb-2 border-b border-hairline"><div>Measure</div><div className="text-right">This facility</div><div /><div>Compared with the benchmark</div></div>}
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
