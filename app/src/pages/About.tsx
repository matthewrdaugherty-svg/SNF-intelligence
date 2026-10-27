import { useMemo, useState } from 'react'
import type { Reference } from '../lib/reference'
import { GROUPS } from '../lib/measures'
import { useReference } from '../components/ui'

/** The full MS-DRG → family mapping, straight from the exported table, so nobody has to trust the prose. */
function DrgMapping({ ref }: { ref: Reference }) {
  const [open, setOpen] = useState(false)
  const fams = useMemo(() => { const m = new Map<string, Reference['drgFamilies']>(); for (const r of ref.drgFamilies) m.set(r.family, [...(m.get(r.family) ?? []), r]); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])) }, [ref])
  return (
    <div className="mt-2">
      <button className="press btn btn-quiet btn-sm" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide' : 'Show'} the DRG-to-family mapping ({ref.drgFamilies.length} DRGs, {fams.length} families)</button>
      {open && <div className="mt-2 max-h-[480px] overflow-auto card p-3">{fams.map(([f, rows]) => <div key={f} className="mb-3"><div className="t-label text-ink font-medium">{f} <span className="text-ink-3 font-normal">· {rows.length} DRGs</span></div><div className="t-caption">{rows.map(r => `${r.drg} ${r.title}`).join(' · ')}</div></div>)}</div>}
    </div>
  )
}

