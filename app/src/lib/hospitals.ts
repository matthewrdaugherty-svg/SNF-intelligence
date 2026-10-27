// Hospital layer queries. All numbers come from the loaded CMS tables; the only model is snf_hospital_area (see db.ts).
import { q, sqlStr, type Row } from './db'

export interface HospitalLite { hospital_ccn: string; hospital_name: string; city: string; state: string; hospital_type: string; hospital_overall_rating: number | null; medicare_discharges_2024: number | null; cases_visible: number | null }

export async function searchHospitals(text: string, limit = 25): Promise<HospitalLite[]> {
  const t = text.trim().toUpperCase().replace(/[%_\\]/g, m => '\\' + m)
  if (!t) return []
  const like = (col: string, p: string) => `${col} LIKE ${sqlStr(p)} ESCAPE '\\'`
  return q<HospitalLite & Row>(`SELECT hospital_ccn, hospital_name, city, state, hospital_type, hospital_overall_rating, medicare_discharges_2024, cases_visible FROM hospital_master
    WHERE ${like('upper(hospital_name)', '%' + t + '%')} OR ${like('upper(city)', '%' + t + '%')} OR ${like('hospital_ccn', t + '%')}
    ORDER BY (cases_visible IS NULL), medicare_discharges_2024 DESC NULLS LAST, hospital_name LIMIT ${limit}`) as Promise<HospitalLite[]>
}
export const hospitalsByCcn = (ccns: string[]) => ccns.length ? q<HospitalLite & Row>(`SELECT hospital_ccn, hospital_name, city, state, hospital_type, hospital_overall_rating, medicare_discharges_2024, cases_visible FROM hospital_master WHERE hospital_ccn IN (${ccns.map(sqlStr).join(',')})`) as Promise<HospitalLite[]> : Promise.resolve([])
export const hospitalDetail = (ccn: string) => q(`SELECT * FROM hospital_master WHERE hospital_ccn = ${sqlStr(ccn)}`).then(r => r[0] ?? null)

/** The hospital's visible service area: ZIPs with ≥11 cases, largest first, with cumulative share. */
export const serviceArea = (ccn: string) => q(`SELECT zip, cases, days, charges, share_of_visible_cases, cumulative_share, zip_rank,
  (SELECT count(*) FROM facility_master f WHERE f.zip_code = a.zip) AS snfs_in_zip
  FROM hospital_service_area a WHERE hospital_ccn = ${sqlStr(ccn)} ORDER BY zip_rank`)

/** SNFs located in one or more hospitals' service-area ZIPs, with the modeled weight summed across the chosen hospitals. */
export const inClause = (ccns: string[]) => `ccn IN (SELECT ccn FROM snf_hospital_area WHERE hospital_ccn IN (${ccns.map(sqlStr).join(',')}))`
export const weightExpr = (ccns: string[]) => `(SELECT sum(modeled_weight) FROM snf_hospital_area w WHERE w.ccn = facility_master.ccn AND w.hospital_ccn IN (${ccns.map(sqlStr).join(',')}))`

export const snfsServing = (ccn: string) => q(`
  SELECT f.ccn, f.provider_name, f.city_town, f.state, f.zip_code, f.overall_rating, f.health_inspection_rating, f.qm_rating, f.staffing_rating, f.special_focus_status, f.abuse_icon,
         f.number_of_certified_beds, f.qm_521_adj, f.qm_521_fn, f.qrp_004_ppr_pd_rsrr, f.qrp_004_ppr_pd_rsrr_fn, f.qrp_005_dtc_rs_rate, f.qrp_005_dtc_rs_rate_fn, f.pen_total_fines_usd, f.hc_n_severity_G_or_worse,
         a.zip_share, a.hospital_cases_from_zip, a.snf_medicare_stays_2024, a.zip_snfs, a.modeled_weight
  FROM snf_hospital_area a JOIN facility_master f USING (ccn) WHERE a.hospital_ccn = ${sqlStr(ccn)} ORDER BY a.modeled_weight DESC`)

export interface Mix { total_weight: number; covered_share: number; low: number; mid: number; high: number; unrated: number; n_snf: number; n_low: number; n_mid: number; n_high: number; w521: number | null; w004: number | null; w005: number | null; wstars: number | null }
/** Quality mix of the modeled SNF volume. Shares are of the weight that lands on rated/unrated SNFs (= visible volume from ZIPs that contain a SNF). */
export const qualityMix = (ccn: string) => q<Mix & Row>(`
  SELECT sum(a.modeled_weight) AS total_weight, sum(a.modeled_weight) AS covered_share,
    sum(CASE WHEN f.overall_rating <= 2 THEN a.modeled_weight ELSE 0 END) / nullif(sum(a.modeled_weight),0) AS low,
    sum(CASE WHEN f.overall_rating = 3 THEN a.modeled_weight ELSE 0 END) / nullif(sum(a.modeled_weight),0) AS mid,
    sum(CASE WHEN f.overall_rating >= 4 THEN a.modeled_weight ELSE 0 END) / nullif(sum(a.modeled_weight),0) AS high,
    sum(CASE WHEN f.overall_rating IS NULL THEN a.modeled_weight ELSE 0 END) / nullif(sum(a.modeled_weight),0) AS unrated,
    count(*) AS n_snf, count(*) FILTER (WHERE f.overall_rating <= 2) AS n_low, count(*) FILTER (WHERE f.overall_rating = 3) AS n_mid, count(*) FILTER (WHERE f.overall_rating >= 4) AS n_high,
    sum(a.modeled_weight * f.qm_521_adj) / nullif(sum(CASE WHEN f.qm_521_adj IS NOT NULL THEN a.modeled_weight END),0) AS w521,
    sum(a.modeled_weight * f.qrp_004_ppr_pd_rsrr) / nullif(sum(CASE WHEN f.qrp_004_ppr_pd_rsrr IS NOT NULL THEN a.modeled_weight END),0) AS w004,
    sum(a.modeled_weight * f.qrp_005_dtc_rs_rate) / nullif(sum(CASE WHEN f.qrp_005_dtc_rs_rate IS NOT NULL THEN a.modeled_weight END),0) AS w005,
    sum(a.modeled_weight * f.overall_rating) / nullif(sum(CASE WHEN f.overall_rating IS NOT NULL THEN a.modeled_weight END),0) AS wstars
  FROM snf_hospital_area a JOIN facility_master f USING (ccn) WHERE a.hospital_ccn = ${sqlStr(ccn)}`).then(r => r[0] ?? null)
