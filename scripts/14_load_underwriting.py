#!/usr/bin/env python3
"""Underwriting data layer (Rondo value model): county / state / CBSA benchmarks from CMS and Census.

Sources (all primary; raw/underwriting/manifest.json records the exact URL and release of each):
  gv_county.csv            CMS Medicare Geographic Variation PUF, by National/State/County, 2014-2024 (Original Medicare)
  ma_gv_state.csv          CMS Medicare Advantage Geographic Variation PUF, National & State, 2016-2023
  monthly_enrollment.csv   CMS Medicare Monthly Enrollment (county: total / Original Medicare / MA & other health plan)
  mssp_county_risk.csv     CMS MSSP County-level Aggregate Expenditure and Risk Score Data on Assignable Beneficiaries
  cbsa_delineation_2023.xlsx  Census/OMB CBSA delineation file, July 2023 (county -> CBSA)
  snf_cost_report.csv      CMS Skilled Nursing Facility Cost Report (HCRIS extract), FY2024
  hospital_cost_report.csv CMS Hospital Provider Cost Report (HCRIS extract), FY2024
  hrrp/, vbp/              FY 2027 IPPS final rule (CMS-1849-F): Table 15 readmission-penalty factors; Table 16A proxy value-based purchasing factors
  pac_hha / pac_irf / pac_ltch  CMS Post-Acute Care Utilization PUFs by Geography and Provider, 2024
  cpsc/CPSC_*_2026_09.csv  CMS Monthly Enrollment by Contract/Plan/State/County (September 2026): MA enrollment by plan and county, with parent organization
  ratebook/CSV/CountyRate2027.csv  CMS 2027 Medicare Advantage ratebook: monthly county benchmark rates at 0%, 3.5% and 5% quality bonus

Rules: every numeric column is cast with a lossless assertion ('*' = CMS suppression -> NULL, never 0);
nothing is imputed; every derived column is named for what it is.
"""
import duckdb, json, openpyxl, pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "raw" / "underwriting"
con = duckdb.connect(str(ROOT / "db" / "snf.duckdb"))
one = lambda q, *a: con.execute(q, list(a)).fetchall()[0][0]


def num(col, alias=None):
    """'*' and '' -> NULL; anything else must parse as a number (asserted after load)."""
    a = alias or col.lower()
    return f"""CASE WHEN "{col}" IS NULL OR trim("{col}") IN ('*','','.','NA','N/A') THEN NULL ELSE CAST(replace(replace(trim("{col}"),',',''),'$','') AS DOUBLE) END AS {a}"""


def assert_lossless(src, cols, where="TRUE"):
    """No value other than a suppression marker may fail to parse."""
    for c in cols:
        bad = one(f"""SELECT count(*) FROM {src} WHERE {where} AND "{c}" IS NOT NULL AND trim("{c}") NOT IN ('*','','.','NA','N/A')
                      AND TRY_CAST(replace(replace(trim("{c}"),',',''),'$','') AS DOUBLE) IS NULL""")
        assert bad == 0, f"{src}.{c}: {bad} values are neither numeric nor a suppression marker"


# ---------------------------------------------------------------- Geographic Variation (Original Medicare)
GV = f"read_csv('{RAW}/gv_county.csv', all_varchar=true)"
GV_NUM = ["BENES_TOTAL_CNT", "BENES_OM_CNT", "BENES_MA_CNT", "MA_PRTCPTN_RATE", "BENE_AVG_AGE", "BENE_DUAL_PCT",
          "TOT_MDCR_PYMT_AMT", "TOT_MDCR_PYMT_PC", "TOT_MDCR_STDZD_PYMT_PC",
          "IP_MDCR_PYMT_AMT", "IP_MDCR_PYMT_PC", "IP_MDCR_PYMT_PER_USER", "BENES_IP_CVRD_STAY_CNT", "IP_CVRD_STAYS_PER_1000_BENES", "IP_CVRD_DAYS_PER_1000_BENES",
          "ACUTE_HOSP_READMSN_CNT", "ACUTE_HOSP_READMSN_PCT", "BENES_ER_VISITS_CNT", "ER_VISITS_PER_1000_BENES",
          "SNF_MDCR_PYMT_AMT", "SNF_MDCR_PYMT_PC", "SNF_MDCR_PYMT_PER_USER", "BENES_SNF_CNT", "SNF_CVRD_STAYS_PER_1000_BENES", "SNF_CVRD_DAYS_PER_1000_BENES",
          "IRF_MDCR_PYMT_AMT", "IRF_MDCR_PYMT_PC", "BENES_IRF_CNT", "IRF_CVRD_STAYS_PER_1000_BENES", "IRF_CVRD_DAYS_PER_1000_BENES",
          "LTCH_MDCR_PYMT_AMT", "LTCH_MDCR_PYMT_PC", "BENES_LTCH_CNT", "LTCH_CVRD_STAYS_PER_1000_BENES", "LTCH_CVRD_DAYS_PER_1000_BENES",
          "HH_MDCR_PYMT_AMT", "HH_MDCR_PYMT_PC", "BENES_HH_CNT", "HH_EPISODES_PER_1000_BENES", "HH_VISITS_PER_1000_BENES",
          "HOSPC_MDCR_PYMT_AMT", "HOSPC_MDCR_PYMT_PC", "DME_MDCR_PYMT_AMT", "DME_MDCR_PYMT_PC", "OP_MDCR_PYMT_PC"]
assert_lossless(GV, GV_NUM, "YEAR IN ('2023','2024')")
con.execute(f"""CREATE OR REPLACE TABLE gv AS
  SELECT CAST(YEAR AS INTEGER) AS year, BENE_GEO_LVL AS geo_level, BENE_GEO_DESC AS geo_desc, nullif(trim(BENE_GEO_CD),'') AS geo_code, BENE_AGE_LVL AS age_level,
         {', '.join(num(c) for c in GV_NUM)}
  FROM {GV} WHERE YEAR IN ('2023','2024')""")
n_cty = one("SELECT count(*) FROM gv WHERE year=2024 AND geo_level='County' AND age_level='All'")
assert n_cty == 3197, n_cty
assert one("SELECT count(*) FROM gv WHERE year=2024 AND geo_level='National' AND age_level='All'") == 1
# identity check on CMS's own columns: per-1,000 rate x FFS beneficiaries reproduces nothing we invent; we only verify payment-per-capita = amount / FFS benes at national level
nat = con.execute("SELECT benes_om_cnt, snf_mdcr_pymt_amt, snf_mdcr_pymt_pc FROM gv WHERE year=2024 AND geo_level='National' AND age_level='All'").fetchall()[0]
assert abs(nat[1] / nat[0] - nat[2]) < 0.5, ("SNF per-capita is not amount / Original Medicare beneficiaries", nat)

# ---------------------------------------------------------------- Medicare Advantage Geographic Variation (state)
MA = f"read_csv('{RAW}/ma_gv_state.csv', all_varchar=true)"
MA_NUM = ["BENES_MA_CNT", "BENE_DUAL_PCT", "BENES_IP_STAY_CNT", "IP_STAYS_PER_1000_BENES", "IP_DAYS_PER_1000_BENES", "BENES_IRF_CNT", "IRF_STAYS_PER_1000_BENES", "IRF_DAYS_PER_1000_BENES",
          "BENES_LTC_CNT", "LTC_STAYS_PER_1000_BENES", "LTC_DAYS_PER_1000_BENES", "BENES_SNF_CNT", "SNF_STAYS_PER_1000_BENES", "SNF_DAYS_PER_1000_BENES",
          "BENES_ER_VISITS_CNT", "BENES_ER_VISITS_PCT", "ER_VISITS_PER_1000_BENES"]
assert_lossless(MA, MA_NUM)
con.execute(f"""CREATE OR REPLACE TABLE ma_gv AS SELECT CAST(YEAR AS INTEGER) AS year, STATE AS state, nullif(trim(BENE_GEO_CD),'') AS state_fips, {', '.join(num(c) for c in MA_NUM)} FROM {MA}""")
ma_year = one("SELECT max(year) FROM ma_gv")
assert ma_year == 2023 and one("SELECT count(*) FROM ma_gv WHERE year=2023") == 54

