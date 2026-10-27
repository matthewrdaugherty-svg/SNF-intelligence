# Red team r5: recompute every number on /cohorts from db/snf.duckdb with hand-written SQL (not the app's condSql) and compare to the dump.
import duckdb, json, math, sys
c=duckdb.connect('/home/claude/snf-intel/db/snf.duckdb',read_only=True)
d=json.load(open('out_r5/cohort_dump.json'))
HA="ccn IN (SELECT ccn FROM snf_hospital_area WHERE hospital_ccn IN ({}))"
W={ # scenario -> (where, metric, group)
 'v01_stars45':("overall_rating IN (4,5)",'qm_521_adj','state'),
 'v02_between_MD':("qm_521_adj>=15 AND qm_521_adj<=20 AND state='MD'",'qm_521_adj','state'),
 'v03_between_reversed':("qm_521_adj>=15 AND qm_521_adj<=20",'qm_521_adj','state'),
 'v03b_between_fwd':("qm_521_adj>=15 AND qm_521_adj<=20",'qm_521_adj','state'),
 'v04_blank_qrp004':("qrp_004_ppr_pd_rsrr IS NULL",'qrp_004_ppr_pd_rsrr','state'),
 'v05_abuse_chain':("abuse_icon='Y'",'qm_521_adj',"coalesce(chain_name,'(independent)')"),
 'v06_name_contains':("provider_name ILIKE '%health%'",'qm_521_adj','ownership_type'),
 'v07_hosp_area':(HA.format("'210009'"),'qm_521_adj',"coalesce(CAST(CAST(overall_rating AS INTEGER) AS VARCHAR)||'★','not rated')"),
 'v08_hosp_area2_ge4':(HA.format("'210009','210022'")+" AND overall_rating>=4",'qm_521_adj',"CASE WHEN number_of_certified_beds<60 THEN 'under 60' WHEN number_of_certified_beds<120 THEN '60–119' WHEN number_of_certified_beds<180 THEN '120–179' WHEN number_of_certified_beds IS NULL THEN 'unknown' ELSE '180+' END"),
 'v09_ky_nofines_staff':("pen_total_fines_usd=0 AND state='KY'",'reported_total_nurse_staffing_hours_per_resident_per_day',"county_parish||', '||state"),
 'v10_vbp_no_551':("vbp_in_program<>'Y'",'qm_551_adj',"coalesce(special_focus_status,'none')"),
 'v11_unrated':("overall_rating IS NULL",'qm_521_adj',"CASE WHEN number_of_certified_beds<60 THEN 'under 60' WHEN number_of_certified_beds<120 THEN '60–119' WHEN number_of_certified_beds<180 THEN '120–179' WHEN number_of_certified_beds IS NULL THEN 'unknown' ELSE '180+' END"),
 'v12_indep_urban':("(chain_name IS NULL OR chain_name='')",'qm_521_adj',"CASE urban WHEN 'Y' THEN 'urban' WHEN 'N' THEN 'rural' ELSE 'unknown' END"),
 'v13_beds_sff':("number_of_certified_beds BETWEEN 60 AND 119 AND special_focus_status IS NOT NULL AND special_focus_status<>''",'pen_total_fines_usd','state'),
 'v14_narrow':("qm_521_adj BETWEEN 20 AND 20.4",'qm_521_adj','state'),
 'v15_fines_metric':("state='CA'",'pen_total_fines_usd','state'),
 'v16_le_staff':("staffing_rating<=2 AND qm_rating>=4",'qm_521_adj','state'),
 'v17_eq_decimal':("qm_521_adj=20.5",'qm_521_adj','state'),
 'v18_hp_no':("high_performing_icon<>'Y' AND provider_resides_in_hospital='Y'",'qm_521_adj','state'),
 'x13_25conds':("qm_521_adj>=19",'qm_521_adj','state'),
 'x14_21st_cond_restrictive':("overall_rating>=1",'qm_521_adj','state'),
 'x08_hex':("qm_521_adj>=16",'qm_521_adj','state'),
 'x29_stars_decimal':("overall_rating=4",'qm_521_adj','state'),
 'x32_neg_zero':("qm_521_adj>=0",'qm_521_adj','state'),
 'x33_space_num':("qm_521_adj>=30",'qm_521_adj','state'),
 'x35_sharp_s':("provider_name ILIKE '%SS%'",'qm_521_adj','state'),
 'x36_between_same':("qm_521_adj=20",'qm_521_adj','state'),
 'x37_between_3parts':("qm_521_adj BETWEEN 10 AND 20",'qm_521_adj','state'),
 'x21_ctrl':("provider_name ILIKE '%HEALTH%'",'qm_521_adj','state'),
}
UNIT={'qm_521_adj':'pct','qrp_004_ppr_pd_rsrr':'pct','qm_551_adj':'per1000','reported_total_nurse_staffing_hours_per_resident_per_day':'hours','pen_total_fines_usd':'usd'}
def rnd(x,dp):  # Intl.NumberFormat rounds half away from zero on the decimal value
    from decimal import Decimal, ROUND_HALF_UP
    return format(Decimal(repr(x)).quantize(Decimal(1).scaleb(-dp),rounding=ROUND_HALF_UP),f',.{dp}f')
