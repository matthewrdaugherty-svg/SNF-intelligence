"""Load all raw CMS files into DuckDB, build wide/aggregate tables and the facility master.
Re-runnable from raw. Every step asserts expected counts (see docs/TRUTH_LEDGER.md).
Usage: python3 scripts/02_load.py
"""
import duckdb, re, os, csv, json, sys, datetime
ROOT = "/home/claude/snf-intel"
RAW, DB = f"{ROOT}/raw", f"{ROOT}/db/snf.duckdb"
if os.path.exists(DB): os.remove(DB)
con = duckdb.connect(DB)
N_FAC = 14690  # T-002

FILES = {  # table name -> raw file
 "provider_info":        "4pq5-n9py_2026-09-30_NH_ProviderInfo_Sep2026_3.csv",
 "mds_qm_long":          "djen-97ju_2026-09-30_NH_QualityMsr_MDS_Sep2026_2.csv",
 "claims_qm_long":       "ijh5-nb2v_2026-09-30_NH_QualityMsr_Claims_Sep2026_2.csv",
 "qrp_long":             "fykj-qjee_2026-09-30_Skilled_Nursing_Facility_Quality_Reporting_Program_Provider_Data_Sep2026_2.csv",
 "qrp_national":         "5sqm-2qku_2026-07-01_Skilled_Nursing_Facility_Quality_Reporting_Program_National_Data_Jul2026.csv",
 "swing_bed_long":       "6uyb-waub_2026-07-01_Swing_Bed_SNF_data_Jul2026.csv",
 "penalties":            "g6vv-u9sr_2026-09-30_NH_Penalties_Sep2026_2.csv",
 "ownership":            "y2hd-n93e_2026-09-30_NH_Ownership_Sep2026_2.csv",
 "health_citations":     "r5ix-sfxw_2026-09-30_NH_HealthCitations_Sep2026_2.csv",
 "fire_citations":       "ifjz-ge4w_2026-09-30_NH_FireSafetyCitations_Sep2026_2.csv",
 "survey_summary":       "tbry-pc2d_2026-09-30_NH_SurveySummary_Sep2026_2.csv",
 "survey_dates":         "svdt-c123_2026-09-30_NH_SurveyDates_Sep2026_2.csv",
 "state_averages":       "xcdc-v8bm_2026-09-30_NH_StateUSAverages_Sep2026_2.csv",
 "inspection_cutpoints": "hicp-9999_2026-09-30_NH_HlthInspecCutpointsState_Sep2026_2.csv",
 "citation_descriptions":"tagd-9999_2026-09-30_NH_CitationDescriptions_Sep2026_2.csv",
 "collection_intervals": "qmdc-9999_2026-09-30_NH_DataCollectionIntervals_Sep2026_2.csv",
 "vbp_facility":         "284v-j9fz_2025-11-01_FY_2026_SNF_VBP_Facility_Performance.csv",
 "vbp_aggregate":        "ujcx-uaut_2025-12-02_FY_2026_SNF_VBP_Aggregate_Performance.csv",
}
EXPECTED_ROWS = {"provider_info":14690,"mds_qm_long":249730,"claims_qm_long":58760,"qrp_long":837330,"qrp_national":27,
 "swing_bed_long":43548,"penalties":15419,"ownership":251314,"health_citations":418947,"fire_citations":200188,
 "survey_summary":43942,"survey_dates":149330,"state_averages":54,"inspection_cutpoints":53,"citation_descriptions":643,
 "collection_intervals":47,"vbp_facility":13900,"vbp_aggregate":1}

def snake(h):
    s = h.strip()
    s = s.replace("CMS Certification Number (CCN)", "ccn").replace("%","pct").replace("/", "_").replace("&","and")
    s = re.sub(r"[^0-9A-Za-z]+", "_", s).strip("_").lower()
    s = re.sub(r"_+", "_", s)
    if re.match(r"^\d", s): s = "c_" + s
    return s

