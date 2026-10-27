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
# PECOS ownership layer (scripts/07_load_pecos.py)
pq("SELECT owner_id, system_name, n_hospitals_enrolled, n_hospitals_in_care_compare, n_hospitals_with_service_area, n_state_codes FROM hospital_system WHERE n_hospitals_in_care_compare > 0", "hospital_system")
pq("SELECT family_id, label, n_member_orgs, aliases, n_hospitals, n_with_service_area, n_states FROM hospital_family", "hospital_family")
pq("SELECT family_id, hospital_ccn, state, has_service_area, direct FROM hospital_family_member", "hospital_family_member")
pq("SELECT hospital_ccn, owner_id, owner_name, role_code, role_text, pct, since FROM hospital_owner_org WHERE in_hospital_master", "hospital_owner_org")
pq("""SELECT ccn, legal_entity, dba, affiliation_entity_name, affiliation_entity_id, proprietary_nonprofit, organization_type_structure, incorporation_date,
       n_org_owners, n_individual_owners, n_managing_control, any_private_equity_owner, any_reit_owner, n_chow_since_2016, last_chow_date, last_buyer, last_seller
       FROM snf_pecos WHERE in_facility_master""", "snf_pecos")
hm=json.load(open(f"{OUT}/meta.json")); hm.update({"hospital_layer": {"service_area_year": 2025, "inpatient_year": 2024, "pacpuf_year": 2024, "care_compare_hospitals_release": "2026-07-22 (general info), 2026-09-10 (unplanned visits), 2026-01-26 (spending by claim)",
  "pecos_release": "2026-09-29 (Hospital/SNF All Owners, Enrollments, Change of Ownership; data.cms.gov)", "hwr_note": "The hospital-wide readmission measure (Hybrid HWR) is 'Not Available' for every hospital in this release (CMS footnote 4); condition-specific 30-day readmission rates are shown instead."}})
json.dump(hm, open(f"{OUT}/meta.json","w"), indent=1)
open(f"{OUT}/discharge_flows_template.csv","w").write("hospital_ccn,hospital_name,snf_ccn,period_start,period_end,n_discharges\n210009,Johns Hopkins Hospital (example row - delete),215001,2025-01-01,2025-12-31,0\n")
print("footnotes:", len(fn), "| lineage rows:", len(lin), "| done")
