"""PECOS ownership layer: load the CMS PECOS public files for hospitals and SNFs (data.cms.gov, 2026-09-29 release)
into db/snf.duckdb, type them losslessly, and derive (a) hospital systems = organizations holding a 5%-or-greater
direct or indirect ownership interest in each hospital, (b) a PECOS view of each nursing home (legal entity, CMS
affiliation entity, non-profit flag, changes of ownership since 2016). Re-runnable (drops and recreates its own tables only).
Usage: python3 scripts/07_load_pecos.py
Inputs: raw/pecos/clean/*.csv — byte-identical to the downloads in raw/pecos/ except that 72 lines containing stray
Windows-1252 bytes were transcoded to UTF-8 (raw/pecos/clean/_encoding_log.json; zero characters unrecoverable).
"""
import duckdb, csv, re, json
ROOT="/home/claude/snf-intel"; RAW=f"{ROOT}/raw/pecos/clean"; DB=f"{ROOT}/db/snf.duckdb"; REL="2026.09.29"
con=duckdb.connect(DB)
LOG=[]
def snake(h):
    s=re.sub(r"[^0-9A-Za-z]+","_",h.strip().replace("%","pct")).strip("_").lower(); s=re.sub(r"_+","_",s)
    return ("c_"+s) if re.match(r"^\d",s) else s
def load(table, fname, expected):
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
    assert n==expected, (table,n,expected)   # expected = line count of the download minus header, checked by hand
    print(f"  {table:<26}{n:>10,} rows"); return names
def cast(table,col,typ,using,sentinels=()):
    sent=" AND ".join([f"{col} <> '{x}'" for x in sentinels]) or "TRUE"
    raw=con.execute(f"SELECT count(*) FROM {table} WHERE {col} IS NOT NULL AND {col}<>'' AND {sent}").fetchone()[0]
    con.execute(f"ALTER TABLE {table} ALTER {col} TYPE {typ} USING {using}")
    kept=con.execute(f"SELECT count({col}) FROM {table}").fetchone()[0]
    assert kept==raw, f"{table}.{col}: {raw-kept} values lost in cast"
    LOG.append((table,col,typ,raw,kept,",".join(sentinels)))
DATE="TRY_STRPTIME({c}, '%m/%d/%Y')::DATE"

print("== Loading PECOS", REL)
load("pecos_hosp_owners", f"Hospital_All_Owners_{REL}.csv", 146948)
load("pecos_hosp_enroll", f"Hospital_Enrollments_{REL}.csv", 9138)
load("pecos_hosp_chow",   f"Hospital_CHOW_{REL}.csv", 779)
load("pecos_snf_owners",  f"SNF_All_Owners_{REL}.csv", 300738)
load("pecos_snf_enroll",  f"SNF_Enrollments_{REL}.csv", 14404)
load("pecos_snf_chow",    f"SNF_CHOW_{REL}.csv", 5340)

print("== Typing")
for t in ("pecos_hosp_owners","pecos_snf_owners"):
    cast(t,"percentage_ownership","DOUBLE","TRY_CAST(percentage_ownership AS DOUBLE)")
    cast(t,"association_date_owner","DATE",DATE.format(c="association_date_owner"))
for t in ("pecos_hosp_enroll","pecos_snf_enroll"):
    cast(t,"incorporation_date","DATE",DATE.format(c="incorporation_date"))
for t in ("pecos_hosp_chow","pecos_snf_chow"):
    cast(t,"effective_date","DATE",DATE.format(c="effective_date"))
# keys are unique per the profile; assert so a future refresh cannot silently break joins
for t in ("pecos_hosp_enroll","pecos_snf_enroll"):
    assert con.execute(f"SELECT count(*) - count(DISTINCT ccn) FROM {t}").fetchone()[0]==0, t
    assert con.execute(f"SELECT count(*) - count(DISTINCT enrollment_id) FROM {t}").fetchone()[0]==0, t

# ---------- hospital systems ----------
print("== Hospital systems (owner organizations with a 5%+ direct or indirect ownership interest)")
con.execute("DROP TABLE IF EXISTS hospital_owner_org")
con.execute("""CREATE TABLE hospital_owner_org AS
  SELECT e.ccn AS hospital_ccn, e.enrollment_id, e.organization_name AS hospital_legal_name, e.doing_business_as_name AS hospital_dba,
         o.associate_id_owner AS owner_id, o.organization_name_owner AS owner_name, o.doing_business_as_name_owner AS owner_dba,
         o.role_code_owner AS role_code, o.role_text_owner AS role_text, o.percentage_ownership AS pct, o.association_date_owner AS since,
         o.state_owner AS owner_state, (e.ccn IN (SELECT hospital_ccn FROM hospital_master)) AS in_hospital_master
  FROM pecos_hosp_owners o JOIN pecos_hosp_enroll e USING (enrollment_id)
  WHERE o.type_owner = 'O' AND o.role_code_owner IN ('34','35')""")
