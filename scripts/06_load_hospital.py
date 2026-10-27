"""Hospital layer: load the CMS hospital files into db/snf.duckdb, type them losslessly, build the service-area model,
and join to the nursing-home universe. Re-runnable (drops and recreates its own tables only).
Usage: python3 scripts/06_load_hospital.py
Sources (scripts/05_download_hospital.sh): HSAF 2025, Medicare Inpatient Hospitals by Provider 2024, PAC PUF SNF 2024,
Care Compare Hospital General Information / Spending by Claim / Unplanned Hospital Visits / HRRP (Sep 2026 refresh).
"""
import duckdb, csv, re, json, os
ROOT="/home/claude/snf-intel"; RAW=f"{ROOT}/raw/hospital"; DB=f"{ROOT}/db/snf.duckdb"
con=duckdb.connect(DB)
LOG=[]
def snake(h):
    s=re.sub(r"[^0-9A-Za-z]+","_",h.strip().replace("%","pct")).strip("_").lower(); s=re.sub(r"_+","_",s)
    return ("c_"+s) if re.match(r"^\d",s) else s
def load(table, fname, expected=None):
    path=f"{RAW}/{fname}"
    hdr=next(csv.reader(open(path,newline="",encoding="utf-8-sig")))
    names=[]; seen={}
    for h in hdr:
        s=snake(h)
        if s in seen: seen[s]+=1; s=f"{s}_{seen[s]}"
        else: seen[s]=0
        names.append(s)
    sel=", ".join(f'"{h}" AS {s}' for h,s in zip(hdr,names))
    con.execute(f"DROP TABLE IF EXISTS {table}")
    con.execute(f"CREATE TABLE {table} AS SELECT {sel} FROM read_csv('{path}', header=true, all_varchar=true, sample_size=-1)")
    n=con.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
    if expected is not None: assert n==expected, (table,n,expected)
    print(f"  {table:<28}{n:>10,} rows"); return names
def cast(table,col,typ,using,sentinels=()):
    sent=" AND ".join([f"{col} <> '{x}'" for x in sentinels]) or "TRUE"
    raw=con.execute(f"SELECT count(*) FROM {table} WHERE {col} IS NOT NULL AND {col}<>'' AND {sent}").fetchone()[0]
    con.execute(f"ALTER TABLE {table} ALTER {col} TYPE {typ} USING {using}")
    kept=con.execute(f"SELECT count({col}) FROM {table}").fetchone()[0]
    assert kept==raw, f"{table}.{col}: {raw-kept} values lost in cast"
    LOG.append((table,col,typ,raw,kept,",".join(sentinels)))

print("== Loading")
load("hsaf_raw","Hospital_Service_Area_2025.csv",1175708)   # equals the API found_rows
load("hosp_inpatient","Medicare_Inpatient_Hospitals_by_Provider_2024.csv",3044)
load("hosp_info","Hospital_General_Information.csv",5419)
load("hosp_spending_by_claim","Hospital_Spending_by_Claim.csv")
load("hosp_unplanned_visits","Unplanned_Hospital_Visits.csv")
load("hosp_hrrp","Hospital_Readmissions_Reduction_Program.csv")
load("pacpuf_snf","PACPUF_SNF_2024_main.csv")

# ---------- HSAF: typed, suppression explicit ----------
print("== HSAF typing")
con.execute("DROP TABLE IF EXISTS hsaf")
con.execute("""CREATE TABLE hsaf AS SELECT medicare_prov_num AS hospital_ccn, zip_cd_of_residence AS zip,
  CASE WHEN total_cases='*' THEN NULL ELSE TRY_CAST(total_cases AS INTEGER) END AS cases,
  CASE WHEN total_days_of_care='*' THEN NULL ELSE TRY_CAST(total_days_of_care AS INTEGER) END AS days,
  CASE WHEN total_charges='*' THEN NULL ELSE TRY_CAST(total_charges AS DOUBLE) END AS charges,
  (total_cases='*') AS suppressed, 2025 AS year FROM hsaf_raw""")
r=con.execute("SELECT count(*), count(*) FILTER (WHERE suppressed), count(cases), min(cases), count(*) FILTER (WHERE NOT suppressed AND cases IS NULL) FROM hsaf").fetchone()
assert r[1]+r[2]==r[0] and r[4]==0 and r[3]>=11, r
print(f"  rows {r[0]:,}; suppressed {r[1]:,}; visible {r[2]:,}; min visible cases {r[3]}")
con.execute("DROP TABLE hsaf_raw")

