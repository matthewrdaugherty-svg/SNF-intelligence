// Registry of every measure shown in the app: db column, plain-English label, unit, direction,
// footnote column, and the matching state-average / national-average source. Nothing here is a value;
// values come from the Parquet files. Direction is OUR reading (flagged in the UI as such).

export type Direction = 'lower' | 'higher' | 'none'
export type Unit = 'pct' | 'per1000' | 'hours' | 'count' | 'usd' | 'ratio' | 'stars' | 'rank' | 'fraction' | 'text' | 'date' | 'score'

export interface Measure {
  key: string            // db column on facility_master
  label: string
  unit: Unit
  direction: Direction
  fn?: string            // footnote column
  state?: string         // column on state_averages
  national?: string      // key into national context map (qrp_national / vbp_aggregate), or state_averages NATION row
  note?: string
  compPerf?: string      // QRP comparative performance text column
  volume?: string        // QRP eligible stays column
  decimals?: number
  short?: string         // compact label for table headers
}
export interface Group { id: string; title: string; blurb?: string; measures: Measure[] }

export const GROUPS: Group[] = [
  { id: 'ratings', title: 'Star ratings', blurb: 'CMS Five-Star ratings. Health inspection stars are relative within each state.',
    measures: [
      { key: 'overall_rating', label: 'Overall', unit: 'stars', direction: 'higher', fn: 'overall_rating_footnote', state: 'overall_rating' },
      { key: 'health_inspection_rating', label: 'Health inspection', unit: 'stars', direction: 'higher', fn: 'health_inspection_rating_footnote', state: 'health_inspection_rating' },
      { key: 'qm_rating', label: 'Quality measures', unit: 'stars', direction: 'higher', fn: 'qm_rating_footnote', state: 'qm_rating' },
      { key: 'long_stay_qm_rating', label: 'Long-stay quality measures', unit: 'stars', direction: 'higher', fn: 'long_stay_qm_rating_footnote' },
      { key: 'short_stay_qm_rating', label: 'Short-stay quality measures', unit: 'stars', direction: 'higher', fn: 'short_stay_qm_rating_footnote' },
      { key: 'staffing_rating', label: 'Staffing', unit: 'stars', direction: 'higher', fn: 'staffing_rating_footnote', state: 'staffing_rating' },
    ] },
  { id: 'hospital_use', title: 'Hospital and ED use', blurb: 'Claims-based. These are the measures closest to what a discharging hospital cares about.',
    measures: [
      { key: 'qm_521_adj', label: 'Short-stay residents rehospitalized (QM 521)', short: 'Rehospitalized % (QM 521)', unit: 'pct', direction: 'lower', fn: 'qm_521_fn', state: 'percentage_of_short_stay_residents_who_were_rehospitalized_after_a_nursing_home_admission', note: 'Risk-adjusted. Calendar 2025.' },
      { key: 'qm_522_adj', label: 'Short-stay residents with an outpatient ED visit (QM 522)', short: 'ED visit % (QM 522)', unit: 'pct', direction: 'lower', fn: 'qm_522_fn', state: 'percentage_of_short_stay_residents_who_had_an_outpatient_emergency_department_visit' },
      { key: 'qm_551_adj', label: 'Long-stay hospitalizations per 1,000 resident-days (QM 551)', short: 'Hospitalizations /1,000 days (QM 551)', unit: 'per1000', direction: 'lower', fn: 'qm_551_fn', state: 'number_of_hospitalizations_per_1000_long_stay_resident_days' },
      { key: 'qm_552_adj', label: 'Long-stay ED visits per 1,000 resident-days (QM 552)', short: 'ED visits /1,000 days (QM 552)', unit: 'per1000', direction: 'lower', fn: 'qm_552_fn', state: 'number_of_outpatient_emergency_department_visits_per_1000_long_stay_resident_days' },
    ] },
  { id: 'qrp', title: 'SNF Quality Reporting Program', blurb: 'Medicare Part A stays. Readmission, discharge-to-community and spending cover Oct 2022–Sep 2024; the rest Oct 2024–Sep 2025.',
    measures: [
      { key: 'qrp_004_ppr_pd_rsrr', label: 'Potentially preventable readmissions within 30 days of SNF discharge (QRP 004)', short: 'Readmission % (QRP 004)', unit: 'pct', direction: 'lower', fn: 'qrp_004_ppr_pd_rsrr_fn', national: 'S_004_01_PPR_PD_NAT_UNADJUST_AVG', compPerf: 'qrp_004_ppr_pd_comp_perf', volume: 'qrp_004_ppr_pd_volume', note: 'Risk-standardized. National figure is the unadjusted average.' },
      { key: 'qrp_005_dtc_rs_rate', label: 'Successful discharge to community (QRP 005)', short: 'To community % (QRP 005)', unit: 'pct', direction: 'higher', fn: 'qrp_005_dtc_rs_rate_fn', national: 'S_005_02_DTC_NAT_OBS_RATE', compPerf: 'qrp_005_dtc_comp_perf', volume: 'qrp_005_dtc_volume', note: 'Risk-standardized. National figure is the observed rate.' },
      { key: 'qrp_006_mspb_score', label: 'Medicare spending per beneficiary, ratio to national (QRP 006)', short: 'Spending ratio (QRP 006)', unit: 'ratio', direction: 'lower', fn: 'qrp_006_mspb_score_fn', national: 'S_006_01_MSPB_SCORE_NATL', volume: 'qrp_006_mspb_numb', decimals: 2 },
      { key: 'qrp_039_hai_rs_rate', label: 'Infections acquired in the SNF that led to hospitalization (QRP 039)', short: 'Infections % (QRP 039)', unit: 'pct', direction: 'lower', fn: 'qrp_039_hai_rs_rate_fn', national: 'S_039_01_HAI_NAT_OBS_RATE', compPerf: 'qrp_039_hai_comp_perf', volume: 'qrp_039_hai_volume' },
      { key: 'qrp_013_obs_rate', label: 'Falls with major injury (QRP 013)', unit: 'pct', direction: 'lower', fn: 'qrp_013_obs_rate_fn', national: 'S_013_02_NATL_OBS_RATE' },
      { key: 'qrp_038_adj_rate', label: 'New or worsened pressure ulcers (QRP 038)', unit: 'pct', direction: 'lower', fn: 'qrp_038_adj_rate_fn', national: 'S_038_02_NATL_OBS_RATE', note: 'Facility value is adjusted; national is observed.' },
      { key: 'qrp_042_obs_rate', label: 'At or above expected self-care and mobility at discharge (QRP 042)', unit: 'pct', direction: 'higher', fn: 'qrp_042_obs_rate_fn', national: 'S_042_02_NATL_OBS_RATE' },
      { key: 'qrp_024_obs_rate', label: 'Self-care goal met at discharge (QRP 024)', unit: 'pct', direction: 'higher', fn: 'qrp_024_obs_rate_fn', national: 'S_024_06_NATL_OBS_RATE' },
      { key: 'qrp_025_obs_rate', label: 'Mobility goal met at discharge (QRP 025)', unit: 'pct', direction: 'higher', fn: 'qrp_025_obs_rate_fn', national: 'S_025_06_NATL_OBS_RATE' },
      { key: 'qrp_043_obs_rate', label: 'Medication list given to next provider (QRP 043)', unit: 'pct', direction: 'higher', fn: 'qrp_043_obs_rate_fn', national: 'S_043_02_NATL_OBS_RATE' },
      { key: 'qrp_044_obs_rate', label: 'Medication list given to patient or family (QRP 044)', unit: 'pct', direction: 'higher', fn: 'qrp_044_obs_rate_fn', national: 'S_044_02_NATL_OBS_RATE' },
      { key: 'qrp_007_obs_rate', label: 'Drug regimen reviewed with follow-up (QRP 007)', unit: 'pct', direction: 'higher', fn: 'qrp_007_obs_rate_fn', national: 'S_007_02_NATL_OBS_RATE' },
      { key: 'qrp_040_obs_rate', label: 'Staff up to date on COVID vaccine (QRP 040)', unit: 'pct', direction: 'higher', fn: 'qrp_040_obs_rate_fn', national: 'S_040_02_NATL_OBS_RATE' },
      { key: 'qrp_041_obs_rate', label: 'Staff flu vaccination (QRP 041)', unit: 'pct', direction: 'higher', fn: 'qrp_041_obs_rate_fn', national: 'S_041_01_NATL_OBS_RATE' },
      { key: 'qrp_045_obs_rate', label: 'Residents up to date on COVID vaccine (QRP 045)', unit: 'pct', direction: 'higher', fn: 'qrp_045_obs_rate_fn', national: 'S_045_01_NATL_OBS_RATE' },
    ] },
  { id: 'vbp', title: 'SNF Value-Based Purchasing, FY2026', blurb: 'CMS withholds 2% of Medicare Part A payments and pays back 60% of the pool by performance. A multiplier below 1.0 is a net cut; the floor is 0.980322.',
    measures: [
      { key: 'vbp_ranking', label: 'Program ranking (1 = best of 13,900)', unit: 'rank', direction: 'lower' },
      { key: 'vbp_performance_score', label: 'Performance score (0–100)', unit: 'score', direction: 'higher', decimals: 1 },
      { key: 'vbp_incentive_multiplier', label: 'Incentive payment multiplier', short: 'VBP multiplier', unit: 'ratio', direction: 'higher', decimals: 4 },
      { key: 'x_vbp_net_part_a_payment_change_pct', label: 'Net Part A payment change (derived: multiplier − 1)', short: 'VBP net pay change %', unit: 'pct', direction: 'higher', decimals: 2, note: 'Our arithmetic, not a CMS value.' },
      { key: 'vbp_fy24_rsrr', label: 'FY2024 risk-standardized readmission rate (SNFRM)', unit: 'fraction', direction: 'lower', fn: 'vbp_fy24_rsrr_fn', national: 'performance_period_fy_2024_national_average_risk_standardized_readmission_rate', decimals: 4 },
      { key: 'vbp_fy24_hai_rate', label: 'FY2024 risk-standardized infection rate', unit: 'fraction', direction: 'lower', fn: 'vbp_fy24_hai_rate_fn', national: 'performance_period_fy_2024_national_average_risk_standardized_healthcare_associated_infection_rate', decimals: 4 },
      { key: 'vbp_fy24_turnover', label: 'FY2024 total nursing staff turnover', unit: 'fraction', direction: 'lower', fn: 'vbp_fy24_turnover_fn', national: 'performance_period_fy_2024_national_average_total_nursing_staff_turnover_rate', decimals: 4 },
      { key: 'vbp_fy24_adj_nurse_hprd', label: 'FY2024 adjusted nurse hours per resident-day', unit: 'hours', direction: 'higher', fn: 'vbp_fy24_adj_nurse_hprd_fn', national: 'performance_period_fy_2024_national_average_adjusted_total_nursing_staff_hours_per_resident_day', decimals: 2 },
    ] },
  { id: 'enforcement', title: 'Inspections, penalties and complaints', blurb: 'Everything CMS publishes for the last three inspection cycles (about three years). Zero means none in the window.',
    measures: [
      { key: 'ss_c1_health_deficiencies', label: 'Health deficiencies, most recent standard inspection cycle', short: 'Deficiencies, latest cycle', unit: 'count', direction: 'lower', state: 'cycle_1_total_number_of_health_deficiencies' },
      { key: 'hc_n_total', label: 'Health deficiencies, all three cycles', unit: 'count', direction: 'lower' },
      { key: 'hc_n_actual_harm_GHI', label: 'Actual-harm deficiencies (severity G–I)', unit: 'count', direction: 'lower' },
      { key: 'hc_n_immediate_jeopardy_JKL', label: 'Immediate-jeopardy deficiencies (severity J–L)', unit: 'count', direction: 'lower' },
      { key: 'hc_n_abuse_neglect', label: 'Abuse, neglect or exploitation deficiencies', unit: 'count', direction: 'lower' },
      { key: 'hc_n_complaint', label: 'Deficiencies found on complaint inspections', unit: 'count', direction: 'lower' },
      { key: 'hc_n_complaint_last_12m', label: 'Complaint-inspection deficiencies, last 12 months', unit: 'count', direction: 'lower' },
      { key: 'sd_n_health_complaint_surveys_last_12m', label: 'Complaint inspections with citations, last 12 months', unit: 'count', direction: 'lower' },
      { key: 'hc_n_infection_control', label: 'Infection-control inspection deficiencies', unit: 'count', direction: 'lower' },
      { key: 'fc_n_total', label: 'Fire safety deficiencies, three cycles', unit: 'count', direction: 'lower' },
      { key: 'pen_n_fines', label: 'Fines', unit: 'count', direction: 'lower', state: 'number_of_fines' },
      { key: 'pen_total_fines_usd', label: 'Total fines', short: 'Fines $ (3 yr)', unit: 'usd', direction: 'lower', state: 'fine_amount_in_dollars' },
      { key: 'pen_fines_usd_last_12m', label: 'Fines, last 12 months', unit: 'usd', direction: 'lower' },
      { key: 'pen_n_payment_denials', label: 'Medicare payment denials', unit: 'count', direction: 'lower' },
      { key: 'pen_total_denial_days', label: 'Payment denial days', unit: 'count', direction: 'lower' },
      { key: 'total_weighted_health_survey_score', label: 'Weighted health survey score (feeds the health-inspection stars)', unit: 'score', direction: 'lower', decimals: 1 },
    ] },
  { id: 'staffing', title: 'Staffing', blurb: 'From Payroll-Based Journal submissions, Jan–Mar 2026; turnover covers calendar 2025.',
    measures: [
      { key: 'reported_total_nurse_staffing_hours_per_resident_per_day', label: 'Total nurse hours per resident-day', short: 'Nurse hrs / resident-day', unit: 'hours', direction: 'higher', fn: 'reported_staffing_footnote', state: 'reported_total_nurse_staffing_hours_per_resident_per_day', decimals: 2 },
      { key: 'reported_rn_staffing_hours_per_resident_per_day', label: 'RN hours per resident-day', unit: 'hours', direction: 'higher', fn: 'reported_staffing_footnote', state: 'reported_rn_staffing_hours_per_resident_per_day', decimals: 2 },
      { key: 'adjusted_total_nurse_staffing_hours_per_resident_per_day', label: 'Total nurse hours per resident-day, case-mix adjusted', unit: 'hours', direction: 'higher', fn: 'staffing_rating_footnote', decimals: 2 },
      { key: 'total_number_of_nurse_staff_hours_per_resident_per_day_on_the_weekend', label: 'Weekend total nurse hours per resident-day', unit: 'hours', direction: 'higher', fn: 'reported_staffing_footnote', state: 'total_number_of_nurse_staff_hours_per_resident_per_day_on_the_weekend', decimals: 2 },
      { key: 'reported_physical_therapist_staffing_hours_per_resident_per_day', label: 'Physical therapist hours per resident-day', unit: 'hours', direction: 'higher', fn: 'physical_therapist_staffing_footnote', state: 'reported_physical_therapist_staffing_hours_per_resident_per_day', decimals: 2 },
      { key: 'total_nursing_staff_turnover', label: 'Total nursing staff turnover', unit: 'pct', direction: 'lower', fn: 'total_nursing_staff_turnover_footnote', state: 'total_nursing_staff_turnover', decimals: 1 },
      { key: 'registered_nurse_turnover', label: 'RN turnover', unit: 'pct', direction: 'lower', fn: 'registered_nurse_turnover_footnote', state: 'registered_nurse_turnover', decimals: 1 },
      { key: 'number_of_administrators_who_have_left_the_nursing_home', label: 'Administrators who left', unit: 'count', direction: 'lower', fn: 'administrator_turnover_footnote', state: 'number_of_administrators_who_have_left_the_nursing_home' },
      { key: 'nursing_case_mix_index', label: 'Nursing case-mix index (resident acuity)', unit: 'ratio', direction: 'none', state: 'nursing_case_mix_index', decimals: 2 },
    ] },
  { id: 'short_stay', title: 'Short-stay residents (MDS)', blurb: 'Facility-reported assessments, Apr 2025–Mar 2026 (flu vaccine: Jul 2024–Jun 2025).',
    measures: [
      { key: 'qm_434_4q', label: 'Newly received an antipsychotic (QM 434)', unit: 'pct', direction: 'lower', fn: 'qm_434_fn', state: 'percentage_of_short_stay_residents_who_newly_received_an_antipsychotic_medication' },
      { key: 'qm_430_4q', label: 'Pneumococcal vaccine given (QM 430)', unit: 'pct', direction: 'higher', fn: 'qm_430_fn', state: 'percentage_of_short_stay_residents_assessed_and_appropriately_given_the_pneumococcal_vaccine' },
      { key: 'qm_472_4q', label: 'Flu vaccine given (QM 472)', unit: 'pct', direction: 'higher', fn: 'qm_472_fn', state: 'percentage_of_short_stay_residents_who_were_assessed_and_appropriately_given_the_seasonal_influenza_vaccine' },
    ] },
  { id: 'long_stay', title: 'Long-stay residents (MDS)', blurb: 'Facility-reported assessments, Apr 2025–Mar 2026 (flu vaccine: Jul 2024–Jun 2025).',
    measures: [
      { key: 'qm_401_4q', label: 'Need for help with daily activities increased (QM 401)', unit: 'pct', direction: 'lower', fn: 'qm_401_fn', state: 'percentage_of_long_stay_residents_whose_need_for_help_with_daily_activities_has_increased' },
      { key: 'qm_410_4q', label: 'Falls with major injury (QM 410)', unit: 'pct', direction: 'lower', fn: 'qm_410_fn', state: 'percentage_of_long_stay_residents_experiencing_one_or_more_falls_with_major_injury' },
      { key: 'qm_479_4q', label: 'Pressure ulcers (QM 479)', unit: 'pct', direction: 'lower', fn: 'qm_479_fn', state: 'percentage_of_long_stay_residents_with_pressure_ulcers' },
      { key: 'qm_481_4q', label: 'Received an antipsychotic (QM 481)', unit: 'pct', direction: 'lower', fn: 'qm_481_fn', state: 'percentage_of_long_stay_residents_who_received_an_antipsychotic_medication' },
      { key: 'qm_452_4q', label: 'Received an antianxiety or hypnotic (QM 452)', unit: 'pct', direction: 'lower', fn: 'qm_452_fn', state: 'percentage_of_long_stay_residents_who_received_an_antianxiety_or_hypnotic_medication' },
      { key: 'qm_407_4q', label: 'Urinary tract infection (QM 407)', unit: 'pct', direction: 'lower', fn: 'qm_407_fn', state: 'percentage_of_long_stay_residents_with_a_urinary_tract_infection' },
      { key: 'qm_406_4q', label: 'Catheter left in bladder (QM 406)', unit: 'pct', direction: 'lower', fn: 'qm_406_fn', state: 'percentage_of_long_stay_residents_with_a_catheter_inserted_and_left_in_their_bladder' },
      { key: 'qm_451_4q', label: 'Ability to walk worsened (QM 451)', unit: 'pct', direction: 'lower', fn: 'qm_451_fn', state: 'percentage_of_long_stay_residents_whose_ability_to_walk_independently_worsened' },
      { key: 'qm_480_4q', label: 'New or worsened incontinence (QM 480)', unit: 'pct', direction: 'lower', fn: 'qm_480_fn', state: 'percentage_of_long_stay_residents_with_new_or_worsened_bowel_or_bladder_incontinence' },
      { key: 'qm_404_4q', label: 'Lost too much weight (QM 404)', unit: 'pct', direction: 'lower', fn: 'qm_404_fn', state: 'percentage_of_long_stay_residents_who_lose_too_much_weight' },
      { key: 'qm_408_4q', label: 'Depressive symptoms (QM 408)', unit: 'pct', direction: 'lower', fn: 'qm_408_fn', state: 'percentage_of_long_stay_residents_who_have_depressive_symptoms' },
      { key: 'qm_409_4q', label: 'Physically restrained (QM 409)', unit: 'pct', direction: 'lower', fn: 'qm_409_fn', state: 'percentage_of_long_stay_residents_who_were_physically_restrained' },
      { key: 'qm_415_4q', label: 'Pneumococcal vaccine given (QM 415)', unit: 'pct', direction: 'higher', fn: 'qm_415_fn', state: 'percentage_of_long_stay_residents_assessed_and_appropriately_given_the_pneumococcal_vaccine' },
      { key: 'qm_454_4q', label: 'Flu vaccine given (QM 454)', unit: 'pct', direction: 'higher', fn: 'qm_454_fn', state: 'percentage_of_long_stay_residents_assessed_and_appropriately_given_the_seasonal_influenza_vaccine' },
    ] },
]

