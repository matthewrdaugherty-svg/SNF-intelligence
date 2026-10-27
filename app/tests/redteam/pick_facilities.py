"""Pick 8 facilities for the red-team data check. Seed stated; read-only DB."""
import duckdb, random, json
SEED = 20261026
rng = random.Random(SEED)
c = duckdb.connect('/home/claude/snf-intel/db/snf.duckdb', read_only=True)
def pool(where): return [r[0] for r in c.sql(f"select ccn from facility_master where {where} order by ccn").fetchall()]
picked = {}
def take(label, where):
    p = [x for x in pool(where) if x not in picked]
    picked[rng.choice(p)] = label
take('Maryland #1 (with penalties)', "state='MD' and pen_n_fines>0")
take('Maryland #2', "state='MD'")
take('Medicaid-only', "provider_type='Medicaid'")
take('Special Focus Facility (SFF)', "special_focus_status='SFF'")
take('Suppressed QM values (qm_521_adj null with footnote)', "qm_521_adj is null and qm_521_fn is not null and overall_rating is not null")
take('Not in VBP', "vbp_in_program='N' and provider_type<>'Medicaid'")
take('Random (any)', "true")
take('Random (has G-L citations + ownership)', "hc_n_severity_G_or_worse>0")
json.dump(picked, open('/home/claude/snf-intel/app/tests/redteam/out/picked.json','w'), indent=1)
for k,v in picked.items(): print(k, v, c.sql(f"select provider_name,state,provider_type,special_focus_status,vbp_in_program from facility_master where ccn='{k}'").fetchall()[0])