column_map = []  # (table, original_header, snake)
def load(table, fname):
    path = f"{RAW}/{fname}"
    hdr = next(csv.reader(open(path, newline="", encoding="utf-8-sig")))
    names, seen = [], {}
    for h in hdr:
        s = snake(h)
        if s in seen: seen[s]+=1; s = f"{s}_{seen[s]}"
        else: seen[s]=0
        names.append(s); column_map.append((table, h, s, fname))
    sel = ", ".join(f'"{h}" AS {s}' for h,s in zip(hdr,names))
    con.execute(f"""CREATE TABLE {table} AS SELECT {sel} FROM read_csv('{path}', header=true, all_varchar=true, sample_size=-1)""")
    n = con.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
    assert n == EXPECTED_ROWS[table], f"{table}: {n} rows, expected {EXPECTED_ROWS[table]}"
    if "ccn" in names and table not in ("qrp_national",):
        bad = con.execute(f"SELECT count(*) FROM {table} WHERE ccn IS NULL OR length(ccn)<>6").fetchone()[0]
        assert bad == 0, f"{table}: {bad} bad CCNs"
    print(f"  loaded {table:<22} {n:>9,} rows")

print("== Loading raw tables")
for t,f in FILES.items(): load(t,f)
with open(f"{ROOT}/db/column_map.csv","w",newline="") as fh:
    w=csv.writer(fh); w.writerow(["table","original_header","column","source_file"]); w.writerows(column_map)


def cast(table, col, typ, using, sentinels=()):
    """Lossless cast: every non-blank raw value that is not an explicitly listed sentinel must survive the cast (D-009)."""
    sent = " AND ".join([f"{col} <> '{x}'" for x in sentinels]) or "TRUE"
    raw = con.execute(f"SELECT count(*) FROM {table} WHERE {col} IS NOT NULL AND {col}<>'' AND {sent}").fetchone()[0]
    con.execute(f"ALTER TABLE {table} ALTER {col} TYPE {typ} USING {using}")
    kept = con.execute(f"SELECT count({col}) FROM {table}").fetchone()[0]
    assert kept == raw, f"{table}.{col}: {raw-kept} non-blank non-sentinel values lost in cast to {typ}"
    CAST_LOG.append((table, col, typ, raw, kept, ",".join(sentinels)))
CAST_LOG = []

# ---------- numeric casts on provider_info (keep text originals where footnotes apply) ----------
print("== Typing provider_info")
pi_cols = [r[0] for r in con.execute("DESCRIBE provider_info").fetchall()]
DATE_PI = ["rating_cycle_1_standard_survey_health_date","rating_cycle_2_standard_health_survey_date","date_first_approved_to_provide_medicare_and_medicaid_services","processing_date"]
NUM_PI = [c for c in pi_cols if any(k in c for k in ["rating","hours","turnover","number_of","total_","score","index","ratio","beds","residents_per_day","fines","penalties","denials","latitude","longitude","facilities_in_chain","administrators"])
          and not c.endswith("footnote") and c not in DATE_PI and c not in ("provider_resides_in_hospital","chain_name","chain_id")]
print("  numeric-cast columns:", NUM_PI)
for c in NUM_PI: cast("provider_info", c, "DOUBLE", f"TRY_CAST({c} AS DOUBLE)")
for c in DATE_PI: cast("provider_info", c, "DATE", f"TRY_CAST({c} AS DATE)")
con.execute("ALTER TABLE provider_info ADD COLUMN data_vintage DATE"); con.execute("UPDATE provider_info SET data_vintage = processing_date")
PROC = con.execute("SELECT max(processing_date) FROM provider_info").fetchone()[0]
assert con.execute("SELECT count(DISTINCT processing_date) FROM provider_info").fetchone()[0]==1
W12 = PROC.replace(year=PROC.year-1)   # start of CMS's "most recent 12 month" window (matches collection_intervals C_H_CMPL: 09/01/2025)
ci = con.execute("SELECT data_collection_period_from_date FROM collection_intervals WHERE measure_code='C_H_CMPL'").fetchone()[0]
assert ci == W12.strftime("%m/%d/%Y"), (ci, W12)
print(f"  processing date {PROC}; 12-month window starts {W12}")

# ---------- MDS QM wide ----------
print("== MDS QM wide")
codes = [r[0] for r in con.execute("SELECT DISTINCT measure_code FROM mds_qm_long ORDER BY 1").fetchall()]
assert len(codes)==17
sel = ", ".join(
  f"MAX(CASE WHEN measure_code='{c}' THEN TRY_CAST(four_quarter_average_score AS DOUBLE) END) AS qm_{c}_4q, "
  f"MAX(CASE WHEN measure_code='{c}' THEN footnote_for_four_quarter_average_score END) AS qm_{c}_fn" for c in codes)
