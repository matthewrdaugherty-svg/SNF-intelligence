"""Export data assets for the web app from db/snf.duckdb and the validated workbook.
Writes app/public/data/*.parquet and *.json. Usage: python3 scripts/04_export_app_data.py
"""
import duckdb, pandas as pd, json, os, re, glob
import pyarrow as pa, pyarrow.feather as feather, pyarrow.compute as pc
ROOT="/home/claude/snf-intel"; OUT=f"{ROOT}/app/public/data"; os.makedirs(OUT, exist_ok=True)
con=duckdb.connect(f"{ROOT}/db/snf.duckdb", read_only=True)
for old in glob.glob(f"{OUT}/*.parquet"): os.remove(old)
def pq(sql, name):
    """Write an uncompressed Arrow IPC file (the browser's DuckDB reads Arrow natively; Parquet would need a runtime extension download)."""
    t=con.sql(sql).to_arrow_table()
    cols=[pc.dictionary_encode(t[f.name]) if pa.types.is_string(f.type) else t[f.name] for f in t.schema]
    t=pa.table(cols, names=t.column_names)
    feather.write_feather(t, f"{OUT}/{name}.arrow", compression="uncompressed")
    print(f"  {name}.arrow  {t.num_rows:,} rows x {t.num_columns} cols  {os.path.getsize(f'{OUT}/{name}.arrow')/1e6:.1f} MB")
_fm_cols=[r[0] for r in con.execute("DESCRIBE facility_master").fetchall()]
_fm_drop={c for c in _fm_cols if c.endswith(('_2_5','_97_5','_2_5_fn','_97_5_fn')) or c in ('location','telephone_number','provider_ssa_county_code','processing_date','geocoding_footnote')}
pq(f"SELECT {', '.join(c for c in _fm_cols if c not in _fm_drop)} FROM facility_master", "facility_master")
pq("SELECT ccn, penalty_date, penalty_type, fine_amount, payment_denial_start_date, payment_denial_length_in_days FROM penalties", "penalties")
pq("""SELECT ccn, survey_date, inspection_cycle, deficiency_tag_number, deficiency_description, deficiency_category, scope_severity_code,
       standard_deficiency, complaint_deficiency, infection_control_inspection_deficiency, deficiency_corrected, correction_date, citation_under_idr, citation_under_iidr
       FROM health_citations WHERE scope_severity_code IN ('G','H','I','J','K','L')""", "citations_gl")
pq("SELECT * FROM state_averages", "state_averages")
pq("SELECT * FROM inspection_cutpoints", "inspection_cutpoints")
pq("SELECT ccn, role_played_by_owner_or_manager_in_facility AS role, owner_type, owner_name, ownership_percentage_raw, association_date FROM ownership WHERE role LIKE '%OWNERSHIP INTEREST%' OR role LIKE '%OPERATIONAL/MANAGERIAL CONTROL%' OR role LIKE '%PARTNERSHIP%'", "ownership")
# measure catalog + intervals
cat = con.execute("SELECT * FROM measure_catalog ORDER BY source, measure_code").df()
cat.to_json(f"{OUT}/measure_catalog.json", orient="records", indent=0)
con.execute("SELECT * FROM collection_intervals").df().to_json(f"{OUT}/collection_intervals.json", orient="records")
# lineage from the validated workbook
wb=f"{ROOT}/output/SNF_Intelligence_CareCompare_Sep2026.xlsx"
lin = pd.read_excel(wb, sheet_name="LINEAGE_FacilityMaster")
lin.to_json(f"{OUT}/lineage.json", orient="records", indent=0)
pd.read_excel(wb, sheet_name="LIMITATIONS").iloc[:,0].tolist()
json.dump(pd.read_excel(wb, sheet_name="LIMITATIONS").iloc[:,0].tolist(), open(f"{OUT}/limitations.json","w"), indent=1)
json.dump(pd.read_excel(wb, sheet_name="README").iloc[:,0].tolist(), open(f"{OUT}/readme.json","w"), indent=1)
pd.read_excel(wb, sheet_name="RECONCILIATION").to_json(f"{OUT}/reconciliation.json", orient="records", indent=0)
# footnote codes from the dictionary digest (section 7 table)
txt=open(f"{ROOT}/docs/DATA_DICTIONARY_DIGEST.md").read()
sec=txt.split("## 7. FOOTNOTE CODES")[1].split("## 8.")[0]
fn={}
for line in sec.splitlines():
    m=re.match(r"\|\s*(\d+)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|$", line)
    if m: fn[m.group(1)]={"meaning":m.group(2),"applies_to":m.group(3)}