# state table: MA rate (2023) beside the Original Medicare rate for the SAME year and state, and their ratio.
# The ratio is how the model turns a county's FFS utilization into an MA estimate (MODELED; D-041).
con.execute(f"""CREATE OR REPLACE TABLE uw_state AS
  SELECT m.state, m.state_fips, m.year AS ma_year, m.benes_ma_cnt AS ma_benes,
         m.ip_stays_per_1000_benes AS ma_ip_stays, m.ip_days_per_1000_benes AS ma_ip_days,
         m.snf_stays_per_1000_benes AS ma_snf_stays, m.snf_days_per_1000_benes AS ma_snf_days,
         m.irf_stays_per_1000_benes AS ma_irf_stays, m.irf_days_per_1000_benes AS ma_irf_days,
         m.ltc_stays_per_1000_benes AS ma_ltch_stays, m.ltc_days_per_1000_benes AS ma_ltch_days,
         g.ip_cvrd_stays_per_1000_benes AS ffs_ip_stays, g.ip_cvrd_days_per_1000_benes AS ffs_ip_days,
         g.snf_cvrd_stays_per_1000_benes AS ffs_snf_stays, g.snf_cvrd_days_per_1000_benes AS ffs_snf_days,
         g.irf_cvrd_stays_per_1000_benes AS ffs_irf_stays, g.irf_cvrd_days_per_1000_benes AS ffs_irf_days,
         g.ltch_cvrd_stays_per_1000_benes AS ffs_ltch_stays, g.ltch_cvrd_days_per_1000_benes AS ffs_ltch_days,
         m.ip_stays_per_1000_benes / nullif(g.ip_cvrd_stays_per_1000_benes,0) AS r_ip_stays, m.ip_days_per_1000_benes / nullif(g.ip_cvrd_days_per_1000_benes,0) AS r_ip_days,
         m.snf_stays_per_1000_benes / nullif(g.snf_cvrd_stays_per_1000_benes,0) AS r_snf_stays, m.snf_days_per_1000_benes / nullif(g.snf_cvrd_days_per_1000_benes,0) AS r_snf_days,
         m.irf_stays_per_1000_benes / nullif(g.irf_cvrd_stays_per_1000_benes,0) AS r_irf_stays, m.ltc_stays_per_1000_benes / nullif(g.ltch_cvrd_stays_per_1000_benes,0) AS r_ltch_stays
  FROM ma_gv m
  JOIN gv g ON g.year = m.year AND g.age_level = 'All' AND ((m.state = 'National' AND g.geo_level = 'National') OR (g.geo_level = 'State' AND g.geo_desc = m.state))
  WHERE m.year = {ma_year}""")
n_state = one("SELECT count(*) FROM uw_state")
assert n_state >= 52, n_state   # 50 states + DC + PR + National, minus any state code the two files spell differently
natr = con.execute("SELECT ma_ip_stays, ffs_ip_stays, r_ip_stays, ma_snf_days, ffs_snf_days, r_snf_days FROM uw_state WHERE state='National'").fetchall()[0]

# ---------------------------------------------------------------- Medicare Monthly Enrollment (county)
EN = f"read_csv('{RAW}/monthly_enrollment.csv', all_varchar=true)"
MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
en_year = one(f"SELECT max(CAST(YEAR AS INTEGER)) FROM {EN}")
have = [r[0] for r in con.execute(f"SELECT DISTINCT MONTH FROM {EN} WHERE YEAR = '{en_year}'").fetchall()]
en_month = [m for m in MONTHS if m in have][-1]
EN_NUM = ["TOT_BENES", "ORGNL_MDCR_BENES", "MA_AND_OTH_BENES", "DUAL_TOT_BENES", "AGED_TOT_BENES", "DSBLD_TOT_BENES"]
assert_lossless(EN, EN_NUM, f"YEAR='{en_year}' AND MONTH='{en_month}'")
con.execute(f"""CREATE OR REPLACE TABLE enrollment_county AS
  SELECT trim(BENE_FIPS_CD) AS fips, BENE_STATE_ABRVTN AS state, BENE_STATE_DESC AS state_name, BENE_COUNTY_DESC AS county_name, {', '.join(num(c) for c in EN_NUM)}
  FROM {EN} WHERE YEAR='{en_year}' AND MONTH='{en_month}' AND BENE_GEO_LVL='County'""")
en_nat = con.execute(f"SELECT {', '.join(num(c) for c in EN_NUM[:3])} FROM {EN} WHERE YEAR='{en_year}' AND MONTH='{en_month}' AND BENE_GEO_LVL='National'").fetchall()[0]
assert one("SELECT count(*) FROM enrollment_county") == one("SELECT count(DISTINCT fips) FROM enrollment_county")

# ---------------------------------------------------------------- CBSA delineation (Census / OMB, July 2023)
wb = openpyxl.load_workbook(RAW / "cbsa_delineation_2023.xlsx", read_only=True)
rows = [r for r in wb.active.iter_rows(min_row=4, values_only=True) if r[0] and re.fullmatch(r"\d{5}", str(r[0]))]
con.execute("CREATE OR REPLACE TABLE cbsa_county (cbsa VARCHAR, cbsa_title VARCHAR, cbsa_type VARCHAR, csa VARCHAR, csa_title VARCHAR, county_name VARCHAR, state_name VARCHAR, fips VARCHAR, central_outlying VARCHAR)")
con.executemany("INSERT INTO cbsa_county VALUES (?,?,?,?,?,?,?,?,?)",
                [(str(r[0]), r[3], 'Metro' if str(r[4]).startswith('Metropolitan') else 'Micro', str(r[2]) if r[2] else None, r[6], r[7], r[8], f"{str(r[9]).zfill(2)}{str(r[10]).zfill(3)}", r[11]) for r in rows])
n_cbsa_cty = one("SELECT count(*) FROM cbsa_county"); n_cbsa = one("SELECT count(DISTINCT cbsa) FROM cbsa_county")
assert n_cbsa_cty == one("SELECT count(DISTINCT fips) FROM cbsa_county"), "a county appears in two CBSAs"
assert n_cbsa == 935 and one("SELECT count(DISTINCT cbsa) FROM cbsa_county WHERE cbsa_type='Metro'") == 393, (n_cbsa,)   # OMB Bulletin 23-01: 393 metro + 542 micro (incl. Puerto Rico)

# ---------------------------------------------------------------- MA enrollment by contract / plan / county (CPSC) and parent organization
CP = sorted((RAW / "cpsc").glob("*/CPSC_Enrollment_Info_*.csv"))[-1]; CI = sorted((RAW / "cpsc").glob("*/CPSC_Contract_Info_*.csv"))[-1]
cpsc_period = re.search(r"(\d{4})_(\d{2})", CP.name).group(0).replace("_", "-")
# The contract file carries a few Windows-1252 bytes (curly quotes, accented letters in organization names): transcode to UTF-8, changing nothing else.
_raw = CI.read_bytes(); _clean = RAW / "cpsc" / "contract_info_utf8.csv"
try: _raw.decode("utf-8"); _clean.write_bytes(_raw); n_transcoded = 0
except UnicodeDecodeError:
    _txt = _raw.decode("cp1252"); _clean.write_text(_txt, encoding="utf-8", newline="")
    n_transcoded = sum(1 for ln in _raw.split(b"\n") if any(b > 127 for b in ln))
    assert _txt.count("\n") == _raw.count(b"\n")
ENR = f"read_csv('{CP}', all_varchar=true)"; CON = f"read_csv('{_clean}', all_varchar=true)"
assert_lossless(ENR, ["Enrollment"])
con.execute(f"""CREATE OR REPLACE TABLE ma_contract AS
  SELECT trim("Contract ID") AS contract_id, nullif(trim("Plan ID"),'') AS plan_id, "Organization Type" AS org_type, "Plan Type" AS plan_type, "Offers Part D" AS offers_part_d, "SNP Plan" AS snp, "EGHP" AS eghp,
         "Organization Name" AS org_name, "Organization Marketing Name" AS org_marketing_name, "Plan Name" AS plan_name, nullif(trim("Parent Organization"),'') AS parent_org,
         CASE WHEN "Plan Type" IN ('HMO/HMOPOS','Local PPO','Regional PPO','PFFS','MSA') THEN 'MA'
              WHEN "Plan Type" LIKE 'Medicare-Medicaid Plan%' THEN 'MMP' WHEN "Plan Type" LIKE '%PACE%' THEN 'PACE' WHEN "Plan Type" LIKE '%Cost%' THEN 'Cost'
              WHEN "Plan Type" LIKE '%Prescription Drug%' OR "Plan Type" LIKE '%PDP%' THEN 'PDP' ELSE 'Other' END AS segment
  FROM {CON}""")
assert one("SELECT count(*) FROM ma_contract") == one("SELECT count(*) FROM (SELECT DISTINCT contract_id, plan_id FROM ma_contract)"), "contract/plan is not unique in the contract file"
con.execute(f"""CREATE OR REPLACE TABLE ma_enroll AS
  SELECT trim("Contract Number") AS contract_id, nullif(trim("Plan ID"),'') AS plan_id, nullif(trim("SSA State County Code"),'') AS ssa, nullif(trim("FIPS State County Code"),'') AS fips,
         nullif(trim(State),'') AS state, nullif(trim(County),'') AS county, {num('Enrollment', 'enrollment')}, (trim("Enrollment") = '*') AS suppressed
  FROM {ENR}""")