con.execute(f"CREATE TABLE mds_qm_wide AS SELECT ccn, {sel} FROM mds_qm_long GROUP BY ccn")
assert con.execute("SELECT count(*) FROM mds_qm_wide").fetchone()[0]==N_FAC
# quarterly wide for pattern/seasonality work
qsel = ", ".join(f"MAX(CASE WHEN measure_code='{c}' THEN TRY_CAST(q{q}_measure_score AS DOUBLE) END) AS qm_{c}_q{q}" for c in codes for q in (1,2,3,4))
con.execute(f"CREATE TABLE mds_qm_quarterly_wide AS SELECT ccn, {qsel} FROM mds_qm_long GROUP BY ccn")

# ---------- Claims QM wide ----------
print("== Claims QM wide")
ccodes = [r[0] for r in con.execute("SELECT DISTINCT measure_code FROM claims_qm_long ORDER BY 1").fetchall()]
assert ccodes==['521','522','551','552'], ccodes
sel = ", ".join(
  f"MAX(CASE WHEN measure_code='{c}' THEN TRY_CAST(adjusted_score AS DOUBLE) END) AS qm_{c}_adj, "
  f"MAX(CASE WHEN measure_code='{c}' THEN TRY_CAST(observed_score AS DOUBLE) END) AS qm_{c}_obs, "
  f"MAX(CASE WHEN measure_code='{c}' THEN TRY_CAST(expected_score AS DOUBLE) END) AS qm_{c}_exp, "
  f"MAX(CASE WHEN measure_code='{c}' THEN footnote_for_score END) AS qm_{c}_fn" for c in ccodes)
con.execute(f"CREATE TABLE claims_qm_wide AS SELECT ccn, {sel} FROM claims_qm_long GROUP BY ccn")
assert con.execute("SELECT count(*) FROM claims_qm_wide").fetchone()[0]==N_FAC

# ---------- SNF QRP wide ----------
print("== SNF QRP wide")
qcodes = [r[0] for r in con.execute("SELECT DISTINCT measure_code FROM qrp_long ORDER BY 1").fetchall()]
assert len(qcodes)==57
def qrp_col(code):  # S_004_01_PPR_PD_RSRR -> qrp_004_ppr_pd_rsrr  (version kept in measure_catalog)
    m = re.match(r"S_(\d{3})_\d{2}_(.*)", code); return f"qrp_{m.group(1)}_{m.group(2).lower()}"
parts=[]
for c in qcodes:
    col = qrp_col(c)
    if c.endswith("COMP_PERF"):
        parts.append(f"MAX(CASE WHEN measure_code='{c}' THEN NULLIF(score,'Not Available') END) AS {col}")
    else:
        parts.append(f"MAX(CASE WHEN measure_code='{c}' THEN TRY_CAST(score AS DOUBLE) END) AS {col}")
    parts.append(f"MAX(CASE WHEN measure_code='{c}' THEN NULLIF(footnote,'-') END) AS {col}_fn")
con.execute(f"CREATE TABLE qrp_wide AS SELECT ccn, {', '.join(parts)} FROM qrp_long GROUP BY ccn")
assert con.execute("SELECT count(*) FROM qrp_wide").fetchone()[0]==N_FAC
# guard: no numeric QRP score silently lost (count of numeric-castable rows == count of non-null numeric in wide)
n_num_long = con.execute("SELECT count(*) FROM qrp_long WHERE TRY_CAST(score AS DOUBLE) IS NOT NULL AND measure_code NOT LIKE '%COMP_PERF'").fetchone()[0]
num_cols = [qrp_col(c) for c in qcodes if not c.endswith("COMP_PERF")]
n_num_wide = con.execute("SELECT " + " + ".join(f"count({c})" for c in num_cols) + " FROM qrp_wide").fetchone()[0]
assert n_num_long == n_num_wide, (n_num_long, n_num_wide)

