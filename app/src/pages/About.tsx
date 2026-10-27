import { useState } from 'react'
import { GROUPS } from '../lib/measures'
import { useReference } from '../components/ui'

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
              <table className="w-full"><tbody>
                {g.measures.map(m => {
                  const cat = ref.catalog.find(c => c.master_column === m.key)
                  return <tr key={m.key} className="border-t border-hairline/60"><td className="py-1 pr-3 w-1/2">{m.label}</td><td className="py-1 pr-3 text-ink-2 text-xs">{m.direction === 'none' ? 'no direction' : m.direction === 'lower' ? 'lower is better' : 'higher is better'}</td><td className="py-1 text-ink-3 text-xs">{cat ? `${cat.source} ${cat.measure_code} · ${cat.period}` : ''}<code className="ml-2">{m.key}</code></td></tr>
                })}
              </tbody></table>
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
          <h2 className="font-medium mt-6">Hospital service areas (modeled)</h2>
          <p className="mt-1 text-ink-2">CMS publishes no hospital-to-SNF discharge flows. A nursing home is "in" a hospital's service area when its ZIP code is one of the ZIPs the hospital's Medicare inpatients come from (CMS Hospital Service Area File, 2025; ZIPs with fewer than 11 cases are suppressed by CMS and cannot be used). The modeled share is the ZIP's share of the hospital's visible cases times the nursing home's share of Medicare SNF stays among the homes in that ZIP (CMS Post-Acute Care PUF, 2024). It is a proxy for referral exposure, not an observed flow; every number built on it is tagged "Modeled".</p>
          <h2 className="font-medium mt-6">Hospital systems (PECOS ownership)</h2>
          <p className="mt-1 text-ink-2">Owners come from CMS's PECOS "Hospital All Owners" file ({ref.meta.hospital_layer?.pecos_release?.slice(0, 10)}): organizations holding a 5%-or-greater direct or indirect ownership interest. Because a hospital lists every owner up its chain, one system appears under several holding-company names. A "system" here groups them with two mechanical rules and no fuzzy matching: owner records with the exact same name are one organization, and an organization whose hospitals are at least 80% contained in a larger organization's hospitals is treated as its subsidiary. The group is labelled with its largest member that is not named as a holding or acquisition vehicle, and every member name is kept as a searchable alias. Hospitals that are their own top-level entity have no system. A joint-venture hospital belongs to each of its owners' systems. Ownership percentages and private-equity/REIT flags are as self-reported to CMS.</p>
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