def fmt(v,unit,dp=None):
    if v is None or (isinstance(v,float) and math.isnan(v)): return ''
    if unit=='pct': return rnd(v,1 if dp is None else dp)+'%'
    if unit=='usd': return '$'+rnd(v,0) if v>=0 else '-$'+rnd(-v,0)
    if unit=='count': return rnd(v,0)
    return rnd(v,2 if dp is None else dp)
checks=0; bad=[]
def eq(scn,what,exp,got):
    global checks; checks+=1
    if str(exp)!=str(got): bad.append((scn,what,exp,got))
for scn,(w,m,g) in W.items():
    r=d[scn]; u=UNIT[m]
    n=c.execute(f"select count(*) from facility_master where {w}").fetchone()[0]
    eq(scn,'count',rnd(n,0),r['cards'][0]['value'])
    eq(scn,'count note',f"{100*n/14690:.1f}% of all nursing homes",r['cards'][0]['note'])
    nv,mean,med,p25,p75,stars,good,poor=c.execute(f"select count({m}),avg({m}),median({m}),quantile_cont({m},0.25),quantile_cont({m},0.75),avg(overall_rating),count(*) filter (where overall_rating>=4)*1.0/nullif(count(*),0),count(*) filter (where overall_rating<=2)*1.0/nullif(count(*),0) from facility_master where {w}").fetchone()
    eq(scn,'median',fmt(med,u,1) if med is not None else '–',r['cards'][1]['value'])
    if n>0:
        note=f"mean {fmt(mean,u,1) if mean is not None else '–'} · p25 {fmt(p25,u,1) if p25 is not None else '–'} · p75 {fmt(p75,u,1) if p75 is not None else '–'} · {rnd(nv,0)} with a value"
        eq(scn,'median note',note,r['cards'][1]['note'])
    ma,mea=c.execute(f"select median({m}),avg({m}) from facility_master").fetchone()
    eq(scn,'all median',fmt(ma,u,1),r['cards'][2]['value']); eq(scn,'all mean',f"mean {fmt(mea,u,1)}",r['cards'][2]['note'])
    sh=lambda v: "" if v is None else rnd(100*v,0)+"%"
    if n>0:
        eq(scn,'mix value',f"{sh(good)} good",r['cards'][3]['value'])
        eq(scn,'mix note',f"{sh(poor)} poor (1–2★) · avg {('%.2f'%stars) if stars is not None else '–'}★",r['cards'][3]['note'])
        tone='var(--color-q2)' if poor is not None and poor>0.3 else 'var(--color-q5)' if good is not None and good>0.5 else '#dc6803'
        got=r['cards'][3]['tone']; eq(scn,'mix tone',tone,{'rgb(220, 104, 3)':'#dc6803'}.get(got,got))
        eq(scn,'facility rows',f"{rnd(n,0)} rows",(r['facHdr'] or '').split(' · ')[0])
        # percentiles on histogram
        p10,p50,p90=c.execute(f"select quantile_cont({m},0.1),quantile_cont({m},0.5),quantile_cont({m},0.9) from facility_master where {w}").fetchone()
        if p50 is not None and r['hist']:
            ts=[t['s'] for t in r['hist']['texts']]
            for k,v in (('p10',p10),('p50',p50),('p90',p90)): eq(scn,f'hist {k}',f"{k} {fmt(v,u,1)}",[t for t in ts if t.startswith(k)][0])
            lo,hi=c.execute(f"select min({m}),max({m}) from facility_master").fetchone()
            eq(scn,'hist lo',fmt(lo,u,1),ts[-2]); eq(scn,'hist hi',fmt(hi,u,1),ts[-1])
    # groups: compare every rendered group row (order ties may differ, so key by group)
    gr=c.execute(f"select {g} as grp,count(*),avg({m}),count({m}),count(*) filter (where overall_rating>=4)*1.0/count(*),count(*) filter (where overall_rating<=2)*1.0/count(*),avg(pen_total_fines_usd) from facility_master where {w} group by 1 order by 2 desc").fetchall()
    exp={str(x[0]):[str(x[0]),rnd(x[1],0),fmt(x[2],u,1) if x[2] is not None else '',rnd(x[3],0),sh(x[4]),sh(x[5]),fmt(x[6],'usd') if x[6] is not None else ''] for x in gr}
    got=r['groups'] or []
    eq(scn,'n groups shown',min(60,len(gr)),len(got))
    for row in got:
        e=exp.get(row[0]); 
        if e is None: bad.append((scn,'unknown group',None,row)); continue
        for i,lab in enumerate(['grp','n','mean','n_val','good','poor','fines']): eq(scn,f'group {row[0]} {lab}',e[i],row[i])
    # top-60 by n: the set of groups shown must be a valid top-60 (ties at the cut may differ)
    if len(gr)>60:
        cut=gr[59][1]; shown=set(x[0] for x in got); must=set(str(x[0]) for x in gr if x[1]>cut)
        if not must<=shown: bad.append((scn,'top60 missing',sorted(must-shown)[:5],None))
print('checks',checks,'mismatches',len(bad))
for b in bad[:80]: print(b)