export const ALL_MEASURES: Measure[] = GROUPS.flatMap(g => g.measures)
export const byKey = (k: string) => ALL_MEASURES.find(m => m.key === k)

/** Columns available in the Explore table (beyond identity). Order = default order in the column picker. */
export interface TableCol { key: string; label: string; short?: string; unit: Unit; width?: number; direction?: Direction; fn?: string; group: string; default?: boolean }
export const IDENTITY_COLS: TableCol[] = [
  { key: 'city_town', label: 'City', unit: 'text', group: 'Facility', width: 140, default: true },
  { key: 'state', label: 'State', unit: 'text', group: 'Facility', width: 56, default: true },
  { key: 'county_parish', label: 'County', unit: 'text', group: 'Facility', width: 120 },
  { key: 'zip_code', label: 'ZIP', unit: 'text', group: 'Facility', width: 64 },
  { key: 'number_of_certified_beds', label: 'Beds', unit: 'count', group: 'Facility', width: 60, default: true },
  { key: 'average_number_of_residents_per_day', label: 'Residents / day', unit: 'count', group: 'Facility', width: 90 },
  { key: 'ownership_type', label: 'Ownership', unit: 'text', group: 'Facility', width: 150, default: true },
  { key: 'chain_name', label: 'Chain', unit: 'text', group: 'Facility', width: 170 },
  { key: 'provider_type', label: 'Certification', unit: 'text', group: 'Facility', width: 150 },
  { key: 'provider_resides_in_hospital', label: 'In a hospital', unit: 'text', group: 'Facility', width: 80 },
  { key: 'special_focus_status', label: 'Special focus', unit: 'text', group: 'Facility', width: 100, default: true },
  { key: 'abuse_icon', label: 'Abuse icon', unit: 'text', group: 'Facility', width: 70 },
  { key: 'high_performing_icon', label: 'High performing', unit: 'text', group: 'Facility', width: 90 },
  { key: 'vbp_in_program', label: 'In VBP', unit: 'text', group: 'Facility', width: 60 },
]
const DEFAULT_MEASURE_COLS = new Set(['qm_521_adj', 'qrp_004_ppr_pd_rsrr', 'qrp_005_dtc_rs_rate', 'pen_total_fines_usd', 'hc_n_severity_G_or_worse', 'reported_total_nurse_staffing_hours_per_resident_per_day'])
export const MEASURE_COLS: TableCol[] = [
  ...GROUPS.filter(g => g.id !== 'ratings').flatMap(g => g.measures.map(m => ({ key: m.key, label: m.label, short: m.short, unit: m.unit, direction: m.direction, fn: m.fn, group: g.title, width: m.unit === 'usd' ? 110 : 96, default: DEFAULT_MEASURE_COLS.has(m.key) } as TableCol))),
  { key: 'hc_n_severity_G_or_worse', label: 'Harm or jeopardy deficiencies (G–L), three cycles', short: 'G–L deficiencies (3 cycles)', unit: 'count', direction: 'lower', group: 'Inspections, penalties and complaints', width: 96, default: true },
]
export const TABLE_COLS: TableCol[] = [...IDENTITY_COLS, ...MEASURE_COLS]
export const colByKey = (k: string) => TABLE_COLS.find(c => c.key === k)
