"""Hospital discharge mix: Medicare Inpatient Hospitals – by Provider and Service, calendar 2024 (data.cms.gov; one row per hospital x MS-DRG,
rows with fewer than 11 discharges suppressed by CMS). Each DRG is mapped to its Major Diagnostic Category with the CMS MS-DRG v42.1 list
(docs/reference/msdrg_v42_1_list.txt, Appendix A of the Definitions Manual) and then to a plain-English "discharge family" used for
post-acute placement, and to the ICD-10 chapter groups the Post-Acute Care PUF uses for each SNF's admitted patients (so a hospital's
discharge mix and a SNF's patient mix can be compared on the same footing). Lossless loads with row-count and share assertions.
Usage: python3 scripts/11_load_drg.py
Download: curl -O https://data.cms.gov/sites/default/files/2026-04/828defb5-c9e6-4442-8c1b-f27bc0799daf/MUP_INP_RY26_P03_V10_DY24_PrvSvc.CSV
"""
import duckdb, csv, json
ROOT="/home/claude/snf-intel"; RAW=f"{ROOT}/raw/hospital/MUP_INP_RY26_P03_V10_DY24_PrvSvc.CSV"; DB=f"{ROOT}/db/snf.duckdb"
con=duckdb.connect(DB)

print("== DRG reference (MS-DRG v42.1)")
rows=[l.rstrip("\n").split("|") for l in open(f"{ROOT}/docs/reference/msdrg_v42_1_list.txt") if l.strip() and not l.startswith("#")]
assert all(len(r)==4 for r in rows), [r for r in rows if len(r)!=4][:3]
assert len(rows)==len({r[0] for r in rows}), "duplicate DRG"
con.execute("DROP TABLE IF EXISTS msdrg"); con.execute("CREATE TABLE msdrg (drg VARCHAR, mdc VARCHAR, drg_type VARCHAR, title VARCHAR)")
con.executemany("INSERT INTO msdrg VALUES (?,?,?,?)", [(r[0], r[1] or None, r[2] or None, r[3]) for r in rows])
print(f"  {len(rows)} MS-DRGs; {sum(1 for r in rows if not r[1])} without an MDC (pre-MDC transplant/tracheostomy, unrelated-procedure and ungroupable DRGs)")

# ---- plain-English discharge families for post-acute placement. Named DRG sets come from the titles in the verified list; the rest fall
# ---- back to the MDC. Every DRG lands in exactly one family (asserted).
# MDCs with named carve-outs below are labelled "(other)" so the remainder is never read as the whole category (Validation Report 06, finding 7).
MDC_FAMILY={"01":"Brain and nervous system (other than stroke)","02":"Eye","03":"Ear, nose, mouth and throat","04":"Lung and breathing (other)","05":"Heart and circulation (other)",
 "06":"Digestive","07":"Liver, pancreas and gallbladder","08":"Bones, joints and muscles (other)","09":"Skin (other)","10":"Diabetes, nutrition and metabolism",
 "11":"Kidney and urinary (other)","12":"Male reproductive","13":"Female reproductive","14":"Pregnancy and childbirth","15":"Newborns","16":"Blood and immune",
 "17":"Cancer (lymphoma, leukemia, chemo)","18":"Infections (other than sepsis)","19":"Mental health","20":"Alcohol and drug use","21":"Injuries and poisoning",
 "22":"Burns","23":"Rehabilitation and aftercare","24":"Multiple trauma","25":"HIV"}
NAMED={  # family: DRG codes (all present in the v42.1 list; asserted)
 "Joint replacement (hip, knee)":["461","462","466","467","468","469","470"],
 "Hip and femur fracture or surgery":["480","481","482","521","522","533","534","535","536"],   # 521/522 = hip replacement FOR a hip fracture (title), so they are fracture cases
 "Spine surgery":["453","454","455","459","460","028","029","030","402","426","427","428","429","430","447","448","450","451","456","457","458","471","472","473","518","519","520"],
 "Stroke":["061","062","063","064","065","066","067","068","069"],
 "Heart failure":["291","292","293"],
 "Heart attack":["280","281","282","283","284","285"],
 "Cardiac surgery and procedures":["212","215","216","217","218","219","220","221","228","229","231","232","233","234","235","236","242","243","244","245","250","251","252","253","254","258","259","260","261","262","263","264","265","266","267","268","269","270","271","272","273","274","275","276","277","278","279","317","319","320","321","322","323","324","325"],
 "Amputation":["239","240","241","255","256","257","474","475","476","616","617","618"],
 "Pneumonia and respiratory infection":["177","178","179","193","194","195"],
 "COPD and asthma":["190","191","192","202","203"],
 "Ventilator, tracheostomy and respiratory failure":["003","004","189","207","208","870"],
 "Sepsis":["871","872"],
 "Kidney failure and dialysis-related":["682","683","684"],
 "Urinary infection":["689","690"],
 "Wounds, ulcers and cellulitis":["570","571","572","573","574","575","592","593","594","602","603","463","464","465","622","623","624","901","902","903"],
 "Transplant":["001","002","005","006","007","008","010","014","016","017","018","019","650","651","652"],   # 019 = simultaneous pancreas/kidney, 650–652 = kidney transplant
}
fam_of={}
for fam,codes in NAMED.items():
    for c in codes:
        assert c in {r[0] for r in rows}, (fam,c); assert c not in fam_of, (c, fam_of.get(c), fam); fam_of[c]=fam