# the SSA <-> FIPS county crosswalk as CMS itself publishes it in this file (used for the ratebook and the MSSP risk file, which are keyed on SSA codes)
# Every SSA code maps to exactly one FIPS county; a few FIPS counties carry several SSA codes (Los Angeles has two; Guam and American Samoa are coded by village),
# so the crosswalk is many-to-one and anything keyed on SSA is aggregated or resolved explicitly when it is brought to the FIPS county.
con.execute("""CREATE OR REPLACE TABLE ssa_fips AS SELECT ssa, min(fips) AS fips, substr(ssa,1,2) AS ssa_state, substr(ssa,3,3) AS ssa_county, coalesce(sum(enrollment),0) AS cpsc_enrollment
               FROM ma_enroll WHERE ssa IS NOT NULL AND fips IS NOT NULL GROUP BY ssa""")
assert one("SELECT count(*) FROM (SELECT ssa FROM ma_enroll WHERE ssa IS NOT NULL AND fips IS NOT NULL GROUP BY ssa HAVING count(DISTINCT fips) > 1)") == 0, "an SSA county code maps to two FIPS codes"
multi = con.execute("SELECT fips, count(*) FROM ssa_fips GROUP BY 1 HAVING count(*) > 1 ORDER BY 1").fetchall()
assert [m[0] for m in multi if not m[0].startswith(('60', '66'))] == ['06037'], multi   # outside the territories, only Los Angeles County has more than one SSA code
# for a FIPS county with several SSA codes, the ratebook rate used is that of the SSA code carrying the most MA enrollment
con.execute("CREATE OR REPLACE TABLE ssa_primary AS SELECT fips, arg_max(ssa, cpsc_enrollment) AS ssa, count(*) AS n_ssa FROM ssa_fips GROUP BY fips")
# ---------------------------------------------------------------- Star Ratings -> quality-bonus tier and rebate share per MA contract (for 2027 payment)
# Method, as CMS sets it out (42 CFR 422.258(d)(7), 422.266(a)(2); CMS annual "Quality Bonus Payment Determinations" memo):
#   * the rating used for payment year 2027 is the 2026 Star Rating (released fall 2025; this file is CMS's July 22 2026 update of it): the overall rating for a contract
#     that offers Part D, the Part C summary rating for one that does not;
#   * 4 stars or more  -> benchmark at the 5% bonus rate; below 4 -> 0% rate;
#   * rebate share of (benchmark - bid): 70% at 4.5 stars or more, 65% at 3.5 to 4, 50% below 3.5;
#   * a contract too new to be rated takes the enrollment-weighted average rating of its parent organization's rated MA contracts; if the parent has none it is a "new MA plan":
#     3.5% bonus rate, rebate as 3.5 stars (65%);
#   * a low-enrollment contract ("Not enough data available") is paid at the 3.5% rate with a 65% rebate (the ratebook's own "low enrollment / new contract under new parent org" column).
# The parent average is weighted by November 2025 enrollment, as CMS does. One approximation, counted in the summary: the average is rounded to the nearest half star,
# and "the parent has no rated MA contract" stands in for CMS's "no MA contract in the previous three years".
def _star(v):
    t = "" if v is None else str(v).strip()
    return (float(t), None) if re.fullmatch(r"\d(\.\d)?", t) else (None, t or None)
def read_star_summary(rows, year):
    hi = next(i for i, r in enumerate(rows) if r and str(r[0]).strip() == "Contract Number")
    hdr = [str(c).strip() if c is not None else "" for c in rows[hi]]
    ic, io, ip = hdr.index(f"{year} Part C Summary"), hdr.index(f"{year} Overall"), hdr.index("Parent Organization")
    out = {}
    for r in rows[hi + 1:]:
        cid = str(r[0]).strip() if r and r[0] is not None else ""
        if not re.fullmatch(r"[A-Z]\d{4}", cid): continue
        (pc, pc_txt), (ov, ov_txt) = _star(r[ic]), _star(r[io])
        assert cid not in out, f"duplicate contract {cid} in the {year} Star Ratings"
        out[cid] = (ov if ov is not None else pc, ov_txt if ov is None and pc is None else None, pc, ov, str(r[ip]).strip() if r[ip] else None)
    return out
S26 = RAW / "stars" / "s2026" / "Master Tables Individual Files 8 17 26" / "2026 Star Ratings Data Table - Summary Ratings (July 22 2026).xlsx"
S27 = RAW / "stars" / "s2027" / "2027 Star Ratings Data Table - Summary Ratings (Oct 8 2026).csv"
stars26 = read_star_summary([list(r) for r in openpyxl.load_workbook(S26, read_only=True).worksheets[0].iter_rows(values_only=True)], 2026)
import csv as _csv2
with open(S27, encoding="cp1252", newline="") as fh: stars27 = read_star_summary(list(_csv2.reader(fh)), 2027)
assert len(stars26) > 600 and len(stars27) > 600, (len(stars26), len(stars27))
assert all(v[0] is None or (1 <= v[0] <= 5 and v[0] * 2 == int(v[0] * 2)) for v in list(stars26.values()) + list(stars27.values())), "a star rating is not a half-star value between 1 and 5"
con.execute("CREATE OR REPLACE TABLE ma_stars (contract_id VARCHAR, rating_2026 DOUBLE, status_2026 VARCHAR, part_c_2026 DOUBLE, overall_2026 DOUBLE, rating_2027 DOUBLE, status_2027 VARCHAR)")
con.executemany("INSERT INTO ma_stars VALUES (?,?,?,?,?,?,?)", [(c, *stars26.get(c, (None, None, None, None))[:4], *stars27.get(c, (None, None))[:2]) for c in sorted(set(stars26) | set(stars27))])
# November 2025 enrollment by contract: the month CMS weights by when it averages a parent organization's ratings for a contract too new to be rated (QBP memo)
NOV = RAW / "contract_enrollment" / "c2025_11" / "Monthly_Report_By_Contract_2025_11" / "Monthly_Report_By_Contract_2025_11.csv"
with open(NOV, encoding="cp1252", newline="") as fh:
    nov = [(r["Contract Number"].strip(), r["Plan Type"].strip(), None if r["Enrollment"].strip() == "*" else float(r["Enrollment"].replace(",", ""))) for r in _csv2.DictReader(fh)]
assert len(nov) == len({r[0] for r in nov}) and len(nov) > 900
con.execute("CREATE OR REPLACE TABLE ma_contract_nov (contract_id VARCHAR, plan_type VARCHAR, enrollment DOUBLE)"); con.executemany("INSERT INTO ma_contract_nov VALUES (?,?,?)", nov)
# one row per MA contract in the enrollment file: its parent, visible enrollment, and the payment tier the rules above give it
con.execute("""CREATE OR REPLACE TABLE ma_contract_qbp AS
  WITH k AS (SELECT e.contract_id, arg_max(coalesce(c.parent_org, c.org_marketing_name, c.org_name, e.contract_id), coalesce(e.enrollment, 0)) AS parent_org, coalesce(sum(e.enrollment), 0) AS enrollment
             FROM ma_enroll e JOIN ma_contract c ON c.contract_id = e.contract_id AND c.plan_id IS NOT DISTINCT FROM e.plan_id WHERE c.segment = 'MA' GROUP BY 1),
       j AS (SELECT k.*, s.rating_2026, s.status_2026, s.rating_2027 FROM k LEFT JOIN ma_stars s USING (contract_id)),
       pa AS (SELECT j.parent_org, sum(n.enrollment * j.rating_2026) / nullif(sum(n.enrollment), 0) AS parent_avg FROM j JOIN ma_contract_nov n USING (contract_id) WHERE j.rating_2026 IS NOT NULL GROUP BY 1)
  SELECT j.contract_id, j.parent_org, j.enrollment, j.rating_2026, j.status_2026, j.rating_2027,
         CASE WHEN j.rating_2026 IS NOT NULL THEN 'rated'
              WHEN j.status_2026 ILIKE 'Not enough data%' THEN 'low enrollment'
              WHEN pa.parent_avg IS NOT NULL THEN 'parent average' ELSE 'new' END AS basis,
         CASE WHEN j.rating_2026 IS NOT NULL THEN j.rating_2026
              WHEN j.status_2026 ILIKE 'Not enough data%' THEN NULL
              WHEN pa.parent_avg IS NOT NULL THEN round(pa.parent_avg * 2) / 2 END AS qbp_rating
  FROM j LEFT JOIN pa USING (parent_org)""")
con.execute("""ALTER TABLE ma_contract_qbp ADD COLUMN bonus DOUBLE; ALTER TABLE ma_contract_qbp ADD COLUMN rebate_pct DOUBLE;
  UPDATE ma_contract_qbp SET bonus = CASE WHEN qbp_rating IS NULL THEN 3.5 WHEN qbp_rating >= 4 THEN 5 ELSE 0 END,
                             rebate_pct = CASE WHEN qbp_rating IS NULL THEN 65 WHEN qbp_rating >= 4.5 THEN 70 WHEN qbp_rating >= 3.5 THEN 65 ELSE 50 END""")
