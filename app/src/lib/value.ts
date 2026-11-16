// Value model (underwriting): what better hospital-to-post-acute placement is worth to a payer, a hospital and a SNF.
//
// Everything on the BASELINE side is a CMS figure or a labelled derivation of one (scripts/14_load_underwriting.py, T-026):
//   - Original Medicare utilization and payments by county: Geographic Variation PUF, 2024
//   - Medicare Advantage utilization by state: MA Geographic Variation PUF, 2023 (the county MA estimate = county FFS rate x that state's MA/FFS ratio; MODELED)
//   - MA enrollment by parent organization and county: CPSC file, September 2026; county totals: Medicare Monthly Enrollment, July 2026
//   - county benchmark rates: 2027 MA ratebook; county FFS risk scores: MSSP county file, 2025; counties to CBSAs: Census/OMB July 2023
//   - SNF and hospital cost reports: HCRIS extracts, fiscal year 2024
// Everything on the IMPROVEMENT side is an assumption the user sets. Presets are Minimum / Base / Stretch; none of them is a CMS number. (D-041..D-043)
import { ensureTables, q, sqlStr, type Row } from './db'
import { SNF_SHARE_OF_DISCHARGES } from './scenario'

export const UW_TABLES = ['uw_county', 'uw_state', 'snf_geo', 'hospital_geo', 'snf_cost', 'hospital_cost', 'ma_parent_county'] as const
export const ensureUw = () => ensureTables(UW_TABLES)

// ------------------------------------------------------------------ geography
export type Geo = { kind: 'us' } | { kind: 'cbsa'; code: string } | { kind: 'state'; code: string }
export const geoParam = (g: Geo) => g.kind === 'us' ? 'US' : g.kind === 'cbsa' ? g.code : `ST-${g.code}`
export function parseGeo(v: string | null): Geo {
  if (v && /^\d{5}$/.test(v)) return { kind: 'cbsa', code: v }
  if (v && /^ST-[A-Z]{2}$/.test(v)) return { kind: 'state', code: v.slice(3) }
  return { kind: 'us' }
}
/** WHERE clause over uw_county (alias u). Inputs are validated by parseGeo, so nothing user-typed reaches SQL. */
export const geoWhere = (g: Geo, a = 'u') => g.kind === 'us' ? 'TRUE' : g.kind === 'cbsa' ? `${a}.cbsa = ${sqlStr(g.code)}` : `${a}.state = ${sqlStr(g.code)}`