# ---------- Penalties aggregate ----------
print("== Penalties aggregate")
cast("penalties","penalty_date","DATE","TRY_CAST(penalty_date AS DATE)")
cast("penalties","payment_denial_start_date","DATE","TRY_CAST(payment_denial_start_date AS DATE)")
cast("penalties","fine_amount","DOUBLE","TRY_CAST(replace(replace(fine_amount,'$',''),',','') AS DOUBLE)")
cast("penalties","payment_denial_length_in_days","DOUBLE","TRY_CAST(payment_denial_length_in_days AS DOUBLE)")
assert con.execute("SELECT count(*) FROM penalties WHERE penalty_type NOT IN ('Fine','Payment Denial')").fetchone()[0]==0
con.execute(f"""CREATE TABLE penalties_agg AS
SELECT ccn,
  count(*) FILTER (WHERE penalty_type='Fine')                       AS pen_n_fines,
  sum(fine_amount) FILTER (WHERE penalty_type='Fine')               AS pen_total_fines_usd,
  count(*) FILTER (WHERE penalty_type='Payment Denial')             AS pen_n_payment_denials,
  sum(payment_denial_length_in_days) FILTER (WHERE penalty_type='Payment Denial') AS pen_total_denial_days,
  count(*) FILTER (WHERE penalty_type='Fine' AND penalty_date >= DATE '{W12}') AS pen_n_fines_last_12m,
  sum(fine_amount) FILTER (WHERE penalty_type='Fine' AND penalty_date >= DATE '{W12}') AS pen_fines_usd_last_12m,
  max(penalty_date) AS pen_last_penalty_date,
  min(penalty_date) AS pen_first_penalty_date_in_window
FROM penalties GROUP BY ccn""")

# ---------- Citations aggregate ----------
print("== Citations aggregate")
for t in ("health_citations","fire_citations"):
    cast(t,"survey_date","DATE","TRY_CAST(survey_date AS DATE)")
    cast(t,"correction_date","DATE","TRY_CAST(correction_date AS DATE)")
    codes_present = {r[0] for r in con.execute(f"SELECT DISTINCT scope_severity_code FROM {t}").fetchall()}
    assert codes_present <= set("ABCDEFGHIJKL"), codes_present
SEV_HARM = "('G','H','I','J','K','L')"
# Scope/severity: A–L grid. G–L = actual harm or immediate jeopardy (to be confirmed vs. data dictionary digest). J,K,L = immediate jeopardy.
con.execute(f"""CREATE TABLE health_citations_agg AS
SELECT ccn,
  count(*)                                                         AS hc_n_total,
  count(*) FILTER (WHERE inspection_cycle='1')                     AS hc_n_cycle1,
  count(*) FILTER (WHERE inspection_cycle='2')                     AS hc_n_cycle2,
  count(*) FILTER (WHERE inspection_cycle='3')                     AS hc_n_cycle3,
  count(*) FILTER (WHERE scope_severity_code IN ('G','H','I'))     AS hc_n_actual_harm_GHI,
  count(*) FILTER (WHERE scope_severity_code IN ('J','K','L'))     AS hc_n_immediate_jeopardy_JKL,
  count(*) FILTER (WHERE scope_severity_code IN {SEV_HARM})               AS hc_n_severity_G_or_worse,
  count(*) FILTER (WHERE complaint_deficiency='Y')                 AS hc_n_complaint,
  count(*) FILTER (WHERE standard_deficiency='Y')                  AS hc_n_standard,
  count(*) FILTER (WHERE infection_control_inspection_deficiency='Y') AS hc_n_infection_control,
  count(*) FILTER (WHERE deficiency_category='Freedom from Abuse, Neglect, and Exploitation Deficiencies') AS hc_n_abuse_neglect,
  count(*) FILTER (WHERE survey_date >= DATE '{W12}')         AS hc_n_last_12m,
  count(*) FILTER (WHERE survey_date >= DATE '{W12}' AND complaint_deficiency='Y') AS hc_n_complaint_last_12m,
  count(*) FILTER (WHERE survey_date >= DATE '{W12}' AND complaint_deficiency='Y' AND scope_severity_code IN {SEV_HARM}) AS hc_n_complaint_last_12m_G_or_worse,
  count(DISTINCT survey_date) FILTER (WHERE complaint_deficiency='Y') AS hc_n_complaint_survey_dates_with_citations,
  count(*) FILTER (WHERE survey_date >= DATE '{W12}' AND scope_severity_code IN {SEV_HARM}) AS hc_n_last_12m_G_or_worse,
  max(survey_date) AS hc_last_survey_date,
  count(DISTINCT deficiency_tag_number) AS hc_n_distinct_tags
FROM health_citations GROUP BY ccn""")
con.execute(f"""CREATE TABLE fire_citations_agg AS
SELECT ccn, count(*) AS fc_n_total,
  count(*) FILTER (WHERE scope_severity_code IN {SEV_HARM}) AS fc_n_severity_G_or_worse,
  count(*) FILTER (WHERE survey_date >= DATE '{W12}') AS fc_n_last_12m,
  max(survey_date) AS fc_last_survey_date
FROM fire_citations GROUP BY ccn""")
# sanity: category label used above exists
cats = [r[0] for r in con.execute("SELECT DISTINCT deficiency_category FROM health_citations").fetchall()]
assert 'Freedom from Abuse, Neglect, and Exploitation Deficiencies' in cats, cats

