// Placement scenarios (MODELED). Everything here is arithmetic on CMS facility rates and a stated reassignment rule; no patient data.
// The same engine runs on a hospital's real discharge counts (user_flows) when they are loaded — see `baselineSql`.
import { q, sqlStr, type Row } from './db'

export interface ScenarioParams {
  hospital: string          // hospital CCN
  minStars: number          // viable SNF must have overall rating >= this (1–5)
  excludeFlags: boolean     // drop special-focus and abuse-icon facilities from the viable set
  snfOnly: boolean          // Medicare-certified SNFs only
  units: string[]           // required dedicated units: vent, dialysis, alz, hospice, trauma, rehab
  minOverlap: number | null // minimum case-mix overlap 0–1, or null to ignore
  maxMiles: number          // a displaced patient can be moved at most this far from the SNF they would have used
  k: number                 // split moved volume across the k nearest viable SNFs
  shift: number             // share of non-viable volume that is moved, 0–1
  n: number | null          // the hospital's annual SNF discharges (optional; absolute numbers need it)
  mode: 'nearest' | 'optimal' // nearest: split across the k nearest acceptable facilities; optimal: every moved patient goes to the best-fit acceptable facility within reach that still has room
  objective: Objective      // what 'best fit' means in optimal mode
  weights: Weights          // for objective = 'blend'
}
export type Objective = 'balanced' | 'blend' | 'readmit' | 'rehosp' | 'community' | 'cost' | 'stars'
export const OBJECTIVE_LABEL: Record<Objective, string> = { balanced: 'Balanced: readmissions, rehospitalization, discharge to community and cost, equally', blend: 'Custom blend of those four', readmit: 'Fewest readmissions after SNF discharge', rehosp: 'Fewest short-stay rehospitalizations', community: 'Most discharges to community', cost: 'Lowest Medicare payment per stay', stars: 'Highest overall rating' }
/** Short form for sentences. */
export const OBJECTIVE_WORD: Record<Objective, string> = { balanced: 'the best balance of readmissions, rehospitalization, discharge to community and Medicare cost', blend: 'your custom blend of readmissions, rehospitalization, discharge to community and cost', readmit: 'fewest readmissions after SNF discharge', rehosp: 'fewest short-stay rehospitalizations', community: 'most discharges to community', cost: 'lowest Medicare payment per stay', stars: 'highest overall rating' }
/** Blend weights, in the order readmit · rehosp · community · cost; each 0–10. Balanced = 1,1,1,1. */
export type Weights = [number, number, number, number]
export const WEIGHT_LABEL = ['Readmissions after SNF discharge', 'Short-stay rehospitalization', 'Discharge to community', 'Medicare payment per stay']
/** MedPAC July 2026 Data Book, Chart 8-3: 18.7% of FFS hospital discharges (2019) went to a SNF. Used only to size a hospital's SNF volume when the user has not entered it. */
export const SNF_SHARE_OF_DISCHARGES = 0.187
export const DEFAULTS: Omit<ScenarioParams, 'hospital'> = { minStars: 4, excludeFlags: true, snfOnly: true, units: [], minOverlap: null, maxMiles: 10, k: 3, shift: 1, n: null, mode: 'nearest', objective: 'balanced', weights: [1, 1, 1, 1] }
const UNIT_SQL: Record<string, string> = { vent: 'coalesce(f.beds_ventilator,0) > 0', dialysis: 'coalesce(f.beds_dialysis,0) > 0', alz: 'coalesce(f.beds_alzheimers,0) > 0', hospice: 'coalesce(f.beds_hospice,0) > 0', trauma: 'coalesce(f.beds_head_trauma,0) > 0', rehab: 'coalesce(f.beds_rehab,0) > 0' }
export const UNIT_LABEL: Record<string, string> = { vent: 'Ventilator unit', dialysis: 'Dialysis unit', alz: 'Dementia unit', hospice: 'Hospice unit', trauma: 'Head trauma unit', rehab: 'Rehab unit' }