# ---------- hospital master ----------
print("== Hospital master")
for c in ["hospital_overall_rating","mort_group_measure_count","count_of_facility_mort_measures","count_of_mort_measures_better","count_of_mort_measures_no_different","count_of_mort_measures_worse",
          "safety_group_measure_count","count_of_facility_safety_measures","count_of_safety_measures_better","count_of_safety_measures_no_different","count_of_safety_measures_worse",
          "readm_group_measure_count","count_of_facility_readm_measures","count_of_readm_measures_better","count_of_readm_measures_no_different","count_of_readm_measures_worse",
          "pt_exp_group_measure_count","count_of_facility_pt_exp_measures","te_group_measure_count","count_of_facility_te_measures"]:
    cast("hosp_info",c,"DOUBLE",f"TRY_CAST({c} AS DOUBLE)",sentinels=("Not Available",))
num_inp=[c for c in con.execute("DESCRIBE hosp_inpatient").df().column_name if c.startswith(("tot_","bene_")) and c not in ("bene_avg_age",)]+["bene_avg_age"]
for c in num_inp: cast("hosp_inpatient",c,"DOUBLE",f"TRY_CAST({c} AS DOUBLE)")
# spending by claim: SNF share of post-discharge spend
for c in ["avg_spndg_per_ep_hospital","avg_spndg_per_ep_state","avg_spndg_per_ep_national"]: cast("hosp_spending_by_claim",c,"DOUBLE",f"TRY_CAST({c} AS DOUBLE)",sentinels=("Not Available",))
for c in ["percent_of_spndg_hospital","percent_of_spndg_state","percent_of_spndg_national"]: cast("hosp_spending_by_claim",c,"DOUBLE",f"TRY_CAST(replace({c},'%','') AS DOUBLE)",sentinels=("Not Available",))
for c in ["score","denominator","number_of_patients","number_of_patients_returned"]: cast("hosp_unplanned_visits",c,"DOUBLE",f"TRY_CAST({c} AS DOUBLE)",sentinels=("Not Available","Too Few to Report","Not Applicable"))
for c in ["excess_readmission_ratio","predicted_readmission_rate","expected_readmission_rate"]: cast("hosp_hrrp",c,"DOUBLE",f"TRY_CAST({c} AS DOUBLE)",sentinels=("N/A","Too Few to Report"))
for c in ["number_of_discharges","number_of_readmissions"]: cast("hosp_hrrp",c,"DOUBLE",f"TRY_CAST({c} AS DOUBLE)",sentinels=("N/A","Too Few to Report"))
con.execute("DROP TABLE IF EXISTS hosp_snf_spend")
con.execute("""CREATE TABLE hosp_snf_spend AS SELECT facility_id AS hospital_ccn,
  max(CASE WHEN claim_type='Skilled Nursing Facility' AND period='1 through 30 days After Discharge from Index Hospital Admission' THEN avg_spndg_per_ep_hospital END) AS snf_spend_30d_per_episode,
  max(CASE WHEN claim_type='Skilled Nursing Facility' AND period='1 through 30 days After Discharge from Index Hospital Admission' THEN avg_spndg_per_ep_national END) AS snf_spend_30d_per_episode_national,
  max(CASE WHEN claim_type='Skilled Nursing Facility' AND period='1 through 30 days After Discharge from Index Hospital Admission' THEN percent_of_spndg_hospital END) AS snf_spend_30d_pct_of_episode,
  max(CASE WHEN claim_type='Skilled Nursing Facility' AND period='1 through 30 days After Discharge from Index Hospital Admission' THEN percent_of_spndg_national END) AS snf_spend_30d_pct_of_episode_national,
  max(CASE WHEN claim_type='Total' AND period='Complete Episode' THEN avg_spndg_per_ep_hospital END) AS total_spend_per_episode,
  max(CASE WHEN claim_type='Total' AND period='Complete Episode' THEN avg_spndg_per_ep_national END) AS total_spend_per_episode_national,
  any_value(start_date)||'..'||any_value(end_date) AS period
  FROM hosp_spending_by_claim GROUP BY facility_id""")
con.execute("DROP TABLE IF EXISTS hosp_readmit")
con.execute("""CREATE TABLE hosp_readmit AS SELECT facility_id AS hospital_ccn,
  max(CASE WHEN measure_id='Hybrid_HWR' THEN score END) AS hwr_readmission_rate,
  max(CASE WHEN measure_id='Hybrid_HWR' THEN compared_to_national END) AS hwr_vs_national,
  max(CASE WHEN measure_id='Hybrid_HWR' THEN footnote END) AS hwr_footnote,
  max(CASE WHEN measure_id='READM_30_HF' THEN score END) AS readm_hf, max(CASE WHEN measure_id='READM_30_PN' THEN score END) AS readm_pn,
  max(CASE WHEN measure_id='READM_30_AMI' THEN score END) AS readm_ami, max(CASE WHEN measure_id='READM_30_COPD' THEN score END) AS readm_copd,
  max(CASE WHEN measure_id='READM_30_HIP_KNEE' THEN score END) AS readm_hip_knee,
  any_value(CASE WHEN measure_id='Hybrid_HWR' THEN start_date||'..'||end_date END) AS hwr_period
  FROM hosp_unplanned_visits GROUP BY facility_id""")
