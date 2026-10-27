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
export interface FamilyLite { family_id: number; label: string; aliases: string | null; n_member_orgs: number; n_hospitals: number; n_with_service_area: number; n_states: number; n_minority_stakes?: number; matched_alias?: string | null; tier?: number }
/** Hospital systems ("families"): PECOS owner organizations grouped across their holding companies (see Methodology). Search matches the label and every alias. */
export async function searchSystems(text: string, limit = 20): Promise<FamilyLite[]> {
  const t = text.trim().toUpperCase().replace(/[%_\\]/g, m => '\\' + m)
  if (!t) return []
  const p = sqlStr('%' + t + '%')
  const pre = sqlStr(t + '%')
  return q<FamilyLite & Row>(`SELECT family_id, label, aliases, n_member_orgs, n_hospitals, n_with_service_area, n_states, n_minority_stakes,
      CASE WHEN upper(label) LIKE ${pre} ESCAPE '\\' THEN 0 WHEN upper(label) LIKE ${p} ESCAPE '\\' THEN 1 ELSE 2 END AS tier,
      CASE WHEN upper(label) LIKE ${p} ESCAPE '\\' THEN NULL ELSE (SELECT a FROM unnest(string_split(coalesce(aliases,''), ' | ')) AS u(a) WHERE upper(a) LIKE ${p} ESCAPE '\\' LIMIT 1) END AS matched_alias
    FROM hospital_family WHERE upper(label) LIKE ${p} ESCAPE '\\' OR upper(coalesce(aliases,'')) LIKE ${p} ESCAPE '\\'
    ORDER BY tier, n_with_service_area DESC, label LIMIT ${limit}`) as Promise<FamilyLite[]>
}
export interface FamilyMember { hospital_ccn: string; state: string; has_service_area: boolean }
/** Hospitals the family controls (a member holds a 50%+ or unreported share); minority stakes are not members. */
export const familyMembers = (familyId: number) => q<FamilyMember & Row>(`SELECT hospital_ccn, state, has_service_area FROM hospital_family_member WHERE family_id = ${Math.trunc(familyId)} AND controlled ORDER BY state, hospital_ccn`) as Promise<FamilyMember[]>
/** Families a hospital belongs to (usually one; two for a joint venture), with the member CCNs that have service-area data. */
export const hospitalFamilies = (ccn: string) => q<{ family_id: number; label: string; n_hospitals: number } & Row>(`SELECT f.family_id, f.label, f.n_hospitals FROM hospital_family_member m JOIN hospital_family f USING (family_id) WHERE m.hospital_ccn = ${sqlStr(ccn)} AND m.controlled ORDER BY f.n_hospitals DESC`)
/** Owner organizations of one hospital (direct first, then indirect), for the hospital page. */
export const hospitalOwners = (ccn: string) => q(`SELECT owner_id, owner_name, role_code, role_text, pct, since FROM hospital_owner_org WHERE hospital_ccn = ${sqlStr(ccn)} ORDER BY role_code, owner_name`)
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