/** Every URL value is checked here; nothing reaches SQL unvalidated. */
export function fromParams(p: URLSearchParams): ScenarioParams | null {
  const h = (p.get('h') ?? '').toUpperCase(); if (!/^[0-9A-Z]{6}$/.test(h)) return null
  const num = (k: string, lo: number, hi: number, d: number) => { const v = Number(p.get(k)); return p.get(k) != null && Number.isFinite(v) && v >= lo && v <= hi ? v : d }
  return {
    hospital: h, minStars: Math.round(num('stars', 1, 5, DEFAULTS.minStars)), excludeFlags: p.get('flags') !== '0', snfOnly: p.get('snf') !== '0',
    units: [...new Set((p.get('units') ?? '').split(',').filter(u => u in UNIT_SQL))], minOverlap: p.get('ov') != null && Number.isFinite(Number(p.get('ov'))) ? Math.min(1, Math.max(0, Number(p.get('ov')) / 100)) : null,
    maxMiles: num('mi', 1, 60, DEFAULTS.maxMiles), k: Math.round(num('k', 1, 10, DEFAULTS.k)), shift: num('shift', 0, 100, 100) / 100, n: p.get('n') != null && /^\d{1,7}$/.test(p.get('n')!) ? Number(p.get('n')) : null,
    mode: p.get('mode') === 'optimal' ? 'optimal' : 'nearest', objective: (['balanced', 'blend', 'readmit', 'rehosp', 'community', 'cost', 'stars'] as Objective[]).find(o => o === p.get('obj')) ?? 'balanced',
    weights: parseWeights(p.get('w')),
  }
}
/** 'w=2,1,1,3' → [2,1,1,3]; anything malformed → equal weights. Weights are whole numbers 0–10 and at least one must be > 0. */
export function parseWeights(v: string | null): Weights {
  const parts = (v ?? '').split(',').map(x => Number(x))
  if (parts.length !== 4 || parts.some(x => !Number.isInteger(x) || x < 0 || x > 10) || parts.every(x => x === 0)) return [1, 1, 1, 1]
  return parts as Weights
}
export function toParams(s: ScenarioParams): URLSearchParams {
  const p = new URLSearchParams({ h: s.hospital, stars: String(s.minStars), mi: String(s.maxMiles), k: String(s.k), shift: String(Math.round(100 * s.shift)) })
  if (!s.excludeFlags) p.set('flags', '0'); if (!s.snfOnly) p.set('snf', '0'); if (s.units.length) p.set('units', s.units.join(',')); if (s.minOverlap != null) p.set('ov', String(Math.round(100 * s.minOverlap))); if (s.n != null) p.set('n', String(s.n)); if (s.mode === 'optimal') p.set('mode', 'optimal'); if (s.objective !== 'balanced') p.set('obj', s.objective); if (s.objective === 'blend' && s.weights.join(',') !== '1,1,1,1') p.set('w', s.weights.join(','))
  return p
}

/** Straight-line miles between two Care Compare facility coordinates (facility_master latitude/longitude) — more precise than ZIP centroids. */
const dist = (a: string, b: string) => `3958.8 * 2 * asin(sqrt(pow(sin(radians(${b}.latitude - ${a}.latitude) / 2), 2) + cos(radians(${a}.latitude)) * cos(radians(${b}.latitude)) * pow(sin(radians(${b}.longitude - ${a}.longitude) / 2), 2)))`

/** Baseline volume per SNF as a share of the hospital's SNF volume. Hospital-reported counts when loaded, else the modeled service-area weights. */
export const baselineSql = (h: string, source: 'reported' | 'modeled') => source === 'reported'
  // only SNFs that exist in Care Compare can carry rates; reported counts at other CCNs are left out and reported separately (unknownShare)
  ? `SELECT snf_ccn AS ccn, sum(n_discharges) * 1.0 / (SELECT sum(n_discharges) FROM user_flows WHERE hospital_ccn = ${sqlStr(h)} AND snf_ccn IN (SELECT ccn FROM facility_master)) AS w FROM user_flows WHERE hospital_ccn = ${sqlStr(h)} AND snf_ccn IN (SELECT ccn FROM facility_master) GROUP BY 1`
  : `SELECT ccn, sum(modeled_weight) / (SELECT sum(modeled_weight) FROM snf_hospital_area WHERE hospital_ccn = ${sqlStr(h)}) AS w FROM snf_hospital_area WHERE hospital_ccn = ${sqlStr(h)} GROUP BY 1`