export default function About() {
  const ref = useReference()
  const [tab, setTab] = useState<'overview' | 'measures' | 'lineage' | 'footnotes' | 'limits' | 'checks'>('overview')
  if (!ref) return <div className="p-8 text-sm text-ink-2">Loading…</div>
  const tabs = [['overview', 'Overview'], ['measures', 'Measures and direction'], ['lineage', 'Column lineage'], ['footnotes', 'Footnote codes'], ['limits', 'Limitations'], ['checks', 'Verification']] as const
  return (
    <div className="page">
      <h1>Methodology & trust</h1>
      <p className="text-sm text-ink-2 mt-1 max-w-3xl">Every number in this app comes from a CMS file, unchanged, or from a count or sum of CMS rows whose rule is written down here. Nothing is estimated or filled in. Where CMS suppressed a value, it is blank and carries CMS's footnote.</p>
      <div className="flex gap-1 mt-5 border-b border-hairline overflow-x-auto whitespace-nowrap">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`press px-3 py-2 text-sm -mb-px border-b-2 ${tab === k ? 'border-ink text-ink font-medium' : 'border-transparent text-ink-2 hover:text-ink'}`}>{l}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="mt-5 grid grid-cols-[180px_1fr] gap-x-6 gap-y-3 text-sm max-w-3xl">
          <div className="text-ink-2">Data</div><div>CMS Care Compare nursing-home files (processing date {ref.meta.data_vintage}), the SNF Quality Reporting Program provider file, and the SNF Value-Based Purchasing FY2026 facility file. Release: {ref.meta.release}.</div>
          <div className="text-ink-2">Facilities</div><div>{ref.meta.n_facilities.toLocaleString()} — every nursing home in the CMS Provider Information file. Hospital swing-bed units are not included.</div>
          <div className="text-ink-2">“Last 12 months”</div><div>On or after {ref.meta.window_12m_start}, which is CMS's own most-recent-12-month window for this release.</div>
          <div className="text-ink-2">State and national averages</div><div>Taken from CMS's State/US Averages file. They are simple, unweighted averages of facility values, which we confirmed by recomputing them from the facility rows (they match to the published precision).</div>
          <div className="text-ink-2">Severity letters</div><div>CMS scope-and-severity grid A–L. We label G–I “actual harm” and J–L “immediate jeopardy”. The CMS data dictionary confirms “G or greater” means harm; the full grid is defined in the CMS Five-Star Technical Users' Guide, which this project has not yet independently fetched.</div>
          <div className="text-ink-2">Derived columns</div><div>Only one: the VBP net Part A payment change, which is (incentive multiplier − 1) × 100. It is labelled “derived” wherever it appears.</div>
          <div className="text-ink-2">What is not here</div><div>Hospital-to-SNF discharge flows (CMS does not publish them), dollar costs, payer mix, complaints filed or substantiated. See Limitations.</div>
          <div className="text-ink-2">Built</div><div>{ref.meta.built}. The database runs inside your browser, so filters, searches and anything you upload on Discharge flows stay on your machine (uploads are kept in this browser's storage until you remove them). Two optional features contact outside services: the place lookup sends the address you type to OpenStreetMap's Nominatim service, and the Map loads its street basemap from OpenFreeMap.</div>
        </div>
      )}

      {tab === 'measures' && (
        <div className="mt-5 text-sm">
          <p className="text-ink-2 max-w-3xl mb-4">“Better” and “worse” in this app follow our reading of each measure's description (lower is better for harms, costs and readmissions; higher is better for vaccinations, function and discharge to community). This is an interpretation, not a CMS value, and is pending sign-off by the project's quality reviewer.</p>
          {GROUPS.map(g => (
            <div key={g.id} className="mb-4">
              <div className="font-medium">{g.title}</div>
              {g.blurb && <div className="text-xs text-ink-2 mb-1">{g.blurb}</div>}
              <div className="overflow-x-auto"><table className="tbl tbl-compact"><tbody>
                {g.measures.map(m => {
                  const cat = ref.catalog.find(c => c.master_column === m.key)
                  return <tr key={m.key}><td className="w-1/2 [overflow-wrap:anywhere]">{m.label}</td><td className="text-ink-2 text-xs whitespace-nowrap">{m.direction === 'none' ? 'no direction' : m.direction === 'lower' ? 'lower is better' : 'higher is better'}</td><td className="text-ink-3 text-xs [overflow-wrap:anywhere]">{cat ? `${cat.source} ${cat.measure_code} · ${cat.period}` : ''}<code className="ml-2">{m.key}</code></td></tr>
                })}
              </tbody></table></div>
            </div>
          ))}
        </div>
      )}

      {tab === 'lineage' && (
        <div className="mt-5 text-sm">
          <p className="text-ink-2 max-w-3xl mb-3">Each column in the facility table, the CMS file and header it came from, and how it was derived.</p>
          <div className="overflow-x-auto"><table className="tbl tbl-compact text-xs"><thead><tr><th>Column</th><th>Database name</th><th>CMS file</th><th>CMS header / rule</th></tr></thead><tbody>
            {ref.lineage.map((l, i) => <tr key={i}><td className="[overflow-wrap:anywhere]">{l['Facility_Master header']}</td><td className="text-ink-2 [overflow-wrap:anywhere]"><code>{l['db column']}</code></td><td className="text-ink-2 [overflow-wrap:anywhere]">{l.source_file.replace(/^[a-z0-9]{4}-[a-z0-9]{4}_\d{4}-\d{2}-\d{2}_/, '')}</td><td className="text-ink-2 [overflow-wrap:anywhere]">{l.original_header}{l.how_derived && l.how_derived !== 'direct copy' ? ` — ${l.how_derived}` : ''}</td></tr>)}
          </tbody></table></div>
        </div>
      )}

      {tab === 'footnotes' && (
        <div className="mt-5 text-sm max-w-3xl">
          <p className="text-ink-2 mb-3">From the CMS Nursing Home data dictionary. A blank value with one of these codes was suppressed or not computed by CMS; it is never zero.</p>
          <table className="w-full"><tbody>
            {Object.entries(ref.footnotes).sort((a, b) => Number(a[0]) - Number(b[0])).map(([c, f]) => <tr key={c} className="border-t border-hairline/60 align-top"><td className="py-1 pr-3 tabular-nums w-10 text-ink-2">{c}</td><td className="py-1">{f.meaning}<div className="text-xs text-ink-3">{f.applies_to}</div></td></tr>)}
          </tbody></table>
        </div>
      )}

      {tab === 'limits' && (
        <div className="mt-5 text-sm max-w-3xl">
          <ol className="space-y-2">{ref.limitations.map((l, i) => <li key={i} className="pl-1">{l.replace(/^\d+\.\s*/, '')}</li>)}</ol>
          <h2 className="font-medium mt-6">Three words, kept distinct</h2>
          <p className="mt-1 text-ink-2"><b className="text-ink font-medium">SNF</b> means a Medicare-certified skilled nursing facility — the post-acute setting that can provide licensed nursing care such as IV therapy, and the destination a hospital discharges to. <b className="text-ink font-medium">Nursing home</b> is CMS's word for the whole Care Compare universe: 14,690 certified homes, of which 13,905 are certified for Medicare and Medicaid, 538 for Medicare only, and 247 for Medicaid only; those 247 are nursing facilities, not SNFs, and the Certification filter removes them. <b className="text-ink font-medium">Facility</b> is used only as a generic word (a row, "this facility"); it never stands in for SNF, because a facility could also be a rehabilitation or other setting.</p>
          <h2 className="font-medium mt-6">Hospital service areas (modeled)</h2>
          <p className="mt-1 text-ink-2">CMS publishes no hospital-to-SNF discharge flows. A nursing home is "in" a hospital's service area when its ZIP code is one of the ZIPs the hospital's Medicare inpatients come from (CMS Hospital Service Area File, 2025; ZIPs with fewer than 11 cases are suppressed by CMS and cannot be used). The modeled share is the ZIP's share of the hospital's visible cases times the nursing home's share of Medicare SNF stays among the homes in that ZIP (CMS Post-Acute Care PUF, 2024). It is a proxy for referral exposure, not an observed flow; every number built on it is tagged "Modeled".</p>
          <h2 className="font-medium mt-6">Hospital systems (PECOS ownership)</h2>
          <p className="mt-1 text-ink-2">Owners come from CMS's PECOS "Hospital All Owners" file ({ref.meta.hospital_layer?.pecos_release?.slice(0, 10)}): organizations holding a 5%-or-greater direct or indirect ownership interest. Because a hospital lists every owner up its chain, one system appears under several holding-company names. A "system" here groups them with mechanical rules and no fuzzy matching: owner records with the exact same name are one organization; an owner's stake counts only when it is controlling (a reported share of 50% or more, or no share reported); and an organization with two or more controlled hospitals is treated as a subsidiary of the largest organization that holds a documented controlling share in at least two-thirds of them. Joint-venture partners and minority investors are shown but never pull a hospital into their system. The group is labelled with its largest member that is not named as a holding or acquisition vehicle, and every member name is kept as a searchable alias. Hospitals that are their own top-level entity have no system. A hospital controlled by two systems belongs to both. Ownership percentages and private-equity/REIT flags are as self-reported to CMS. System names are shown in a friendly form by default — title case with corporate suffixes dropped, plus a short hand-curated list of brand names for entities whose legal name does not say who they are (AdventHealth for Adventist Health System Sunbelt Healthcare Corporation, Ardent Health for AHP Health Partners, Intermountain Health for IHC Health Services, Atrium Health for The Charlotte-Mecklenburg Hospital Authority, and a dozen more listed in the code) — and a toggle beside every system name switches to the legal PECOS name. Owner lines always show the legal name, because that is the PECOS record.</p>
          <h2 className="font-medium mt-6">Discharge mix and case-mix overlap (modeled)</h2>
          <p className="mt-1 text-ink-2">A hospital's discharge mix comes from CMS's Medicare Inpatient Hospitals by Provider and Service file (calendar 2024). CMS suppresses any diagnosis group with fewer than 11 cases at a hospital, so the visible rows cover on average 58% of a hospital's Medicare discharges; the page states the coverage beside every mix. Diagnosis groups (MS-DRGs) are rolled into plain-English families using CMS's own DRG-to-major-diagnostic-category list (v42.1), with sixteen named families (joint replacement, hip fracture, stroke, heart failure, sepsis, pneumonia…) and the category name for everything else. A SNF's patient mix comes from the Post-Acute Care PUF diagnosis chapters. "Case-mix overlap" is the share of a hospital's discharge mix that the SNF's published patient mix also covers (the sum, across chapters, of the smaller of the two shares); it is reported only when the SNF's published chapters cover at least 60% of its stays, and withheld with the reason otherwise. A low overlap or a missing unit never proves a home cannot take a patient. Because the hospital side is the admitting diagnosis and the SNF side is the diagnosis for the SNF stay (often aftercare or rehabilitation), the two mixes differ by nature and even a well-matched pair rarely scores above about 70%.</p>
          <DrgMapping ref={ref} />
          <h2 className="font-medium mt-6">Placement scenarios (modeled)</h2>
          <p className="mt-1 text-ink-2">The Scenarios page starts from the hospital's SNF volume by home — the modeled service-area shares, or the hospital's own counts when they have been loaded on the Flows page — and a definition of an acceptable SNF (minimum overall rating, no special-focus or abuse-icon homes, Medicare-certified only, required dedicated units, minimum case-mix overlap). Volume in facilities that do not meet the bar is moved, in the chosen share, to the nearest acceptable facilities within the chosen distance of the facility the patient would otherwise have used (straight-line distance between the two facilities' Care Compare coordinates), split equally among them; volume with no acceptable facility in reach stays unplaced and is reported. "Optimize" is the ceiling: all of that volume goes to the single best-fit acceptable facility within reach, ranked by overall rating, then lowest readmission after SNF discharge, then highest case-mix overlap, then distance, with no bed-capacity limit. "Realization" is (before − your scenario) ÷ (before − optimal) on each measure: the share of the modeled opportunity a scenario captures. Before-and-after figures are volume-weighted averages of each facility's published CMS rates (readmission after SNF discharge, short-stay rehospitalization, discharge to community, overall rating) and of Medicare's average payment per stay from the Post-Acute Care PUF. The distance shown is home-to-home, an upper bound on the extra travel from the patient's own address, which the public data does not contain. It assumes receiving facilities keep their published rates at the new volume, have beds, and are accepted by patients; it is a sizing tool, not a forecast. The figures for the Johns Hopkins default case were reproduced independently in pure Python (scripts/verify/scenario_indep.py) before the page shipped.</p>
        </div>
      )}

      {tab === 'checks' && (
        <div className="mt-5 text-sm max-w-3xl">
          <p className="text-ink-2 mb-3">{ref.meta.validation}</p>
          <div className="font-medium mb-1">Cross-file reconciliation (facilities matching / total)</div>
          <div className="overflow-x-auto"><table className="tbl tbl-compact text-xs"><tbody>{ref.reconciliation.map((r, i) => <tr key={i}><td>{r.Check}</td><td className="num text-ink-2 whitespace-nowrap">{r.Result}</td></tr>)}</tbody></table></div>
          <div className="text-xs text-ink-3 mt-3">The one known difference — Provider Info's rating-cycle deficiency counts versus the inspection-cycle counts in the survey files — is explained for 287 of 449 facilities (citations under informal dispute) and open for the rest. This app uses the survey-file counts.</div>
        </div>
      )}
    </div>
  )
}