con.execute("DROP TABLE IF EXISTS hospital_system")
con.execute("""CREATE TABLE hospital_system AS
  WITH names AS (SELECT owner_id, owner_name, count(*) AS c, row_number() OVER (PARTITION BY owner_id ORDER BY count(*) DESC, owner_name) AS rn
                 FROM hospital_owner_org GROUP BY 1,2)
  SELECT h.owner_id, n.owner_name AS system_name,
         count(DISTINCT h.hospital_ccn) AS n_hospitals_enrolled,
         count(DISTINCT CASE WHEN h.in_hospital_master THEN h.hospital_ccn END) AS n_hospitals_in_care_compare,
         count(DISTINCT CASE WHEN h.hospital_ccn IN (SELECT hospital_ccn FROM hospital_service_area) THEN h.hospital_ccn END) AS n_hospitals_with_service_area,
         count(DISTINCT substr(h.hospital_ccn,1,2)) AS n_state_codes,
         count(DISTINCT CASE WHEN h.role_code='34' THEN h.hospital_ccn END) AS n_direct, count(DISTINCT CASE WHEN h.role_code='35' THEN h.hospital_ccn END) AS n_indirect
  FROM hospital_owner_org h JOIN names n ON n.owner_id = h.owner_id AND n.rn = 1 GROUP BY 1,2""")
r=con.execute("SELECT count(*), sum(n_hospitals_in_care_compare>0), max(n_hospitals_in_care_compare) FROM hospital_system").fetchone()
print(f"  owner organizations: {r[0]:,}; with ≥1 Care Compare hospital: {r[1]:,}; largest: {r[2]}")
hop=con.execute("SELECT system_name, n_hospitals_enrolled, n_hospitals_in_care_compare FROM hospital_system WHERE system_name ILIKE '%JOHNS HOPKINS HEALTH SYSTEM%'").fetchall()
print("  Hopkins:", hop); assert any(x[1]==8 for x in hop), hop   # 7 CCNs + 09S005 sub-unit, per profile on 2026-10-26

# ---------- hospital families (superset across holding companies) ----------
# A hospital lists its direct owner and every indirect owner up the chain, so one system shows up under several holding-company
# names. Families are built from the data with no fuzzy name matching: (1) owner records with the exact same organization name
# are one organization; (2) only CONTROLLING interests count — an owner's stake in a hospital counts when its reported percentage
# is 50% or more, or is not reported (minority investors such as a 20% holding vehicle or a joint-venture partner never pull a
# hospital into their family); (3) an organization whose controlled hospitals are at least 80% contained in a larger organization's
# controlled hospitals is a subsidiary of the largest such organization; (4) a family is the resulting tree, labelled with its
# largest member that is not named as a holding/acquisition vehicle, carrying every member name as an alias.
print("== Hospital families")
rows=con.execute("""SELECT upper(trim(owner_name)) AS name, hospital_ccn, max(coalesce(pct, 100)) AS pct, max(pct) AS pct_reported
  FROM hospital_owner_org WHERE in_hospital_master GROUP BY 1,2""").fetchall()
sets={}; allsets={}; docsets={}
for name,ccn,pct,pct_rep in rows:
    allsets.setdefault(name,set()).add(ccn)
    if pct>=50: sets.setdefault(name,set()).add(ccn)                       # controls (reported >=50% or unreported)
    if pct_rep is not None and pct_rep>=50: docsets.setdefault(name,set()).add(ccn)   # documented control (reported >=50%)
names=sorted(allsets, key=lambda n:(-len(sets.get(n,())), n))
# Attachment (subsidiary → parent) needs DOCUMENTED control by the parent on at least two-thirds of the child's controlled hospitals
# (every attachment between 2/3 and 80% was checked by hand on 2026-10-27 and all 24 were real subsidiaries, e.g. Dignity → CommonSpirit), and a child
# with at least two controlled hospitals. Unreported shares still make a hospital a member of its owner's family, but they can never
# make one organization a subsidiary of another: in joint ventures both partners are usually listed with no percentage, and a
# single-hospital investor is not a holding company.
parent={}
for n in names:
    A=sets.get(n,set())
    if len(A)<2: continue
    best=None
    for m in names:
        if m==n: continue
        B=docsets.get(m,set())
        if len(sets.get(m,()))<len(A) or (len(sets.get(m,()))==len(A) and m>n): continue
        if len(A&B)/len(A)>=2/3 and (best is None or len(sets[m])>len(sets[best])): best=m
    if best: parent[n]=best