for r in rows:
    if r[0] not in fam_of: fam_of[r[0]]=MDC_FAMILY.get(r[1], "Other or unclassified") if r[1] else ("Other surgery" if r[2]=="P" else "Other or unclassified")
# ---- ICD-10 chapter groups as used in the PAC PUF (prmry_dx_* columns); MDC → chapter group
MDC_CHAPTER={"01":"nervsystm","02":"entsys","03":"entsys","04":"rspsystm","05":"circsystm","06":"digsystm","07":"digsystm","08":"sknmussystm","09":"sknmussystm",
 "10":"endonutrmet","11":"gusystm","12":"gusystm","13":"gusystm","14":"prgpericong","15":"prgpericong","16":"neobld","17":"neobld","18":"infctn","19":"mntbehneudis",
 "20":"mntbehneudis","21":"injpois","22":"injpois","23":"hlthsrv","24":"injpois","25":"infctn"}
con.execute("DROP TABLE IF EXISTS drg_family"); con.execute("CREATE TABLE drg_family (drg VARCHAR, family VARCHAR, chapter VARCHAR)")
# Fracture / dislocation DRGs sit in MDC 08 but their principal diagnosis is an injury (ICD-10 S codes), which the PAC PUF files under "injury and poisoning";
# mapping them to the injury chapter keeps the hospital and SNF sides of the overlap on the same footing (Report 06, finding 8). Pathological fractures (M codes) stay musculoskeletal.
INJURY_DRGS={"480","481","482","521","522","533","534","535","536","537","538","562","563"}
def chapter(r):
    if r[0] in INJURY_DRGS: return "injpois"
    if r[1]: return MDC_CHAPTER.get(r[1])
    return "rspsystm" if r[0] in ("003","004") else "hlthsrv" if r[0] in ("981","982","983","987","988","989") else None
con.executemany("INSERT INTO drg_family VALUES (?,?,?)", [(r[0], fam_of[r[0]], chapter(r)) for r in rows])
assert con.execute("SELECT count(*) FROM drg_family WHERE family IS NULL").fetchone()[0]==0
print(f"  {len(set(fam_of.values()))} discharge families")

print("== Medicare Inpatient by Provider and Service, 2024")
con.execute("DROP TABLE IF EXISTS hosp_drg_raw")
con.execute(f"CREATE TABLE hosp_drg_raw AS SELECT * FROM read_csv('{RAW}', header=true, all_varchar=true, sample_size=-1)")
n=con.execute("SELECT count(*) FROM hosp_drg_raw").fetchone()[0]; assert n==145879, n   # wc -l minus header
con.execute("DROP TABLE IF EXISTS hosp_drg")
con.execute("""CREATE TABLE hosp_drg AS SELECT Rndrng_Prvdr_CCN AS hospital_ccn, DRG_Cd AS drg, DRG_Desc AS drg_desc, CAST(Tot_Dschrgs AS INTEGER) AS discharges,
  CAST(Avg_Mdcr_Pymt_Amt AS DOUBLE) AS avg_medicare_payment, CAST(Avg_Tot_Pymt_Amt AS DOUBLE) AS avg_total_payment FROM hosp_drg_raw""")
