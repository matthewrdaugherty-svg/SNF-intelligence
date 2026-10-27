import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { q, type Row } from '../lib/db'
import { hospitalDetail, qualityMix, serviceArea, snfsServing, searchHospitals, type HospitalLite, type Mix } from '../lib/hospitals'
import { fmtInt, fmtPct, fmtUsd, titleCase, countyLabel } from '../lib/format'
import { Empty, Fn, QualityStrip, Stars, Stat, useReference } from '../components/ui'

const pct = (x: unknown, d = 1) => x == null ? '' : fmtPct(100 * Number(x), d)

/** /hospitals — find a hospital. */
export function HospitalSearch() {
  const [text, setText] = useState('')
  const [results, setResults] = useState<HospitalLite[]>([])
  const [top, setTop] = useState<HospitalLite[]>([])
  const nav = useNavigate()
  useEffect(() => { q<HospitalLite & Row>(`SELECT hospital_ccn, hospital_name, city, state, hospital_type, hospital_overall_rating, medicare_discharges_2024, cases_visible FROM hospital_master WHERE cases_visible IS NOT NULL ORDER BY medicare_discharges_2024 DESC NULLS LAST LIMIT 12`).then(setTop) }, [])
  useEffect(() => { let live = true; const t = setTimeout(() => searchHospitals(text, 40).then(r => { if (live) setResults(r) }), 200); return () => { live = false; clearTimeout(t) } }, [text])
  const list = text.trim() ? results : top
  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
      <h1 className="text-xl font-semibold tracking-tight">Hospitals</h1>
      <p className="text-sm text-ink-2 mt-1 max-w-3xl">Every hospital in CMS Care Compare, with its Medicare inpatient volume, where its patients come from (the 2025 Hospital Service Area file), and the SNFs located in that service area. Pick a hospital to see the SNFs that serve its patients and the quality mix of that volume.</p>
      <input className="control w-full md:w-[480px] mt-4" value={text} onChange={e => setText(e.target.value)} placeholder="Hospital name, city or CCN" aria-label="Find a hospital" autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && list[0]) nav(`/hospital/${list[0].hospital_ccn}`) }} />
      <div className="text-xs text-ink-3 mt-2 mb-3">{text.trim() ? `${list.length} match${list.length === 1 ? '' : 'es'}` : 'Largest hospitals by 2024 Medicare discharges'}</div>
      <div className="bg-surface rounded-[10px]">
        {list.map(h => (
          <Link key={h.hospital_ccn} to={`/hospital/${h.hospital_ccn}`} className="flex items-center gap-4 px-4 py-2.5 border-b border-hairline/60 last:border-0 hover:bg-paper">
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink truncate">{titleCase(h.hospital_name)}</div>
              <div className="text-[11px] text-ink-3">{titleCase(h.city)}, {h.state} · {h.hospital_type} · CCN {h.hospital_ccn}</div>
            </div>
            <div className="text-right text-sm tabular-nums w-28"><div>{h.medicare_discharges_2024 != null ? fmtInt(Number(h.medicare_discharges_2024)) : <span className="text-ink-3">–</span>}</div><div className="text-[11px] text-ink-3">discharges 2024</div></div>
            <div className="w-10 text-right"><Stars value={h.hospital_overall_rating} label="Hospital overall rating" /></div>
          </Link>
        ))}
        {list.length === 0 && <div className="px-4 py-6 text-sm text-ink-2">No hospital matches. Try part of the name, or the city.</div>}
      </div>
    </div>
  )
}

