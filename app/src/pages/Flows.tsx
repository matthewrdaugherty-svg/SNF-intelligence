import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import Papa from 'papaparse'
import { getDb, q, sqlStr } from '../lib/db'
import { distExpr } from '../lib/filters'
import { fmtInt, fmtPct, fmtUsd, titleCase } from '../lib/format'
import { QualityStrip, StripHeader, Empty, Fn, Stat, StatRow, useReference } from '../components/ui'

type Row = Record<string, unknown>
const REQUIRED = ['hospital_ccn', 'hospital_name', 'snf_ccn', 'period_start', 'period_end', 'n_discharges']
const OPTIONAL = ['hospital_lat', 'hospital_lng']
const STORE = 'snf.flows.csv'

export interface ParsedFlows { rows: Row[]; errors: string[]; hospitals: string[]; headerError?: boolean }
/** Validate an uploaded CSV. Pure function so it can be unit-tested. */
export function parseFlowsCsv(text: string): ParsedFlows {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase() })
  const errors: string[] = []
  const headers = res.meta.fields ?? []
  const missing = REQUIRED.filter(h => !headers.includes(h))
  if (missing.length) return { rows: [], errors: [`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}. Expected columns: ${REQUIRED.join(', ')} (optional: ${OPTIONAL.join(', ')}).`], hospitals: [], headerError: true }
  const rows: Row[] = []
  const isoDate = (s: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const t = Date.parse(s + 'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s }   // rejects 2025-13-45 and 2025-02-30
  res.data.forEach((r, i) => {
    const line = i + 2
    const snf = (r.snf_ccn ?? '').trim().toUpperCase(), hosp = (r.hospital_ccn ?? '').trim().toUpperCase()
    const nRaw = (r.n_discharges ?? '').trim()
    const ps = (r.period_start ?? '').trim(), pe = (r.period_end ?? '').trim()
    if (!/^[0-9A-Z]{6}$/.test(snf)) { errors.push(`Line ${line}: snf_ccn "${r.snf_ccn}" must be 6 characters (keep leading zeros).`); return }
    if (!/^[0-9A-Z]{6}$/.test(hosp)) { errors.push(`Line ${line}: hospital_ccn "${r.hospital_ccn}" must be 6 characters (keep leading zeros).`); return }
    if (!/^\d{1,9}$/.test(nRaw)) { errors.push(`Line ${line}: n_discharges "${nRaw}" must be a whole number of 0 or more (digits only).`); return }
    const n = Number(nRaw)
    if (!isoDate(ps) || !isoDate(pe)) { errors.push(`Line ${line}: period_start/period_end must be real dates in YYYY-MM-DD form.`); return }
    if (pe < ps) { errors.push(`Line ${line}: period_end ${pe} is before period_start ${ps}.`); return }
    const lat = r.hospital_lat?.trim() ? Number(r.hospital_lat) : null, lng = r.hospital_lng?.trim() ? Number(r.hospital_lng) : null
    if ((lat != null && Number.isNaN(lat)) || (lng != null && Number.isNaN(lng))) { errors.push(`Line ${line}: hospital_lat/hospital_lng must be numbers.`); return }
    rows.push({ hospital_ccn: hosp, hospital_name: (r.hospital_name ?? '').trim() || hosp, snf_ccn: snf, period_start: ps, period_end: pe, n_discharges: n, hospital_lat: lat, hospital_lng: lng })
  })
  return { rows, errors, hospitals: [...new Set(rows.map(r => String(r.hospital_ccn)))] }
}

async function loadIntoDb(rows: Row[]) {
  const conn = await getDb()
  await conn.query('DELETE FROM user_flows')
  await conn.query('DELETE FROM user_hospitals')
  const today = new Date().toISOString().slice(0, 10)
  for (let i = 0; i < rows.length; i += 500) {
    const vals = rows.slice(i, i + 500).map(r => `(${sqlStr(String(r.hospital_ccn))}, ${sqlStr(String(r.hospital_name))}, ${sqlStr(String(r.snf_ccn))}, DATE '${r.period_start}', DATE '${r.period_end}', ${Number(r.n_discharges)}, 'hospital_reported', 'uploaded CSV', DATE '${today}')`).join(',')
    await conn.query(`INSERT INTO user_flows VALUES ${vals}`)
  }
  const hosp = new Map<string, Row>()
  for (const r of rows) if (!hosp.has(String(r.hospital_ccn))) hosp.set(String(r.hospital_ccn), r)
  const hv = [...hosp.values()].map(r => `(${sqlStr(String(r.hospital_ccn))}, ${sqlStr(String(r.hospital_name))}, ${r.hospital_lat == null ? 'NULL' : Number(r.hospital_lat)}, ${r.hospital_lng == null ? 'NULL' : Number(r.hospital_lng)})`).join(',')
  if (hv) await conn.query(`INSERT INTO user_hospitals VALUES ${hv}`)
}

export default function Flows() {
  const [parsed, setParsed] = useState<ParsedFlows | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [hospital, setHospital] = useState<string>('')
  const [hospitals, setHospitals] = useState<Row[]>([])
  const [summary, setSummary] = useState<Row | null>(null)
  const [dest, setDest] = useState<Row[]>([])
  const [alts, setAlts] = useState<Row[]>([])
  const [radius, setRadius] = useState(15)
  const [fileName, setFileName] = useState<string>('')
  const ref = useReference()

  // restore a previous upload from this browser
  useEffect(() => {
    try { const t = localStorage.getItem(STORE); if (t) { const p = parseFlowsCsv(t); if (p.rows.length) { setParsed(p); setFileName('previous upload (this browser)'); loadIntoDb(p.rows).then(() => setLoaded(true)) } } } catch { /* ignore */ }
  }, [])

  const uploadSeq = useRef(0)
  async function onFile(file: File) {
    const seq = ++uploadSeq.current                      // only the latest upload may save itself or update the screen
    const text = await file.text()
    const p = parseFlowsCsv(text)
    try { localStorage.removeItem(STORE) } catch { /* ignore */ }   // a new upload always replaces the old one, even if it fails
    if (seq !== uploadSeq.current) return
    setParsed(p); setFileName(file.name); setLoaded(false); setSummary(null); setDest([]); setAlts([]); setHospitals([]); setHospital('')
    try {
      await loadIntoDb(p.rows)
      if (seq !== uploadSeq.current) return
      if (p.rows.length) { setLoaded(true); try { localStorage.setItem(STORE, text) } catch { /* ignore */ } }
    } catch (e) { if (seq === uploadSeq.current) setParsed({ rows: [], errors: [`The file could not be loaded: ${String((e as Error)?.message ?? e)}`], hospitals: [] }) }
  }
  function clearAll() { setParsed(null); setLoaded(false); setHospital(''); setHospitals([]); setSummary(null); setDest([]); setAlts([]); setFileName(''); try { localStorage.removeItem(STORE) } catch { /* ignore */ } loadIntoDb([]) }

  useEffect(() => {
    if (!loaded) return
    q(`SELECT hospital_ccn, any_value(hospital_name) AS hospital_name, sum(n_discharges) AS n, count(DISTINCT snf_ccn) AS n_snf, min(period_start) AS p0, max(period_end) AS p1 FROM user_flows GROUP BY hospital_ccn ORDER BY n DESC`)
      .then(h => { setHospitals(h); if (h.length && !h.find(x => x.hospital_ccn === hospital)) setHospital(String(h[0].hospital_ccn)) })
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!loaded || !hospital) return
    let live = true
    const h = sqlStr(hospital)
    ;(async () => {
      const [s] = await q(`
        WITH d AS (SELECT f.snf_ccn, sum(f.n_discharges) AS n FROM user_flows f WHERE f.hospital_ccn = ${h} GROUP BY f.snf_ccn)
        SELECT sum(d.n) AS total,
          sum(CASE WHEN m.ccn IS NULL THEN d.n ELSE 0 END) AS unmatched,
          sum(CASE WHEN m.overall_rating IN (1,2) THEN d.n ELSE 0 END) AS low,
          sum(CASE WHEN m.overall_rating = 3 THEN d.n ELSE 0 END) AS mid,
          sum(CASE WHEN m.overall_rating IN (4,5) THEN d.n ELSE 0 END) AS high,
          sum(CASE WHEN m.ccn IS NOT NULL AND m.overall_rating IS NULL THEN d.n ELSE 0 END) AS unrated,
          sum(CASE WHEN m.qm_521_adj IS NOT NULL THEN d.n ELSE 0 END) AS n_with_521,
          sum(d.n * m.qm_521_adj) / nullif(sum(CASE WHEN m.qm_521_adj IS NOT NULL THEN d.n ELSE 0 END),0) AS w521,
          sum(d.n * m.qrp_004_ppr_pd_rsrr) / nullif(sum(CASE WHEN m.qrp_004_ppr_pd_rsrr IS NOT NULL THEN d.n ELSE 0 END),0) AS w004,
          sum(d.n * m.qrp_005_dtc_rs_rate) / nullif(sum(CASE WHEN m.qrp_005_dtc_rs_rate IS NOT NULL THEN d.n ELSE 0 END),0) AS w005,
          sum(d.n * m.overall_rating) / nullif(sum(CASE WHEN m.overall_rating IS NOT NULL THEN d.n ELSE 0 END),0) AS wstars,
          count(DISTINCT d.snf_ccn) AS n_snf, count(DISTINCT CASE WHEN m.ccn IS NOT NULL THEN d.snf_ccn END) AS n_snf_matched
        FROM d LEFT JOIN facility_master m ON m.ccn = d.snf_ccn`)
      const [hh] = await q(`SELECT * FROM user_hospitals WHERE hospital_ccn = ${h}`)
      const hasLoc = hh && hh.lat != null && hh.lng != null
      const distSel = hasLoc ? `, ${distExpr(Number(hh.lat), Number(hh.lng))} AS distance_mi` : ''
      const dd = await q(`
        WITH d AS (SELECT snf_ccn, sum(n_discharges) AS n FROM user_flows WHERE hospital_ccn = ${h} GROUP BY snf_ccn)
        SELECT d.snf_ccn, d.n, m.ccn, m.provider_name, m.city_town, m.state, m.overall_rating, m.health_inspection_rating, m.qm_rating, m.staffing_rating, m.special_focus_status, m.abuse_icon,
               m.number_of_certified_beds, m.qm_521_adj, m.qm_521_fn, m.qrp_004_ppr_pd_rsrr, m.qrp_004_ppr_pd_rsrr_fn, m.qrp_005_dtc_rs_rate, m.qrp_005_dtc_rs_rate_fn, m.pen_total_fines_usd, m.hc_n_severity_G_or_worse${distSel}
        FROM d LEFT JOIN facility_master m ON m.ccn = d.snf_ccn ORDER BY d.n DESC`)
      let aa: Row[] = []
      if (hasLoc) {
        aa = await q(`SELECT ccn, provider_name, city_town, state, overall_rating, health_inspection_rating, qm_rating, staffing_rating, number_of_certified_beds, average_number_of_residents_per_day, qm_521_adj, qrp_004_ppr_pd_rsrr, qrp_005_dtc_rs_rate, pen_total_fines_usd, hc_n_severity_G_or_worse, ${distExpr(Number(hh.lat), Number(hh.lng))} AS distance_mi,
          (ccn IN (SELECT snf_ccn FROM user_flows WHERE hospital_ccn = ${h})) AS already_used
          FROM facility_master WHERE overall_rating IN (4,5) AND special_focus_status IS NULL AND abuse_icon <> 'Y' AND ${distExpr(Number(hh.lat), Number(hh.lng))} <= ${radius} ORDER BY distance_mi ASC`)
      }
      if (!live) return
      setSummary({ ...s, hasLoc, lat: hh?.lat, lng: hh?.lng }); setDest(dd); setAlts(aa)
    })().catch(e => { if (live) { setParsed({ rows: [], errors: [`The uploaded data could not be summarized: ${String((e as Error)?.message ?? e)}`], hospitals: [] }); setLoaded(false); try { localStorage.removeItem(STORE) } catch { /* ignore */ } } })
    return () => { live = false }
  }, [loaded, hospital, radius])

  // whole-number shares that add to exactly 100 (largest-remainder rounding)
  const shares = useMemo(() => {
    if (!summary || !(Number(summary.total) > 0)) return null
    const tot = Number(summary.total)
    const parts = { high: Number(summary.high), mid: Number(summary.mid), low: Number(summary.low), other: Number(summary.unrated) + Number(summary.unmatched) }
    const raw = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, 100 * v / tot])) as Record<keyof typeof parts, number>
    const fl = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Math.floor(v)])) as Record<keyof typeof parts, number>
    let rem = 100 - Object.values(fl).reduce((a, b) => a + b, 0)
    for (const k of (Object.keys(raw) as (keyof typeof parts)[]).sort((a, b) => (raw[b] - fl[b]) - (raw[a] - fl[a]))) { if (rem <= 0) break; fl[k] += 1; rem -= 1 }
    return fl
  }, [summary])
  const share = (n: unknown) => summary && Number(summary.total) > 0 ? fmtPct(100 * Number(n) / Number(summary.total), 0) : ''
  const hospRow = hospitals.find(x => x.hospital_ccn === hospital)
  const altStats = useMemo(() => {
    const v = alts.filter(a => a.qm_521_adj != null).map(a => Number(a.qm_521_adj)); const b = alts.reduce((s, a) => s + Number(a.number_of_certified_beds ?? 0), 0)
    return { n: alts.length, beds: b, avg521: v.length ? v.reduce((x, y) => x + y, 0) / v.length : null }
  }, [alts])

  return (
    <div className="page stack">
      <div><h1>Discharge flows</h1>
      <p className="t-body text-ink-2 mt-2 max-w-3xl">Where a hospital's patients go after discharge, and how much of that volume lands in high- versus low-rated SNFs. CMS publishes no hospital-to-SNF flows, so this page runs on counts a hospital provides; the schema is fixed so real data drops in without any rework. Until a hospital shares its data, the <Link to="/hospitals" className="underline">Hospitals</Link> pages give a modeled view of the same question, built from CMS's public service-area and utilization files and labelled “Modeled” everywhere it appears.</p></div>

      <div className="panel panel-pad">
        <div className="flex flex-wrap items-center gap-3">
          <label className="press btn btn-primary text-sm cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent">Upload CSV<input type="file" accept=".csv,text/csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = '' }} /></label>
          <a className="press btn btn-surface text-sm" href={`${import.meta.env.BASE_URL}data/discharge_flows_template.csv`} download>Download the template</a>
          {parsed && <button className="press btn btn-quiet text-sm" onClick={clearAll}>Remove uploaded data</button>}
          <div className="text-xs text-ink-3 ml-auto max-w-md">Use aggregated counts (hospital → SNF → number of discharges in a period), never patient records. The file is kept in this browser's storage until you remove it; nothing is sent to a server.</div>
        </div>
        <div className="text-xs text-ink-2 mt-3">Columns: <code className="text-ink">hospital_ccn, hospital_name, snf_ccn, period_start, period_end, n_discharges</code> · optional <code className="text-ink">hospital_lat, hospital_lng</code> (needed for distances and nearby alternatives). Dates as YYYY-MM-DD. Keep leading zeros in CCNs.</div>
        {parsed && (
          <div className="mt-3 text-sm">
            <div>{fileName}: {parsed.headerError ? <span className="font-medium">not loaded</span> : <><span className="font-medium tabular-nums">{parsed.rows.length.toLocaleString()}</span> valid row{parsed.rows.length === 1 ? '' : 's'}, {parsed.hospitals.length} hospital{parsed.hospitals.length === 1 ? '' : 's'}{parsed.errors.length ? <span className="font-medium"> · {parsed.errors.length} row{parsed.errors.length === 1 ? '' : 's'} skipped</span> : null}</>}</div>
            {parsed.errors.length > 0 && <ul className="mt-1 text-xs text-ink-2 list-disc pl-5">{parsed.errors.slice(0, 12).map((e, i) => <li key={i}>{e}</li>)}{parsed.errors.length > 12 && <li>…and {parsed.errors.length - 12} more</li>}</ul>}
          </div>
        )}
      </div>

      {!loaded && !parsed && <Empty title="No discharge data loaded.">Upload a CSV to see the quality mix of a hospital's post-acute destinations. Without one, <Link to="/hospitals" className="underline">find the hospital</Link> for a modeled quality mix of its service area, or use <Link to="/map" className="underline">the Map</Link> to see every SNF within a radius of any hospital address.</Empty>}

      {loaded && hospitals.length > 0 && summary && (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <label className="text-sm text-ink-2">Hospital</label>
            <select className="control max-w-full" value={hospital} onChange={e => setHospital(e.target.value)} aria-label="Hospital">
              {hospitals.map(h => <option key={String(h.hospital_ccn)} value={String(h.hospital_ccn)}>{String(h.hospital_name)} ({String(h.hospital_ccn)}) · {fmtInt(Number(h.n))} discharges</option>)}
            </select>
            {hospRow && <span className="text-xs text-ink-3">{String(hospRow.p0)} to {String(hospRow.p1)} · hospital-reported</span>}
          </div>

          <StatRow source="Hospital-reported" cols={5} note="quality mix of the uploaded discharges to SNFs">
            <Stat label="Discharges to SNFs" value={fmtInt(Number(summary.total))} note={<>{fmtInt(Number(summary.n_snf_matched))} SNFs in the CMS file{Number(summary.n_snf) > Number(summary.n_snf_matched) ? ` · ${fmtInt(Number(summary.n_snf) - Number(summary.n_snf_matched))} CCNs not found` : ''}</>} />
            <Stat label="To 4–5★ (good)" value={`${shares?.high ?? 0}%`} note={`${fmtInt(Number(summary.high))} discharges`} />
            <Stat label="To 3★ (average)" value={`${shares?.mid ?? 0}%`} note={`${fmtInt(Number(summary.mid))} discharges`} />
            <Stat label="To 1–2★ (poor)" value={`${shares?.low ?? 0}%`} note={`${fmtInt(Number(summary.low))} discharges`} />
            <Stat label="Unrated or not found" value={`${shares?.other ?? 0}%`} note={`${fmtInt(Number(summary.unmatched))} to CCNs not in the CMS file`} />
          </StatRow>
          <div className="panel panel-pad t-body text-ink-2 flex flex-wrap gap-x-6 gap-y-1">
            <span>Volume-weighted averages of the destinations' CMS measures:</span>
            {summary.wstars != null && <span>overall stars <span className="text-ink font-medium tabular-nums">{Number(summary.wstars).toFixed(2)}</span></span>}
            {summary.w521 != null && <span>short-stay rehospitalization <span className="text-ink font-medium tabular-nums">{fmtPct(Number(summary.w521))}</span></span>}
            {summary.w004 != null && <span>30-day preventable readmission after SNF discharge <span className="text-ink font-medium tabular-nums">{fmtPct(Number(summary.w004))}</span></span>}
            {summary.w005 != null && <span>discharge to community <span className="text-ink font-medium tabular-nums">{fmtPct(Number(summary.w005))}</span></span>}
            <span className="t-caption w-full">Weighted by discharges; SNFs with a suppressed value are left out of that average. These are SNF-level CMS rates, not this hospital's own patients' outcomes.</span>
          </div>

          <section className="panel panel-pad">
            <h2 className="section-title">Destinations <span className="text-ink-3 font-normal">· {dest.length}</span></h2>
            <div className="overflow-x-auto"><table className="tbl tbl-compact mt-2">
              <thead><tr><th>SNF</th><th className="num">Discharges</th><th className="num">Share</th><th><StripHeader /></th>{summary.hasLoc ? <th className="num">Miles</th> : null}<th className="num">Rehospitalized</th><th className="num">Readmitted after SNF</th><th className="num">To community</th><th className="num">Fines, 3 yr</th><th className="num">Harm deficiencies</th></tr></thead>
              <tbody>
                {dest.map(d => (
                  <tr key={String(d.snf_ccn)}>
                    <td>{d.ccn ? <Link to={`/facility/${d.ccn}`} className="hover:underline underline-offset-2">{titleCase(String(d.provider_name))}</Link> : <span className="text-ink-2">CCN {String(d.snf_ccn)} <span className="font-medium text-ink">not in the CMS file</span></span>}{d.ccn ? <span className="sub">{titleCase(String(d.city_town))}, {String(d.state)}{d.special_focus_status ? <span className="text-rust"> · {String(d.special_focus_status)}</span> : ''}{d.abuse_icon === 'Y' ? <span className="text-rust"> · abuse icon</span> : ''}</span> : null}</td>
                    <td className="num">{fmtInt(Number(d.n))}</td><td className="num text-ink-2">{share(d.n)}</td>
                    <td>{d.ccn ? <QualityStrip row={d} /> : null}</td>
                    {summary.hasLoc ? <td className="num">{d.distance_mi != null ? Number(d.distance_mi).toFixed(1) : <span className="empty">—</span>}</td> : null}
                    <td className="num">{d.qm_521_adj != null ? fmtPct(Number(d.qm_521_adj)) : <Fn code={d.qm_521_fn} ref={ref} compact />}</td>
                    <td className="num">{d.qrp_004_ppr_pd_rsrr != null ? fmtPct(Number(d.qrp_004_ppr_pd_rsrr)) : <Fn code={d.qrp_004_ppr_pd_rsrr_fn} ref={ref} compact />}</td>
                    <td className="num">{d.qrp_005_dtc_rs_rate != null ? fmtPct(Number(d.qrp_005_dtc_rs_rate)) : <Fn code={d.qrp_005_dtc_rs_rate_fn} ref={ref} compact />}</td>
                    <td className="num">{d.pen_total_fines_usd != null ? fmtUsd(Number(d.pen_total_fines_usd)) : <span className="empty">—</span>}</td>
                    <td className="num">{d.hc_n_severity_G_or_worse != null ? fmtInt(Number(d.hc_n_severity_G_or_worse)) : <span className="empty">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>

          <section className="panel panel-pad">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="section-title">4–5★ SNFs near this hospital</h2>
              {Boolean(summary.hasLoc) ? <><label className="text-sm text-ink-2 ml-2">within</label><input type="range" min={3} max={40} value={radius} onChange={e => setRadius(Number(e.target.value))} aria-label="Radius in miles" /><span className="text-sm tabular-nums">{radius} mi</span></> : <span className="text-xs text-ink-3">Add hospital_lat and hospital_lng to the CSV to see nearby alternatives and distances.</span>}
            </div>
            {Boolean(summary.hasLoc) && (
              <>
                <div className="text-sm text-ink-2 mt-2">
                  {altStats.n} SNFs rated 4–5★ overall (excluding special-focus and abuse-icon SNFs) with {fmtInt(altStats.beds)} certified beds in total{altStats.avg521 != null ? <>; their simple average short-stay rehospitalization is <span className="text-ink font-medium">{fmtPct(altStats.avg521)}</span>{summary.w521 != null ? <> versus <span className="text-ink font-medium">{fmtPct(Number(summary.w521))}</span> weighted across current destinations</> : null}</> : null}.
                  {Number(summary.low) > 0 && <> This hospital sent <span className="text-ink font-medium">{fmtInt(Number(summary.low))}</span> discharges ({share(summary.low)}) to 1–2★ SNFs in the period.</>}
                </div>
                <div className="text-xs text-ink-3 mt-1">Arithmetic on CMS facility averages, for sizing the conversation. It does not say these SNFs have capacity or are clinically right for the patients, and it is not an estimate of readmissions avoided.</div>
                <div className="overflow-x-auto"><table className="tbl tbl-compact mt-3">
                  <thead><tr><th>SNF</th><th className="num">Miles</th><th><StripHeader /></th><th className="num">Beds</th><th className="num">Residents per day</th><th className="num">Rehospitalized</th><th className="num">Readmitted after SNF</th><th className="num">To community</th><th className="num">Fines, 3 yr</th><th>Already a destination</th></tr></thead>
                  <tbody>
                    {alts.map(a => (
                      <tr key={String(a.ccn)}>
                        <td><Link to={`/facility/${a.ccn}`} className="hover:underline underline-offset-2">{titleCase(String(a.provider_name))}</Link><span className="sub">{titleCase(String(a.city_town))}, {String(a.state)}</span></td>
                        <td className="num">{Number(a.distance_mi).toFixed(1)}</td><td><QualityStrip row={a} /></td>
                        <td className="num">{a.number_of_certified_beds != null ? fmtInt(Number(a.number_of_certified_beds)) : <span className="empty">—</span>}</td>
                        <td className="num">{a.average_number_of_residents_per_day != null ? Number(a.average_number_of_residents_per_day).toFixed(0) : <span className="empty">—</span>}</td>
                        <td className="num">{a.qm_521_adj != null ? fmtPct(Number(a.qm_521_adj)) : <span className="empty">—</span>}</td>
                        <td className="num">{a.qrp_004_ppr_pd_rsrr != null ? fmtPct(Number(a.qrp_004_ppr_pd_rsrr)) : <span className="empty">—</span>}</td>
                        <td className="num">{a.qrp_005_dtc_rs_rate != null ? fmtPct(Number(a.qrp_005_dtc_rs_rate)) : <span className="empty">—</span>}</td>
                        <td className="num">{a.pen_total_fines_usd != null ? fmtUsd(Number(a.pen_total_fines_usd)) : <span className="empty">—</span>}</td>
                        <td className="text-ink-2">{a.already_used ? 'yes' : <span className="empty">—</span>}</td>
                      </tr>
                    ))}
                    {alts.length === 0 && <tr><td colSpan={10} className="py-3 text-ink-3 text-sm">No 4–5★ SNFs within {radius} miles. Widen the radius.</td></tr>}
                  </tbody>
                </table></div>
              </>
            )}
          </section>
          <div className="text-xs text-ink-3 mt-4 mb-8">Source labels: every row above is “hospital-reported” (your upload). CMS data as of {ref?.meta.data_vintage}.</div>
        </>
      )}
    </div>
  )
}
