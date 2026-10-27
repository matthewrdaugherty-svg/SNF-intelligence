"""Services layer: CMS-671 "Long-Term Care Facility Characteristics" (data.cms.gov, quarterly; Q2 2026 release used here).
The CMS-671 is the application form every certified nursing home files and updates at each survey. It gives, per facility:
certification detail (dual / distinct part / SNF-only / NF-only), hospital-based flag, dedicated special-care-unit beds by type
(self-reported), and the resident census by payer at the last survey. Loaded losslessly; census values that cannot be real are
nulled and flagged (see CENSUS RULE). Re-runnable (drops and recreates its own tables only).
Usage: python3 scripts/09_load_ltc671.py
Download: curl -O https://data.cms.gov/sites/default/files/2026-07/4b0024b0-dad0-4039-9d5a-1042655480fb/Form_671_Q2_2026.csv (catalog: data.cms.gov/data.json,
title "Long-Term Care Facility Characteristics : 2026-04-01").
"""
import duckdb, csv, re, json
ROOT="/home/claude/snf-intel"; RAW=f"{ROOT}/raw/ltc671/Form_671_Q2_2026.csv"; DB=f"{ROOT}/db/snf.duckdb"
con=duckdb.connect(DB); LOG=[]
def snake(h):
    s=re.sub(r"[^0-9A-Za-z]+","_",h.strip().replace("%","pct").replace("'","")).strip("_").lower(); s=re.sub(r"_+","_",s)
    return ("c_"+s) if re.match(r"^\d",s) else s
hdr=next(csv.reader(open(RAW,newline="",encoding="utf-8-sig")))
names=[snake(h) for h in hdr]
sel=", ".join(f'"{h}" AS {s}' for h,s in zip(hdr,names))
con.execute("DROP TABLE IF EXISTS ltc671_raw")
con.execute(f"CREATE TABLE ltc671_raw AS SELECT {sel} FROM read_csv('{RAW}', header=true, all_varchar=true, sample_size=-1)")
n=con.execute("SELECT count(*), count(DISTINCT provider_number) FROM ltc671_raw").fetchone(); assert n==(14696,14696), n
print(f"== CMS-671 Q2 2026: {n[0]:,} facilities (unique CCNs)")
def cast(col,typ,using,sentinels=()):
    sent=" AND ".join([f"{col} <> '{x}'" for x in sentinels]) or "TRUE"
    raw=con.execute(f"SELECT count(*) FROM ltc671_raw WHERE {col} IS NOT NULL AND {col}<>'' AND {sent}").fetchone()[0]
    con.execute(f"ALTER TABLE ltc671_raw ALTER {col} TYPE {typ} USING {using}")
    kept=con.execute(f"SELECT count({col}) FROM ltc671_raw").fetchone()[0]
    assert kept==raw, f"{col}: {raw-kept} lost"; LOG.append(("ltc671_raw",col,typ,raw,kept))
BEDS=[c for c in names if c.startswith("number_of_") and c.endswith("_beds")]
for c in BEDS+["medicare_census","medicaid_census","other_census","total_residents","c7_day_rn_hrs_waived_per_week","c24_hr_licensed_nursing_hrs_waived_per_week"]:
    if c in names: cast(c,"BIGINT",f"TRY_CAST({c} AS BIGINT)")
for c in ["certification_date","c7_day_rn_waiver_date","c24_hr_licensed_nursing_waiver_date"]:
    if c in names: cast(c,"DATE",f"TRY_CAST({c} AS DATE)")
print(f"  {len(LOG)} casts, all lossless")

