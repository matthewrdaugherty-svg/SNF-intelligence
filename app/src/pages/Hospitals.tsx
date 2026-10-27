import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { q, type Row } from '../lib/db'
import { dischargeMix, familyMembers, hospitalDetail, hospitalFamilies, hospitalOwners, qualityMix, serviceArea, snfsServing, searchHospitals, type HospitalLite, type Mix } from '../lib/hospitals'
import { fmtInt, fmtPct, fmtUsd, titleCase, countyLabel } from '../lib/format'
import { Empty, Fn, QualityStrip, StripHeader, Stars, Stat, StatRow, useReference } from '../components/ui'

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
    <div className="page">
      <h1>Hospitals</h1>
      <p className="t-body text-ink-2 mt-2 max-w-3xl">Every hospital in CMS Care Compare, with its Medicare inpatient volume, where its patients come from (the 2025 Hospital Service Area file), and the SNFs located in that service area. Pick a hospital to see the SNFs that serve its patients and the quality mix of that volume.</p>
      <input className="control w-full md:w-[480px] mt-6" value={text} onChange={e => setText(e.target.value)} placeholder="Hospital name, city or CCN" aria-label="Find a hospital" autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && list[0]) nav(`/hospital/${list[0].hospital_ccn}`) }} />
      <div className="t-caption mt-2 mb-2">{text.trim() ? `${list.length} match${list.length === 1 ? '' : 'es'}` : 'Largest hospitals by 2024 Medicare discharges'}</div>
      <div className="panel">
        <div className="flex items-center gap-4 px-4 h-9 t-caption border-b border-hairline"><div className="flex-1">Hospital</div><div className="w-28 text-right">Medicare discharges, 2024</div><div className="w-10 text-right">Stars</div></div>
        {list.map(h => (
          <Link key={h.hospital_ccn} to={`/hospital/${h.hospital_ccn}`} className="press flex items-center gap-4 px-4 min-h-12 py-2 border-b border-hairline/60 last:border-0 hover:bg-paper">
            <div className="min-w-0 flex-1">
              <div className="t-body" title={titleCase(h.hospital_name)}>{titleCase(h.hospital_name)}</div>
              <div className="t-caption">{titleCase(h.city)}, {h.state} · {h.hospital_type}</div>
            </div>
            <div className="text-right t-body tabular-nums w-28">{h.medicare_discharges_2024 != null ? fmtInt(Number(h.medicare_discharges_2024)) : <span className="text-ink-3">—</span>}</div>
            <div className="w-10 text-right"><Stars value={h.hospital_overall_rating} label="Hospital overall rating" /></div>
          </Link>
        ))}
        {list.length === 0 && <div className="px-4 py-6 t-body text-ink-2">No hospital matches. Try part of the name, or the city.</div>}
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
  const [owners, setOwners] = useState<Row[]>([])
  const [dmix, setDmix] = useState<Row[]>([])
  const [showAllFam, setShowAllFam] = useState(false)
  const [sysLinks, setSysLinks] = useState<{ name: string; ccns: string[]; stateCcns: string[]; n: number }[]>([])
  const [showAllZips, setShowAllZips] = useState(false)
  const [tier, setTier] = useState<'all' | 'high' | 'mid' | 'low'>('all')
  const ref = useReference()
  useEffect(() => {
    let live = true
    setH(undefined); setArea([]); setSnfs([]); setMix(null); setOwners([]); setSysLinks([]); setDmix([])
    Promise.all([hospitalDetail(ccn), serviceArea(ccn), snfsServing(ccn), qualityMix(ccn), hospitalOwners(ccn), dischargeMix(ccn)]).then(async ([d, a, s, m, o, dm]) => {
      if (!live) return; setH(d); setArea(a); setSnfs(s); setMix(m); setOwners(o); setDmix(dm)
      const fams = (await hospitalFamilies(ccn)).filter(f => Number(f.n_hospitals) > 1)
      const links = await Promise.all(fams.map(async f => { const mem = await familyMembers(Number(f.family_id)); const usable = mem.filter(m => m.has_service_area)
        return { name: titleCase(String(f.label)), n: mem.length, ccns: usable.map(m => m.hospital_ccn), stateCcns: usable.filter(m => m.state === String(d?.state)).map(m => m.hospital_ccn) } }))
      if (live) setSysLinks(links)
    }).catch(() => { if (live) setH(null) })
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
    <div className="page stack">
      <header className="panel panel-pad">
      <div className="t-caption mb-1"><Link to="/hospitals" className="hover:underline">Hospitals</Link> / {state}</div>
      <div className="flex flex-col md:flex-row md:items-start gap-3 md:gap-6">
        <div className="min-w-0 flex-1">
          <h1>{name}</h1>
          <div className="text-sm text-ink-2 mt-1">{titleCase(String(h.address))}, {titleCase(String(h.city))}, {state} {String(h.zip)} · {countyLabel(String(h.county), state)} · CCN {ccn}</div>
          <div className="text-sm text-ink-2 mt-1">{String(h.hospital_type)} · {String(h.hospital_ownership)}{h.emergency_services === 'Yes' ? ' · emergency services' : ''}{h.ruca ? ` · ${String(h.ruca)}` : ''}</div>
          {owners.length > 0 && (
            <div className="text-sm text-ink-2 mt-1" data-testid="hospital-owners">Owned by {owners.map((o, i) => <span key={i}>{i > 0 ? (i === owners.length - 1 ? ' and ' : ', ') : ''}<span className="text-ink">{titleCase(String(o.owner_name))}</span>{o.role_code === '35' ? ' (indirect)' : ''}{o.pct != null && Number(o.pct) > 0 ? ` ${Number(o.pct).toFixed(0)}%` : ''}</span>)} <span className="text-ink-3">· PECOS, 5%-or-greater interests</span></div>
          )}
          {sysLinks.map(sl => <div key={sl.name} className="text-sm text-ink-2 mt-1" data-testid="system-link">Part of <span className="text-ink">{sl.name}</span> ({sl.n} hospitals)
            {sl.stateCcns.length > 0 ? <> · SNFs serving its <Link to={`/explore?h=${sl.stateCcns.join(',')}`} className="text-accent hover:underline">{state} hospitals ({sl.stateCcns.length})</Link></> : null}
            {sl.ccns.length > sl.stateCcns.length ? <>{sl.stateCcns.length > 0 ? ' or ' : ' · SNFs serving '}<Link to={`/explore?h=${sl.ccns.join(',')}`} className="text-accent hover:underline">all {sl.ccns.length} with service-area data</Link></> : null}
            {sl.ccns.length === 0 ? ' — none of its hospitals has service-area data' : ''}</div>)}
        </div>
        <div className="shrink-0 flex flex-col sm:flex-row md:flex-col items-stretch md:items-end gap-2 w-full md:w-64">
          <Link to={exploreLink} className="press btn btn-primary">Explore SNFs in this service area</Link>
          <Link to={`/map?h=${ccn}`} className="press btn btn-surface">Show on the map</Link>
        </div>
      </div>
      </header>

      {/* the sentence */}
      <section className="panel panel-pad">
      <h2 className="section-title">Where this hospital's patients come from <span className="t-caption font-normal ml-2">Modeled</span></h2>
      {h.cases_visible != null ? (
        <p className="t-lead mt-2">
          In 2025, <span className="font-semibold tabular-nums">{fmtInt(Number(h.cases_visible))}</span> Medicare inpatient cases at {name} came from <span className="font-semibold tabular-nums">{fmtInt(Number(h.n_zips_visible))}</span> ZIP codes that each sent 11 or more patients.
          {mix && mix.n_snf > 0 ? <> Those ZIP codes contain <span className="font-semibold tabular-nums">{fmtInt(mix.n_snf)}</span> SNFs. Weighting them by where the hospital's patients live and by each SNF's Medicare volume, <span className="font-semibold tabular-nums">{pct(mix.high, 0)}</span> of that modeled SNF volume sits in 4–5★ SNFs, <span className="font-semibold tabular-nums">{pct(mix.mid, 0)}</span> in 3★, and <span className="font-semibold tabular-nums" style={{ color: 'var(--color-rust)' }}>{pct(mix.low, 0)}</span> in 1–2★.</> : null}
        </p>
      ) : <p className="mt-2 text-sm text-ink-2">CMS publishes no service-area rows with 11 or more cases for this hospital, so the service-area view is not available.</p>}
      <div className="mt-3 text-xs leading-4 text-ink-3 max-w-[68ch]">CMS does not publish which SNF each patient went to. The model assumes patients use the nursing homes in their home ZIP code in proportion to those SNFs' Medicare stays; ZIP codes with fewer than 11 of this hospital's patients are suppressed by CMS and not counted. {covered > 0 && covered < 0.999 ? `${pct(covered, 0)} of the visible volume comes from ZIP codes that contain at least one nursing home; the rest is not assigned.` : ''}</div>
      </section>

      {/* hospital stats */}
      <StatRow source="CMS" note="hospital figures">
        <Stat label="Hospital overall rating" value={h.hospital_overall_rating != null ? <Stars value={h.hospital_overall_rating} size="lg" label="Hospital overall rating" /> : '–'} note={h.hospital_overall_rating == null ? <Fn code={h.hospital_overall_rating_footnote} ref={ref} /> : 'CMS Care Compare, 2026'} source="CMS" how="CMS Overall Hospital Quality Star Rating from the Hospital General Information file (Care Compare, July 2026 release)." />
        <Stat label="Medicare inpatient discharges, 2024" value={h.medicare_discharges_2024 != null ? fmtInt(Number(h.medicare_discharges_2024)) : '–'} note={h.medicare_beneficiaries_2024 != null ? `${fmtInt(Number(h.medicare_beneficiaries_2024))} beneficiaries · ${h.medicare_payment_2024 != null ? fmtUsd(Number(h.medicare_payment_2024)) + ' Medicare paid' : ''}` : 'Not in the 2024 inpatient file'} source="CMS" how="Medicare Inpatient Hospitals – by Provider, calendar 2024 (fee-for-service Part A). Tot_Dschrgs, Tot_Benes, Tot_Mdcr_Pymt_Amt." />
        <Stat label="Readmission measures vs. national" value={h.count_of_facility_readm_measures != null ? `${fmtInt(Number(h.count_of_readm_measures_better ?? 0))} / ${fmtInt(Number(h.count_of_readm_measures_no_different ?? 0))} / ${fmtInt(Number(h.count_of_readm_measures_worse ?? 0))}` : '–'} note="better / same / worse" source="CMS" how={<>Counts of this hospital's readmission measures that CMS rates better than, no different from, or worse than the national rate (Hospital General Information). Condition rates: heart failure {h.readm_hf != null ? fmtPct(Number(h.readm_hf)) : 'n/a'}, pneumonia {h.readm_pn != null ? fmtPct(Number(h.readm_pn)) : 'n/a'}, AMI {h.readm_ami != null ? fmtPct(Number(h.readm_ami)) : 'n/a'}, COPD {h.readm_copd != null ? fmtPct(Number(h.readm_copd)) : 'n/a'}, hip/knee {h.readm_hip_knee != null ? fmtPct(Number(h.readm_hip_knee)) : 'n/a'} (Unplanned Hospital Visits, Jul 2023–Jun 2025). The hospital-wide measure is not available in this CMS release.</>} />
        <Stat label="SNF spending in the 30 days after discharge" value={h.snf_spend_30d_per_episode != null ? fmtUsd(Number(h.snf_spend_30d_per_episode)) : '–'} unit={h.snf_spend_30d_per_episode != null ? 'per episode' : undefined}
          note={h.snf_spend_30d_per_episode != null ? `National ${fmtUsd(Number(h.snf_spend_30d_per_episode_national))} · ${Number(h.snf_spend_30d_pct_of_episode).toFixed(1)}% of the episode (national ${Number(h.snf_spend_30d_pct_of_episode_national).toFixed(1)}%)` : 'Not reported by CMS for this hospital'} source="CMS"
          how="Medicare Hospital Spending by Claim (Care Compare), claim type Skilled Nursing Facility, period 1–30 days after discharge, calendar 2024. Hospitals exempt from the Medicare Spending per Beneficiary measure have no row." />
      </StatRow>

      {/* quality mix */}
      {mix && mix.n_snf > 0 && (
        <StatRow source="Modeled" note="share of the hospital's modeled SNF volume by rating tier">
          <Stat label="Modeled SNF volume in 4–5★ SNFs" value={pct(mix.high, 0)} note={`${fmtInt(mix.n_high)} SNFs`} source="Modeled" how="Sum of modeled weights for SNFs rated 4 or 5 stars overall, divided by the sum of all modeled weights for this hospital." />
          <Stat label="In 3★ SNFs" value={pct(mix.mid, 0)} note={`${fmtInt(mix.n_mid)} SNFs`} source="Modeled" how="Same method, overall rating = 3." />
          <Stat label="In 1–2★ SNFs" value={pct(mix.low, 0)} note={`${fmtInt(mix.n_low)} SNFs`} source="Modeled" how="Same method, overall rating 1 or 2." />
          <Stat label="Volume-weighted average star rating" value={mix.wstars != null ? Number(mix.wstars).toFixed(2) : '–'} unit="stars" note={<>Rehospitalized {mix.w521 != null ? fmtPct(mix.w521) : 'n/a'}<br />Readmitted after SNF {mix.w004 != null ? fmtPct(mix.w004) : 'n/a'} · to community {mix.w005 != null ? fmtPct(mix.w005) : 'n/a'}</>} source="Modeled" how="Each SNF's CMS measure weighted by its modeled share; SNFs with a suppressed value are left out of that average. These are SNF-level rates, not this hospital's patients' outcomes." />
        </StatRow>
      )}

      {/* discharge mix */}
      <section className="panel panel-pad" data-testid="discharge-mix">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="section-title">What this hospital discharges</h2>
          <span className="t-caption">Medicare fee-for-service inpatient discharges, calendar 2024, grouped from MS-DRGs · {dmix.length ? `${fmtInt(dmix.reduce((a, r) => a + Number(r.discharges), 0))} visible of ${h.medicare_discharges_2024 != null ? fmtInt(Number(h.medicare_discharges_2024)) : '–'} total` : ''}</span>
          {dmix.length > 12 && <button className="press btn btn-quiet btn-sm ml-auto" onClick={() => setShowAllFam(v => !v)}>{showAllFam ? 'Show the top 12' : `Show all ${dmix.length}`}</button>}
        </div>
        {dmix.length === 0 ? <p className="t-body text-ink-2 mt-2">CMS publishes no DRG-level discharges for this hospital (it is not paid under the inpatient prospective payment system, or every DRG had fewer than 11 cases).</p> : (
          <>
            <ul className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1.5 max-w-5xl">
              {(showAllFam ? dmix : dmix.slice(0, 12)).map(r => { const pct = 100 * Number(r.share_of_visible); return (
                <li key={String(r.family)} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
                  <div className="min-w-0"><div className="t-body truncate" title={String(r.family)}>{String(r.family)}</div><div className="h-1.5 rounded bg-well mt-1"><div className="h-full rounded bg-ink-3" style={{ width: `${Math.min(100, pct)}%` }} /></div></div>
                  <div className="t-body tabular-nums text-right w-28"><span className="font-medium">{fmtInt(Number(r.discharges))}</span> <span className="text-ink-3">· {pct.toFixed(1)}%</span></div>
                </li>) })}
            </ul>
            <div className="t-caption mt-3 max-w-[68ch]">Shares are of the visible discharges: CMS suppresses any DRG with fewer than 11 cases at a hospital, so small service lines are missing and the visible total is below the hospital's full Medicare count. Families are plain-English groups of MS-DRGs (CMS v42.1 list; mapping in Methods). Medicare Advantage and non-Medicare discharges are not in this file.</div>
          </>
        )}
      </section>

      {/* service area */}
      <section className="panel panel-pad">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="section-title">Service area</h2>
          <span className="t-caption">ZIP codes of residence for this hospital's Medicare inpatients, 2025 · {showAllZips ? `all ${area.length}` : 'ZIPs that make up 80% of visible cases'}</span>
          <button className="press btn btn-quiet btn-sm ml-auto" onClick={() => setShowAllZips(v => !v)}>{showAllZips ? 'Show the top 80%' : `Show all ${area.length}`}</button>
        </div>
        <div className="overflow-x-auto"><table className="tbl tbl-compact mt-2">
          <thead><tr><th className="w-10">#</th><th>ZIP</th><th className="num">Cases</th><th className="num">Share</th><th className="num">Cumulative</th><th className="num">Days of care</th><th className="num">Nursing homes in ZIP</th></tr></thead>
          <tbody>{zipsShown.map(z => (
            <tr key={String(z.zip)}>
              <td className="text-ink-3">{String(z.zip_rank)}</td><td>{String(z.zip)}</td>
              <td className="num">{fmtInt(Number(z.cases))}</td><td className="num">{pct(z.share_of_visible_cases)}</td><td className="num text-ink-2">{pct(z.cumulative_share, 0)}</td>
              <td className="num">{fmtInt(Number(z.days))}</td><td className="num">{Number(z.snfs_in_zip) ? fmtInt(Number(z.snfs_in_zip)) : <span className="empty">—</span>}</td>
            </tr>))}</tbody>
        </table></div>
        <div className="t-caption mt-2">Source: CMS Hospital Service Area file, 2025 (MEDICARE_PROV_NUM, ZIP_CD_OF_RESIDENCE, TOTAL_CASES, TOTAL_DAYS_OF_CARE). Rows with fewer than 11 cases are suppressed by CMS and excluded; shares are of visible cases.</div>
      </section>

      {/* SNFs serving */}
      <section className="panel panel-pad">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="section-title">SNFs in the service area <span className="text-ink-3 font-normal">· {filtered.length}</span></h2>
          <div role="radiogroup" aria-label="Rating tier" className="seg ml-auto !w-auto">
            {([['all', 'All'], ['high', '4–5★'], ['mid', '3★'], ['low', '1–2★']] as const).map(([v, l]) => <button key={v} role="radio" aria-checked={tier === v} onClick={() => setTier(v)} className="press seg-btn !flex-none">{l}</button>)}
          </div>
        </div>
        <div className="overflow-x-auto"><table className="tbl tbl-compact mt-2">
          <thead><tr><th>SNF</th><th><StripHeader /></th><th className="num">Modeled share</th><th className="num" title="Modeled: how much of this hospital's 2024 Medicare discharge mix (by diagnosis chapter) the SNF's own admitted-patient mix covers, 0–100%">Case-mix overlap</th><th>Units</th><th className="num">ZIP share</th><th className="num">Medicare stays 2024</th><th className="num">Beds</th><th className="num">Rehospitalized</th><th className="num">Readmitted after SNF</th><th className="num">To community</th><th className="num">Fines, 3 yr</th><th className="num">Harm deficiencies</th></tr></thead>
          <tbody>{filtered.map(s => (
            <tr key={String(s.ccn)}>
              <td><Link to={`/facility/${s.ccn}`} className="hover:text-accent hover:underline underline-offset-2">{titleCase(String(s.provider_name))}</Link><span className="sub">{titleCase(String(s.city_town))} {String(s.zip_code)}{s.special_focus_status ? <span className="text-rust"> · {String(s.special_focus_status)}</span> : ''}{s.abuse_icon === 'Y' ? <span className="text-rust"> · abuse icon</span> : ''}</span></td>
              <td><QualityStrip row={s} /></td>
              <td className="num font-medium">{(100 * Number(s.modeled_weight)).toFixed(2)}%</td>
              <td className="num">{s.casemix_overlap != null ? `${Math.round(100 * Number(s.casemix_overlap))}%` : <span className="empty" title={s.casemix_known != null ? `Only ${Math.round(100 * Number(s.casemix_known))}% of this SNF's 2024 stays fall in diagnosis categories large enough for CMS to publish, so the overlap is not computed` : 'No 2024 Medicare diagnosis mix published for this SNF'}>—</span>}</td>
              <td className="t-caption whitespace-nowrap">{[['beds_ventilator', 'Vent'], ['beds_dialysis', 'Dialysis'], ['beds_alzheimers', 'Dementia'], ['beds_hospice', 'Hospice'], ['beds_head_trauma', 'Head trauma'], ['beds_rehab', 'Rehab']].filter(([k]) => Number(s[k]) > 0).map(([, l]) => l).join(' · ') || <span className="empty">—</span>}</td>
              <td className="num text-ink-2" title={`${fmtInt(Number(s.hospital_cases_from_zip))} of the hospital's cases came from ${String(s.zip_code)}; ${String(s.zip_snfs)} nursing home(s) there`}>{pct(s.zip_share)}</td>
              <td className="num">{s.snf_medicare_stays_2024 != null && Number(s.snf_medicare_stays_2024) > 0 ? fmtInt(Number(s.snf_medicare_stays_2024)) : <span className="empty" title="No Medicare stays reported in the 2024 PAC PUF (suppressed or none)">—</span>}</td>
              <td className="num">{s.number_of_certified_beds != null ? fmtInt(Number(s.number_of_certified_beds)) : <span className="empty">—</span>}</td>
              <td className="num">{s.qm_521_adj != null ? fmtPct(Number(s.qm_521_adj)) : <Fn code={s.qm_521_fn} ref={ref} compact />}</td>
              <td className="num">{s.qrp_004_ppr_pd_rsrr != null ? fmtPct(Number(s.qrp_004_ppr_pd_rsrr)) : <Fn code={s.qrp_004_ppr_pd_rsrr_fn} ref={ref} compact />}</td>
              <td className="num">{s.qrp_005_dtc_rs_rate != null ? fmtPct(Number(s.qrp_005_dtc_rs_rate)) : <Fn code={s.qrp_005_dtc_rs_rate_fn} ref={ref} compact />}</td>
              <td className="num">{s.pen_total_fines_usd != null ? fmtUsd(Number(s.pen_total_fines_usd)) : <span className="empty">—</span>}</td>
              <td className="num">{s.hc_n_severity_G_or_worse != null ? fmtInt(Number(s.hc_n_severity_G_or_worse)) : <span className="empty">—</span>}</td>
            </tr>))}</tbody>
        </table></div>
        <div className="text-[11px] text-ink-3 mt-2">Modeled share = ZIP share of the hospital's visible cases × this SNF's share of Medicare stays among the nursing homes in that ZIP (2024 PAC PUF; equal split where none report stays). Shares sum to the covered share above. Upload hospital-reported counts on Discharge flows to replace the model.</div>
      </section>
    </div>
  )
}