def root(n):
    while n in parent: n=parent[n]
    return n
fam={}
for n in names: fam.setdefault(root(n),[]).append(n)
print(f"  {len(names):,} owner organizations → {len(fam):,} families; {sum(1 for f in fam.values() if len(f)>1)} families have more than one member name")
con.execute("DROP TABLE IF EXISTS hospital_family"); con.execute("DROP TABLE IF EXISTS hospital_family_org"); con.execute("DROP TABLE IF EXISTS hospital_family_member")
con.execute("CREATE TABLE hospital_family (family_id INTEGER, label VARCHAR, n_member_orgs INTEGER, aliases VARCHAR)")
con.execute("CREATE TABLE hospital_family_org (family_id INTEGER, org_name VARCHAR, n_hospitals_controlled INTEGER, n_hospitals_any INTEGER, parent_org VARCHAR)")
import re as _re
GENERIC=_re.compile(r"\b(HOLDING|HOLDINGS|ACQUISITION|ACQUISITIONS|BUYER)\b")
def label_of(members):
    named=[m for m in members if not GENERIC.search(m)]
    return (named or members)[0]
for i,(r,members) in enumerate(sorted(fam.items(), key=lambda kv:(-len(sets.get(kv[0],())), kv[0])), start=1):
    members=sorted(members, key=lambda n:(-len(sets.get(n,())), n)); lab=label_of(members)
    con.execute("INSERT INTO hospital_family VALUES (?,?,?,?)", [i, lab, len(members), " | ".join(m for m in members if m!=lab)])
    for m in members: con.execute("INSERT INTO hospital_family_org VALUES (?,?,?,?,?)", [i, m, len(sets.get(m,())), len(allsets[m]), parent.get(m)])
# membership = hospitals the family CONTROLS (some member holds ≥50% or an unreported share); minority stakes are kept separately
con.execute("""CREATE TABLE hospital_family_member AS
  WITH o AS (SELECT upper(trim(owner_name)) AS org_name, hospital_ccn, max(coalesce(pct,100)) AS pct, max(CASE WHEN role_code='34' THEN 1 ELSE 0 END) AS direct
             FROM hospital_owner_org WHERE in_hospital_master GROUP BY 1,2)
  SELECT fo.family_id, o.hospital_ccn, h.state, h.hospital_name, (o.hospital_ccn IN (SELECT hospital_ccn FROM hospital_service_area)) AS has_service_area,
         max(o.direct) = 1 AS direct, max(o.pct) AS pct_max, max(o.pct) >= 50 AS controlled
  FROM o JOIN hospital_family_org fo USING (org_name) JOIN hospital_master h USING (hospital_ccn) GROUP BY 1,2,3,4""")
con.execute("ALTER TABLE hospital_family ADD COLUMN n_hospitals INTEGER"); con.execute("ALTER TABLE hospital_family ADD COLUMN n_with_service_area INTEGER"); con.execute("ALTER TABLE hospital_family ADD COLUMN n_states INTEGER"); con.execute("ALTER TABLE hospital_family ADD COLUMN n_minority_stakes INTEGER")
con.execute("""UPDATE hospital_family SET n_hospitals = m.n, n_with_service_area = m.a, n_states = m.s, n_minority_stakes = m.mi FROM
  (SELECT family_id, count(*) FILTER (WHERE controlled) n, count(*) FILTER (WHERE controlled AND has_service_area) a, count(DISTINCT CASE WHEN controlled THEN state END) s, count(*) FILTER (WHERE NOT controlled) mi
   FROM hospital_family_member GROUP BY 1) m WHERE m.family_id = hospital_family.family_id""")