assert len(fn)>=19, len(fn)
json.dump(fn, open(f"{OUT}/footnotes.json","w"), indent=1)
# national/state context: nation row of state_averages + VBP aggregate + QRP national
nat = con.execute("SELECT * FROM qrp_national").df(); nat.to_json(f"{OUT}/qrp_national.json", orient="records")
con.execute("SELECT * FROM vbp_aggregate").df().to_json(f"{OUT}/vbp_aggregate.json", orient="records")
# the DRG → family / chapter mapping, so the Methods page can show it (Validation Report 06, finding 13)
con.execute("SELECT f.drg, m.title, m.mdc, f.family, f.chapter FROM drg_family f JOIN msdrg m USING (drg) ORDER BY f.family, f.drg").df().to_json(f"{OUT}/drg_families.json", orient="records")
meta={"data_vintage":"2026-09-01","release":"2026-09-30 (nursing home + SNF QRP provider files); SNF VBP FY2026 facility file 2025-11-01",
      "n_facilities":int(con.execute("SELECT count(*) FROM facility_master").fetchone()[0]),
      "window_12m_start":"2025-09-01","built":pd.Timestamp.today().strftime("%Y-%m-%d"),
      "validation":"docs/VALIDATION_REPORT_01.md, _02.md — all Facility_Master values matched raw CMS files for all 14,690 facilities; 5 facilities matched the live CMS API"}
json.dump(meta, open(f"{OUT}/meta.json","w"), indent=1)
# discharge_flows plug-in: schema + empty parquet + sample CSV
con.execute("""CREATE TEMP TABLE df_schema (hospital_ccn VARCHAR, hospital_name VARCHAR, snf_ccn VARCHAR, period_start DATE, period_end DATE, n_discharges INTEGER, source VARCHAR, method VARCHAR, loaded_at DATE)""")
# (user_flows is created in the app from the same schema; no empty file shipped)
# ---- hospital layer (scripts/06_load_hospital.py) ----
pq("""SELECT hospital_ccn, hospital_name, address, city, state, zip, county, hospital_type, hospital_ownership, emergency_services, hospital_overall_rating, hospital_overall_rating_footnote,
       count_of_facility_readm_measures, count_of_readm_measures_better, count_of_readm_measures_no_different, count_of_readm_measures_worse,
       medicare_discharges_2024, medicare_beneficiaries_2024, medicare_payment_2024, medicare_days_2024, bene_avg_age, dual_eligible_share, ruca,
       snf_spend_30d_per_episode, snf_spend_30d_per_episode_national, snf_spend_30d_pct_of_episode, snf_spend_30d_pct_of_episode_national, total_spend_per_episode, total_spend_per_episode_national,
       readm_hf, readm_pn, readm_ami, readm_copd, readm_hip_knee, n_zips_visible, cases_visible, n_zips_total FROM hospital_master""", "hospital_master")
pq("SELECT hospital_ccn, zip, cases, days, charges, share_of_visible_cases, cumulative_share, zip_rank FROM hospital_service_area", "hospital_service_area")
pq("SELECT * FROM snf_utilization", "snf_utilization")
# Services layer (scripts/09_load_ltc671.py, CMS-671 Q2 2026)
pq("""SELECT ccn, certification_detail, hospital_based, multi_facility, ccrc, ltc671_certification_date, beds_ventilator, beds_dialysis, beds_alzheimers, beds_hospice, beds_head_trauma, beds_rehab,
       beds_aids, beds_huntingtons, beds_pediatric, census_medicare, census_medicaid, census_other, census_total, census_unreliable, census_medicare_share, census_medicaid_share, resident_council, family_council
       FROM snf_services WHERE in_facility_master""", "snf_services")