qbp = con.execute("""SELECT count(*), sum(enrollment), sum(enrollment) FILTER (WHERE basis = 'rated') / sum(enrollment), sum(enrollment) FILTER (WHERE basis = 'parent average') / sum(enrollment),
     sum(enrollment) FILTER (WHERE basis = 'low enrollment') / sum(enrollment), sum(enrollment) FILTER (WHERE basis = 'new') / sum(enrollment),
     sum(enrollment) FILTER (WHERE bonus = 5) / sum(enrollment), sum(enrollment) FILTER (WHERE bonus = 3.5) / sum(enrollment),
     sum(enrollment * rating_2026) FILTER (WHERE basis = 'rated') / sum(enrollment) FILTER (WHERE basis = 'rated'),
     sum(enrollment) FILTER (WHERE rating_2027 >= 4) / sum(enrollment) FILTER (WHERE rating_2027 IS NOT NULL), sum(enrollment * rebate_pct) / sum(enrollment) FROM ma_contract_qbp""").fetchall()[0]
assert qbp[2] > 0.90, f"only {qbp[2]:.1%} of MA enrollment is in a contract with a 2026 Star Rating"
# Reasonableness check against CMS's own published figures (2027 Star Ratings fact sheet): enrollment-weighted average MA-PD overall rating 4.01 for 2026 (after the June 2026
# updates) and 3.99 for 2027, with about 71% of MA-PD enrollees in contracts at 4 stars or more for 2027.
chk = con.execute("""SELECT (SELECT sum(n.enrollment * s.overall_2026) / sum(n.enrollment) FROM ma_contract_nov n JOIN ma_stars s USING (contract_id) WHERE s.overall_2026 IS NOT NULL AND n.plan_type IN ('HMO/HMOPOS','Local PPO','Regional PPO','PFFS','MSA')),
    (SELECT sum(n.enrollment) FILTER (WHERE s.overall_2026 >= 4) / sum(n.enrollment) FROM ma_contract_nov n JOIN ma_stars s USING (contract_id) WHERE s.overall_2026 IS NOT NULL AND n.plan_type IN ('HMO/HMOPOS','Local PPO','Regional PPO','PFFS','MSA')),
    (SELECT sum(enrollment * rating_2027) / sum(enrollment) FROM ma_contract_qbp WHERE rating_2027 IS NOT NULL)""").fetchall()[0]
assert abs(chk[0] - 4.01) < 0.02 and abs(chk[2] - 3.99) < 0.02 and abs(qbp[9] - 0.71) < 0.01, chk

# ---------------------------------------------------------------- CMS Plan Payment Data, Part C, 2024 (the latest reconciled year): per plan, the average risk score,
# the average A/B payment STANDARDIZED TO A 1.0 RISK SCORE (the plan's standardized bid when it bids below the benchmark) and the average rebate, $ per member per month
PP = RAW / "plan_payment" / "pp2024" / "2024PartCPlanLevel.xlsx"
pp_rows = [list(r) for r in openpyxl.load_workbook(PP, read_only=True).worksheets[0].iter_rows(values_only=True)]
phi = next(i for i, r in enumerate(pp_rows) if r and str(r[0]).strip() == "Contract Number")
assert [str(c).strip() for c in pp_rows[phi]] == ['Contract Number', 'Plan Benefit Package', 'Contract Name', 'Plan Type', 'Average A/B PM/PM Payment', 'Average Part C Risk Score', 'Average Rebate PM/PM Payment'], pp_rows[phi]
def _f(v):
    t = "" if v is None else str(v).strip()
    return None if t in ("", "None", "*") else float(t)     # float() raises on anything else
pay = [(str(r[0]).strip(), str(r[1]).strip().zfill(3), str(r[3]).strip() if r[3] else None, _f(r[4]), _f(r[5]), _f(r[6])) for r in pp_rows[phi + 1:] if r and r[0] and re.fullmatch(r"[A-Z]\d{4}", str(r[0]).strip())]
assert len(pay) == len({(a, b) for a, b, *_ in pay}) and len(pay) > 4000, len(pay)
con.execute("CREATE OR REPLACE TABLE ma_plan_pay (contract_id VARCHAR, plan_id VARCHAR, plan_type VARCHAR, ab_std DOUBLE, risk DOUBLE, rebate DOUBLE)")
con.executemany("INSERT INTO ma_plan_pay VALUES (?,?,?,?,?,?)", pay)
assert one("SELECT count(*) FROM ma_plan_pay WHERE risk NOT BETWEEN 0.3 AND 5 OR ab_std NOT BETWEEN 200 AND 4000 OR rebate < 0 OR rebate > 1500") == 0, "a 2024 plan payment value is outside a plausible range"

# ---------------------------------------------------------------- CMS Medical Loss Ratio data release, contract year 2023 (the latest published): what each MA contract
# reported to CMS as revenue, claims and its medical loss ratio. Contract level, Parts C and D together. CMS leaves out single-plan and non-credible contracts.
MLR = RAW / "mlr" / "m2023" / "CY-2023-MLR-Data-Release-File.xlsx"
mrows = [list(r) for r in openpyxl.load_workbook(MLR, read_only=True).worksheets[0].iter_rows(values_only=True)]
mh = [str(c).strip() for c in mrows[0]]
MC = {k: mh.index(k) for k in ["Contract Number", "Contract Year", "7 Total Member months", "1.2 MA Plan Payments PMPM", "1.10 Total Revenue PMPM",
                               "2.1a Claims Incurred for benefits covered under Parts A & B PMPM", "1.3 MLR Numerator", "2.3 MLR Denominator", "4.1 Unadjusted MLR"]}   # .index raises if CMS renames a column
def _fm(v):
    """CMS masks some cells in this file with text such as '0.84SUPPRESSED99'; those are suppressed (None), never read as numbers. Anything else must parse."""
    t = "" if v is None else str(v).strip()
    return None if t in ("", "None", "*") or "SUPPRESS" in t.upper() else float(t)
mlr = []
for r in mrows[1:]:
    cid = str(r[MC["Contract Number"]]).strip() if r[MC["Contract Number"]] else ""
    if not re.fullmatch(r"[A-Z]\d{4}", cid): continue
    assert str(r[MC["Contract Year"]]).strip() == "2023", r[:3]
    mm, m_num, m_den = _fm(r[MC["7 Total Member months"]]), _fm(r[MC["1.3 MLR Numerator"]]), _fm(r[MC["2.3 MLR Denominator"]])
    ok = mm is not None and mm > 0
    mlr.append((cid, mm, _fm(r[MC["1.2 MA Plan Payments PMPM"]]), _fm(r[MC["1.10 Total Revenue PMPM"]]), _fm(r[MC["2.1a Claims Incurred for benefits covered under Parts A & B PMPM"]]),
                m_num / mm if ok and m_num is not None else None, m_den / mm if ok and m_den is not None else None, _fm(r[MC["4.1 Unadjusted MLR"]])))
assert len(mlr) == len({m[0] for m in mlr}) and len(mlr) > 500, len(mlr)
con.execute("CREATE OR REPLACE TABLE ma_mlr (contract_id VARCHAR, member_months DOUBLE, ma_pay DOUBLE, revenue DOUBLE, ab_claims DOUBLE, num_pm DOUBLE, den_pm DOUBLE, mlr DOUBLE)")
con.executemany("INSERT INTO ma_mlr VALUES (?,?,?,?,?,?,?,?)", mlr)
# every published ratio must equal numerator / denominator (the file is internally consistent or we do not use it)
assert one("SELECT count(*) FROM ma_mlr WHERE mlr IS NOT NULL AND den_pm > 0 AND abs(num_pm / den_pm - mlr) > 0.002") == 0, "an MLR does not equal its numerator over its denominator"