top=con.execute("SELECT label, n_member_orgs, n_hospitals, n_states, n_minority_stakes, aliases FROM hospital_family ORDER BY n_hospitals DESC LIMIT 8").fetchall()
for t in top: print("  ", t[0], "| orgs", t[1], "| controls", t[2], "| states", t[3], "| minority stakes", t[4], "| aliases:", (t[5] or "")[:90])
def famof(name): return con.execute("SELECT family_id FROM hospital_family_org WHERE org_name=?",[name]).fetchone()
assert famof('HCA INC')==famof('HCA HEALTHCARE INC')==famof('HEALTHTRUST INC - THE HOSPITAL COMPANY'), "HCA wholly-owned chain split"
# minority holding vehicles (Hercules/Frisco hold 14–20% of ~155 HCA hospitals) may sit inside the HCA family through the handful they control,
# but their minority stakes must never add hospitals: every HCA-family hospital is controlled by an HCA entity with a reported >=50% share or an unreported share.
assert con.execute("SELECT count(*) FROM hospital_family_member WHERE family_id=? AND NOT controlled",[famof('HCA INC')[0]]).fetchone()[0]==0
assert famof('HENRY FORD HEALTH SYSTEM')!=famof('ASCENSION HEALTH'), "JV partner merged (Henry Ford → Ascension)"
assert famof('BAYLOR UNIVERSITY MEDICAL CENTER')!=famof('TENET HEALTHCARE CORPORATION'), "JV partner merged (Baylor → Tenet)"
assert famof('DIGNITY HEALTH')==famof('COMMONSPIRIT HEALTH'), "wholly-owned subsidiary split (Dignity ≠ CommonSpirit)"
# Known limit: VHS San Antonio Partners LLC (9 joint-venture surgical hospitals) stays its own family because Tenet reports no percentage on any of them.
assert famof('BAIN CAPITAL FUND IX LP')!=famof('HCA INC') and famof("ST. DAVID'S FOUNDATION")!=famof('HCA INC') if famof("ST. DAVID'S FOUNDATION") else True, "single-hospital investor became an HCA alias"
assert len({famof(x)[0] for x in ['HCA INC','UNIVERSAL HEALTH SERVICES INC','COMMONSPIRIT HEALTH','TENET HEALTHCARE CORPORATION','THE JOHNS HOPKINS HEALTH SYSTEM CORPORATION']})==5
hop=con.execute("SELECT state, count(*) FROM hospital_family_member WHERE controlled AND family_id=(SELECT family_id FROM hospital_family_org WHERE org_name='THE JOHNS HOPKINS HEALTH SYSTEM CORPORATION') GROUP BY 1 ORDER BY 1").fetchall()
print("  Hopkins family by state (controlled):", hop)
print("  JV check: hospitals in 2+ families:", con.execute("SELECT count(*) FROM (SELECT hospital_ccn FROM hospital_family_member WHERE controlled GROUP BY 1 HAVING count(*)>1)").fetchone()[0])

# ---------- SNF PECOS view ----------
print("== SNF PECOS view")
con.execute("DROP TABLE IF EXISTS snf_pecos")
con.execute("""CREATE TABLE snf_pecos AS
  WITH ch AS (SELECT ccn_buyer AS ccn, count(*) AS n_chow_since_2016, max(effective_date) AS last_chow_date,
                     arg_max(organization_name_buyer, effective_date) AS last_buyer, arg_max(organization_name_seller, effective_date) AS last_seller
              FROM pecos_snf_chow WHERE ccn_buyer IS NOT NULL AND ccn_buyer <> '' GROUP BY 1),
       own AS (SELECT e.ccn, count(*) FILTER (WHERE o.type_owner='O' AND o.role_code_owner IN ('34','35')) AS n_org_owners,
                      count(*) FILTER (WHERE o.type_owner='I' AND o.role_code_owner IN ('34','35')) AS n_individual_owners,
                      count(*) FILTER (WHERE o.role_code_owner='43') AS n_managing_control,
                      max(CASE WHEN o.private_equity_company_owner='Y' THEN 1 ELSE 0 END) AS any_private_equity_owner,
                      max(CASE WHEN o.reit_owner='Y' THEN 1 ELSE 0 END) AS any_reit_owner
               FROM pecos_snf_enroll e JOIN pecos_snf_owners o USING (enrollment_id) GROUP BY 1)
  SELECT e.ccn, e.enrollment_id, e.organization_name AS legal_entity, e.doing_business_as_name AS dba, e.nursing_home_provider_name,
         e.affiliation_entity_name, e.affiliation_entity_id, e.proprietary_nonprofit, e.organization_type_structure, e.incorporation_date,
         own.n_org_owners, own.n_individual_owners, own.n_managing_control, own.any_private_equity_owner = 1 AS any_private_equity_owner, own.any_reit_owner = 1 AS any_reit_owner,
         coalesce(ch.n_chow_since_2016, 0) AS n_chow_since_2016, ch.last_chow_date, ch.last_buyer, ch.last_seller,
         (e.ccn IN (SELECT ccn FROM facility_master)) AS in_facility_master
  FROM pecos_snf_enroll e LEFT JOIN own USING (ccn) LEFT JOIN ch USING (ccn)""")