export const viableSql = (s: ScenarioParams) => {
  const w = [`f.overall_rating >= ${s.minStars}`]
  if (s.excludeFlags) w.push(`f.special_focus_status IS NULL`, `coalesce(f.abuse_icon,'N') <> 'Y'`)
  if (s.snfOnly) w.push(`f.provider_type <> 'Medicaid'`)
  for (const u of s.units) w.push(UNIT_SQL[u])
  if (s.minOverlap != null) w.push(`o.casemix_overlap >= ${s.minOverlap}`)
  return `SELECT f.ccn, o.casemix_overlap FROM facility_master f LEFT JOIN (SELECT s.ccn, CASE WHEN k.known >= 0.6 THEN sum(least(h.share, s.share)) END AS casemix_overlap FROM hospital_chapter_mix h JOIN snf_chapter_mix s USING (chapter) JOIN (SELECT ccn, sum(share) AS known FROM snf_chapter_mix GROUP BY 1) k ON k.ccn = s.ccn WHERE h.hospital_ccn = ${sqlStr(s.hospital)} GROUP BY s.ccn, k.known) o USING (ccn) WHERE ${w.join(' AND ')}`
}

export interface Outcome {
  source: 'reported' | 'modeled'; before: Row; after: Row
  belowBar: number          // share of baseline volume in facilities that do not meet the bar (independent of shift)
  unreachable: number       // share of baseline volume in such facilities with no acceptable facility within maxMiles (independent of shift)
  moved: number             // share actually moved = (belowBar − unreachable) × shift
  unplaced: number          // unreachable × shift (the part of the shift that could not happen)
  unknownShare: number      // reported baseline only: share of uploaded discharges at CCNs not in Care Compare, left out
  full: number              // share of baseline volume that could not move because every acceptable facility within reach is full (capacity rule)
  annual: number | null     // the annual SNF volume the capacity rule used (stays); null when no capacity check was possible
  annualSource: 'given' | 'estimated' | 'none'
  addedMiles: number | null; gains: Row[]; losses: Row[]; nViable: number; nBaseline: number; nReceiving: number; nLosing: number
}

