# For every facility and every measure with a CMS state average: does the Delta/Snapshot wording agree with the two numbers printed beside it?
import duckdb, re
from decimal import Decimal, ROUND_HALF_UP
c=duckdb.connect('/home/claude/snf-intel/db/snf.duckdb',read_only=True)
src=open('/home/claude/snf-intel/app/src/lib/measures.ts').read()
ms=[]
for m in re.finditer(r"\{ key: '([^']+)'[^}]*?unit: '([^']+)'[^}]*?direction: '([^']+)'[^}]*\}", src):
    body=m.group(0); st=re.search(r"state: '([^']+)'",body); dec=re.search(r"decimals: (\d+)",body)
    if st and m.group(2)!='stars' and m.group(3)!='none': ms.append((m.group(1),m.group(2),m.group(3),st.group(1),int(dec.group(1)) if dec else None))
def r(x,dp): return Decimal(x).quantize(Decimal(1).scaleb(-dp),rounding=ROUND_HALF_UP)
sa={row[0]:row for row in c.execute("select * from state_averages").fetchall()}
scols=[x[0] for x in c.execute("describe state_averages").fetchall()]
tot={}; ex={}
for key,unit,dirn,scol,dec in ms:
    if scol not in scols: continue
    si=scols.index(scol)
    ddec = 1 if unit=='count' else 0 if unit=='usd' else (dec if dec is not None else (1 if unit in('pct','fraction_pct') else 2))
    # displayed precision of the value and of the "State avg": value uses fmt(v,unit,decimals); avg() uses 1 dec for counts else fmt(st,unit,decimals)
    vdec = {'pct':1,'per1000':2,'hours':2,'count':0,'usd':0,'ratio':2,'score':1,'fraction_pct':1}[unit] if dec is None else dec
    if unit=='count': vdec=0 if dec is None else dec
    adec = 1 if unit=='count' else vdec
    for ccn,state,v in c.execute(f"select ccn,state,{key} from facility_master where {key} is not null").fetchall():
        s=sa.get(state); 
        if not s or s[si] is None: continue
        cmp=float(s[si]); d=float(v)-cmp
        shown=r(abs(d),ddec)
        same = shown==0
        dv, dc = r(float(v),vdec), r(cmp,adec)
        k=(key,'same-word-but-numbers-differ' if same and dv!=dc and vdec==adec else 'diff-word-but-numbers-equal' if (not same) and dv==dc and vdec==adec else None)
        if k[1]:
            tot[k]=tot.get(k,0)+1; ex.setdefault(k,(ccn,float(v),cmp,str(dv),str(dc),str(shown)))
for k in sorted(tot): print(k,tot[k],'e.g.',ex[k])
print('measures scanned',len(ms))