r=con.execute("SELECT count(*), sum(in_facility_master), count(affiliation_entity_name) FILTER (WHERE affiliation_entity_name<>''), count(*) FILTER (WHERE n_chow_since_2016>0) FROM snf_pecos").fetchone()
print(f"  SNF enrollments {r[0]:,}; in facility_master {r[1]:,}; with affiliation entity {r[2]:,}; with a CHOW since 2016 {r[3]:,}")
cols=[c[0] for c in con.execute("DESCRIBE pecos_snf_owners").fetchall()]
assert "private_equity_company_owner" in cols and "reit_owner" in cols, cols

# ---------- reconciliation ----------
print("== Reconciliation")
rec={}
# SNF vs Medicaid-only nursing facility (T-022): Care Compare "Provider Type" must agree with CMS's CCN rules (SOM ch.2 §2779A1: Medicare SNFs
# are 5000-6499 in positions 3-6; §2779B: title XIX-only providers carry an alpha third character, A/B/E/F = NF) and with Medicare enrollment.
bad=con.execute("""SELECT count(*) FROM facility_master WHERE (provider_type='Medicaid') <> (substr(ccn,3,1) IN ('A','B','E','F'))
  OR (provider_type<>'Medicaid' AND substr(ccn,3,1) NOT IN ('5','6'))""").fetchone()[0]
assert bad==0, f"{bad} nursing homes whose Provider Type disagrees with the CCN rule"
assert con.execute("SELECT count(*) FROM facility_master WHERE provider_type='Medicaid' AND ccn IN (SELECT ccn FROM pecos_snf_enroll)").fetchone()[0]==0, "a Medicaid-only NF has a Medicare SNF enrollment"
rec["snf_vs_nf_ccn_rule"]=con.execute("SELECT count(*) FILTER (WHERE provider_type<>'Medicaid'), count(*) FILTER (WHERE provider_type='Medicaid'), count(*) FILTER (WHERE provider_type='Medicaid' AND vbp_in_program='Y'), count(*) FILTER (WHERE provider_type='Medicaid' AND qrp_004_ppr_pd_rsrr_fn LIKE '%14%') FROM facility_master").fetchone()
print("  SNF/NF rule holds for all 14,690; Medicaid-only in VBP:", rec["snf_vs_nf_ccn_rule"][2], "; with QRP footnote 14:", rec["snf_vs_nf_ccn_rule"][3])
rec["hospital_master_with_pecos_enrollment"]=con.execute("SELECT count(*) FILTER (WHERE hospital_ccn IN (SELECT ccn FROM pecos_hosp_enroll)), count(*) FROM hospital_master").fetchone()
rec["hospital_master_with_owner_org"]=con.execute("SELECT count(DISTINCT hospital_ccn) FROM hospital_owner_org WHERE in_hospital_master").fetchone()
rec["facility_master_with_pecos_enrollment"]=con.execute("SELECT count(*) FILTER (WHERE ccn IN (SELECT ccn FROM pecos_snf_enroll)), count(*) FROM facility_master").fetchone()
# Care Compare chain vs PECOS affiliation entity: informational only (different definitions)
rec["chain_vs_affiliation"]=con.execute("""SELECT count(*) FILTER (WHERE f.chain_name IS NOT NULL AND p.affiliation_entity_name<>''),
  count(*) FILTER (WHERE f.chain_name IS NOT NULL AND (p.affiliation_entity_name IS NULL OR p.affiliation_entity_name='')),
  count(*) FILTER (WHERE f.chain_name IS NULL AND p.affiliation_entity_name<>''),
  count(*) FILTER (WHERE f.chain_name IS NOT NULL AND p.affiliation_entity_name<>'' AND upper(f.chain_name)=upper(p.affiliation_entity_name))
  FROM facility_master f LEFT JOIN snf_pecos p USING (ccn)""").fetchone()
for k,v in rec.items(): print(f"  {k}: {v}")
json.dump({k:list(v) for k,v in rec.items()}, open(f"{ROOT}/db/reconciliation_pecos.json","w"), indent=1)
with open(f"{ROOT}/db/cast_log_pecos.csv","w",newline="") as fh:
    w=csv.writer(fh); w.writerow(["table","column","type","raw_nonblank","typed","sentinels"]); w.writerows(LOG)
print(f"  {len(LOG)} casts logged, all lossless")
con.close(); print("done")