# ZIP centroids (scripts/12_load_zip_centroids.py; Census 2024 ZCTA Gazetteer)
pq("SELECT zip, lat, lng FROM zip_centroids WHERE zip IN (SELECT zip FROM hospital_service_area) OR zip IN (SELECT zip_code FROM facility_master)", "zip_centroids")
# Discharge mix layer (scripts/11_load_drg.py)
pq("SELECT hospital_ccn, family, discharges, share_of_visible, avg_medicare_payment FROM hospital_drg_mix", "hospital_drg_mix")
pq("SELECT hospital_ccn, chapter, discharges, share FROM hospital_chapter_mix", "hospital_chapter_mix")
pq("SELECT ccn, chapter, share FROM snf_chapter_mix WHERE ccn IN (SELECT ccn FROM facility_master)", "snf_chapter_mix")
pq("""SELECT p.prvdr_id AS ccn, TRY_CAST(p.bene_avg_risk_scre AS DOUBLE) AS avg_risk_score, TRY_CAST(p.bene_avg_age AS DOUBLE) AS avg_age, TRY_CAST(p.bene_dual_pct AS DOUBLE) AS dual_pct,
       TRY_CAST(p.bene_cc_bh_alz_nonalzdem_v2_pct AS DOUBLE) AS cc_dementia_pct, TRY_CAST(p.bene_cc_ph_hf_nonihd_v2_pct AS DOUBLE) AS cc_heart_failure_pct, TRY_CAST(p.bene_cc_ph_copd_v2_pct AS DOUBLE) AS cc_copd_pct,
       TRY_CAST(p.bene_cc_ph_ckd_v2_pct AS DOUBLE) AS cc_ckd_pct, TRY_CAST(p.bene_cc_ph_diabetes_v2_pct AS DOUBLE) AS cc_diabetes_pct, TRY_CAST(p.bene_cc_ph_stroke_tia_v2_pct AS DOUBLE) AS cc_stroke_pct,
       TRY_CAST(p.bene_cc_bh_depress_v1_pct AS DOUBLE) AS cc_depression_pct, TRY_CAST(p.bene_cc_bh_schizo_othpsy_v1_pct AS DOUBLE) AS cc_psychosis_pct
       FROM pacpuf_snf p WHERE p.smry_ctgry='PROVIDER' AND p.srvc_ctgry='SNF' AND p.prvdr_id IN (SELECT ccn FROM facility_master)""", "snf_patient_mix")
# PECOS ownership layer (scripts/07_load_pecos.py)
pq("SELECT owner_id, system_name, n_hospitals_enrolled, n_hospitals_in_care_compare, n_hospitals_with_service_area, n_state_codes FROM hospital_system WHERE n_hospitals_in_care_compare > 0", "hospital_system")
pq("SELECT family_id, label, n_member_orgs, aliases, n_hospitals, n_with_service_area, n_states, n_minority_stakes FROM hospital_family WHERE n_hospitals > 0", "hospital_family")
pq("SELECT family_id, hospital_ccn, state, has_service_area, direct, pct_max, controlled FROM hospital_family_member", "hospital_family_member")
pq("SELECT hospital_ccn, owner_id, owner_name, role_code, role_text, pct, since FROM hospital_owner_org WHERE in_hospital_master", "hospital_owner_org")
pq("""SELECT ccn, legal_entity, dba, affiliation_entity_name, affiliation_entity_id, proprietary_nonprofit, organization_type_structure, incorporation_date,
       n_org_owners, n_individual_owners, n_managing_control, any_private_equity_owner, any_reit_owner, n_chow_since_2016, last_chow_date, last_buyer, last_seller
       FROM snf_pecos WHERE in_facility_master""", "snf_pecos")
hm=json.load(open(f"{OUT}/meta.json")); hm.update({"hospital_layer": {"service_area_year": 2025, "inpatient_year": 2024, "pacpuf_year": 2024, "care_compare_hospitals_release": "2026-07-22 (general info), 2026-09-10 (unplanned visits), 2026-01-26 (spending by claim)",
  "zip_centroids": "U.S. Census Bureau 2024 ZCTA Gazetteer (www2.census.gov); 99.3% of service-area cases have a centroid", "drg_release": "Medicare Inpatient Hospitals by Provider and Service, calendar 2024 (published 2026-04-23); MS-DRG v42.1 reference", "ltc671_release": "Q2 2026 (CMS-671 Long-Term Care Facility Characteristics, data.cms.gov, published 2026-07-29)", "pecos_release": "2026-09-29 (Hospital/SNF All Owners, Enrollments, Change of Ownership; data.cms.gov)", "hwr_note": "The hospital-wide readmission measure (Hybrid HWR) is 'Not Available' for every hospital in this release (CMS footnote 4); condition-specific 30-day readmission rates are shown instead."}})