# MA plan x county, visible enrollment only ('*' = 10 or fewer enrollees, never treated as zero); PDPs are not health plans for this purpose.
# Grouped by payment tier so the app can price each member at their own contract's benchmark; the *_x columns are enrollment-weighted sums of the 2024 plan figures.
con.execute("""CREATE OR REPLACE TABLE ma_parent_county AS
  SELECT coalesce(c.parent_org, c.org_marketing_name, c.org_name, e.contract_id) AS parent_org, e.fips, c.segment, (c.snp = 'Yes') AS snp, (c.eghp = 'Yes') AS eghp,
         q.bonus, q.rebate_pct, q.qbp_rating AS stars, q.basis,
         sum(e.enrollment) AS enrollment, count(*) FILTER (WHERE e.suppressed) AS suppressed_cells, count(*) AS plan_cells, count(DISTINCT e.contract_id) AS contracts,
         sum(e.enrollment) FILTER (WHERE q.rating_2027 IS NOT NULL) AS enr_next, sum(e.enrollment * q.rating_2027) AS stars_next_x, sum(e.enrollment) FILTER (WHERE q.rating_2027 >= 4) AS enr_next4,
         sum(e.enrollment) FILTER (WHERE p.risk IS NOT NULL AND p.ab_std IS NOT NULL AND p.rebate IS NOT NULL) AS enr_pay,
         sum(e.enrollment * p.risk) FILTER (WHERE p.ab_std IS NOT NULL AND p.rebate IS NOT NULL) AS risk_x, sum(e.enrollment * p.rebate) FILTER (WHERE p.risk IS NOT NULL AND p.ab_std IS NOT NULL) AS rebate_x,
         sum(e.enrollment * p.ab_std * p.risk) FILTER (WHERE p.rebate IS NOT NULL) AS base_x,
         -- the plan's own standardized bid, and the benchmark-minus-bid gap its 2024 rebate implies: rebate = rebate share x risk x (benchmark - bid). The rebate share is the
         -- contract's 2027 one (its 2024 share is not loaded), so the implied bid ratio ab_x / (ab_x + gap_x) is an estimate and is labelled as one.
         -- Employer-group plans are left out of both: CMS pays them a set rate with no separate rebate, so their payments say nothing about a bid.
         sum(e.enrollment * p.ab_std) FILTER (WHERE p.risk IS NOT NULL AND p.rebate IS NOT NULL AND c.eghp <> 'Yes') AS ab_x,
         sum(e.enrollment * p.rebate / (q.rebate_pct / 100.0 * p.risk)) FILTER (WHERE p.ab_std IS NOT NULL AND c.eghp <> 'Yes') AS gap_x,
         -- the contract's 2023 medical-loss-ratio filing, weighted by today's members: MA payment, total revenue (Parts C and D, premiums), Parts A and B claims, MLR numerator and denominator
         sum(e.enrollment) FILTER (WHERE m.den_pm > 0 AND m.num_pm IS NOT NULL AND m.ma_pay > 0 AND m.revenue > 0 AND m.ab_claims > 0) AS enr_mlr,
         sum(e.enrollment * m.ma_pay) FILTER (WHERE m.den_pm > 0 AND m.num_pm IS NOT NULL AND m.ma_pay > 0 AND m.revenue > 0 AND m.ab_claims > 0) AS mlr_pay_x,
         sum(e.enrollment * m.revenue) FILTER (WHERE m.den_pm > 0 AND m.num_pm IS NOT NULL AND m.ma_pay > 0 AND m.revenue > 0 AND m.ab_claims > 0) AS mlr_rev_x,
         sum(e.enrollment * m.ab_claims) FILTER (WHERE m.den_pm > 0 AND m.num_pm IS NOT NULL AND m.ma_pay > 0 AND m.revenue > 0 AND m.ab_claims > 0) AS mlr_ab_x,
         sum(e.enrollment * m.num_pm) FILTER (WHERE m.den_pm > 0 AND m.num_pm IS NOT NULL AND m.ma_pay > 0 AND m.revenue > 0 AND m.ab_claims > 0) AS mlr_num_x,
         sum(e.enrollment * m.den_pm) FILTER (WHERE m.den_pm > 0 AND m.num_pm IS NOT NULL AND m.ma_pay > 0 AND m.revenue > 0 AND m.ab_claims > 0) AS mlr_den_x
  FROM ma_enroll e JOIN ma_contract c ON c.contract_id = e.contract_id AND c.plan_id IS NOT DISTINCT FROM e.plan_id
  LEFT JOIN ma_contract_qbp q ON q.contract_id = e.contract_id AND c.segment = 'MA'
  LEFT JOIN ma_plan_pay p ON p.contract_id = e.contract_id AND p.plan_id = e.plan_id AND c.segment = 'MA'
  LEFT JOIN ma_mlr m ON m.contract_id = e.contract_id AND c.segment = 'MA'
  WHERE e.fips IS NOT NULL AND c.segment <> 'PDP'
  GROUP BY ALL""")
assert one("SELECT count(*) FROM ma_parent_county WHERE segment = 'MA' AND (bonus IS NULL OR rebate_pct IS NULL)") == 0, "an MA contract has no payment tier"
pay24 = con.execute("""SELECT sum(enr_pay) / sum(enrollment), sum(risk_x) / sum(enr_pay), sum(base_x) / sum(enr_pay), sum(rebate_x) / sum(enr_pay), sum(ab_x) / (sum(ab_x) + sum(gap_x)),
     sum(rebate_x) FILTER (WHERE NOT eghp AND NOT snp) / sum(enr_pay) FILTER (WHERE NOT eghp AND NOT snp), sum(rebate_x) FILTER (WHERE NOT eghp) / sum(enr_pay) FILTER (WHERE NOT eghp)
     FROM ma_parent_county WHERE segment = 'MA'""").fetchall()[0]
mlr23 = con.execute("""SELECT sum(enr_mlr) / sum(enrollment), sum(mlr_pay_x) / sum(enr_mlr), sum(mlr_rev_x) / sum(enr_mlr), sum(mlr_ab_x) / sum(enr_mlr), sum(mlr_num_x) / sum(mlr_den_x)
     FROM ma_parent_county WHERE segment = 'MA'""").fetchall()[0]
assert 0.80 < mlr23[4] < 0.95 and 900 < mlr23[1] < 1500, mlr23     # MA plans must spend at least 85% of revenue on care; a national figure outside 80-95% means the file was misread
# Reasonableness checks against MedPAC (March 2024 report, ch. 12): 2024 rebates of $194 a month for conventional plans and $209 including special-needs plans (both from bids,
# excluding employer plans), and bids at 82% of FFS against benchmarks at 108% (a bid-to-benchmark ratio of about 76%). CMS's actual 2024 payments should land near these.
assert abs(pay24[5] / 194 - 1) < 0.10 and abs(pay24[6] / 209 - 1) < 0.10 and 0.74 < pay24[4] < 0.82, pay24
cpsc = con.execute("""SELECT sum(enrollment) FILTER (WHERE segment='MA'), sum(enrollment), sum(suppressed_cells), sum(plan_cells), count(DISTINCT parent_org) FROM ma_parent_county""").fetchall()[0]
unj = one("SELECT count(*) FROM ma_enroll e LEFT JOIN ma_contract c ON c.contract_id = e.contract_id AND c.plan_id IS NOT DISTINCT FROM e.plan_id WHERE c.contract_id IS NULL")
assert unj == 0, f"{unj} enrollment rows have no contract record"

# ---------------------------------------------------------------- 2027 MA ratebook (county benchmark, $ per member per month)
RB = RAW / "ratebook" / "CSV" / "CountyRate2027.csv"
import csv as _csv
rb_rows = []
with open(RB, encoding="utf-8-sig", newline="") as fh:
    rdr = _csv.reader(fh); hdr = None
    for row in rdr:
        if row and row[0].strip() == "Code": hdr = [h.strip() for h in row]; continue
        if hdr and row and re.fullmatch(r"\d{5}", row[0].strip()):
            vals = []
            for v in row[3:7]:
                v = v.strip().replace(",", "")
                vals.append(float(v) if v not in ("", "*") else None)   # float() raises on anything unexpected: no silent coercion
            rb_rows.append((row[0].strip(), row[1].strip(), row[2].strip(), *vals))
assert hdr == ['Code', 'State', 'County Name', 'Parts A&B 5% Bonus 2027 Rate', 'Parts A&B 3.5% Bonus 2027 Rate', 'Parts A&B 0% Bonus 2027 Rate', 'Parts A&B ESRD 2027 Rate'], hdr
con.execute("CREATE OR REPLACE TABLE ma_ratebook (ssa VARCHAR, state_name VARCHAR, county_name VARCHAR, rate_5 DOUBLE, rate_35 DOUBLE, rate_0 DOUBLE, rate_esrd DOUBLE)")
con.executemany("INSERT INTO ma_ratebook VALUES (?,?,?,?,?,?,?)", rb_rows)
n_rb = one("SELECT count(*) FROM ma_ratebook"); assert n_rb > 3100 and n_rb == one("SELECT count(DISTINCT ssa) FROM ma_ratebook"), n_rb
assert one("SELECT count(*) FROM ma_ratebook WHERE rate_5 < rate_35 OR rate_35 < rate_0") == 0, "a bonus rate is below the base rate"
# The same ratebook publishes what CMS pays employer-group plans in each county by star category. CMS builds those from the county benchmark and the national average
# bid-to-benchmark ratio of individual-market plans in the county's quartile (77.7% to 78.7% for 2027):   payment = benchmark x [ratio + rebate share x (1 - ratio)].
# We read each county's ratio back out of the "<3.5 stars" column and then REQUIRE that the other four published columns are reproduced to the cent by the same formula.
# That is the check that the payment arithmetic in the app is CMS's own.
eg_rows = []
with open(RAW / "ratebook" / "CSV" / "Local EGWP Rates 2027.csv", encoding="utf-8-sig", newline="") as fh:
    ehdr = None
    for row in _csv.reader(fh):
        if row and row[0].strip() == "Code": ehdr = [re.sub(r"\s+", " ", h.replace("–", "-")).strip() for h in row]; continue
        if ehdr and row and re.fullmatch(r"\d{5}", row[0].strip()): eg_rows.append((row[0].strip(), *[float(v.replace(",", "").strip()) for v in row[3:8]]))