# ---------- Survey dates aggregate (complaint inspections; NB: CMS lists a complaint inspection only if it produced a citation) ----------
print("== Survey dates aggregate")
cast("survey_dates","survey_date","DATE","TRY_CAST(survey_date AS DATE)")
con.execute(f"""CREATE TABLE survey_dates_agg AS
SELECT ccn,
  count(*) FILTER (WHERE type_of_survey='Health Complaint') AS sd_n_health_complaint_surveys_3cycles,
  count(*) FILTER (WHERE type_of_survey='Health Complaint' AND survey_date >= DATE '{W12}') AS sd_n_health_complaint_surveys_last_12m,
  count(*) FILTER (WHERE type_of_survey='Infection Control') AS sd_n_infection_control_surveys,
  max(survey_date) FILTER (WHERE type_of_survey='Health Standard') AS sd_last_health_standard_survey_date
FROM survey_dates GROUP BY ccn""")

# ---------- Ownership aggregate ----------
print("== Ownership aggregate")
con.execute("ALTER TABLE ownership ADD COLUMN ownership_percentage_raw VARCHAR"); con.execute("UPDATE ownership SET ownership_percentage_raw = ownership_percentage")
con.execute("ALTER TABLE ownership ADD COLUMN association_date_raw VARCHAR"); con.execute("UPDATE ownership SET association_date_raw = association_date")
cast("ownership","ownership_percentage","DOUBLE","TRY_CAST(replace(ownership_percentage,'%','') AS DOUBLE)", sentinels=("NOT APPLICABLE","NO PERCENTAGE PROVIDED"))
cast("ownership","association_date","DATE","TRY_CAST(TRY_STRPTIME(replace(association_date,'since ',''),'%m/%d/%Y') AS DATE)", sentinels=("NO DATE PROVIDED",))
con.execute("""CREATE TABLE ownership_agg AS
WITH o AS (SELECT * FROM ownership WHERE role_played_by_owner_or_manager_in_facility <> 'Ownership Data Not Available')
SELECT ccn,
  count(*) AS own_n_records,
  string_agg(DISTINCT owner_name, ' | ') FILTER (WHERE role_played_by_owner_or_manager_in_facility LIKE '%DIRECT OWNERSHIP INTEREST%' AND role_played_by_owner_or_manager_in_facility NOT LIKE '%INDIRECT%') AS own_direct_owners,
  string_agg(DISTINCT owner_name, ' | ') FILTER (WHERE role_played_by_owner_or_manager_in_facility LIKE '%INDIRECT OWNERSHIP INTEREST%') AS own_indirect_owners,
  string_agg(DISTINCT owner_name, ' | ') FILTER (WHERE role_played_by_owner_or_manager_in_facility = 'OPERATIONAL/MANAGERIAL CONTROL' AND owner_type='Organization') AS own_operational_control_orgs,
  string_agg(DISTINCT owner_name, ' | ') FILTER (WHERE role_played_by_owner_or_manager_in_facility LIKE '%PARTNERSHIP INTEREST%') AS own_partnership_owners,
  string_agg(DISTINCT owner_name, ' | ') FILTER (WHERE role_played_by_owner_or_manager_in_facility = 'OPERATIONAL/MANAGERIAL CONTROL' AND owner_type='Individual') AS own_operational_control_individuals,
  max(ownership_percentage) FILTER (WHERE role_played_by_owner_or_manager_in_facility LIKE '%DIRECT OWNERSHIP INTEREST%' AND role_played_by_owner_or_manager_in_facility NOT LIKE '%INDIRECT%') AS own_max_direct_pct,
  max(association_date) AS own_most_recent_association_date
FROM o GROUP BY ccn""")
con.execute("""CREATE TABLE ownership_flag AS SELECT ccn, max(CASE WHEN role_played_by_owner_or_manager_in_facility='Ownership Data Not Available' THEN 'N' ELSE 'Y' END) AS own_data_available FROM ownership GROUP BY ccn""")