con.execute("DROP TABLE IF EXISTS hospital_master")
con.execute("""CREATE TABLE hospital_master AS
SELECT g.facility_id AS hospital_ccn, g.facility_name AS hospital_name, g.address, g.city_town AS city, g.state, g.zip_code AS zip, g.county_parish AS county,
       g.hospital_type, g.hospital_ownership, g.emergency_services, g.hospital_overall_rating, g.hospital_overall_rating_footnote,
       g.count_of_facility_readm_measures, g.count_of_readm_measures_better, g.count_of_readm_measures_no_different, g.count_of_readm_measures_worse,
       i.tot_dschrgs AS medicare_discharges_2024, i.tot_benes AS medicare_beneficiaries_2024, i.tot_mdcr_pymt_amt AS medicare_payment_2024, i.tot_days AS medicare_days_2024,
       i.bene_avg_age, i.bene_dual_cnt / nullif(i.tot_benes,0) AS dual_eligible_share, i.rndrng_prvdr_ruca_desc AS ruca,
       s.snf_spend_30d_per_episode, s.snf_spend_30d_per_episode_national, s.snf_spend_30d_pct_of_episode, s.snf_spend_30d_pct_of_episode_national, s.total_spend_per_episode, s.total_spend_per_episode_national,
       r.hwr_readmission_rate, r.hwr_vs_national, r.hwr_footnote, r.readm_hf, r.readm_pn, r.readm_ami, r.readm_copd, r.readm_hip_knee,
       h.n_zips_visible, h.cases_visible, h.n_zips_total
FROM hosp_info g
LEFT JOIN hosp_inpatient i ON i.rndrng_prvdr_ccn = g.facility_id
LEFT JOIN hosp_snf_spend s ON s.hospital_ccn = g.facility_id
LEFT JOIN hosp_readmit r ON r.hospital_ccn = g.facility_id
LEFT JOIN (SELECT hospital_ccn, count(*) FILTER (WHERE NOT suppressed) AS n_zips_visible, sum(cases) AS cases_visible, count(*) AS n_zips_total FROM hsaf GROUP BY hospital_ccn) h ON h.hospital_ccn = g.facility_id""")
n=con.execute("SELECT count(*), count(DISTINCT hospital_ccn), count(medicare_discharges_2024), count(cases_visible), count(hwr_readmission_rate), count(snf_spend_30d_per_episode) FROM hospital_master").fetchone()
print(f"  hospitals {n[0]:,} (distinct {n[1]:,}); with 2024 inpatient volume {n[2]:,}; with service-area data {n[3]:,}; with HWR readmission {n[4]:,}; with SNF spend {n[5]:,}")
# hospitals in HSAF but not in Care Compare list
orphan=con.execute("SELECT count(DISTINCT h.hospital_ccn) FROM hsaf h LEFT JOIN hosp_info g ON g.facility_id=h.hospital_ccn WHERE g.facility_id IS NULL").fetchone()[0]
print(f"  HSAF providers not in the Care Compare hospital list: {orphan:,} (kept in hsaf, not in hospital_master)")

# ---------- service areas ----------
print("== Service areas")
con.execute("DROP TABLE IF EXISTS hospital_service_area")
con.execute("""CREATE TABLE hospital_service_area AS
WITH v AS (SELECT hospital_ccn, zip, cases, days, charges FROM hsaf WHERE NOT suppressed AND zip <> ''),
t AS (SELECT hospital_ccn, sum(cases) AS tot FROM v GROUP BY hospital_ccn)
SELECT v.hospital_ccn, v.zip, v.cases, v.days, v.charges, v.cases * 1.0 / t.tot AS share_of_visible_cases,
       sum(v.cases) OVER (PARTITION BY v.hospital_ccn ORDER BY v.cases DESC, v.zip ROWS UNBOUNDED PRECEDING) * 1.0 / t.tot AS cumulative_share,
       row_number() OVER (PARTITION BY v.hospital_ccn ORDER BY v.cases DESC, v.zip) AS zip_rank
FROM v JOIN t USING (hospital_ccn)""")
r=con.execute("SELECT count(*), count(DISTINCT hospital_ccn), round(sum(share_of_visible_cases)/count(DISTINCT hospital_ccn),6) FROM hospital_service_area").fetchone()
assert abs(r[2]-1.0)<1e-6, r
print(f"  {r[0]:,} hospital-ZIP rows, {r[1]:,} hospitals; shares sum to 1 per hospital")