assert ehdr[3:8] == ['Part A/B Rate - 4.5 and 5 stars', 'Part A/B Rate - 4 stars', 'Part A/B Rate - 3.5 stars', 'Part A/B Rate - <3.5 stars', 'Part A/B Rate - low enrollment / new contract under new parent org'], ehdr
con.execute("CREATE OR REPLACE TABLE ma_egwp (ssa VARCHAR, r45 DOUBLE, r4 DOUBLE, r35 DOUBLE, rlt35 DOUBLE, rnew DOUBLE)"); con.executemany("INSERT INTO ma_egwp VALUES (?,?,?,?,?,?)", eg_rows)
con.execute("ALTER TABLE ma_ratebook ADD COLUMN bid_ratio DOUBLE")
con.execute("UPDATE ma_ratebook b SET bid_ratio = (e.rlt35 / b.rate_0 - 0.5) / 0.5 FROM ma_egwp e WHERE e.ssa = b.ssa AND b.rate_0 > 0")
egchk = con.execute("""SELECT count(*), min(bid_ratio), max(bid_ratio),
    max(greatest(abs(r45 - rate_5 * (bid_ratio + 0.70 * (1 - bid_ratio))), abs(r4 - rate_5 * (bid_ratio + 0.65 * (1 - bid_ratio))),
                 abs(r35 - rate_0 * (bid_ratio + 0.65 * (1 - bid_ratio))), abs(rnew - rate_35 * (bid_ratio + 0.65 * (1 - bid_ratio)))))
    FROM ma_ratebook b JOIN ma_egwp e USING (ssa) WHERE bid_ratio IS NOT NULL""").fetchall()[0]
assert egchk[0] > 3100 and 0.77 < egchk[1] and egchk[2] < 0.79 and egchk[3] < 0.02, egchk

# ---------------------------------------------------------------- MSSP county risk scores (SSA codes) (SSA codes; crosswalk from the CPSC file)
MS = f"read_csv('{RAW}/mssp_county_risk.csv', all_varchar=true)"
MS_NUM = [f"{a}_{b}" for b in ("ESRD", "DIS", "AGDU", "AGND") for a in ("PER_CAPITA_EXP", "AVG_RISK_SCORE", "AVG_DEMOG_SCORE", "PERSON_YEARS")]
assert_lossless(MS, MS_NUM)
con.execute(f"""CREATE OR REPLACE TABLE mssp_county AS SELECT CAST(YEAR AS INTEGER) AS year, STATE_NAME AS state_name, COUNTY_NAME AS county_name,
    lpad(trim(STATE_ID), 2, '0') AS ssa_state, lpad(trim(COUNTY_ID), 3, '0') AS ssa_county, {', '.join(num(c) for c in MS_NUM)} FROM {MS}""")
# person-year-weighted average risk score across the four enrollment types (a category with suppressed values drops out of both sums)
con.execute("""CREATE OR REPLACE TABLE mssp_county_risk AS SELECT *,
    (coalesce(person_years_esrd*avg_risk_score_esrd,0) + coalesce(person_years_dis*avg_risk_score_dis,0) + coalesce(person_years_agdu*avg_risk_score_agdu,0) + coalesce(person_years_agnd*avg_risk_score_agnd,0))
      / nullif(CASE WHEN avg_risk_score_esrd IS NOT NULL THEN coalesce(person_years_esrd,0) ELSE 0 END + CASE WHEN avg_risk_score_dis IS NOT NULL THEN coalesce(person_years_dis,0) ELSE 0 END
             + CASE WHEN avg_risk_score_agdu IS NOT NULL THEN coalesce(person_years_agdu,0) ELSE 0 END + CASE WHEN avg_risk_score_agnd IS NOT NULL THEN coalesce(person_years_agnd,0) ELSE 0 END, 0) AS avg_risk_score,
    coalesce(person_years_esrd,0) + coalesce(person_years_dis,0) + coalesce(person_years_agdu,0) + coalesce(person_years_agnd,0) AS person_years
  FROM mssp_county""")
mssp_year = one("SELECT max(year) FROM mssp_county")
NORM = lambda c: f"regexp_replace(regexp_replace(upper(strip_accents({c})), '\\s+(COUNTY|PARISH|BOROUGH|CENSUS AREA|MUNICIPALITY|MUNICIPIO|CITY AND BOROUGH|PLANNING REGION)$', ''), '[^A-Z0-9]', '', 'g')"
# CMS provider files abbreviate a handful of county names. Each alias below is an abbreviation of exactly one county-equivalent in that state
# (checked against the enrollment file's own list); nothing is matched on similarity. Connecticut HOSPITALS still carry the eight pre-2022 counties,
# which do not map one-to-one onto the nine planning regions CMS now uses, so they stay unmatched and are reported as such.
ALIAS = {('CT', 'CAPITOL'): 'Capitol', ('CT', 'SOUTH CENTRAL CT'): 'South Central Connecticut', ('CT', 'NAUGATUCK VLY'): 'Naugatuck Valley', ('CT', 'WESTERN CT'): 'Western Connecticut',
         ('CT', 'LOWER CT RIVER VLY'): 'Lower Connecticut River Valley', ('CT', 'GREATER BRIDGEPORT'): 'Greater Bridgeport', ('CT', 'SOUTHEASTERN CT'): 'Southeastern Connecticut',
         ('CT', 'NW HILLS'): 'Northwest Hills', ('CT', 'NORTHEASTERN CT'): 'Northeastern Connecticut',
         ('LA', 'E. BATON ROUGE'): 'East Baton Rouge', ('LA', 'W. BATON ROUGE'): 'West Baton Rouge', ('LA', 'JEFFRSON DAVIS'): 'Jefferson Davis', ('LA', 'ST. JOHN BAPTIST'): 'St. John The Baptist',
         ('DC', 'THE DISTRICT'): 'District Of Columbia', ('PA', 'NORTHUMBERLND'): 'Northumberland', ('NE', 'SCOTT BLUFF'): 'Scotts Bluff', ('MN', 'YELLOW MEDCINE'): 'Yellow Medicine',
         ('MN', 'LAKE OF  WOODS'): 'Lake Of The Woods', ('VA', 'POQUOSON'): 'Poquoson City', ('AK', 'NORTHWEST ARTIC BOROUGH'): 'Northwest Arctic', ('AK', 'NORTH SLOPE BOROUH'): 'North Slope'}
con.execute("CREATE OR REPLACE TEMP TABLE county_alias (state VARCHAR, raw VARCHAR, canon VARCHAR)")
con.executemany("INSERT INTO county_alias VALUES (?,?,?)", [(k[0], k[1], v) for k, v in ALIAS.items()])
py_all = one("SELECT sum(person_years) FROM mssp_county_risk"); py_ok = one("SELECT sum(r.person_years) FROM mssp_county_risk r JOIN ssa_fips x USING (ssa_state, ssa_county)")
assert py_ok / py_all > 0.995, f"SSA->FIPS crosswalk covers only {py_ok/py_all:.4f} of MSSP person-years"