json.dump(hm, open(f"{OUT}/meta.json","w"), indent=1)
open(f"{OUT}/discharge_flows_template.csv","w").write("hospital_ccn,hospital_name,snf_ccn,period_start,period_end,n_discharges\n210009,Johns Hopkins Hospital (example row - delete),215001,2025-01-01,2025-12-31,0\n")
print("footnotes:", len(fn), "| lineage rows:", len(lin), "| done")

# ---------------------------------------------------------------- underwriting layer (scripts/14_load_underwriting.py)
pq("SELECT * FROM uw_county", "uw_county")
pq("SELECT * FROM uw_state", "uw_state")
pq("SELECT ccn, fips, cbsa FROM snf_geo", "snf_geo")
pq("SELECT hospital_ccn, fips, cbsa FROM hospital_geo", "hospital_geo")
pq("""SELECT ccn, name, state, medicare_cbsa, fy_begin, fy_end, period_days, n_reports, type_of_control,
             total_days_title_xviii AS days_medicare, total_days_title_xix AS days_medicaid, total_days_other AS days_other, total_days_total AS days_total,
             number_of_beds AS beds, total_bed_days_available AS bed_days_available, total_discharges_title_xviii AS discharges_medicare, total_discharges_total AS discharges_total,
             total_costs, net_patient_revenue, less_total_operating_expense AS operating_expense, net_income_from_service_to_patients AS net_income_patients, net_income, inpatient_pps_amount
      FROM snf_cost""", "snf_cost")
pq("""SELECT ccn, name, state, medicare_cbsa, fy_begin, fy_end, period_days, n_reports, provider_type, type_of_control,
             total_days_title_xviii AS days_medicare, total_days_title_xix AS days_medicaid, total_days_v_xviii_xix_unknown AS days_total, number_of_beds AS beds, total_bed_days_available AS bed_days_available,
             total_discharges_title_xviii AS discharges_medicare, total_discharges_title_xix AS discharges_medicaid, total_discharges_v_xviii_xix_unknown AS discharges_total,
             total_costs, inpatient_total_charges, combined_outpatient_inpatient_total_charges AS total_charges, cost_to_charge_ratio,
             coalesce(drg_amounts_other_than_outlier_payments, coalesce(drg_amounts_before_october_1, 0) + coalesce(drg_amounts_after_october_1, 0)) AS drg_payments_raw,
             drg_amounts_other_than_outlier_payments, drg_amounts_before_october_1, drg_amounts_after_october_1, outlier_payments_for_discharges AS outlier_payments,
             net_patient_revenue, less_total_operating_expense AS operating_expense, net_income,
             (SELECT hrrp_factor FROM hospital_hrrp h WHERE h.ccn = hospital_cost.ccn) AS hrrp_factor, (SELECT vbp_factor FROM hospital_vbp v WHERE v.ccn = hospital_cost.ccn) AS vbp_factor
      FROM hospital_cost""", "hospital_cost")
# visible enrollment only: plan-county cells of 10 or fewer are suppressed by CMS and stay out (the count of suppressed cells per county is in uw_county)
pq("""SELECT parent_org, fips, segment, snp, bonus, rebate_pct, stars, basis, CAST(sum(enrollment) AS INTEGER) AS enrollment, CAST(sum(suppressed_cells) AS INTEGER) AS suppressed_cells,
             sum(enr_next) AS enr_next, sum(stars_next_x) AS stars_next_x, sum(enr_next4) AS enr_next4, sum(enr_pay) AS enr_pay, sum(risk_x) AS risk_x, sum(rebate_x) AS rebate_x, sum(base_x) AS base_x, sum(ab_x) AS ab_x, sum(gap_x) AS gap_x
      FROM ma_parent_county GROUP BY ALL HAVING sum(enrollment) IS NOT NULL ORDER BY parent_org, fips""", "ma_parent_county")
um=json.load(open(f"{OUT}/meta.json")); um["underwriting"]=json.load(open(f"{ROOT}/db/underwriting_summary.json"))
json.dump(um, open(f"{OUT}/meta.json","w"), indent=1)