# ---------- Survey summary: latest cycle row per facility ----------
print("== Survey summary wide (cycle 1 = most recent)")
cast("survey_summary","health_survey_date","DATE","TRY_CAST(health_survey_date AS DATE)")
cast("survey_summary","fire_safety_survey_date","DATE","TRY_CAST(fire_safety_survey_date AS DATE)")
for c in [r[0] for r in con.execute("DESCRIBE survey_summary").fetchall() if r[0].startswith(("total_number_of","count_of"))]:
    cast("survey_summary", c, "DOUBLE", f"TRY_CAST({c} AS DOUBLE)")
con.execute("""CREATE TABLE survey_summary_c1 AS SELECT * FROM survey_summary WHERE inspection_cycle='1'""")
assert con.execute("SELECT count(*), count(DISTINCT ccn) FROM survey_summary_c1").fetchone()==(N_FAC,N_FAC)

# ---------- VBP: type numeric ----------
print("== VBP typing")
vcols = [r[0] for r in con.execute("DESCRIBE vbp_facility").fetchall()]
for c in vcols:
    if c.startswith("footnote") or c in ("ccn","provider_name","provider_address","city_town","state","zip_code"): continue
    cast("vbp_facility", c, "DOUBLE", f"TRY_CAST({c} AS DOUBLE)", sentinels=("---",))
VBP_FN = {"This facility did not meet this measure's case minimum policy requirement and therefore no measure data is publicly reported.": "Case minimum not met - not reported",
          "This facility did not have sufficient data to calculate a baseline period measure result.": "Insufficient data for baseline period",
          "This facility did not have sufficient data to calculate a baseline period measure result or improvement score.": "Insufficient data for baseline period / improvement score"}
for c in vcols:
    if c.startswith("footnote"):
        vals = {r[0] for r in con.execute(f"SELECT DISTINCT {c} FROM vbp_facility").fetchall()}
        assert vals <= {"---", None, ""} | set(VBP_FN), (c, vals)   # fail loudly on any unseen footnote text
        con.execute(f"ALTER TABLE vbp_facility ADD COLUMN {c}_raw VARCHAR"); con.execute(f"UPDATE vbp_facility SET {c}_raw = {c}")
        con.execute(f"UPDATE vbp_facility SET {c} = NULL WHERE {c} = '---'")
        for long_txt, short_txt in VBP_FN.items(): con.execute(f"UPDATE vbp_facility SET {c} = ? WHERE {c} = ?", [short_txt, long_txt])

# ---------- Measure catalog ----------
print("== Measure catalog")
con.execute("""CREATE TABLE measure_catalog AS
SELECT 'mds_qm' AS source, measure_code, any_value(measure_description) AS description, any_value(resident_type) AS resident_type,
       any_value(used_in_quality_measure_five_star_rating) AS used_in_5star, any_value(measure_period) AS period, 'qm_'||measure_code||'_4q' AS master_column
FROM mds_qm_long GROUP BY measure_code
UNION ALL
SELECT 'claims_qm', measure_code, any_value(measure_description), any_value(resident_type), any_value(used_in_quality_measure_five_star_rating), any_value(measure_period), 'qm_'||measure_code||'_adj'
FROM claims_qm_long GROUP BY measure_code
UNION ALL
SELECT 'snf_qrp', q.measure_code, ci.measure_description, NULL, NULL, any_value(q.start_date)||'..'||any_value(q.end_date), NULL
FROM qrp_long q LEFT JOIN collection_intervals ci ON ci.measure_code = substr(q.measure_code,3,3) GROUP BY q.measure_code, ci.measure_description
ORDER BY 1,2""")
con.execute("UPDATE measure_catalog SET master_column = NULL WHERE source='snf_qrp'")
for c in qcodes:
    con.execute("UPDATE measure_catalog SET master_column=? WHERE measure_code=?", [qrp_col(c), c])