# ---------------------------------------------------------------- the county table the app uses
con.execute("""CREATE OR REPLACE TABLE uw_county AS
  SELECT e.fips, e.state, e.county_name, c.cbsa, c.cbsa_title, c.cbsa_type, c.central_outlying,
         e.tot_benes AS enr_total, e.orgnl_mdcr_benes AS enr_ffs, e.ma_and_oth_benes AS enr_ma, e.dual_tot_benes AS enr_dual,
         g.benes_om_cnt AS gv_ffs_benes, g.benes_ma_cnt AS gv_ma_benes, g.ma_prtcptn_rate AS gv_ma_rate, g.bene_dual_pct AS gv_dual_pct,
         g.tot_mdcr_pymt_pc AS ffs_total_pc, g.tot_mdcr_stdzd_pymt_pc AS ffs_total_std_pc,
         g.ip_cvrd_stays_per_1000_benes AS ffs_ip_stays, g.ip_cvrd_days_per_1000_benes AS ffs_ip_days, g.ip_mdcr_pymt_amt AS ffs_ip_pymt, g.ip_mdcr_pymt_pc AS ffs_ip_pc,
         g.acute_hosp_readmsn_pct AS ffs_readm_rate, g.acute_hosp_readmsn_cnt AS ffs_readm_cnt, g.er_visits_per_1000_benes AS ffs_er_visits,
         g.snf_cvrd_stays_per_1000_benes AS ffs_snf_stays, g.snf_cvrd_days_per_1000_benes AS ffs_snf_days, g.snf_mdcr_pymt_amt AS ffs_snf_pymt, g.snf_mdcr_pymt_pc AS ffs_snf_pc,
         g.irf_cvrd_stays_per_1000_benes AS ffs_irf_stays, g.irf_cvrd_days_per_1000_benes AS ffs_irf_days, g.irf_mdcr_pymt_amt AS ffs_irf_pymt, g.irf_mdcr_pymt_pc AS ffs_irf_pc,
         g.ltch_cvrd_stays_per_1000_benes AS ffs_ltch_stays, g.ltch_cvrd_days_per_1000_benes AS ffs_ltch_days, g.ltch_mdcr_pymt_amt AS ffs_ltch_pymt, g.ltch_mdcr_pymt_pc AS ffs_ltch_pc,
         g.hh_episodes_per_1000_benes AS ffs_hh_episodes, g.hh_mdcr_pymt_amt AS ffs_hh_pymt, g.hh_mdcr_pymt_pc AS ffs_hh_pc,
         g.dme_mdcr_pymt_pc AS ffs_dme_pc, g.hospc_mdcr_pymt_pc AS ffs_hospice_pc,
         r.avg_risk_score AS ffs_risk_score, r.person_years AS risk_person_years,
         b.rate_0 AS ma_rate_0, b.rate_35 AS ma_rate_35, b.rate_5 AS ma_rate_5, b.bid_ratio AS ma_bid_ratio,
         p.ma_enrollment AS cpsc_ma_enrollment, p.suppressed_cells AS cpsc_suppressed_cells
  FROM enrollment_county e
  LEFT JOIN gv g ON g.year = 2024 AND g.geo_level = 'County' AND g.age_level = 'All' AND g.geo_code = e.fips
  LEFT JOIN cbsa_county c ON c.fips = e.fips
  LEFT JOIN ssa_primary x ON x.fips = e.fips
  LEFT JOIN (SELECT x.fips, sum(m.person_years * m.avg_risk_score) / nullif(sum(CASE WHEN m.avg_risk_score IS NOT NULL THEN m.person_years END), 0) AS avg_risk_score, sum(m.person_years) AS person_years
             FROM mssp_county_risk m JOIN ssa_fips x USING (ssa_state, ssa_county) GROUP BY 1) r ON r.fips = e.fips
  LEFT JOIN ma_ratebook b ON b.ssa = x.ssa
  LEFT JOIN (SELECT fips, sum(enrollment) FILTER (WHERE segment = 'MA') AS ma_enrollment, sum(suppressed_cells) FILTER (WHERE segment = 'MA') AS suppressed_cells FROM ma_parent_county GROUP BY 1) p ON p.fips = e.fips""")
n_uw = one("SELECT count(*) FROM uw_county"); assert n_uw == one("SELECT count(DISTINCT fips) FROM uw_county")
cov = con.execute("""SELECT sum(enr_ma) FILTER (WHERE ffs_snf_days IS NOT NULL) / sum(enr_ma), sum(enr_ma) FILTER (WHERE ffs_risk_score IS NOT NULL) / sum(enr_ma),
                            sum(enr_ma) FILTER (WHERE cbsa IS NOT NULL) / sum(enr_ma), sum(enr_ma), count(*) FILTER (WHERE gv_ffs_benes IS NULL) FROM uw_county""").fetchall()[0]
assert cov[0] > 0.97 and cov[1] > 0.97, cov

# ---------------------------------------------------------------- cost reports (one report per CCN: the longest period in the fiscal-year file)
def load_cost(table, csv, name_col, numeric, extra_text=()):
    src = f"read_csv('{RAW}/{csv}', all_varchar=true)"
    assert_lossless(src, numeric)
    text = ", ".join(f'"{c}" AS {re.sub("[^a-z0-9]+", "_", c.lower()).strip("_")}' for c in extra_text)
    cols = ", ".join(num(c, re.sub("[^a-z0-9]+", "_", c.lower()).strip("_")) for c in numeric)
    con.execute(f"""CREATE OR REPLACE TABLE {table} AS
      WITH s AS (SELECT lpad(trim("Provider CCN"), 6, '0') AS ccn, "{name_col}" AS name, "State Code" AS state, County AS county, nullif(trim("Medicare CBSA Number"),'') AS medicare_cbsa,
                        strptime("Fiscal Year Begin Date", '%m/%d/%Y')::DATE AS fy_begin, strptime("Fiscal Year End Date", '%m/%d/%Y')::DATE AS fy_end{', ' + text if text else ''}, {cols}
                 FROM {src}),
           r AS (SELECT *, date_diff('day', fy_begin, fy_end) + 1 AS period_days, row_number() OVER (PARTITION BY ccn ORDER BY date_diff('day', fy_begin, fy_end) DESC, fy_end DESC) AS rn, count(*) OVER (PARTITION BY ccn) AS n_reports FROM s)
      SELECT * EXCLUDE (rn) FROM r WHERE rn = 1""")
    return one(f"SELECT count(*) FROM {table}"), one(f"SELECT count(*) FROM {table} WHERE period_days BETWEEN 360 AND 371"), one(f"SELECT count(*) FROM {src}")

SNF_NUM = ["Total Days Title XVIII", "Total Days Title XIX", "Total Days Other", "Total Days Total", "Number of Beds", "Total Bed Days Available",
           "Total Discharges Title XVIII", "Total Discharges Total", "SNF Days Title XVIII", "SNF Days Title XIX", "SNF Days Other", "SNF Days Total", "SNF Number of Beds", "SNF Bed Days Available",
           "SNF Admissions Title XVIII", "SNF Admissions Total", "NF Days Total", "Total Costs", "Net Patient Revenue", "Less Total Operating Expense", "Net Income from service to patients", "Net Income", "Inpatient PPS Amount", "Total Salaries (adjusted)", "Contract Labor"]
snf_n = load_cost("snf_cost", "snf_cost_report.csv", "Facility Name", SNF_NUM, ("Type of Control", "Rural versus Urban"))
HOSP_NUM = ["Total Days Title XVIII", "Total Days Title XIX", "Total Days (V + XVIII + XIX + Unknown)", "Number of Beds", "Total Bed Days Available",
            "Total Discharges Title XVIII", "Total Discharges Title XIX", "Total Discharges (V + XVIII + XIX + Unknown)", "Total Costs", "Inpatient Total Charges", "Combined Outpatient + Inpatient Total Charges",
            "DRG Amounts Other Than Outlier Payments", "DRG Amounts Before October 1", "DRG Amounts After October 1", "Outlier Payments For Discharges", "Managed Care Simulated Payments",
            "Inpatient Revenue", "Total Patient Revenue", "Net Patient Revenue", "Less Total Operating Expense", "Net Income from Service to Patients", "Net Income", "Cost To Charge Ratio"]
hosp_n = load_cost("hospital_cost", "hospital_cost_report.csv", "Hospital Name", HOSP_NUM, ("CCN Facility Type", "Provider Type", "Type of Control", "Rural Versus Urban"))

# ---------------------------------------------------------------- PAC PUFs: state and national rows (prices per stay / episode / day), 2024
for t in ("hha", "irf", "ltch"):
    src = f"read_csv('{RAW}/pac_{t}.csv', all_varchar=true)"
    P = ["BENE_DSTNCT_CNT", "TOT_EPSD_STAY_CNT", "TOT_SRVC_DAYS", "TOT_MDCR_PYMT_AMT", "TOT_MDCR_STDZD_PYMT_AMT", "BENE_AVG_RISK_SCRE"]
    assert_lossless(src, P)
    con.execute(f"""CREATE OR REPLACE TABLE pac_{t} AS SELECT CAST(YEAR AS INTEGER) AS year, SMRY_CTGRY AS level, SRVC_CTGRY AS service, nullif(trim(PRVDR_ID),'') AS provider_id, PRVDR_NAME AS provider_name, PRVDR_CITY AS city, STATE AS state, PRVDR_ZIP AS zip, {', '.join(num(c) for c in P)} FROM {src}""")

# ---------------------------------------------------------------- facility / hospital -> county FIPS (state + normalized county name; exact, unique matches only)
con.execute(f"""CREATE OR REPLACE TABLE snf_geo AS
  WITH e AS (SELECT state, {NORM('county_name')} AS k, min(fips) AS fips, count(*) AS n FROM enrollment_county GROUP BY 1,2)
  SELECT f.ccn, e.fips, c.cbsa FROM facility_master f LEFT JOIN county_alias a ON a.state = f.state AND a.raw = upper(trim(f.county_parish))
  JOIN e ON e.state = f.state AND e.k = {NORM('coalesce(a.canon, f.county_parish)')} AND e.n = 1 LEFT JOIN cbsa_county c ON c.fips = e.fips""")