# ---------- SNF volume (PAC PUF) ----------
print("== SNF Medicare utilization (PAC PUF 2024)")
for c in ["bene_dstnct_cnt","tot_epsd_stay_cnt","tot_srvc_days","tot_chrg_amt","tot_alowd_amt","tot_mdcr_pymt_amt","tot_mdcr_stdzd_pymt_amt","bene_dual_pct","bene_avg_age","bene_avg_risk_scre"]:
    cast("pacpuf_snf",c,"DOUBLE",f"TRY_CAST({c} AS DOUBLE)",sentinels=("*","+"))
con.execute("DROP TABLE IF EXISTS snf_utilization")
con.execute("""CREATE TABLE snf_utilization AS SELECT prvdr_id AS ccn, bene_dstnct_cnt AS medicare_beneficiaries_2024, tot_epsd_stay_cnt AS medicare_stays_2024, tot_srvc_days AS medicare_days_2024,
  tot_mdcr_pymt_amt AS medicare_payment_2024, tot_mdcr_stdzd_pymt_amt AS medicare_std_payment_2024, bene_dual_pct AS dual_eligible_pct, bene_avg_risk_scre AS avg_risk_score, bene_avg_age AS avg_age
  FROM pacpuf_snf WHERE smry_ctgry='PROVIDER'""")
m=con.execute("SELECT count(*), count(*) FILTER (WHERE ccn IN (SELECT ccn FROM facility_master)) FROM snf_utilization").fetchone()
print(f"  {m[0]:,} SNF rows; {m[1]:,} match the nursing-home universe")
nat=con.execute("SELECT tot_epsd_stay_cnt, tot_mdcr_pymt_amt, bene_dstnct_cnt FROM pacpuf_snf WHERE smry_ctgry='NATION'").fetchone()
print(f"  national row: stays {nat[0]:,.0f}, payment ${nat[1]:,.0f}, beneficiaries {nat[2]:,.0f}")

# ---------- SNF ↔ hospital service-area membership (observed geography + modeled weights) ----------
print("== SNF in service area (modeled)")
con.execute("DROP TABLE IF EXISTS snf_hospital_area")
con.execute("""CREATE TABLE snf_hospital_area AS
WITH s AS (SELECT f.ccn, f.zip_code AS zip, coalesce(u.medicare_stays_2024, 0) AS stays FROM facility_master f LEFT JOIN snf_utilization u USING (ccn)),
z AS (SELECT zip, sum(stays) AS zip_stays, count(*) AS zip_snfs FROM s GROUP BY zip)
SELECT a.hospital_ccn, s.ccn, a.zip, a.cases AS hospital_cases_from_zip, a.share_of_visible_cases AS zip_share, a.zip_rank, a.cumulative_share,
       s.stays AS snf_medicare_stays_2024, z.zip_snfs,
       -- modeled: the hospital's volume from this ZIP is split among the ZIP's SNFs in proportion to their Medicare stays (equal split if none have volume)
       a.share_of_visible_cases * (CASE WHEN z.zip_stays > 0 THEN s.stays / z.zip_stays ELSE 1.0 / z.zip_snfs END) AS modeled_weight
FROM hospital_service_area a JOIN s ON s.zip = a.zip JOIN z ON z.zip = a.zip""")
r=con.execute("SELECT count(*), count(DISTINCT hospital_ccn), count(DISTINCT ccn) FROM snf_hospital_area").fetchone()
print(f"  {r[0]:,} hospital-SNF pairs; {r[1]:,} hospitals; {r[2]:,} SNFs appear in at least one service area")
# sanity: Hopkins
hk=con.execute("""SELECT count(*), round(sum(modeled_weight),4) FROM snf_hospital_area WHERE hospital_ccn='210009'""").fetchone()
print(f"  Johns Hopkins Hospital (210009): {hk[0]} SNFs in visible service-area ZIPs; modeled weights sum to {hk[1]} (share of visible volume whose ZIP contains ≥1 SNF)")

with open(f"{ROOT}/db/cast_log_hospital.csv","w",newline="") as fh:
    w=csv.writer(fh); w.writerow(["table","column","type","raw_nonblank_nonsentinel","typed_nonnull","sentinels"]); w.writerows(LOG)
print(f"  {len(LOG)} casts, all lossless")
con.close(); print("DONE")