# ---------- MASTER ----------
print("== Building facility_master")
con.execute(f"""CREATE TABLE facility_master AS
SELECT p.*,
       s.total_number_of_health_deficiencies AS ss_c1_health_deficiencies, s.total_number_of_fire_safety_deficiencies AS ss_c1_fire_deficiencies,
       s.health_survey_date AS ss_c1_health_survey_date,
       h.* EXCLUDE (ccn), f.* EXCLUDE (ccn), sd.* EXCLUDE (ccn), pa.* EXCLUDE (ccn), of.* EXCLUDE (ccn), o.* EXCLUDE (ccn),
       m.* EXCLUDE (ccn), c.* EXCLUDE (ccn), q.* EXCLUDE (ccn),
       v.snf_vbp_program_ranking AS vbp_ranking, v.performance_score AS vbp_performance_score, v.incentive_payment_multiplier AS vbp_incentive_multiplier,
       v.performance_period_fy_2024_risk_standardized_readmission_rate AS vbp_fy24_rsrr,
       v.performance_period_fy_2024_risk_standardized_healthcare_associated_infection_rate AS vbp_fy24_hai_rate,
       v.performance_period_fy_2024_total_nursing_staff_turnover_rate AS vbp_fy24_turnover,
       v.performance_period_fy_2024_adjusted_total_nursing_staff_hours_per_resident_day AS vbp_fy24_adj_nurse_hprd,
       v.footnote_performance_period_fy_2024_risk_standardized_readmission_rate AS vbp_fy24_rsrr_fn,
       v.footnote_performance_period_fy_2024_risk_standardized_healthcare_associated_infection_rate AS vbp_fy24_hai_rate_fn,
       v.footnote_performance_period_fy_2024_total_nursing_staff_turnover_rate AS vbp_fy24_turnover_fn,
       v.footnote_performance_period_fy_2024_adjusted_total_nursing_staff_hours_per_resident_day AS vbp_fy24_adj_nurse_hprd_fn,
       CASE WHEN v.ccn IS NOT NULL THEN 'Y' ELSE 'N' END AS vbp_in_program,
       round((v.incentive_payment_multiplier - 1) * 100, 4) AS x_vbp_net_part_a_payment_change_pct
FROM provider_info p
LEFT JOIN survey_summary_c1 s USING (ccn)
LEFT JOIN health_citations_agg h USING (ccn)
LEFT JOIN fire_citations_agg f USING (ccn)
LEFT JOIN survey_dates_agg sd USING (ccn)
LEFT JOIN penalties_agg pa USING (ccn)
LEFT JOIN ownership_flag of USING (ccn)
LEFT JOIN ownership_agg o USING (ccn)
LEFT JOIN mds_qm_wide m USING (ccn)
LEFT JOIN claims_qm_wide c USING (ccn)
LEFT JOIN qrp_wide q USING (ccn)
LEFT JOIN vbp_facility v USING (ccn)""")
n, d = con.execute("SELECT count(*), count(DISTINCT ccn) FROM facility_master").fetchone()
assert (n,d)==(N_FAC,N_FAC), (n,d)
# facilities with no penalties get 0 counts (absence = none in window; T-002), fines stay NULL->0 as well
for c in ["pen_n_fines","pen_total_fines_usd","pen_n_payment_denials","pen_total_denial_days","pen_n_fines_last_12m","pen_fines_usd_last_12m",
          "hc_n_total","hc_n_cycle1","hc_n_cycle2","hc_n_cycle3","hc_n_actual_harm_GHI","hc_n_immediate_jeopardy_JKL","hc_n_severity_G_or_worse",
          "hc_n_complaint","hc_n_standard","hc_n_infection_control","hc_n_abuse_neglect","hc_n_last_12m","hc_n_last_12m_G_or_worse","fc_n_total","fc_n_severity_G_or_worse","fc_n_last_12m",
          "hc_n_complaint_last_12m","hc_n_complaint_last_12m_G_or_worse","hc_n_complaint_survey_dates_with_citations","sd_n_health_complaint_surveys_3cycles","sd_n_health_complaint_surveys_last_12m","sd_n_infection_control_surveys"]:
    con.execute(f"UPDATE facility_master SET {c}=0 WHERE {c} IS NULL")
# VBP non-participants: unmatched CCNs
unmatched = con.execute("SELECT count(*) FROM vbp_facility v LEFT JOIN provider_info p USING (ccn) WHERE p.ccn IS NULL").fetchone()[0]
print(f"  VBP CCNs not in Provider Info universe: {unmatched}")