/** Run the scenario entirely in SQL: (1) baseline shares; (2) viable set; (3) each non-viable SNF's volume × shift goes to its k nearest viable SNFs within maxMiles, split equally; (4) volume-weighted rates before and after. */
export async function runScenario(s: ScenarioParams, prefix = 'sc'): Promise<Outcome> {
  const h = sqlStr(s.hospital)
  const T = (n: string) => `${prefix}_${n}`
  // optimal mode: 100% of the volume below the bar, each facility's volume to its single best-fit acceptable facility within reach
  const shift = s.mode === 'optimal' ? 1 : s.shift, k = s.k
  const [{ n: reported }] = await q<{ n: number } & Row>(`SELECT count(*) AS n FROM user_flows WHERE hospital_ccn = ${h}`)
  const source: 'reported' | 'modeled' = Number(reported) > 0 ? 'reported' : 'modeled'
  await q(`CREATE OR REPLACE TEMP TABLE ${T('base')} AS ${baselineSql(s.hospital, source)}`)
  const [{ n: nBaseline }] = await q<{ n: number } & Row>(`SELECT count(*) AS n FROM ${T('base')}`)
  if (Number(nBaseline) === 0) throw new Error(source === 'reported' ? 'None of the uploaded SNF CCNs for this hospital is in Care Compare.' : 'CMS publishes no service-area rows with 11 or more cases for this hospital, so there is no modeled SNF volume to work from.')
  const unknownShare = source === 'reported' ? Number((await q<Row>(`SELECT coalesce(sum(CASE WHEN snf_ccn NOT IN (SELECT ccn FROM facility_master) THEN n_discharges END),0) * 1.0 / nullif(sum(n_discharges),0) AS u FROM user_flows WHERE hospital_ccn = ${h}`))[0].u ?? 0) : 0
  await q(`CREATE OR REPLACE TEMP TABLE ${T('viable')} AS ${viableSql(s)}`)
  // ---- capacity: how many extra Medicare stays a year each acceptable facility can take ----
  // empty beds (certified beds − average residents per day, Care Compare) × 365 ÷ its own Medicare length of stay (PAC PUF days ÷ stays; national median when missing).
  // The hospital's annual SNF volume: the number the user typed, else its 2024 Medicare discharges × 18.7% (MedPAC share of FFS discharges going to SNF).
  const [hm] = await q<Row>(`SELECT medicare_discharges_2024 FROM hospital_master WHERE hospital_ccn = ${h}`)
  const annual = s.n ?? (hm?.medicare_discharges_2024 != null ? Math.round(Number(hm.medicare_discharges_2024) * SNF_SHARE_OF_DISCHARGES) : null)
  const annualSource: Outcome['annualSource'] = s.n != null ? 'given' : annual != null ? 'estimated' : 'none'
  // "goodness" of each measure as a national percentile (1 = best SNF in the country, 0 = worst), direction-aware, so four measures in different units can be averaged
  await q(`CREATE OR REPLACE TEMP TABLE ${T('good')} AS SELECT f.ccn,
      CASE WHEN f.qrp_004_ppr_pd_rsrr IS NOT NULL THEN 1 - percent_rank() OVER (PARTITION BY f.qrp_004_ppr_pd_rsrr IS NULL ORDER BY f.qrp_004_ppr_pd_rsrr) END AS g004,
      CASE WHEN f.qm_521_adj IS NOT NULL THEN 1 - percent_rank() OVER (PARTITION BY f.qm_521_adj IS NULL ORDER BY f.qm_521_adj) END AS g521,
      CASE WHEN f.qrp_005_dtc_rs_rate IS NOT NULL THEN percent_rank() OVER (PARTITION BY f.qrp_005_dtc_rs_rate IS NULL ORDER BY f.qrp_005_dtc_rs_rate) END AS g005,
      CASE WHEN u.medicare_stays_2024 > 0 THEN 1 - percent_rank() OVER (PARTITION BY u.medicare_stays_2024 > 0 ORDER BY u.medicare_payment_2024 / nullif(u.medicare_stays_2024, 0)) END AS gpay
    FROM facility_master f LEFT JOIN snf_utilization u USING (ccn)`)
  const cands = await q<Row>(`
    WITH nv AS (SELECT b.ccn, b.w FROM ${T('base')} b WHERE b.ccn NOT IN (SELECT ccn FROM ${T('viable')})),
    alos AS (SELECT quantile_cont(medicare_days_2024 * 1.0 / medicare_stays_2024, 0.5) AS med FROM snf_utilization WHERE medicare_stays_2024 > 0)
    SELECT nv.ccn AS from_ccn, nv.w, v.ccn AS to_ccn, ${dist('a', 'c')} AS miles, c.overall_rating, c.qrp_004_ppr_pd_rsrr, c.qm_521_adj, c.qrp_005_dtc_rs_rate,
           u.medicare_payment_2024 / nullif(u.medicare_stays_2024, 0) AS pay, v.casemix_overlap, g.g004, g.g521, g.g005, g.gpay,
           greatest(c.number_of_certified_beds - c.average_number_of_residents_per_day, 0) * 365.0 / coalesce(u.medicare_days_2024 * 1.0 / nullif(u.medicare_stays_2024, 0), (SELECT med FROM alos)) AS capacity_stays
    FROM nv JOIN facility_master a ON a.ccn = nv.ccn JOIN ${T('viable')} v ON v.ccn <> nv.ccn JOIN facility_master c ON c.ccn = v.ccn LEFT JOIN snf_utilization u ON u.ccn = v.ccn LEFT JOIN ${T('good')} g ON g.ccn = v.ccn
    WHERE ${dist('a', 'c')} <= ${s.maxMiles}`)
  // rank candidates per source: nearest mode by distance; optimal mode by the objective (unknown last), then rating, then readmission, then distance
  const num = (v: unknown) => v == null ? null : Number(v)
  const objKey: Record<Exclude<Objective, 'balanced' | 'blend'>, { col: string; lowerBetter: boolean }> = { readmit: { col: 'qrp_004_ppr_pd_rsrr', lowerBetter: true }, rehosp: { col: 'qm_521_adj', lowerBetter: true }, community: { col: 'qrp_005_dtc_rs_rate', lowerBetter: false }, cost: { col: 'pay', lowerBetter: true }, stars: { col: 'overall_rating', lowerBetter: false } }
  const wts: Weights = s.objective === 'blend' ? s.weights : [1, 1, 1, 1]
  /** Weighted mean of the available percentile goodnesses (missing measures drop out with their weight); null when none is published. */
  const composite = (r: Row) => { const g = [r.g004, r.g521, r.g005, r.gpay].map(num); let sw = 0, sv = 0; g.forEach((v, i) => { if (v != null && wts[i] > 0) { sw += wts[i]; sv += wts[i] * v } }); return sw > 0 ? sv / sw : null }
  const objective = (r: Row): { v: number | null; lowerBetter: boolean } => s.objective === 'balanced' || s.objective === 'blend' ? { v: composite(r), lowerBetter: false } : { v: num(r[objKey[s.objective].col]), lowerBetter: objKey[s.objective].lowerBetter }
  const cmp = (x: Row, y: Row) => {
    if (s.mode === 'optimal') {
      const ox = objective(x), oy = objective(y); const vx = ox.v, vy = oy.v
      if ((vx == null) !== (vy == null)) return vx == null ? 1 : -1
      if (vx != null && vy != null && vx !== vy) return ox.lowerBetter ? vx - vy : vy - vx
      const rx = num(x.overall_rating) ?? 0, ry = num(y.overall_rating) ?? 0; if (rx !== ry) return ry - rx
      const qx = num(x.qrp_004_ppr_pd_rsrr), qy = num(y.qrp_004_ppr_pd_rsrr)
      if ((qx == null) !== (qy == null)) return qx == null ? 1 : -1
      if (qx != null && qy != null && qx !== qy) return qx - qy
    }
    return Number(x.miles) - Number(y.miles)
  }
  const bySource = new Map<string, Row[]>()
  for (const c of cands) { const k = String(c.from_ccn); bySource.set(k, [...(bySource.get(k) ?? []), c]) }
  for (const list of bySource.values()) list.sort(cmp)
  // remaining capacity per receiving facility, in share-of-baseline units (null = no check possible)
  const cap = new Map<string, number>()
  for (const c of cands) if (!cap.has(String(c.to_ccn))) cap.set(String(c.to_ccn), annual ? Number(c.capacity_stays ?? 0) / annual : Infinity)
  const sources = [...bySource.entries()].sort((a, b) => Number(b[1][0].w) - Number(a[1][0].w))   // largest sources first
  const moves: { from: string; to: string; miles: number; moved: number }[] = []
  let full = 0
  const give = (from: string, c: Row, amt: number) => { const to = String(c.to_ccn); const room = cap.get(to)!; const x = Math.min(amt, room); if (x <= 0) return 0; cap.set(to, room - x); moves.push({ from, to, miles: Number(c.miles), moved: x }); return x }
  for (const [from, list] of sources) {
    let left = Number(list[0].w) * shift
    if (s.mode !== 'optimal') { const first = list.slice(0, k); const each = left / first.length; for (const c of first) left -= give(from, c, each) }   // equal split across the k nearest …
    for (const c of list) { if (left <= 1e-12) break; left -= give(from, c, left) }                                                                   // … then spill, in order, to whoever has room
    if (left > 1e-12) full += left
  }
  await q(`CREATE OR REPLACE TEMP TABLE ${T('moves')} (from_ccn VARCHAR, to_ccn VARCHAR, miles DOUBLE, moved DOUBLE)`)
  for (let i = 0; i < moves.length; i += 500) await q(`INSERT INTO ${T('moves')} VALUES ${moves.slice(i, i + 500).map(m => `(${sqlStr(m.from)}, ${sqlStr(m.to)}, ${m.miles}, ${m.moved})`).join(',')}`)
  // merge duplicate (from,to) rows so the tables and averages are clean
  await q(`CREATE OR REPLACE TEMP TABLE ${T('moves2')} AS SELECT from_ccn, to_ccn, sum(moved * miles) / sum(moved) AS miles, sum(moved) AS moved FROM ${T('moves')} GROUP BY 1, 2`)
  await q(`DROP TABLE ${T('moves')}`); await q(`ALTER TABLE ${T('moves2')} RENAME TO ${T('moves')}`)
  await q(`CREATE OR REPLACE TEMP TABLE ${T('after')} AS
    SELECT ccn, sum(w) AS w FROM (
      SELECT ccn, w FROM ${T('base')}
      UNION ALL SELECT from_ccn, -moved FROM ${T('moves')}
      UNION ALL SELECT to_ccn, moved FROM ${T('moves')}) GROUP BY 1 HAVING sum(w) > 1e-12`)
  const metrics = (t: string) => q<Row>(`SELECT sum(w) AS total,
      sum(w * f.qm_521_adj) / nullif(sum(CASE WHEN f.qm_521_adj IS NOT NULL THEN w END),0) AS r521, sum(CASE WHEN f.qm_521_adj IS NOT NULL THEN w END) / sum(w) AS c521,
      sum(w * f.qrp_004_ppr_pd_rsrr) / nullif(sum(CASE WHEN f.qrp_004_ppr_pd_rsrr IS NOT NULL THEN w END),0) AS r004, sum(CASE WHEN f.qrp_004_ppr_pd_rsrr IS NOT NULL THEN w END) / sum(w) AS c004,
      sum(w * f.qrp_005_dtc_rs_rate) / nullif(sum(CASE WHEN f.qrp_005_dtc_rs_rate IS NOT NULL THEN w END),0) AS r005,
      sum(w * f.overall_rating) / nullif(sum(CASE WHEN f.overall_rating IS NOT NULL THEN w END),0) AS stars,
      sum(CASE WHEN f.overall_rating <= 2 THEN w ELSE 0 END) / sum(w) AS low_share, sum(CASE WHEN f.overall_rating >= 4 THEN w ELSE 0 END) / sum(w) AS high_share,
      sum(w * (u.medicare_payment_2024 / nullif(u.medicare_stays_2024,0))) / nullif(sum(CASE WHEN u.medicare_stays_2024 > 0 THEN w END),0) AS pay_per_stay, sum(CASE WHEN u.medicare_stays_2024 > 0 THEN w END) / sum(w) AS cpay,
      count(*) AS n_snf
    FROM ${t} b JOIN facility_master f USING (ccn) LEFT JOIN snf_utilization u USING (ccn)`).then(r => r[0])
  const [before, after] = await Promise.all([metrics(T('base')), metrics(T('after'))])
  const [mv] = await q<Row>(`SELECT coalesce(sum(moved),0) AS moved, coalesce(sum(moved * miles),0) / nullif(sum(moved),0) AS miles, count(DISTINCT to_ccn) AS n_to, count(DISTINCT from_ccn) AS n_from FROM ${T('moves')}`)
  // shares of the baseline that sit below the bar, and that have no acceptable facility in reach — both independent of the shift slider and of capacity
  const nonViable = await q<Row>(`SELECT ccn, w FROM ${T('base')} WHERE ccn NOT IN (SELECT ccn FROM ${T('viable')})`)
  const belowBar = nonViable.reduce((a, r) => a + Number(r.w), 0)
  const unreachable = nonViable.filter(r => !bySource.has(String(r.ccn))).reduce((a, r) => a + Number(r.w), 0)
  const STRIP = 'f.overall_rating, f.health_inspection_rating, f.qm_rating, f.staffing_rating, f.special_focus_status, f.abuse_icon'
  const gains = await q(`WITH alos AS (SELECT quantile_cont(medicare_days_2024 * 1.0 / medicare_stays_2024, 0.5) AS med FROM snf_utilization WHERE medicare_stays_2024 > 0)
    SELECT m.to_ccn AS ccn, f.provider_name, f.city_town, f.state, ${STRIP}, f.qm_521_adj, f.qrp_004_ppr_pd_rsrr, sum(m.moved) AS gained, coalesce(b.w, 0) AS before_w, sum(m.moved * m.miles) / sum(m.moved) AS miles,
           greatest(f.number_of_certified_beds - f.average_number_of_residents_per_day, 0) AS empty_beds, greatest(f.number_of_certified_beds - f.average_number_of_residents_per_day, 0) * 365.0 / coalesce(u.medicare_days_2024 * 1.0 / nullif(u.medicare_stays_2024, 0), (SELECT med FROM alos)) AS capacity_stays
    FROM ${T('moves')} m JOIN facility_master f ON f.ccn = m.to_ccn LEFT JOIN ${T('base')} b ON b.ccn = m.to_ccn LEFT JOIN snf_utilization u ON u.ccn = m.to_ccn GROUP BY ALL ORDER BY gained DESC LIMIT 40`)
  const losses = await q(`SELECT m.from_ccn AS ccn, f.provider_name, f.city_town, f.state, ${STRIP}, f.qm_521_adj, f.qrp_004_ppr_pd_rsrr, sum(m.moved) AS lost, b.w AS before_w
    FROM ${T('moves')} m JOIN facility_master f ON f.ccn = m.from_ccn JOIN ${T('base')} b ON b.ccn = m.from_ccn GROUP BY ALL ORDER BY lost DESC LIMIT 40`)
  const [{ n: nViable }] = await q<{ n: number } & Row>(`SELECT count(*) AS n FROM ${T('viable')}`)
  return { source, before, after, belowBar, unreachable, moved: Number(mv.moved), unplaced: unreachable * shift, full, annual, annualSource, unknownShare, addedMiles: mv.miles == null ? null : Number(mv.miles), gains, losses, nViable: Number(nViable), nBaseline: Number(nBaseline), nReceiving: Number(mv.n_to), nLosing: Number(mv.n_from) }
}