assert con.execute("SELECT count(*) FROM hosp_drg WHERE discharges IS NULL OR discharges < 11").fetchone()[0]==0
con.execute("DROP TABLE hosp_drg_raw")
r=con.execute("SELECT count(*), count(DISTINCT hospital_ccn), sum(discharges), count(*) FILTER (WHERE drg NOT IN (SELECT drg FROM msdrg)) FROM hosp_drg").fetchone()
print(f"  rows {r[0]:,}; hospitals {r[1]:,}; visible discharges {r[2]:,}; rows whose DRG is not in the reference list {r[3]}")
assert r[3]==0, 'every DRG in the 2024 file must be in the reference list'
unmapped=con.execute("SELECT drg, drg_desc, sum(discharges) FROM hosp_drg WHERE drg NOT IN (SELECT drg FROM msdrg) GROUP BY 1,2 ORDER BY 3 DESC").fetchall()
for u in unmapped: print("   unmapped:", u)
# coverage vs the by-provider totals we already loaded
cov=con.execute("""SELECT count(*), avg(v.visible * 1.0 / h.medicare_discharges_2024), quantile_cont(v.visible * 1.0 / h.medicare_discharges_2024, 0.5)
  FROM (SELECT hospital_ccn, sum(discharges) visible FROM hosp_drg GROUP BY 1) v JOIN hospital_master h USING (hospital_ccn) WHERE h.medicare_discharges_2024 > 0""").fetchone()
print(f"  hospitals matched to hospital_master {cov[0]:,}; visible DRG rows cover on average {100*cov[1]:.1f}% (median {100*cov[2]:.1f}%) of each hospital's 2024 Medicare discharges — the rest sit in DRGs with fewer than 11 cases")

con.execute("DROP TABLE IF EXISTS hospital_drg_mix")
con.execute("""CREATE TABLE hospital_drg_mix AS
  WITH t AS (SELECT hospital_ccn, sum(discharges) AS visible FROM hosp_drg d JOIN drg_family f USING (drg) GROUP BY 1)
  SELECT d.hospital_ccn, f.family, sum(d.discharges) AS discharges, sum(d.discharges) * 1.0 / t.visible AS share_of_visible,
         sum(d.discharges * d.avg_medicare_payment) / sum(d.discharges) AS avg_medicare_payment
  FROM hosp_drg d JOIN drg_family f USING (drg) JOIN t USING (hospital_ccn) GROUP BY 1,2,t.visible""")
con.execute("DROP TABLE IF EXISTS hospital_chapter_mix")
con.execute("""CREATE TABLE hospital_chapter_mix AS
  WITH t AS (SELECT hospital_ccn, sum(discharges) AS visible FROM hosp_drg d JOIN drg_family f USING (drg) WHERE f.chapter IS NOT NULL GROUP BY 1)
  SELECT d.hospital_ccn, f.chapter, sum(d.discharges) AS discharges, sum(d.discharges) * 1.0 / t.visible AS share
  FROM hosp_drg d JOIN drg_family f USING (drg) JOIN t USING (hospital_ccn) WHERE f.chapter IS NOT NULL GROUP BY 1,2,t.visible""")
bad=con.execute("SELECT count(*) FROM (SELECT hospital_ccn, sum(share_of_visible) s FROM hospital_drg_mix GROUP BY 1 HAVING abs(s-1) > 1e-9)").fetchone()[0]; assert bad==0
bad=con.execute("SELECT count(*) FROM (SELECT hospital_ccn, sum(share) s FROM hospital_chapter_mix GROUP BY 1 HAVING abs(s-1) > 1e-9)").fetchone()[0]; assert bad==0
hop=con.execute("SELECT family, discharges, round(100*share_of_visible,1) FROM hospital_drg_mix WHERE hospital_ccn='210009' ORDER BY discharges DESC LIMIT 8").fetchall()
print("  Johns Hopkins top families:", hop)
# SNF side: chapter mix from the PAC PUF (already loaded as pacpuf_snf)
con.execute("DROP TABLE IF EXISTS snf_chapter_mix")
cols=["infctn","neobld","endonutrmet","mntbehneudis","nervsystm","entsys","circsystm","rspsystm","digsystm","sknmussystm","gusystm","prgpericong","sxilldef","injpois","hlthsrv"]
sel=" UNION ALL ".join([f"SELECT prvdr_id AS ccn, '{c}' AS chapter, TRY_CAST(prmry_dx_{c}_pct AS DOUBLE)/100 AS share FROM pacpuf_snf WHERE smry_ctgry='PROVIDER' AND srvc_ctgry='SNF'" for c in cols])
con.execute(f"CREATE TABLE snf_chapter_mix AS SELECT * FROM ({sel}) WHERE share IS NOT NULL")
r=con.execute("SELECT count(DISTINCT ccn), count(*) FROM snf_chapter_mix").fetchone(); print(f"  SNF chapter mix: {r[0]:,} SNFs, {r[1]:,} rows (PAC PUF 2024 primary-diagnosis shares; suppressed shares omitted)")
json.dump({"drg_rows":n,"hospitals":r and cov[0],"coverage_mean":cov[1],"coverage_median":cov[2],"unmapped":[list(u) for u in unmapped]}, open(f"{ROOT}/db/reconciliation_drg.json","w"), indent=1)
con.close(); print("done")