# ---------- RECONCILIATIONS (cross-file) ----------
print("== Reconciliations")
recon = {}
def rec(name, sql):
    r = con.execute(sql).fetchone(); recon[name]=r; print(f"  {name}: {r}")
rec("fines_count: provider_info.number_of_fines == penalties count  (n_match, n_total)",
    "SELECT count(*) FILTER (WHERE coalesce(number_of_fines,0)=pen_n_fines), count(*) FROM facility_master")
rec("fines_usd: provider_info.total_amount_of_fines == sum(penalties) within $1  (n_match, n_total)",
    "SELECT count(*) FILTER (WHERE abs(coalesce(total_amount_of_fines_in_dollars,0)-pen_total_fines_usd)<1), count(*) FROM facility_master")
rec("denials_count: provider_info.number_of_payment_denials == penalties count",
    "SELECT count(*) FILTER (WHERE coalesce(number_of_payment_denials,0)=pen_n_payment_denials), count(*) FROM facility_master")
rec("cycle1_health_def: provider_info.rating_cycle_1_total == survey_summary cycle1 total",
    "SELECT count(*) FILTER (WHERE rating_cycle_1_total_number_of_health_deficiencies = TRY_CAST(ss_c1_health_deficiencies AS DOUBLE)), count(*) FROM facility_master")
rec("cycle1_health_def: survey_summary cycle1 total == count of health_citations rows with inspection_cycle=1",
    "SELECT count(*) FILTER (WHERE TRY_CAST(ss_c1_health_deficiencies AS DOUBLE) = hc_n_cycle1), count(*) FROM facility_master")
rec("infection_control: provider_info.number_of_citations_from_infection_control_inspections == citations flagged IC",
    "SELECT count(*) FILTER (WHERE coalesce(number_of_citations_from_infection_control_inspections,0) = hc_n_infection_control), count(*) FROM facility_master")
# state-level: our mean of QM 521 (rehospitalization) vs state_averages file
rec("state_avg_qm521: mean abs diff (pct points) between our simple state mean of qm_521_adj and CMS state average; max abs diff",
    """SELECT round(avg(abs(d)),3), round(max(abs(d)),3) FROM (
         SELECT m.state, avg(m.qm_521_adj) - TRY_CAST(s.percentage_of_short_stay_residents_who_were_rehospitalized_after_a_nursing_home_admission AS DOUBLE) d
         FROM facility_master m JOIN state_averages s ON s.state_or_nation=m.state GROUP BY m.state, s.percentage_of_short_stay_residents_who_were_rehospitalized_after_a_nursing_home_admission)""")
rec("state_avg_overall_rating: mean abs diff between our state mean overall rating and CMS state average; max",
    """SELECT round(avg(abs(d)),3), round(max(abs(d)),3) FROM (
         SELECT m.state, avg(m.overall_rating) - TRY_CAST(s.overall_rating AS DOUBLE) d
         FROM facility_master m JOIN state_averages s ON s.state_or_nation=m.state GROUP BY m.state, s.overall_rating)""")
json.dump({k:list(v) for k,v in recon.items()}, open(f"{ROOT}/db/reconciliation.json","w"), indent=1)
with open(f"{ROOT}/db/cast_log.csv","w",newline="") as fh:
    w=csv.writer(fh); w.writerow(["table","column","type","raw_nonblank_nonsentinel","typed_nonnull","sentinels_mapped_to_null"]); w.writerows(CAST_LOG)
print(f"  {len(CAST_LOG)} casts, all lossless (db/cast_log.csv)")
# T-011/T-002 check: nursing homes without VBP
print("  nursing homes NOT in VBP:", con.execute("SELECT count(*) FROM facility_master WHERE vbp_in_program='N'").fetchone()[0])

# ---------- Save table inventory ----------
inv = con.execute("SELECT table_name, estimated_size FROM duckdb_tables() ORDER BY 1").fetchall()
print("== Tables:"); [print(f"  {t:<26}{n:>10,}") for t,n in inv]
ncols = con.execute("SELECT count(*) FROM (DESCRIBE facility_master)").fetchone()[0]
print(f"facility_master: {N_FAC:,} rows x {ncols} columns")
con.close()
print("DONE", datetime.datetime.now())