# ---------- facility-level services table ----------
# CENSUS RULE: the census fields are typed by hand on the form and 19 rows carry impossible values (e.g. a CCN pasted into the field,
# totals in the billions). A census is kept only when Total Residents <= 1.2 x certified beds (Care Compare) and <= 2,000; otherwise
# all four census fields are nulled and census_unreliable = TRUE. Total Residents equals the three parts in every row (asserted).
assert con.execute("SELECT count(*) FROM ltc671_raw WHERE total_residents <> medicare_census + medicaid_census + other_census").fetchone()[0]==0
con.execute("DROP TABLE IF EXISTS snf_services")
con.execute("""CREATE TABLE snf_services AS
  SELECT l.provider_number AS ccn, l.program_participation_code AS certification_detail, l.hospital_based = 'Yes' AS hospital_based,
         l.multi_facility_organization = 'Yes' AS multi_facility, l.multi_facility_organization_name, l.continuing_care_retirement_community_ccrc = 'Yes' AS ccrc,
         l.certification_date AS ltc671_certification_date,
         l.number_of_ventilator_beds AS beds_ventilator, l.number_of_dialysis_beds AS beds_dialysis, l.number_of_alzheimers_disease_beds AS beds_alzheimers,
         l.number_of_hospice_beds AS beds_hospice, l.number_of_head_trauma_beds AS beds_head_trauma, l.number_of_other_specialized_rehab_beds AS beds_rehab,
         l.number_of_aids_beds AS beds_aids, l.number_of_huntingtons_disease_beds AS beds_huntingtons, l.number_of_disabled_children_young_adult_beds AS beds_pediatric,
         CASE WHEN ok THEN l.medicare_census END AS census_medicare, CASE WHEN ok THEN l.medicaid_census END AS census_medicaid,
         CASE WHEN ok THEN l.other_census END AS census_other, CASE WHEN ok THEN l.total_residents END AS census_total, NOT ok AS census_unreliable,
         CASE WHEN ok AND l.total_residents > 0 THEN l.medicare_census * 1.0 / l.total_residents END AS census_medicare_share,
         CASE WHEN ok AND l.total_residents > 0 THEN l.medicaid_census * 1.0 / l.total_residents END AS census_medicaid_share,
         l.organized_residents_group = 'Yes' AS resident_council, l.organized_family_member_group = 'Yes' AS family_council,
         l.nurse_aide_training_and_competency_evaluation_program = 'Yes' AS nurse_aide_training_program,
         (l.provider_number IN (SELECT ccn FROM facility_master)) AS in_facility_master
  FROM (SELECT l.*, (f.number_of_certified_beds IS NOT NULL AND l.total_residents <= 2000 AND l.total_residents <= 1.2 * f.number_of_certified_beds) AS ok
        FROM ltc671_raw l LEFT JOIN facility_master f ON f.ccn = l.provider_number) l""")
r=con.execute("SELECT count(*), sum(in_facility_master), sum(census_unreliable), sum(beds_ventilator>0), sum(beds_dialysis>0), sum(beds_alzheimers>0), sum(hospital_based) FROM snf_services").fetchone()
print(f"  services rows {r[0]:,}; in facility_master {r[1]:,}; census nulled as unreliable {r[2]}; with ventilator beds {r[3]}; dialysis {r[4]}; Alzheimer's {r[5]}; hospital-based {r[6]}")

# ---------- reconciliation with Care Compare certification ----------
rec={}
rec["certification_detail_vs_provider_type"]=con.execute("""SELECT f.provider_type, s.certification_detail, count(*) FROM facility_master f JOIN snf_services s USING (ccn) GROUP BY 1,2 ORDER BY 1,3 DESC""").fetchall()
agree=con.execute("""SELECT count(*) FILTER (WHERE (f.provider_type='Medicaid') = (s.certification_detail IN ('Nursing Facility (NF) - Medicaid Participation','NF (Medicaid) Only'))), count(*)
  FROM facility_master f JOIN snf_services s USING (ccn) WHERE s.certification_detail IS NOT NULL""").fetchone()
print(f"  Medicaid-only agreement between Care Compare Provider Type and CMS-671: {agree[0]:,} of {agree[1]:,}")
rec["medicaid_only_agreement"]=list(agree)
rec["hospital_based_vs_provider_resides_in_hospital"]=con.execute("""SELECT f.provider_resides_in_hospital, s.hospital_based, count(*) FROM facility_master f JOIN snf_services s USING (ccn) GROUP BY 1,2 ORDER BY 3 DESC""").fetchall()
json.dump({k:[list(x) if isinstance(x,tuple) else x for x in v] if isinstance(v,list) else v for k,v in rec.items()}, open(f"{ROOT}/db/reconciliation_ltc671.json","w"), indent=1, default=str)
with open(f"{ROOT}/db/cast_log_ltc671.csv","w",newline="") as fh: csv.writer(fh).writerows([["table","column","type","raw_nonblank","typed"]]+LOG)
print("  hospital-based vs Care Compare 'resides in hospital':", rec["hospital_based_vs_provider_resides_in_hospital"])
con.close(); print("done")
