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
open(f"{OUT}/discharge_flows_template.csv","w").write("hospital_ccn,hospital_name,snf_ccn,period_start,period_end,n_discharges\n210009,Johns Hopkins Hospital (example row - delete),215001,2025-01-01,2025-12-31,0\n")
print("footnotes:", len(fn), "| lineage rows:", len(lin), "| done")