/** /hospital/:ccn — service area, the SNFs that serve it, and the quality mix of that (modeled) volume. */
export default function Hospital() {
  const { ccn = '' } = useParams()
  const [h, setH] = useState<Row | null | undefined>(undefined)
  const [area, setArea] = useState<Row[]>([])
  const [snfs, setSnfs] = useState<Row[]>([])
  const [mix, setMix] = useState<Mix | null>(null)
  const [showAllZips, setShowAllZips] = useState(false)
  const [tier, setTier] = useState<'all' | 'high' | 'mid' | 'low'>('all')
  const ref = useReference()
  useEffect(() => {
    let live = true
    setH(undefined); setArea([]); setSnfs([]); setMix(null)
    Promise.all([hospitalDetail(ccn), serviceArea(ccn), snfsServing(ccn), qualityMix(ccn)]).then(([d, a, s, m]) => { if (!live) return; setH(d); setArea(a); setSnfs(s); setMix(m) }).catch(() => { if (live) setH(null) })
    return () => { live = false }
  }, [ccn])
  if (h === undefined) return <div className="p-8 text-sm text-ink-2">Loading…</div>
  if (h === null) return <Empty title={`No hospital with CCN ${ccn}.`}><Link to="/hospitals" className="underline">Back to Hospitals</Link></Empty>
  const name = titleCase(String(h.hospital_name)), state = String(h.state)
  const zipsShown = showAllZips ? area : area.filter(z => Number(z.cumulative_share) <= 0.8 || Number(z.zip_rank) <= 10)
  const covered = mix?.covered_share ?? 0
  const filtered = snfs.filter(s => tier === 'all' ? true : tier === 'high' ? Number(s.overall_rating) >= 4 : tier === 'mid' ? Number(s.overall_rating) === 3 : Number(s.overall_rating) <= 2)
  const exploreLink = `/explore?h=${ccn}`

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-6">
      <div className="text-xs text-ink-3 mb-1"><Link to="/hospitals" className="hover:underline">Hospitals</Link> / {state}</div>
      <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-6">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
          <div className="text-sm text-ink-2 mt-1">{titleCase(String(h.address))}, {titleCase(String(h.city))}, {state} {String(h.zip)} · {countyLabel(String(h.county), state)} · CCN {ccn}</div>
          <div className="text-sm text-ink-2 mt-1">{String(h.hospital_type)} · {String(h.hospital_ownership)}{h.emergency_services === 'Yes' ? ' · emergency services' : ''}{h.ruca ? ` · ${String(h.ruca)}` : ''}</div>
        </div>
        <div className="shrink-0 flex flex-col items-start md:items-end gap-2">
          <Link to={exploreLink} className="press btn btn-primary text-sm">Explore SNFs in this service area</Link>
          <Link to={`/map?h=${ccn}`} className="text-xs text-accent hover:underline">Show on the map</Link>
        </div>
      </div>

      {/* the sentence */}
      {h.cases_visible != null ? (
        <p className="mt-6 text-lg leading-snug text-ink max-w-4xl">
          In 2025, <span className="font-semibold tabular-nums">{fmtInt(Number(h.cases_visible))}</span> Medicare inpatient cases at {name} came from <span className="font-semibold tabular-nums">{fmtInt(Number(h.n_zips_visible))}</span> ZIP codes that each sent 11 or more patients.
          {mix && mix.n_snf > 0 ? <> Those ZIP codes contain <span className="font-semibold tabular-nums">{fmtInt(mix.n_snf)}</span> nursing homes. Weighting them by where the hospital's patients live and by each facility's Medicare volume, <span className="font-semibold tabular-nums">{pct(mix.high, 0)}</span> of that modeled SNF volume sits in 4–5★ facilities, <span className="font-semibold tabular-nums">{pct(mix.mid, 0)}</span> in 3★, and <span className="font-semibold tabular-nums" style={{ color: 'var(--color-rust)' }}>{pct(mix.low, 0)}</span> in 1–2★.</> : null}
        </p>
      ) : <p className="mt-6 text-sm text-ink-2">CMS publishes no service-area rows with 11 or more cases for this hospital, so the service-area view is not available.</p>}
      <div className="mt-2 text-xs text-ink-3 max-w-4xl">Modeled. CMS does not publish which SNF each patient went to. The model assumes patients use the nursing homes in their home ZIP code in proportion to those facilities' Medicare stays; ZIP codes with fewer than 11 of this hospital's patients are suppressed by CMS and not counted. {covered > 0 && covered < 0.999 ? `${pct(covered, 0)} of the visible volume comes from ZIP codes that contain at least one nursing home; the rest is not assigned.` : ''}</div>

      {/* hospital stats */}
      <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Hospital overall rating" value={h.hospital_overall_rating != null ? <Stars value={h.hospital_overall_rating} size="lg" label="Hospital overall rating" /> : '–'} note={h.hospital_overall_rating == null ? <Fn code={h.hospital_overall_rating_footnote} ref={ref} /> : 'CMS Care Compare, 2026'} source="CMS" how="CMS Overall Hospital Quality Star Rating from the Hospital General Information file (Care Compare, July 2026 release)." />
        <Stat label="Medicare inpatient discharges, 2024" value={h.medicare_discharges_2024 != null ? fmtInt(Number(h.medicare_discharges_2024)) : '–'} note={h.medicare_beneficiaries_2024 != null ? `${fmtInt(Number(h.medicare_beneficiaries_2024))} beneficiaries · ${h.medicare_payment_2024 != null ? fmtUsd(Number(h.medicare_payment_2024)) + ' Medicare paid' : ''}` : 'Not in the 2024 inpatient file'} source="CMS" how="Medicare Inpatient Hospitals – by Provider, calendar 2024 (fee-for-service Part A). Tot_Dschrgs, Tot_Benes, Tot_Mdcr_Pymt_Amt." />
        <Stat label="Readmission measures vs. national" value={h.count_of_facility_readm_measures != null ? `${fmtInt(Number(h.count_of_readm_measures_better ?? 0))} / ${fmtInt(Number(h.count_of_readm_measures_no_different ?? 0))} / ${fmtInt(Number(h.count_of_readm_measures_worse ?? 0))}` : '–'} note="better / same / worse" source="CMS" how={<>Counts of this hospital's readmission measures that CMS rates better than, no different from, or worse than the national rate (Hospital General Information). Condition rates: heart failure {h.readm_hf != null ? fmtPct(Number(h.readm_hf)) : 'n/a'}, pneumonia {h.readm_pn != null ? fmtPct(Number(h.readm_pn)) : 'n/a'}, AMI {h.readm_ami != null ? fmtPct(Number(h.readm_ami)) : 'n/a'}, COPD {h.readm_copd != null ? fmtPct(Number(h.readm_copd)) : 'n/a'}, hip/knee {h.readm_hip_knee != null ? fmtPct(Number(h.readm_hip_knee)) : 'n/a'} (Unplanned Hospital Visits, Jul 2023–Jun 2025). The hospital-wide measure is not available in this CMS release.</>} />
        <Stat label="SNF spending in the 30 days after discharge" value={h.snf_spend_30d_per_episode != null ? fmtUsd(Number(h.snf_spend_30d_per_episode)) : '–'} unit={h.snf_spend_30d_per_episode != null ? 'per episode' : undefined}
          note={h.snf_spend_30d_per_episode != null ? `National ${fmtUsd(Number(h.snf_spend_30d_per_episode_national))} · ${Number(h.snf_spend_30d_pct_of_episode).toFixed(1)}% of the episode (national ${Number(h.snf_spend_30d_pct_of_episode_national).toFixed(1)}%)` : 'Not reported by CMS for this hospital'} source="CMS"
          how="Medicare Hospital Spending by Claim (Care Compare), claim type Skilled Nursing Facility, period 1–30 days after discharge, calendar 2024. Hospitals exempt from the Medicare Spending per Beneficiary measure have no row." />
      </div>

      {/* quality mix */}
      {mix && mix.n_snf > 0 && (
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Modeled SNF volume in 4–5★ facilities" value={pct(mix.high, 0)} note={`${fmtInt(mix.n_high)} facilities`} source="Modeled" tone="good" how="Sum of modeled weights for SNFs rated 4 or 5 stars overall, divided by the sum of all modeled weights for this hospital." />
          <Stat label="In 3★ facilities" value={pct(mix.mid, 0)} note={`${fmtInt(mix.n_mid)} facilities`} source="Modeled" tone="mid" how="Same method, overall rating = 3." />
          <Stat label="In 1–2★ facilities" value={pct(mix.low, 0)} note={`${fmtInt(mix.n_low)} facilities`} source="Modeled" tone="bad" how="Same method, overall rating 1 or 2." />
          <Stat label="Volume-weighted facility measures" value={mix.wstars != null ? Number(mix.wstars).toFixed(2) + '★' : '–'} note={<>Rehospitalized {mix.w521 != null ? fmtPct(mix.w521) : 'n/a'} · readmitted after SNF {mix.w004 != null ? fmtPct(mix.w004) : 'n/a'} · to community {mix.w005 != null ? fmtPct(mix.w005) : 'n/a'}</>} source="Modeled" how="Each SNF's CMS measure weighted by its modeled share; facilities with a suppressed value are left out of that average. These are facility rates, not this hospital's patients' outcomes." />
        </div>
      )}

      {/* service area */}
      <section className="mt-8 bg-surface rounded-[10px] px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="font-medium">Service area</h2>
          <span className="text-xs text-ink-3">ZIP codes of residence for this hospital's Medicare inpatients, 2025 · {showAllZips ? `all ${area.length}` : 'ZIPs that make up 80% of visible cases'}</span>
          <button className="press btn btn-quiet text-xs ml-auto" onClick={() => setShowAllZips(v => !v)}>{showAllZips ? 'Show the top 80%' : `Show all ${area.length}`}</button>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm mt-2">
          <thead><tr className="text-[11px] text-ink-3 text-left"><th className="font-normal py-1 w-10">#</th><th className="font-normal">ZIP</th><th className="font-normal text-right">Cases</th><th className="font-normal text-right">Share</th><th className="font-normal text-right">Cumulative</th><th className="font-normal text-right">Days of care</th><th className="font-normal text-right">Nursing homes in ZIP</th></tr></thead>
          <tbody>{zipsShown.map(z => (
            <tr key={String(z.zip)} className="border-t border-hairline/60">
              <td className="py-1 tabular-nums text-ink-3">{String(z.zip_rank)}</td><td className="tabular-nums">{String(z.zip)}</td>
              <td className="text-right tabular-nums">{fmtInt(Number(z.cases))}</td><td className="text-right tabular-nums">{pct(z.share_of_visible_cases)}</td><td className="text-right tabular-nums text-ink-2">{pct(z.cumulative_share, 0)}</td>
              <td className="text-right tabular-nums">{fmtInt(Number(z.days))}</td><td className="text-right tabular-nums">{Number(z.snfs_in_zip) ? fmtInt(Number(z.snfs_in_zip)) : <span className="text-ink-3">none</span>}</td>
            </tr>))}</tbody>
        </table></div>
        <div className="text-[11px] text-ink-3 mt-2">Source: CMS Hospital Service Area file, 2025 (MEDICARE_PROV_NUM, ZIP_CD_OF_RESIDENCE, TOTAL_CASES, TOTAL_DAYS_OF_CARE). Rows with fewer than 11 cases are suppressed by CMS and excluded; shares are of visible cases.</div>
      </section>

      {/* SNFs serving */}
      <section className="mt-6 bg-surface rounded-[10px] px-5 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-medium">Nursing homes in the service area <span className="text-ink-3 font-normal">· {filtered.length}</span></h2>
          <div role="radiogroup" aria-label="Rating tier" className="inline-flex rounded-[6px] bg-well p-0.5 ml-auto">
            {([['all', 'All'], ['high', '4–5★'], ['mid', '3★'], ['low', '1–2★']] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={tier === v} onClick={() => setTier(v)} className={`press px-3 py-1 text-sm rounded-[5px] ${tier === v ? 'bg-surface text-ink here' : 'text-ink-2 hover:text-ink'}`}>{l}</button>)}
          </div>
        </div>
        <div className="overflow-x-auto"><table className="w-full text-sm mt-2">
          <thead><tr className="text-[11px] text-ink-3 text-left"><th className="font-normal py-1">Facility</th><th className="font-normal">Ratings</th><th className="font-normal text-right">Modeled share</th><th className="font-normal text-right">ZIP share</th><th className="font-normal text-right">Medicare stays 2024</th><th className="font-normal text-right">Beds</th><th className="font-normal text-right">Rehosp. %</th><th className="font-normal text-right">Readmit %</th><th className="font-normal text-right">To community %</th><th className="font-normal text-right">Fines 3-yr</th><th className="font-normal text-right">G–L deficiencies</th></tr></thead>
          <tbody>{filtered.map(s => (
            <tr key={String(s.ccn)} className="border-t border-hairline/60">
              <td className="py-1.5 pr-2"><Link to={`/facility/${s.ccn}`} className="hover:text-accent hover:underline underline-offset-2">{titleCase(String(s.provider_name))}</Link><div className="text-[11px] text-ink-3">{titleCase(String(s.city_town))} {String(s.zip_code)}{s.special_focus_status ? <span className="text-rust"> · {String(s.special_focus_status)}</span> : ''}{s.abuse_icon === 'Y' ? <span className="text-rust"> · abuse icon</span> : ''}</div></td>
              <td><QualityStrip row={s} /></td>
              <td className="text-right tabular-nums font-medium">{(100 * Number(s.modeled_weight)).toFixed(2)}%</td>
              <td className="text-right tabular-nums text-ink-2" title={`${fmtInt(Number(s.hospital_cases_from_zip))} of the hospital's cases came from ${String(s.zip_code)}; ${String(s.zip_snfs)} nursing home(s) there`}>{pct(s.zip_share)}</td>
              <td className="text-right tabular-nums">{s.snf_medicare_stays_2024 != null && Number(s.snf_medicare_stays_2024) > 0 ? fmtInt(Number(s.snf_medicare_stays_2024)) : <span className="text-ink-3" title="No Medicare stays reported in the 2024 PAC PUF (suppressed or none)">–</span>}</td>
              <td className="text-right tabular-nums">{s.number_of_certified_beds != null ? fmtInt(Number(s.number_of_certified_beds)) : ''}</td>
              <td className="text-right tabular-nums">{s.qm_521_adj != null ? fmtPct(Number(s.qm_521_adj)) : <Fn code={s.qm_521_fn} ref={ref} />}</td>
              <td className="text-right tabular-nums">{s.qrp_004_ppr_pd_rsrr != null ? fmtPct(Number(s.qrp_004_ppr_pd_rsrr)) : <Fn code={s.qrp_004_ppr_pd_rsrr_fn} ref={ref} />}</td>
              <td className="text-right tabular-nums">{s.qrp_005_dtc_rs_rate != null ? fmtPct(Number(s.qrp_005_dtc_rs_rate)) : <Fn code={s.qrp_005_dtc_rs_rate_fn} ref={ref} />}</td>
              <td className="text-right tabular-nums">{s.pen_total_fines_usd != null ? fmtUsd(Number(s.pen_total_fines_usd)) : ''}</td>
              <td className="text-right tabular-nums">{s.hc_n_severity_G_or_worse != null ? fmtInt(Number(s.hc_n_severity_G_or_worse)) : ''}</td>
            </tr>))}</tbody>
        </table></div>
        <div className="text-[11px] text-ink-3 mt-2">Modeled share = ZIP share of the hospital's visible cases × this facility's share of Medicare stays among the nursing homes in that ZIP (2024 PAC PUF; equal split where none report stays). Shares sum to the covered share above. Upload hospital-reported counts on Discharge flows to replace the model.</div>
      </section>
    </div>
  )
}