export const STATE_NAMES: Record<string, string> = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', PR: 'Puerto Rico', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', GU: 'Guam', VI: 'U.S. Virgin Islands', AS: 'American Samoa', MP: 'Northern Mariana Islands' }
const stateLabel = (code: string) => STATE_NAMES[code] ?? code
export interface GeoOption { param: string; label: string; kind: 'cbsa' | 'state'; ma: number; total: number }
export async function searchGeos(text: string, limit = 12): Promise<GeoOption[]> {
  await ensureUw()
  const t = text.trim().toLowerCase().replace(/[%_';]/g, ' ')
  if (!t) return []
  const like = sqlStr(`%${t.split(/\s+/).join('%')}%`)
  // a state matches on its two-letter code or the start of its name; states list first so "maryland" does not hide behind metro areas
  const states = Object.entries(STATE_NAMES).filter(([c, n]) => c.toLowerCase() === t || (t.length >= 3 && n.toLowerCase().startsWith(t))).map(([c]) => c)
  const rows = await q<Row>(`
    SELECT cbsa AS param, any_value(cbsa_title) AS label, 'cbsa' AS kind, sum(enr_ma) AS ma, sum(enr_total) AS total, 1 AS ord FROM uw_county WHERE cbsa IS NOT NULL AND lower(cbsa_title) LIKE ${like} GROUP BY cbsa
    ${states.length ? `UNION ALL SELECT 'ST-' || state, state, 'state', sum(enr_ma), sum(enr_total), 0 FROM uw_county WHERE state IN (${states.map(sqlStr).join(',')}) GROUP BY state` : ''}
    ORDER BY ord, total DESC LIMIT ${Math.trunc(limit)}`)
  return rows.map(r => ({ param: String(r.param), label: r.kind === 'state' ? `${stateLabel(String(r.label))} (whole state)` : String(r.label), kind: r.kind as 'cbsa' | 'state', ma: Number(r.ma ?? 0), total: Number(r.total ?? 0) }))
}
export interface GeoInfo { label: string; inLabel: string; counties: number; enrTotal: number; enrMa: number; enrFfs: number; cpscMa: number | null; nSnf: number; nHospitals: number }
export async function geoInfo(g: Geo): Promise<GeoInfo> {
  await ensureUw()
  const [r] = await q<Row>(`SELECT ${g.kind === 'cbsa' ? 'any_value(u.cbsa_title)' : `''`} AS label, count(*) AS counties,
      sum(enr_total) AS enr_total, sum(enr_ma) AS enr_ma, sum(enr_ffs) AS enr_ffs, sum(cpsc_ma_enrollment) AS cpsc_ma,
      (SELECT count(*) FROM snf_geo s JOIN uw_county u2 ON u2.fips = s.fips WHERE ${geoWhere(g, 'u2')}) AS n_snf,
      (SELECT count(*) FROM hospital_geo h JOIN uw_county u3 ON u3.fips = h.fips WHERE ${geoWhere(g, 'u3')}) AS n_hosp
    FROM uw_county u WHERE ${geoWhere(g)}`)
  const label = g.kind === 'us' ? 'United States' : g.kind === 'state' ? stateLabel(g.code) : String(r.label ?? 'Unknown area')
  return { label, inLabel: g.kind === 'us' ? 'the United States' : label, counties: Number(r.counties), enrTotal: Number(r.enr_total ?? 0), enrMa: Number(r.enr_ma ?? 0), enrFfs: Number(r.enr_ffs ?? 0), cpscMa: r.cpsc_ma == null ? null : Number(r.cpsc_ma), nSnf: Number(r.n_snf), nHospitals: Number(r.n_hosp) }
}

// ------------------------------------------------------------------ payers
/** Parent-organization filter: plain text, matched case-insensitively as a substring of the CMS parent organization name ("united" -> UnitedHealth Group, Inc.). */
export const cleanParent = (text: string) => text.toLowerCase().replace(/[^a-z0-9&.,\- ]/g, ' ').replace(/\s+/g, ' ').trim()   // only characters that occur in CMS parent-organization names; anything else is dropped, so "%" or a quote is an empty filter, not a wildcard
const parentLike = (text: string) => sqlStr(`%${cleanParent(text).replace(/ /g, '%')}%`)
export interface ParentRow { parent_org: string; enrollment: number; counties: number }
export async function parentsIn(g: Geo, text = '', limit = 12): Promise<ParentRow[]> {
  await ensureUw()
  const rows = await q<Row>(`SELECT p.parent_org, sum(p.enrollment) AS enrollment, count(DISTINCT p.fips) AS counties
    FROM ma_parent_county p JOIN uw_county u ON u.fips = p.fips WHERE p.segment = 'MA' AND ${geoWhere(g)} ${cleanParent(text) ? `AND lower(p.parent_org) LIKE ${parentLike(text)}` : ''}
    GROUP BY 1 ORDER BY enrollment DESC LIMIT ${Math.trunc(limit)}`)
  return rows.map(r => ({ parent_org: String(r.parent_org), enrollment: Number(r.enrollment), counties: Number(r.counties) }))
}

export interface PayerBaseline {
  members: number            // members used as weights (the payer's visible MA enrollment in the area, or all MA enrollment)
  membersSource: 'parent' | 'all'
  matchedParents: string[]   // parent organizations the text matched
  areaMa: number             // all MA & other health plan enrollment in the area (Monthly Enrollment)
  coverage: number           // share of those members living in counties with published SNF utilization
  // Original Medicare (FFS) rates per 1,000 beneficiaries, member-weighted across the area's counties (2024)
  ffs: { ipStays: number; ipDays: number; snfStays: number; snfDays: number; irfStays: number | null; ltchStays: number | null; hhEpisodes: number; readmRate: number; totalPc: number }
  // MA estimate per 1,000 members = county FFS rate x state MA/FFS ratio (2023), member-weighted; before any risk adjustment
  ma: { ipStays: number; ipDays: number; snfStays: number; snfDays: number; irfStays: number | null; ltchStays: number | null }
  ratio: { ipStays: number; ipDays: number; snfStays: number; snfDays: number }   // the member-weighted state ratios actually applied
  // FFS payment per unit in the area (2024): total payments / total units across counties where both are published
  price: { ipPerStay: number; ipPerDay: number; snfPerDay: number; hhPerEpisode: number; irfPerStay: number | null; ltchPerStay: number | null }
  ffsRisk: number | null     // average HCC risk score of FFS assignable beneficiaries (MSSP county file, person-year weighted)
  benchmark: { r0: number | null; r35: number | null; r5: number | null }   // 2027 county benchmark, $ PMPM, member-weighted
  // SNF quality in the area (Care Compare + PAC PUF), Medicare-stay weighted
  snf: { n: number; nHigh: number; lowShare: number | null; rehospLow: number | null; rehospHigh: number | null; readmLow: number | null; readmHigh: number | null
    worseShare: number | null; rehospWorse: number | null; rehospBetter: number | null }   // split at the area's stay-weighted average rehospitalization rate instead of at 4 stars
}

export async function payerBaseline(g: Geo, parentText: string): Promise<PayerBaseline | null> {
  await ensureUw()
  const useParent = cleanParent(parentText).length > 0
  const matched = useParent ? (await q<Row>(`SELECT DISTINCT p.parent_org FROM ma_parent_county p JOIN uw_county u ON u.fips = p.fips WHERE p.segment = 'MA' AND ${geoWhere(g)} AND lower(p.parent_org) LIKE ${parentLike(parentText)} ORDER BY 1`)).map(r => String(r.parent_org)) : []
  const mExpr = useParent ? `coalesce(p.e, 0)` : `coalesce(u.enr_ma, 0)`
  const wavg = (x: string) => `sum(m * (${x})) / nullif(sum(CASE WHEN (${x}) IS NOT NULL THEN m END), 0)`
  const price = (pay: string, rate: string) => `sum(CASE WHEN ${pay} IS NOT NULL AND ${rate} IS NOT NULL THEN ${pay} END) / nullif(sum(CASE WHEN ${pay} IS NOT NULL AND ${rate} IS NOT NULL THEN gv_ffs_benes * ${rate} / 1000.0 END), 0)`
  const [r] = await q<Row>(`
    WITH base AS (
      SELECT u.*, ${mExpr} AS m, s.r_ip_stays, s.r_ip_days, s.r_snf_stays, s.r_snf_days, s.r_irf_stays, s.r_ltch_stays
      FROM uw_county u ${useParent ? `LEFT JOIN (SELECT fips, sum(enrollment) AS e FROM ma_parent_county WHERE segment = 'MA' AND lower(parent_org) LIKE ${parentLike(parentText)} GROUP BY 1) p ON p.fips = u.fips` : ''}
      LEFT JOIN uw_state s ON s.state = u.state
      WHERE ${geoWhere(g)})
    SELECT sum(m) AS members, sum(enr_ma) AS area_ma, sum(CASE WHEN ffs_snf_days IS NOT NULL AND r_snf_days IS NOT NULL THEN m END) / nullif(sum(m), 0) AS coverage,
      ${wavg('ffs_ip_stays')} AS f_ip_stays, ${wavg('ffs_ip_days')} AS f_ip_days, ${wavg('ffs_snf_stays')} AS f_snf_stays, ${wavg('ffs_snf_days')} AS f_snf_days,
      ${wavg('ffs_irf_stays')} AS f_irf_stays, ${wavg('ffs_ltch_stays')} AS f_ltch_stays, ${wavg('ffs_hh_episodes')} AS f_hh, ${wavg('ffs_total_pc')} AS f_total_pc,
      sum(gv_ffs_benes * ffs_ip_stays * ffs_readm_rate) / nullif(sum(CASE WHEN ffs_readm_rate IS NOT NULL THEN gv_ffs_benes * ffs_ip_stays END), 0) AS f_readm,
      ${wavg('ffs_ip_stays * r_ip_stays')} AS m_ip_stays, ${wavg('ffs_ip_days * r_ip_days')} AS m_ip_days, ${wavg('ffs_snf_stays * r_snf_stays')} AS m_snf_stays, ${wavg('ffs_snf_days * r_snf_days')} AS m_snf_days,
      ${wavg('ffs_irf_stays * r_irf_stays')} AS m_irf_stays, ${wavg('ffs_ltch_stays * r_ltch_stays')} AS m_ltch_stays,
      ${wavg('r_ip_stays')} AS r_ip_stays, ${wavg('r_ip_days')} AS r_ip_days, ${wavg('r_snf_stays')} AS r_snf_stays, ${wavg('r_snf_days')} AS r_snf_days,
      ${price('ffs_ip_pymt', 'ffs_ip_stays')} AS p_ip_stay, ${price('ffs_ip_pymt', 'ffs_ip_days')} AS p_ip_day, ${price('ffs_snf_pymt', 'ffs_snf_days')} AS p_snf_day,
      ${price('ffs_hh_pymt', 'ffs_hh_episodes')} AS p_hh, ${price('ffs_irf_pymt', 'ffs_irf_stays')} AS p_irf, ${price('ffs_ltch_pymt', 'ffs_ltch_stays')} AS p_ltch,
      sum(risk_person_years * ffs_risk_score) / nullif(sum(CASE WHEN ffs_risk_score IS NOT NULL THEN risk_person_years END), 0) AS ffs_risk,
      ${wavg('ma_rate_0')} AS b0, ${wavg('ma_rate_35')} AS b35, ${wavg('ma_rate_5')} AS b5
    FROM base`)
  if (!r || !(Number(r.members) > 0) || r.m_snf_days == null) return null
  const [s] = await q<Row>(`
    WITH f AS (SELECT fm.overall_rating, fm.qm_521_adj, fm.qrp_004_ppr_pd_rsrr, coalesce(su.medicare_stays_2024, 0) AS stays
               FROM facility_master fm JOIN snf_geo sg ON sg.ccn = fm.ccn JOIN uw_county u ON u.fips = sg.fips LEFT JOIN snf_utilization su ON su.ccn = fm.ccn WHERE ${geoWhere(g)}),
    m AS (SELECT sum(stays * qm_521_adj) / nullif(sum(stays) FILTER (WHERE qm_521_adj IS NOT NULL), 0) AS avg521 FROM f)
    SELECT count(*) AS n, count(*) FILTER (WHERE overall_rating >= 4) AS n_high,
      sum(stays) FILTER (WHERE overall_rating < 4) / nullif(sum(stays) FILTER (WHERE overall_rating IS NOT NULL), 0) AS low_share,
      sum(stays * qm_521_adj) FILTER (WHERE overall_rating < 4) / nullif(sum(stays) FILTER (WHERE overall_rating < 4 AND qm_521_adj IS NOT NULL), 0) AS rehosp_low,
      sum(stays * qm_521_adj) FILTER (WHERE overall_rating >= 4) / nullif(sum(stays) FILTER (WHERE overall_rating >= 4 AND qm_521_adj IS NOT NULL), 0) AS rehosp_high,
      sum(stays * qrp_004_ppr_pd_rsrr) FILTER (WHERE overall_rating < 4) / nullif(sum(stays) FILTER (WHERE overall_rating < 4 AND qrp_004_ppr_pd_rsrr IS NOT NULL), 0) AS readm_low,
      sum(stays * qrp_004_ppr_pd_rsrr) FILTER (WHERE overall_rating >= 4) / nullif(sum(stays) FILTER (WHERE overall_rating >= 4 AND qrp_004_ppr_pd_rsrr IS NOT NULL), 0) AS readm_high,
      sum(stays) FILTER (WHERE qm_521_adj > avg521) / nullif(sum(stays) FILTER (WHERE qm_521_adj IS NOT NULL), 0) AS worse_share,
      sum(stays * qm_521_adj) FILTER (WHERE qm_521_adj > avg521) / nullif(sum(stays) FILTER (WHERE qm_521_adj > avg521), 0) AS rehosp_worse,
      sum(stays * qm_521_adj) FILTER (WHERE qm_521_adj <= avg521) / nullif(sum(stays) FILTER (WHERE qm_521_adj <= avg521), 0) AS rehosp_better
    FROM f, m`)
  const n = (v: unknown) => v == null ? null : Number(v)
  return {
    members: Number(r.members), membersSource: useParent ? 'parent' : 'all', matchedParents: matched, areaMa: Number(r.area_ma ?? 0), coverage: Number(r.coverage ?? 0),
    ffs: { ipStays: Number(r.f_ip_stays), ipDays: Number(r.f_ip_days), snfStays: Number(r.f_snf_stays), snfDays: Number(r.f_snf_days), irfStays: n(r.f_irf_stays), ltchStays: n(r.f_ltch_stays), hhEpisodes: Number(r.f_hh), readmRate: Number(r.f_readm), totalPc: Number(r.f_total_pc) },
    ma: { ipStays: Number(r.m_ip_stays), ipDays: Number(r.m_ip_days), snfStays: Number(r.m_snf_stays), snfDays: Number(r.m_snf_days), irfStays: n(r.m_irf_stays), ltchStays: n(r.m_ltch_stays) },
    ratio: { ipStays: Number(r.r_ip_stays), ipDays: Number(r.r_ip_days), snfStays: Number(r.r_snf_stays), snfDays: Number(r.r_snf_days) },
    price: { ipPerStay: Number(r.p_ip_stay), ipPerDay: Number(r.p_ip_day), snfPerDay: Number(r.p_snf_day), hhPerEpisode: Number(r.p_hh), irfPerStay: n(r.p_irf), ltchPerStay: n(r.p_ltch) },
    ffsRisk: n(r.ffs_risk), benchmark: { r0: n(r.b0), r35: n(r.b35), r5: n(r.b5) },
    snf: { n: Number(s.n), nHigh: Number(s.n_high), lowShare: n(s.low_share), rehospLow: n(s.rehosp_low), rehospHigh: n(s.rehosp_high), readmLow: n(s.readm_low), readmHigh: n(s.readm_high), worseShare: n(s.worse_share), rehospWorse: n(s.rehosp_worse), rehospBetter: n(s.rehosp_better) },
  }
}

export interface PayerAssumptions {
  readmPts: number        // points taken off the 30-day readmission rate (1 = 15% -> 14%)
  snfToHome: number       // % of SNF admissions that go home with home health instead
  snfLos: number          // % fewer SNF days per remaining SNF stay
  irfToSnf: number        // % of IRF stays that step down to SNF
  ltchToSnf: number       // % of LTCH stays that step down to SNF
  ipDays: number          // % fewer inpatient days
  perDiemShare: number    // % of inpatient days the plan pays per diem (only those days save the plan money; under DRG payment the hospital keeps the saving)
  umPmpm: number          // $ PMPM the plan pays today for post-acute utilization management that placement rails replace (the plan's own number)
  priceFactor: number     // MA payment as % of Medicare FFS payment
  basis: 'ma' | 'ffs'     // utilization baseline: a typical MA plan in this state, or unmanaged (Original Medicare levels in these counties)
  acuity: number          // utilization scaled to this % of the baseline (100 = no change; above 100 for a sicker population such as a D-SNP)
  planRisk: number        // the plan's average risk score, used ONLY to turn the county benchmark into revenue (1.00 = benchmark as published)
  bonus: 0 | 35 | 5       // which ratebook column to use for revenue
}
export type Preset = 'min' | 'base' | 'stretch'
export const PAYER_PRESETS: Record<Preset, Pick<PayerAssumptions, 'readmPts' | 'snfToHome' | 'snfLos' | 'irfToSnf' | 'ltchToSnf' | 'ipDays' | 'perDiemShare'>> = {
  min: { readmPts: 0.5, snfToHome: 3, snfLos: 3, irfToSnf: 0, ltchToSnf: 0, ipDays: 0, perDiemShare: 0 },
  base: { readmPts: 1, snfToHome: 5, snfLos: 7, irfToSnf: 5, ltchToSnf: 5, ipDays: 0, perDiemShare: 0 },
  stretch: { readmPts: 2, snfToHome: 10, snfLos: 13, irfToSnf: 10, ltchToSnf: 10, ipDays: 5, perDiemShare: 20 },
}
export const PAYER_DEFAULTS: PayerAssumptions = { ...PAYER_PRESETS.base, umPmpm: 0, priceFactor: 100, basis: 'ma', acuity: 100, planRisk: 1, bonus: 0 }

export interface Lever { key: string; label: string; basis: string; perYear: number; pmpm: number }
export interface PayerValue {
  per1000: { ipStays: number; ipDays: number; snfStays: number; snfDays: number; irfStays: number; ltchStays: number; readmissionsAvoided: number; snfStaysToHome: number; snfDaysSaved: number }
  snfCostPerStay: number
  spendPmpm: { ip: number; snf: number; irf: number; ltch: number; total: number }
  levers: Lever[]
  totalPerYear: number; totalPmpm: number
  revenuePmpm: number | null; pctOfRevenue: number | null; pctOfIpPac: number
  starsAtStakePerYear: number | null
  routingPts: number | null   // readmission points that steering ALL below-4-star SNF volume to 4-5-star SNFs would support on its own (evidence, not added to the total)
  routingPtsMeasure: number | null   // the same, steering stays in SNFs with a worse-than-average rehospitalization rate to the better-than-average ones
}
/** The arithmetic. Every line is volume x change x price; nothing is fitted. `members` is the number of members to size for. */
export function payerValue(b: PayerBaseline, a: PayerAssumptions, members: number): PayerValue {
  const rf = a.acuity / 100          // a plain multiplier the user sets; 100 leaves the baseline alone
  const pf = a.priceFactor / 100
  const u = a.basis === 'ffs' ? b.ffs : b.ma
  const ipStays = u.ipStays * rf, ipDays = u.ipDays * rf, snfStays = u.snfStays * rf, snfDays = u.snfDays * rf
  const irfStays = (u.irfStays ?? 0) * rf, ltchStays = (u.ltchStays ?? 0) * rf
  const ipPerStay = b.price.ipPerStay * pf, ipPerDay = b.price.ipPerDay * pf, snfPerDay = b.price.snfPerDay * pf, hh = b.price.hhPerEpisode * pf
  const irfPerStay = (b.price.irfPerStay ?? 0) * pf, ltchPerStay = (b.price.ltchPerStay ?? 0) * pf
  const snfCostPerStay = snfStays > 0 ? snfDays / snfStays * snfPerDay : 0     // MA days per stay x FFS payment per day
  const k = members / 1000
  // per 1,000 members per year
  const readmAvoided = ipStays * a.readmPts / 100
  const toHome = snfStays * a.snfToHome / 100
  const daysSaved = snfDays * (1 - a.snfToHome / 100) * a.snfLos / 100          // applied to the stays that still go to a SNF, so it does not overlap the site-of-care lever
  const irfMoved = irfStays * a.irfToSnf / 100, ltchMoved = ltchStays * a.ltchToSnf / 100
  const ipDaysSaved = ipDays * a.ipDays / 100 * a.perDiemShare / 100
  const mk = (key: string, label: string, basis: string, per1000: number): Lever => ({ key, label, basis, perYear: per1000 * k, pmpm: per1000 / 1000 / 12 })
  const levers: Lever[] = [
    mk('readm', 'Readmissions avoided', `${f1(ipStays)} admissions per 1,000 × ${a.readmPts} pt × ${usd(ipPerStay)} per stay`, readmAvoided * ipPerStay),
    mk('home', 'SNF admissions that go home with home health instead', `${f1(snfStays)} SNF stays per 1,000 × ${a.snfToHome}% × (${usd(snfCostPerStay)} − ${usd(hh)})`, toHome * Math.max(snfCostPerStay - hh, 0)),
    mk('los', 'Shorter SNF stays', `${f0(snfDays * (1 - a.snfToHome / 100))} SNF days per 1,000 × ${a.snfLos}% × ${usd(snfPerDay)} per day`, daysSaved * snfPerDay),
    mk('irf', 'Rehab-hospital (IRF) stays stepped down to SNF', b.price.irfPerStay == null ? 'no IRF payment published for this area' : `${f1(irfStays)} IRF stays per 1,000 × ${a.irfToSnf}% × (${usd(irfPerStay)} − ${usd(snfCostPerStay)})`, b.price.irfPerStay == null ? 0 : irfMoved * Math.max(irfPerStay - snfCostPerStay, 0)),
    mk('ltch', 'Long-term acute (LTCH) stays stepped down to SNF', b.price.ltchPerStay == null ? 'no LTCH payment published for this area' : `${f2(ltchStays)} LTCH stays per 1,000 × ${a.ltchToSnf}% × (${usd(ltchPerStay)} − ${usd(snfCostPerStay)})`, b.price.ltchPerStay == null ? 0 : ltchMoved * Math.max(ltchPerStay - snfCostPerStay, 0)),
    mk('ipdays', 'Inpatient days the plan pays per diem', `${f0(ipDays)} inpatient days per 1,000 × ${a.ipDays}% × ${a.perDiemShare}% paid per diem × ${usd(ipPerDay)} per day`, ipDaysSaved * ipPerDay),
    mk('um', 'Post-acute utilization-management cost replaced', `${usd2(a.umPmpm)} per member per month, the plan's own figure`, a.umPmpm * 12 * 1000),
  ]
  const totalPerYear = levers.reduce((s, l) => s + l.perYear, 0), totalPmpm = levers.reduce((s, l) => s + l.pmpm, 0)
  const spend = { ip: ipStays * ipPerStay / 12000, snf: snfDays * snfPerDay / 12000, irf: irfStays * irfPerStay / 12000, ltch: ltchStays * ltchPerStay / 12000, total: 0 }
  spend.total = spend.ip + spend.snf + spend.irf + spend.ltch
  const bench = a.bonus === 5 ? b.benchmark.r5 : a.bonus === 35 ? b.benchmark.r35 : b.benchmark.r0
  const revenuePmpm = bench == null ? null : bench * a.planRisk
  const stars = b.benchmark.r5 != null && b.benchmark.r0 != null ? (b.benchmark.r5 - b.benchmark.r0) * a.planRisk * 12 * members : null
  const routing = b.snf.lowShare != null && b.snf.rehospLow != null && b.snf.rehospHigh != null && ipStays > 0 ? snfStays / ipStays * b.snf.lowShare * (b.snf.rehospLow - b.snf.rehospHigh) : null
  const routingMeasure = b.snf.worseShare != null && b.snf.rehospWorse != null && b.snf.rehospBetter != null && ipStays > 0 ? snfStays / ipStays * b.snf.worseShare * (b.snf.rehospWorse - b.snf.rehospBetter) : null
  return {
    per1000: { ipStays, ipDays, snfStays, snfDays, irfStays, ltchStays, readmissionsAvoided: readmAvoided, snfStaysToHome: toHome, snfDaysSaved: daysSaved },
    snfCostPerStay, spendPmpm: spend, levers, totalPerYear, totalPmpm,
    revenuePmpm, pctOfRevenue: revenuePmpm ? totalPmpm / revenuePmpm : null, pctOfIpPac: spend.total > 0 ? totalPmpm / spend.total : 0, starsAtStakePerYear: stars, routingPts: routing, routingPtsMeasure: routingMeasure,
  }
}

// ------------------------------------------------------------------ hospitals
export interface HospitalBaseline {
  n: number; names: string[]; nNoCostReport: number   // nNoCostReport: no FY 2024 cost report, or one whose figures fail HOSP_OK and are left out
  dischargesTotal: number; dischargesFfs: number; daysTotal: number; beds: number; bedDays: number
  maDischarges: number       // MODELED: FFS discharges x (county MA / FFS enrollment) x state MA/FFS inpatient ratio
  placementsFfs: number; placementsMa: number   // SNF-bound discharges: discharges x MedPAC's national SNF share (18.7%) x the county's SNF stays per inpatient stay relative to the nation's; MA also x the state MA ratios
  costPerDay: number | null  // estimated inpatient cost per day: inpatient charges x cost-to-charge ratio / inpatient days (operating expense share when no ratio is reported)
  revPerDay: number | null   // net patient revenue x inpatient share of charges / inpatient days
  drgPayments: number        // Medicare IPPS DRG payments other than outliers (cost report), annualized
  paymentPerStay: number | null   // those DRG payments / Medicare FFS discharges: what Medicare pays this hospital for an average stay
  hrrpPenalty: number        // DRG payments x (1 - the hospital's FY 2027 readmission-penalty factor), summed (IPPS final rule Table 15)
  nHrrp: number; nPenalized: number
  vbpNet: number             // DRG payments x (proxy FY 2027 value-based purchasing factor - 1), summed (Table 16A; net of the 2% withhold)
  nVbp: number
  drgHrrp: number; drgVbp: number   // DRG payments of the hospitals that are in each program's table (Maryland and non-IPPS hospitals are in neither)
}
const hospGeo = (ccns: string[] | null, g: Geo) => ccns && ccns.length ? `hg.hospital_ccn IN (${ccns.map(sqlStr).join(',')})` : geoWhere(g)
/** Estimated inpatient cost of one day, per cost report: inpatient charges x cost-to-charge ratio (or operating expense x inpatient share of charges when no ratio is reported) / inpatient days. */
const HOSP_COST = `CASE WHEN c.cost_to_charge_ratio IS NOT NULL THEN c.inpatient_total_charges * c.cost_to_charge_ratio ELSE c.operating_expense * c.inpatient_total_charges / nullif(c.total_charges, 0) END`
/** A cost report the model will use (D-044): it has discharges, days and beds, occupancy no higher than 105%, positive revenue and charges, and a cost per day between $300 and $20,000
 *  (the 1st-99th percentile nationally is about $540-$16,800). Reports outside this are left out and counted, never adjusted. */
const HOSP_OK = `c.discharges_total > 0 AND c.days_total > 0 AND c.bed_days_available > 0 AND c.days_total <= 1.05 * c.bed_days_available AND c.net_patient_revenue > 0 AND c.inpatient_total_charges > 0 AND c.total_charges > 0
  AND coalesce((${HOSP_COST}) / c.days_total BETWEEN 300 AND 20000, false)`
export async function hospitalBaseline(g: Geo, ccns: string[] | null): Promise<HospitalBaseline | null> {
  await ensureUw()
  const [r] = await q<Row>(`
    WITH nat AS (SELECT sum(gv_ffs_benes * ffs_snf_stays) / sum(gv_ffs_benes * ffs_ip_stays) AS snf_per_ip FROM uw_county WHERE ffs_snf_stays IS NOT NULL AND ffs_ip_stays IS NOT NULL),
    h AS (
      SELECT hg.hospital_ccn, hm.hospital_name, c.*, 365.0 / c.period_days AS ann, coalesce(${HOSP_OK}, false) AS ok, (${HOSP_COST}) AS ip_cost,
        u.enr_ma / nullif(u.enr_ffs, 0) * s.r_ip_stays AS ma_per_ffs,
        ${SNF_SHARE_OF_DISCHARGES} * (u.ffs_snf_stays / nullif(u.ffs_ip_stays, 0)) / (SELECT snf_per_ip FROM nat) AS snf_share_ffs,
        ${SNF_SHARE_OF_DISCHARGES} * (u.ffs_snf_stays * s.r_snf_stays / nullif(u.ffs_ip_stays * s.r_ip_stays, 0)) / (SELECT snf_per_ip FROM nat) AS snf_share_ma
      FROM hospital_geo hg JOIN hospital_master hm ON hm.hospital_ccn = hg.hospital_ccn JOIN uw_county u ON u.fips = hg.fips
      LEFT JOIN hospital_cost c ON c.ccn = hg.hospital_ccn LEFT JOIN uw_state s ON s.state = u.state
      WHERE ${hospGeo(ccns, g)})
    SELECT count(*) AS n, count(*) FILTER (WHERE NOT ok) AS n_no_cost, list(hospital_name ORDER BY discharges_total DESC NULLS LAST) FILTER (WHERE ok) AS names,
      sum(discharges_total * ann) FILTER (WHERE ok) AS d_total, sum(discharges_medicare * ann) FILTER (WHERE ok) AS d_ffs, sum(days_total * ann) FILTER (WHERE ok) AS days_total, sum(beds) FILTER (WHERE ok) AS beds, sum(bed_days_available * ann) FILTER (WHERE ok) AS bed_days,
      sum(discharges_medicare * ann * ma_per_ffs) FILTER (WHERE ok) AS d_ma,
      sum(discharges_medicare * ann * snf_share_ffs) FILTER (WHERE ok) AS p_ffs,
      sum(discharges_medicare * ann * ma_per_ffs * snf_share_ma) FILTER (WHERE ok) AS p_ma,
      sum(ip_cost * ann) FILTER (WHERE ok) / nullif(sum(days_total * ann) FILTER (WHERE ok), 0) AS cost_day,
      sum(net_patient_revenue * inpatient_total_charges / total_charges * ann) FILTER (WHERE ok) / nullif(sum(days_total * ann) FILTER (WHERE ok), 0) AS rev_day,
      sum(drg_payments_raw * ann) FILTER (WHERE ok) AS drg, sum(drg_payments_raw * ann) FILTER (WHERE ok) / nullif(sum(discharges_medicare * ann) FILTER (WHERE ok AND drg_payments_raw IS NOT NULL), 0) AS pay_stay,
      sum(drg_payments_raw * ann * (1 - hrrp_factor)) FILTER (WHERE ok) AS hrrp, count(hrrp_factor) FILTER (WHERE ok AND drg_payments_raw IS NOT NULL) AS n_hrrp, count(*) FILTER (WHERE ok AND drg_payments_raw IS NOT NULL AND hrrp_factor < 1) AS n_pen,
      sum(drg_payments_raw * ann * (vbp_factor - 1)) FILTER (WHERE ok) AS vbp, count(vbp_factor) FILTER (WHERE ok AND drg_payments_raw IS NOT NULL) AS n_vbp,
      sum(drg_payments_raw * ann) FILTER (WHERE ok AND hrrp_factor IS NOT NULL) AS drg_hrrp, sum(drg_payments_raw * ann) FILTER (WHERE ok AND vbp_factor IS NOT NULL) AS drg_vbp
    FROM h`)
  if (!r || !(Number(r.d_total) > 0)) return null
  const n = (v: unknown) => v == null ? null : Number(v)
  const names = listOf(r.names).slice(0, 5)
  return { n: Number(r.n), names, nNoCostReport: Number(r.n_no_cost), dischargesTotal: Number(r.d_total), dischargesFfs: Number(r.d_ffs ?? 0), daysTotal: Number(r.days_total ?? 0), beds: Number(r.beds ?? 0), bedDays: Number(r.bed_days ?? 0),
    maDischarges: Number(r.d_ma ?? 0), placementsFfs: Number(r.p_ffs ?? 0), placementsMa: Number(r.p_ma ?? 0), costPerDay: n(r.cost_day), revPerDay: n(r.rev_day), drgPayments: Number(r.drg ?? 0),
    paymentPerStay: n(r.pay_stay), hrrpPenalty: Number(r.hrrp ?? 0), nHrrp: Number(r.n_hrrp), nPenalized: Number(r.n_pen), vbpNet: Number(r.vbp ?? 0), nVbp: Number(r.n_vbp), drgHrrp: Number(r.drg_hrrp ?? 0), drgVbp: Number(r.drg_vbp ?? 0) }
}
export interface HospitalAssumptions {
  daysSaved: number         // avoidable days removed per SNF-bound discharge
  placements: number | null // SNF-bound discharges per year from the hospital's own data; null = the modeled Medicare count
  variableShare: number     // % of the cost of a day that is avoided when the day is not used
  backfill: number          // % of freed days that are filled with another patient
  penaltyRecovered: number  // % of the hospital's actual readmission penalty removed
  vbpRecovered: number      // % of the 2% value-based purchasing withhold earned on top of today's result
  atRiskShare: number       // % of Medicare discharges where the hospital itself carries the cost of a readmission (ACO, bundle, capitation): a fact about the hospital, 0 unless entered
  readmPts: number          // points off the 30-day readmission rate for those patients
  hoursSaved: number        // case-manager hours saved per placement
  hourly: number            // loaded hourly cost of a case manager, $
}
export const HOSPITAL_PRESETS: Record<Preset, Pick<HospitalAssumptions, 'daysSaved' | 'backfill' | 'penaltyRecovered' | 'vbpRecovered' | 'readmPts' | 'hoursSaved'>> = {
  min: { daysSaved: 0.25, backfill: 0, penaltyRecovered: 0, vbpRecovered: 0, readmPts: 0.5, hoursSaved: 0.5 },
  base: { daysSaved: 0.5, backfill: 25, penaltyRecovered: 25, vbpRecovered: 5, readmPts: 1, hoursSaved: 1 },
  stretch: { daysSaved: 1, backfill: 50, penaltyRecovered: 50, vbpRecovered: 10, readmPts: 2, hoursSaved: 2 },
}
export const HOSPITAL_DEFAULTS: HospitalAssumptions = { ...HOSPITAL_PRESETS.base, placements: null, variableShare: 30, atRiskShare: 0, hourly: 55 }
export interface HospitalValue { placements: number; modeledPlacements: number; daysFreed: number; valuePerDay: number; levers: Lever[]; totalPerYear: number; perPlacement: number; occupancy: number | null; alos: number | null; hrrpMax: number; vbpWithhold: number }
export function hospitalValue(b: HospitalBaseline, a: HospitalAssumptions): HospitalValue {
  const modeled = b.placementsFfs + b.placementsMa
  const placements = a.placements ?? modeled
  const daysFreed = placements * a.daysSaved
  const cost = b.costPerDay ?? 0, rev = b.revPerDay ?? 0, v = a.variableShare / 100, bf = a.backfill / 100
  // an unfilled freed day saves its variable cost; a backfilled one earns a day of revenue and still incurs the variable cost
  const valuePerDay = (1 - bf) * v * cost + bf * Math.max(rev - v * cost, 0)
  const atRisk = (b.dischargesFfs + b.maDischarges) * a.atRiskShare / 100
  const mk = (key: string, label: string, basis: string, perYear: number): Lever => ({ key, label, basis, perYear, pmpm: 0 })
  const levers: Lever[] = [
    mk('days', 'Excess days avoided', `${f0(placements)} SNF-bound discharges × ${a.daysSaved} day × ${usd(valuePerDay)} per freed day`, daysFreed * valuePerDay),
    mk('hrrp', 'Readmission penalty recovered', b.nHrrp === 0 ? 'not in the readmission penalty program' : `${usd(b.hrrpPenalty)} FY 2027 penalty × ${a.penaltyRecovered}% recovered`, b.hrrpPenalty * a.penaltyRecovered / 100),
    mk('vbp', 'Value-based purchasing withhold earned back', b.nVbp === 0 ? 'not in the value-based purchasing program' : `${usd(b.drgVbp)} DRG payments × 2% withhold × ${a.vbpRecovered}%`, b.drgVbp * 0.02 * a.vbpRecovered / 100),
    mk('readm', 'Readmissions avoided on patients the hospital is at risk for', `${f0(atRisk)} at-risk Medicare discharges × ${a.readmPts} pt × ${usd(b.paymentPerStay ?? 0)} per stay`, atRisk * a.readmPts / 100 * (b.paymentPerStay ?? 0)),
    mk('labor', 'Case-management time', `${f0(placements)} placements × ${a.hoursSaved} h × ${usd(a.hourly)} per hour`, placements * a.hoursSaved * a.hourly),
  ]
  const total = levers.reduce((s, l) => s + l.perYear, 0)
  return { placements, modeledPlacements: modeled, daysFreed, valuePerDay, levers, totalPerYear: total, perPlacement: placements > 0 ? total / placements : 0, occupancy: b.bedDays > 0 ? b.daysTotal / b.bedDays : null, alos: b.dischargesTotal > 0 ? b.daysTotal / b.dischargesTotal : null, hrrpMax: b.drgHrrp * 0.03, vbpWithhold: b.drgVbp * 0.02 }
}

// ------------------------------------------------------------------ SNFs
export interface SnfBaseline {
  n: number; names: string[]; nNoCostReport: number
  beds: number; bedDays: number; daysTotal: number; daysMedicare: number; daysMedicaid: number | null; daysOther: number; admissions: number
  revenue: number; opex: number; ppsAmount: number | null
  avgStars: number | null
}
/** A SNF cost report the model will use (D-044): patient days and bed-days, occupancy between 10% and 102%, positive revenue, operating expense within a factor of two of patient revenue
 *  (outside that the report usually covers more than the nursing facility), and Medicare Part A revenue and days to price a Medicare day. About 96% of filed reports pass. Reports that fail are left out and counted, never adjusted. */
const SNF_OK = `c.days_total > 0 AND c.bed_days_available > 0 AND c.days_total BETWEEN 0.10 * c.bed_days_available AND 1.02 * c.bed_days_available AND c.net_patient_revenue > 0
  AND c.operating_expense BETWEEN 0.5 * c.net_patient_revenue AND 2 * c.net_patient_revenue AND c.days_medicare > 0 AND c.days_medicare < c.days_total AND c.inpatient_pps_amount > 0 AND c.inpatient_pps_amount < c.net_patient_revenue`
export async function snfBaseline(g: Geo, ccns: string[] | null, chain: string | null, highOnly = false): Promise<SnfBaseline | null> {
  await ensureUw()
  const where = ccns && ccns.length ? `sg.ccn IN (${ccns.map(sqlStr).join(',')})` : `${geoWhere(g)}${chain ? ` AND fm.chain_name = ${sqlStr(chain)}` : ''}${highOnly ? ' AND fm.overall_rating >= 4' : ''}`
  const [r] = await q<Row>(`
    WITH s AS (SELECT fm.provider_name, fm.overall_rating, c.*, 365.0 / c.period_days AS ann, coalesce(${SNF_OK}, false) AS ok
               FROM snf_geo sg JOIN facility_master fm ON fm.ccn = sg.ccn JOIN uw_county u ON u.fips = sg.fips LEFT JOIN snf_cost c ON c.ccn = sg.ccn WHERE ${where})
    SELECT count(*) AS n, count(*) FILTER (WHERE NOT ok) AS n_no_cost, list(provider_name ORDER BY days_total DESC NULLS LAST) FILTER (WHERE ok) AS names,
      sum(beds) FILTER (WHERE ok) AS beds, sum(bed_days_available * ann) FILTER (WHERE ok) AS bed_days, sum(days_total * ann) FILTER (WHERE ok) AS days_total, sum(days_medicare * ann) FILTER (WHERE ok) AS days_medicare,
      sum(days_medicaid * ann) FILTER (WHERE ok) AS days_medicaid, sum(days_other * ann) FILTER (WHERE ok) AS days_other, sum(discharges_total * ann) FILTER (WHERE ok) AS admissions,
      sum(net_patient_revenue * ann) FILTER (WHERE ok) AS revenue, sum(operating_expense * ann) FILTER (WHERE ok) AS opex, sum(inpatient_pps_amount * ann) FILTER (WHERE ok) AS pps,
      avg(overall_rating) FILTER (WHERE ok) AS stars
    FROM s`)
  if (!r || !(Number(r.days_total) > 0)) return null
  const n = (v: unknown) => v == null ? null : Number(v)
  const names = listOf(r.names).slice(0, 5)
  return { n: Number(r.n), names, nNoCostReport: Number(r.n_no_cost), beds: Number(r.beds ?? 0), bedDays: Number(r.bed_days ?? 0), daysTotal: Number(r.days_total), daysMedicare: Number(r.days_medicare ?? 0), daysMedicaid: n(r.days_medicaid), daysOther: Number(r.days_other ?? 0),
    admissions: Number(r.admissions ?? 0), revenue: Number(r.revenue ?? 0), opex: Number(r.opex ?? 0), ppsAmount: n(r.pps), avgStars: n(r.stars) }
}
/** Why one facility's cost report is not used, in words (for the single-facility empty state). */
export async function snfCostNote(ccn: string): Promise<string> {
  await ensureUw()
  const [c] = await q<Row>(`SELECT * FROM snf_cost c WHERE c.ccn = ${sqlStr(ccn)}`)
  if (!c) return 'CMS has no fiscal-year 2024 cost report for this facility.'
  const d = Number(c.days_total), bd = Number(c.bed_days_available), rev = Number(c.net_patient_revenue), ox = Number(c.operating_expense)
  if (!(d > 0) || !(bd > 0)) return 'Its fiscal-year 2024 cost report has no patient days or no bed-days.'
  if (d > 1.02 * bd || d < 0.1 * bd) return `Its cost report shows ${Math.round(100 * d / bd)}% occupancy, which is outside the 10–102% range the model accepts.`
  if (!(rev > 0)) return 'Its cost report shows no patient revenue.'
  if (ox > 2 * rev || ox < 0.5 * rev) return `Its cost report shows operating expense of ${(ox / rev).toFixed(1)} times patient revenue, which usually means the report covers more than the nursing facility.`
  return 'Its cost report has no usable Medicare Part A revenue or Medicare days, so a Medicare day cannot be priced.'
}
export async function chainsIn(g: Geo, text: string, limit = 10): Promise<{ chain: string; n: number }[]> {
  await ensureUw()
  const t = text.trim().toLowerCase().replace(/[%_';]/g, ' ')
  const rows = await q<Row>(`SELECT fm.chain_name AS chain, count(*) AS n FROM facility_master fm JOIN snf_geo sg ON sg.ccn = fm.ccn JOIN uw_county u ON u.fips = sg.fips
    WHERE fm.chain_name IS NOT NULL AND ${geoWhere(g)} ${t ? `AND lower(fm.chain_name) LIKE ${sqlStr(`%${t.split(/\s+/).join('%')}%`)}` : ''} GROUP BY 1 ORDER BY n DESC LIMIT ${Math.trunc(limit)}`)
  return rows.map(r => ({ chain: String(r.chain), n: Number(r.n) }))
}
/** Occupancy of the area's SNFs by star tier (cost reports, FY 2024): the evidence for "the better SNFs are the fuller ones" in this market. */
export interface SnfTier { tier: 'high' | 'mid' | 'low'; n: number; occupancy: number | null; medicareShare: number | null }
export async function snfMarket(g: Geo): Promise<SnfTier[]> {
  await ensureUw()
  const rows = await q<Row>(`SELECT CASE WHEN fm.overall_rating >= 4 THEN 'high' WHEN fm.overall_rating = 3 THEN 'mid' ELSE 'low' END AS tier, count(*) AS n,
      sum(c.days_total * 365.0 / c.period_days) / nullif(sum(CASE WHEN c.days_total IS NOT NULL THEN c.bed_days_available * 365.0 / c.period_days END), 0) AS occupancy,
      sum(c.days_medicare * 365.0 / c.period_days) / nullif(sum(CASE WHEN c.days_medicare IS NOT NULL THEN c.days_total * 365.0 / c.period_days END), 0) AS medicare_share
    FROM snf_geo sg JOIN facility_master fm ON fm.ccn = sg.ccn JOIN uw_county u ON u.fips = sg.fips JOIN snf_cost c ON c.ccn = sg.ccn
    WHERE fm.overall_rating IS NOT NULL AND ${SNF_OK} AND ${geoWhere(g)} GROUP BY 1`)
  return (['high', 'mid', 'low'] as const).map(t => { const r = rows.find(x => x.tier === t); return { tier: t, n: Number(r?.n ?? 0), occupancy: r?.occupancy == null ? null : Number(r.occupancy), medicareShare: r?.medicare_share == null ? null : Number(r.medicare_share) } })
}
export interface SnfLite { ccn: string; provider_name: string; city_town: string; state: string; overall_rating: number | null }
export async function searchSnfs(g: Geo, text: string, limit = 10): Promise<SnfLite[]> {
  await ensureUw()
  const t = text.trim().toLowerCase().replace(/[%_';]/g, ' ')
  if (!t) return []
  return q<SnfLite & Row>(`SELECT fm.ccn, fm.provider_name, fm.city_town, fm.state, fm.overall_rating FROM facility_master fm JOIN snf_geo sg ON sg.ccn = fm.ccn JOIN uw_county u ON u.fips = sg.fips
    WHERE ${geoWhere(g)} AND (lower(fm.provider_name) LIKE ${sqlStr(`%${t.split(/\s+/).join('%')}%`)} OR fm.ccn = ${sqlStr(t)}) ORDER BY fm.provider_name LIMIT ${Math.trunc(limit)}`) as Promise<SnfLite[]>
}
export const snfsByCcn = (ccns: string[]) => ccns.length ? q<SnfLite & Row>(`SELECT ccn, provider_name, city_town, state, overall_rating FROM facility_master WHERE ccn IN (${ccns.map(sqlStr).join(',')})`) as Promise<SnfLite[]> : Promise.resolve([])
export interface SnfAssumptions {
  fill: number            // % of today's empty bed-days filled by preferred referrals
  medicareShare: number   // % of those added days that are Medicare or Medicare Advantage
  maPriceFactor: number   // payment for those days as % of the facility's Medicare Part A revenue per day
  medicaidRate: number | null   // $ per day for Medicaid / dual days; null = the facility's own average non-Medicare revenue per day
  variableShare: number   // % of operating cost per day that an added day actually adds
  hoursSaved: number      // intake staff hours saved per admission
  hourly: number
}
export const SNF_PRESETS: Record<Preset, Pick<SnfAssumptions, 'fill' | 'medicareShare' | 'hoursSaved'>> = {
  min: { fill: 10, medicareShare: 30, hoursSaved: 0.5 }, base: { fill: 25, medicareShare: 40, hoursSaved: 1 }, stretch: { fill: 50, medicareShare: 50, hoursSaved: 1.5 },
}
export const SNF_DEFAULTS: SnfAssumptions = { ...SNF_PRESETS.base, maPriceFactor: 100, medicaidRate: null, variableShare: 50, hourly: 40 }
export interface SnfValue {
  occupancy: number; emptyBedDays: number; revPerDay: number; opexPerDay: number; medicareRevPerDay: number | null; nonMedicareRevPerDay: number | null
  medicaidRateUsed: number | null; addedDays: number; addedMedicareDays: number; addedMedicaidDays: number; addedRevenue: number; addedCost: number
  levers: Lever[]; totalPerYear: number; perBed: number
  medicareMarginPerDay: number | null; medicaidGapPerDay: number | null; medicaidDaysCarried: number | null   // full-cost view: how many Medicaid days one Medicare day pays for
  mix: { medicare: number; medicaid: number | null; other: number }
}
export function snfValue(b: SnfBaseline, a: SnfAssumptions): SnfValue {
  const occupancy = b.bedDays > 0 ? b.daysTotal / b.bedDays : 0
  const empty = Math.max(b.bedDays - b.daysTotal, 0)
  const revPerDay = b.revenue / b.daysTotal, opexPerDay = b.opex / b.daysTotal
  const mcr = b.ppsAmount != null && b.daysMedicare > 0 ? b.ppsAmount / b.daysMedicare : null
  const nonMcr = b.ppsAmount != null && b.daysTotal > b.daysMedicare ? (b.revenue - b.ppsAmount) / (b.daysTotal - b.daysMedicare) : null
  const mcaid = a.medicaidRate ?? nonMcr
  const added = empty * a.fill / 100, addM = added * a.medicareShare / 100, addX = added - addM
  const addedRevenue = addM * (mcr ?? 0) * a.maPriceFactor / 100 + addX * (mcaid ?? 0)
  const addedCost = added * opexPerDay * a.variableShare / 100
  const mk = (key: string, label: string, basis: string, perYear: number): Lever => ({ key, label, basis, perYear, pmpm: 0 })
  const levers: Lever[] = [
    mk('fill', 'Empty beds filled, after variable cost', `${f0(added)} added days: ${f0(addM)} Medicare/MA at ${usd((mcr ?? 0) * a.maPriceFactor / 100)}, ${f0(addX)} Medicaid/other at ${usd(mcaid ?? 0)}, less ${usd(opexPerDay * a.variableShare / 100)} variable cost per day`, addedRevenue - addedCost),
    mk('intake', 'Intake time', `${f0(b.admissions)} admissions × ${a.hoursSaved} h × ${usd(a.hourly)} per hour`, b.admissions * a.hoursSaved * a.hourly),
  ]
  const total = levers.reduce((s, l) => s + l.perYear, 0)
  const mMargin = mcr == null ? null : mcr * a.maPriceFactor / 100 - opexPerDay, gap = mcaid == null ? null : opexPerDay - mcaid
  return { occupancy, emptyBedDays: empty, revPerDay, opexPerDay, medicareRevPerDay: mcr, nonMedicareRevPerDay: nonMcr, medicaidRateUsed: mcaid, addedDays: added, addedMedicareDays: addM, addedMedicaidDays: addX, addedRevenue, addedCost,
    levers, totalPerYear: total, perBed: b.beds > 0 ? total / b.beds : 0, medicareMarginPerDay: mMargin, medicaidGapPerDay: gap, medicaidDaysCarried: mMargin != null && gap != null && gap > 0 && mMargin > 0 ? mMargin / gap : null,
    mix: { medicare: b.daysMedicare / b.daysTotal, medicaid: b.daysMedicaid == null ? null : b.daysMedicaid / b.daysTotal, other: b.daysOther / b.daysTotal } }
}

/** A DuckDB LIST column arrives as an Arrow vector or a plain array depending on the driver. */
function listOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (v && typeof (v as { toArray?: () => unknown[] }).toArray === 'function') return Array.from((v as { toArray: () => unknown[] }).toArray()).map(String)
  return []
}
// ------------------------------------------------------------------ small formatters for the "basis" strings (kept here so the arithmetic and its description cannot drift apart)
const usd = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
const f0 = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
const f1 = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n)
const usd2 = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
const f2 = (n: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
