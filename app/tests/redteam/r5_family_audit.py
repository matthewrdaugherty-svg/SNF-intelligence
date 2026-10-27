import duckdb;c=duckdb.connect('/home/claude/snf-intel/db/snf.duckdb',read_only=True)
q=lambda s,*a: c.execute(s,list(a)).fetchall()
# sets per exact upper(trim) name (same as script)
rows=q("SELECT DISTINCT upper(trim(owner_name)), hospital_ccn FROM hospital_owner_org WHERE in_hospital_master")
sets={}
for n,h in rows: sets.setdefault(n,set()).add(h)
org=q("select family_id, org_name, n_hospitals, parent_org from hospital_family_org")
fam_of={o[1]:o[0] for o in org}; parent={o[1]:o[3] for o in org}
print("== families with >=2 member names each >=20 hospitals")
from collections import defaultdict
big=defaultdict(list)
for f,n,k,p in org:
    if k>=20: big[f].append((n,k))
lab=dict(q("select family_id,label from hospital_family"))
for f,v in big.items():
    if len(v)>=2: print(f, lab[f], len(v), sorted(v,key=lambda x:-x[1]))
print("\n== partial containment (member not 100% inside its parent): count and hospitals brought in")
part=[]
for f,n,k,p in org:
    if p:
        A=sets[n];B=sets[p]; ov=len(A&B)/len(A)
        if ov<1: part.append((f,lab[f],n,p,len(A),len(A-B),sorted(A-B)))
print(len(part), "members with 80-99% containment")
for x in sorted(part,key=lambda x:-x[4])[:40]: print(x)
print("\n== hospitals in a family not owned by the family's root org name")
tot=0
for f,l,nm in q("select family_id,label,n_member_orgs from hospital_family where n_member_orgs>1"):
    root=[o[1] for o in org if o[0]==f and o[3] is None]
    mem=set(x[0] for x in q("select hospital_ccn from hospital_family_member where family_id=?",f))
    extra=mem-sets[root[0]]
    tot+=len(extra)
    if len(extra)>=1 and len(mem)>=20: print(f,l,"members",len(mem),"root",root[0],len(sets[root[0]]),"extra",len(extra))
print("total hospitals in multi-name families not owned by root:",tot)