con.execute(f"""CREATE OR REPLACE TABLE hospital_geo AS
  WITH e AS (SELECT state, {NORM('county_name')} AS k, min(fips) AS fips, count(*) AS n FROM enrollment_county GROUP BY 1,2)
  SELECT h.hospital_ccn, e.fips, c.cbsa FROM hospital_master h LEFT JOIN county_alias a ON a.state = h.state AND a.raw = upper(trim(h.county))
  JOIN e ON e.state = h.state AND e.k = {NORM('coalesce(a.canon, h.county)')} AND e.n = 1 LEFT JOIN cbsa_county c ON c.fips = e.fips""")
snf_geo = (one("SELECT count(*) FROM snf_geo"), one("SELECT count(*) FROM facility_master")); hosp_geo = (one("SELECT count(*) FROM hospital_geo"), one("SELECT count(*) FROM hospital_master"))
assert snf_geo[0] / snf_geo[1] > 0.995 and hosp_geo[0] / hosp_geo[1] > 0.985, (snf_geo, hosp_geo)
# every alias must have been used against a real county (a typo in the alias table would silently match nothing)
for (st, raw), canon in ALIAS.items():
    assert one(f"SELECT count(*) FROM enrollment_county WHERE state = ? AND {NORM('county_name')} = {NORM('?')}", st, canon) == 1, (st, raw, canon)

# ---------------------------------------------------------------- hospital payment programs (FY 2027 IPPS final rule, CMS-1849-F)
# Table 15: each hospital's Hospital Readmissions Reduction Program payment adjustment factor (1.0000 = no penalty; floor 0.9700). Maryland hospitals are exempt and absent.
# Table 16A: PROXY value-based purchasing adjustment factors (net of the 2% withhold; CMS states these proxies are not used to pay hospitals - the actual Table 16B follows later).
def load_factor(table, path, col):
    rows = []
    for line in open(path, encoding="cp1252"):
        parts = [x.strip() for x in line.rstrip("\r\n").split("\t")]
        if len(parts) >= 2 and re.fullmatch(r"\d{6}", parts[0]):
            rows.append((parts[0], float(parts[1])))          # float() raises on anything non-numeric: nothing is coerced
    assert len(rows) == len({r[0] for r in rows}), f"{table}: duplicate CCNs"
    con.execute(f"CREATE OR REPLACE TABLE {table} (ccn VARCHAR, {col} DOUBLE)")
    con.executemany(f"INSERT INTO {table} VALUES (?, ?)", rows)
    return len(rows)
n_hrrp = load_factor("hospital_hrrp", RAW / "hrrp" / "paf" / "Section 508 version of FY2027_HRRP_Table_15.txt", "hrrp_factor")
n_vbp = load_factor("hospital_vbp", RAW / "vbp" / "t16" / "CMS-1849-F Table 16A.txt", "vbp_factor")
hr = con.execute("SELECT min(hrrp_factor), max(hrrp_factor), count(*) FILTER (WHERE hrrp_factor < 1), avg(1 - hrrp_factor) FROM hospital_hrrp").fetchall()[0]
vb = con.execute("SELECT min(vbp_factor), max(vbp_factor), count(*) FILTER (WHERE vbp_factor < 1) FROM hospital_vbp").fetchall()[0]
assert 0.97 <= hr[0] and hr[1] <= 1.0, hr          # the statutory cap is a 3% reduction
assert 0.98 <= vb[0] and vb[1] < 1.06, vb          # the withhold is 2%, so no factor can be below 0.98
assert n_hrrp > 2500 and n_vbp > 2000, (n_hrrp, n_vbp)

manifest = json.load(open(RAW / "manifest.json"))
summary = {
    "gv_year": 2024, "gv_counties": n_cty, "ma_gv_year": ma_year, "ma_gv_states": n_state,
    "enrollment_month": f"{en_month} {en_year}", "enrollment_national": {"total": en_nat[0], "original_medicare": en_nat[1], "ma_and_other": en_nat[2]},
    "cbsa_counties": n_cbsa_cty, "cbsas": n_cbsa, "mssp_year": mssp_year, "ssa_fips_person_year_coverage": round(py_ok / py_all, 5),
    "cpsc_period": cpsc_period, "cpsc_ma_enrollment_visible": cpsc[0], "cpsc_all_health_plan_enrollment_visible": cpsc[1], "cpsc_suppressed_plan_county_cells": cpsc[2], "cpsc_plan_county_cells": cpsc[3], "cpsc_parent_orgs": cpsc[4],
    "cpsc_contract_lines_transcoded": n_transcoded, "ratebook_year": 2027, "ratebook_counties": n_rb, "ma_enrollment_share_with_ratebook_rate": round(one("SELECT sum(enr_ma) FILTER (WHERE ma_rate_0 IS NOT NULL) / sum(enr_ma) FROM uw_county"), 5),
    "uw_counties": n_uw, "ma_enrollment_share_with_snf_rate": round(cov[0], 5), "ma_enrollment_share_with_risk_score": round(cov[1], 5), "ma_enrollment_share_in_a_cbsa": round(cov[2], 5),
    "national_ma_vs_ffs_2023": {"ma_ip_stays": natr[0], "ffs_ip_stays": natr[1], "ratio_ip_stays": round(natr[2], 4), "ma_snf_days": natr[3], "ffs_snf_days": natr[4], "ratio_snf_days": round(natr[5], 4)},
    "snf_cost": {"ccns": snf_n[0], "full_year_reports": snf_n[1], "reports_in_file": snf_n[2]}, "hospital_cost": {"ccns": hosp_n[0], "full_year_reports": hosp_n[1], "reports_in_file": hosp_n[2]},
    "snf_geo_matched": snf_geo, "hospital_geo_matched": hosp_geo,
    "stars": {"rating_year": 2026, "payment_year": 2027, "next_rating_year": 2027, "ma_contracts": qbp[0], "share_rated": round(qbp[2], 4), "share_parent_average": round(qbp[3], 4), "share_low_enrollment": round(qbp[4], 4),
              "share_new": round(qbp[5], 4), "share_in_5pct_bonus": round(qbp[6], 4), "share_in_3_5pct_bonus": round(qbp[7], 4), "average_rating": round(qbp[8], 3), "share_4plus_next_year": round(qbp[9], 4), "average_rebate_pct": round(qbp[10], 2),
              "check_avg_rating_2026_nov2025_weights": round(chk[0], 3), "check_share_4plus_2026_nov2025_weights": round(chk[1], 4), "check_avg_rating_2027": round(chk[2], 3), "cms_published": {"avg_2026": 4.01, "avg_2027": 3.99, "share_4plus_2027": 0.71}},
    "plan_payment": {"year": 2024, "plans": len(pay), "share_of_ma_enrollment_matched": round(pay24[0], 4), "average_risk_score": round(pay24[1], 4), "average_base_payment_pmpm": round(pay24[2], 2), "average_rebate_pmpm": round(pay24[3], 2), "implied_bid_ratio": round(pay24[4], 4),
                     "rebate_conventional_plans": round(pay24[5], 2), "rebate_non_employer_plans": round(pay24[6], 2), "medpac_2024": {"rebate_conventional": 194, "rebate_with_snps": 209, "bid_pct_of_ffs": 82, "benchmark_pct_of_ffs": 108}},
    "mlr": {"year": 2023, "contracts": len(mlr), "share_of_ma_enrollment_matched": round(mlr23[0], 4), "ma_payment_pmpm": round(mlr23[1], 2), "total_revenue_pmpm": round(mlr23[2], 2), "ab_claims_pmpm": round(mlr23[3], 2), "medical_loss_ratio": round(mlr23[4], 4)},
    "bid_ratio": {"counties": egchk[0], "min": round(egchk[1], 4), "max": round(egchk[2], 4), "max_error_reproducing_cms_egwp_rates_usd": round(egchk[3], 4)},
    "hrrp": {"fiscal_year": 2027, "hospitals": n_hrrp, "penalized": hr[2], "average_penalty": round(hr[3], 5), "largest_penalty": round(1 - hr[0], 4)},
    "vbp": {"fiscal_year": 2027, "proxy": True, "hospitals": n_vbp, "net_losers": vb[2], "min_factor": vb[0], "max_factor": vb[1]},
    "releases": {k: {"dataset": v["dataset"], "period_start": v["period_start"], "modified": v["modified"]} for k, v in manifest.items()},
}
json.dump(summary, open(ROOT / "db" / "underwriting_summary.json", "w"), indent=1)
print(json.dumps(summary, indent=1))
